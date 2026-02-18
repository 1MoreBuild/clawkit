import { copyFileSync, existsSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pbkdf2Sync, createDecipheriv } from "node:crypto";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";

import { CliAppError } from "clawkit-cli-core";

interface BrowserCookieImportResult {
  cookie: string;
  source: string;
}

interface CookieRecord {
  name: string;
  value: string;
  domain: string;
}

const TARGET_DOMAINS = new Set([".byr.pt", "byr.pt", ".bt.byr.cn", "bt.byr.cn"]);
const AUTH_COOKIE_NAMES = new Set(["uid", "pass", "session_id", "auth_token", "refresh_token"]);

export async function importCookieFromBrowser(
  browser: "chrome" | "safari",
  profile?: string,
): Promise<BrowserCookieImportResult> {
  if (process.platform !== "darwin") {
    throw new CliAppError({
      code: "E_AUTH_REQUIRED",
      message: `Browser cookie import is only supported on macOS (requested: ${browser})`,
    });
  }

  if (browser === "chrome") {
    return importCookieFromChrome(profile);
  }

  return importCookieFromSafari();
}

function importCookieFromChrome(profile?: string): BrowserCookieImportResult {
  const home = process.env.HOME ?? "";
  const profilesRoot = join(home, "Library", "Application Support", "Google", "Chrome");
  const profileName = profile?.trim().length ? profile.trim() : "Default";

  const selectedDb = join(profilesRoot, profileName, "Cookies");
  const fallbackDb = join(profilesRoot, "Default", "Cookies");
  const dbPath = existsSync(selectedDb) ? selectedDb : fallbackDb;

  if (!existsSync(dbPath)) {
    throw new CliAppError({
      code: "E_AUTH_REQUIRED",
      message: "Chrome cookies database not found",
      details: {
        checked: [selectedDb, fallbackDb],
      },
    });
  }

  const tempDir = join(tmpdir(), `byr-cli-${randomUUID()}`);
  const tempDb = join(tempDir, "Cookies");
  spawnSync("mkdir", ["-p", tempDir], { stdio: "ignore" });
  copyFileSync(dbPath, tempDb);

  const wal = `${dbPath}-wal`;
  const shm = `${dbPath}-shm`;
  if (existsSync(wal)) {
    copyFileSync(wal, `${tempDb}-wal`);
  }
  if (existsSync(shm)) {
    copyFileSync(shm, `${tempDb}-shm`);
  }

  try {
    const query =
      "SELECT name, value, hex(encrypted_value) FROM cookies " +
      "WHERE host_key IN ('.byr.pt','byr.pt','.bt.byr.cn','bt.byr.cn') " +
      "AND name IN ('uid','pass','session_id','auth_token','refresh_token')";

    const sqlite = spawnSync("sqlite3", ["-separator", "\t", tempDb, query], {
      encoding: "utf8",
    });
    if (sqlite.status !== 0) {
      throw new CliAppError({
        code: "E_AUTH_REQUIRED",
        message: "Failed to read Chrome cookies with sqlite3",
        details: {
          stderr: sqlite.stderr?.trim(),
        },
      });
    }

    const cookies = new Map<string, string>();
    const lines = (sqlite.stdout ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    let keyHex: string | undefined;

    for (const line of lines) {
      const [name, value, encryptedHex] = line.split("\t");
      if (!AUTH_COOKIE_NAMES.has(name)) {
        continue;
      }
      if (value && value.length > 0) {
        cookies.set(name, value);
        continue;
      }
      if (!keyHex) {
        keyHex = getChromeSafeStorageKeyHex();
      }
      if (!encryptedHex || encryptedHex.length === 0 || !keyHex) {
        continue;
      }
      const resolved = decryptChromeCookieHex(encryptedHex, keyHex);
      if (resolved) {
        cookies.set(name, resolved);
      }
    }

    return {
      cookie: buildByrAuthCookieHeader(cookies, {
        source: `chrome:${profileName}`,
        profile: profileName,
      }),
      source: `chrome:${profileName}`,
    };
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function getChromeSafeStorageKeyHex(): string | undefined {
  const attempts: Array<[string, string]> = [
    ["Chrome Safe Storage", "Chrome"],
    ["Chrome Safe Storage", "Google Chrome"],
  ];

  for (const [service, account] of attempts) {
    const command = spawnSync(
      "security",
      ["find-generic-password", "-w", "-s", service, "-a", account],
      {
        encoding: "utf8",
      },
    );
    if (command.status !== 0) {
      continue;
    }

    const password = command.stdout.trim();
    if (password.length === 0) {
      continue;
    }

    const key = pbkdf2Sync(password, "saltysalt", 1003, 16, "sha1");
    return key.toString("hex");
  }

  return undefined;
}

function decryptChromeCookieHex(encryptedHex: string, keyHex: string): string | undefined {
  try {
    let encrypted = Buffer.from(encryptedHex, "hex");
    if (encrypted.length === 0) {
      return undefined;
    }

    if (encrypted.subarray(0, 3).toString("utf8") === "v10") {
      encrypted = encrypted.subarray(3);
    }

    const key = Buffer.from(keyHex, "hex");
    const iv = Buffer.alloc(16, 0x20);
    const decipher = createDecipheriv("aes-128-cbc", key, iv);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString("utf8").replaceAll("\u0000", "").trim();
  } catch {
    return undefined;
  }
}

function importCookieFromSafari(): BrowserCookieImportResult {
  const home = process.env.HOME ?? "";
  const sqliteCandidates = [
    join(home, "Library", "Cookies", "Cookies.sqlite"),
    join(
      home,
      "Library",
      "Containers",
      "com.apple.Safari",
      "Data",
      "Library",
      "Cookies",
      "Cookies.sqlite",
    ),
  ];

  for (const sqlitePath of sqliteCandidates) {
    if (!existsSync(sqlitePath)) {
      continue;
    }
    const result = tryReadSafariSqlite(sqlitePath);
    if (result) {
      return result;
    }
  }

  const binaryCandidates = [
    join(home, "Library", "Cookies", "Cookies.binarycookies"),
    join(
      home,
      "Library",
      "Containers",
      "com.apple.Safari",
      "Data",
      "Library",
      "Cookies",
      "Cookies.binarycookies",
    ),
  ];

  for (const binaryPath of binaryCandidates) {
    if (!existsSync(binaryPath)) {
      continue;
    }
    const result = tryReadSafariBinaryCookies(binaryPath);
    if (result) {
      return result;
    }
  }

  throw new CliAppError({
    code: "E_AUTH_REQUIRED",
    message: "Safari cookie import failed (best effort)",
    details: {
      hint: 'Use `byr auth import-cookie --cookie "uid=...; pass=..."` as fallback.',
      checked: [...sqliteCandidates, ...binaryCandidates],
    },
  });
}

function tryReadSafariSqlite(path: string): BrowserCookieImportResult | undefined {
  const query =
    "SELECT name, value, host FROM cookies " +
    "WHERE host IN ('.byr.pt','byr.pt','.bt.byr.cn','bt.byr.cn') " +
    "AND name IN ('uid','pass','session_id','auth_token','refresh_token')";
  const sqlite = spawnSync("sqlite3", ["-separator", "\t", path, query], {
    encoding: "utf8",
  });
  if (sqlite.status !== 0) {
    return undefined;
  }

  const records: CookieRecord[] = [];
  for (const line of (sqlite.stdout ?? "").split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }
    const [name, value, domain] = trimmed.split("\t");
    if (!name || !value || !domain) {
      continue;
    }
    records.push({ name, value, domain });
  }

  return extractByrCookie(records, `safari-sqlite:${path}`);
}

function tryReadSafariBinaryCookies(path: string): BrowserCookieImportResult | undefined {
  let buffer: Buffer;
  try {
    const stats = statSync(path);
    if (stats.size <= 0) {
      return undefined;
    }
    buffer = readFileSync(path);
  } catch {
    return undefined;
  }

  const records = parseBinaryCookies(buffer);
  return extractByrCookie(records, `safari-binarycookies:${path}`);
}

function extractByrCookie(
  records: CookieRecord[],
  source: string,
): BrowserCookieImportResult | undefined {
  const map = new Map<string, string>();
  for (const record of records) {
    if (!TARGET_DOMAINS.has(record.domain)) {
      continue;
    }
    if (AUTH_COOKIE_NAMES.has(record.name)) {
      map.set(record.name, record.value);
    }
  }

  if (map.size === 0) {
    return undefined;
  }

  try {
    return {
      cookie: buildByrAuthCookieHeader(map, { source }),
      source,
    };
  } catch {
    return undefined;
  }
}

function buildByrAuthCookieHeader(
  cookieMap: Map<string, string>,
  context: { source: string; profile?: string },
): string {
  const uid = cookieMap.get("uid");
  const pass = cookieMap.get("pass");
  if (uid && pass) {
    return `uid=${uid}; pass=${pass}`;
  }

  const sessionId = cookieMap.get("session_id");
  const authToken = cookieMap.get("auth_token");
  if (sessionId && authToken) {
    const refreshToken = cookieMap.get("refresh_token");
    return refreshToken
      ? `session_id=${sessionId}; auth_token=${authToken}; refresh_token=${refreshToken}`
      : `session_id=${sessionId}; auth_token=${authToken}`;
  }

  throw new CliAppError({
    code: "E_AUTH_REQUIRED",
    message: "Unable to extract BYR auth cookies from browser storage",
    details: {
      source: context.source,
      profile: context.profile,
      requiredAnyOf: [
        ["uid", "pass"],
        ["session_id", "auth_token"],
      ],
    },
  });
}

function parseBinaryCookies(buffer: Buffer): CookieRecord[] {
  if (buffer.length < 8 || buffer.subarray(0, 4).toString("ascii") !== "cook") {
    return [];
  }

  const numPages = buffer.readUInt32BE(4);
  const pageSizes: number[] = [];
  let cursor = 8;
  for (let index = 0; index < numPages; index += 1) {
    if (cursor + 4 > buffer.length) {
      return [];
    }
    pageSizes.push(buffer.readUInt32BE(cursor));
    cursor += 4;
  }

  const records: CookieRecord[] = [];
  let pageOffset = cursor;
  for (const pageSize of pageSizes) {
    if (pageOffset + pageSize > buffer.length) {
      break;
    }
    const page = buffer.subarray(pageOffset, pageOffset + pageSize);
    records.push(...parseBinaryCookiePage(page));
    pageOffset += pageSize;
  }

  return records;
}

function parseBinaryCookiePage(page: Buffer): CookieRecord[] {
  if (page.length < 8) {
    return [];
  }

  const count = page.readUInt32LE(4);
  const records: CookieRecord[] = [];
  let offsetTable = 8;
  for (let index = 0; index < count; index += 1) {
    if (offsetTable + 4 > page.length) {
      break;
    }
    const cookieOffset = page.readUInt32LE(offsetTable);
    offsetTable += 4;
    const parsed = parseBinaryCookie(page, cookieOffset);
    if (parsed !== undefined) {
      records.push(parsed);
    }
  }

  return records;
}

function parseBinaryCookie(page: Buffer, cookieOffset: number): CookieRecord | undefined {
  if (cookieOffset + 40 > page.length) {
    return undefined;
  }

  const size = page.readUInt32LE(cookieOffset);
  if (size <= 0 || cookieOffset + size > page.length) {
    return undefined;
  }

  const slice = page.subarray(cookieOffset, cookieOffset + size);
  const domainOffset = slice.readUInt32LE(16);
  const nameOffset = slice.readUInt32LE(20);
  const valueOffset = slice.readUInt32LE(28);

  const domain = readCString(slice, domainOffset);
  const name = readCString(slice, nameOffset);
  const value = readCString(slice, valueOffset);

  if (!domain || !name || !value) {
    return undefined;
  }

  return {
    domain,
    name,
    value,
  };
}

function readCString(buffer: Buffer, offset: number): string {
  if (offset <= 0 || offset >= buffer.length) {
    return "";
  }
  let end = offset;
  while (end < buffer.length && buffer[end] !== 0x00) {
    end += 1;
  }
  return buffer.subarray(offset, end).toString("utf8").trim();
}
