import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

import { CliAppError } from "@onemoreproduct/cli-core";

export interface ByrAuthStore {
  cookie: string;
  source: string;
  updatedAt: string;
}

export function getByrConfigDir(): string {
  return join(homedir(), ".config", "byr-cli");
}

export function getByrGlobalConfigPath(): string {
  return join(getByrConfigDir(), "config.json");
}

export function getByrAuthStorePath(): string {
  return join(getByrConfigDir(), "auth.json");
}

export async function readJsonFile<T>(path: string): Promise<T | undefined> {
  try {
    const content = await readFile(path, "utf8");
    return JSON.parse(content) as T;
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT") {
      return undefined;
    }

    throw new CliAppError({
      code: "E_AUTH_INVALID",
      message: `Failed to read JSON file: ${path}`,
      details: {
        path,
        reason: nodeError.message,
      },
      cause: error,
    });
  }
}

export async function writeJsonFile(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

export async function readAuthStore(): Promise<ByrAuthStore | undefined> {
  const store = await readJsonFile<Partial<ByrAuthStore>>(getByrAuthStorePath());
  if (store === undefined) {
    return undefined;
  }

  if (
    typeof store.cookie !== "string" ||
    typeof store.source !== "string" ||
    typeof store.updatedAt !== "string"
  ) {
    return undefined;
  }

  return {
    cookie: store.cookie,
    source: store.source,
    updatedAt: store.updatedAt,
  };
}

export async function writeAuthStore(cookie: string, source: string): Promise<ByrAuthStore> {
  const store: ByrAuthStore = {
    cookie,
    source,
    updatedAt: new Date().toISOString(),
  };
  await writeJsonFile(getByrAuthStorePath(), store);
  return store;
}

export async function clearAuthStore(): Promise<boolean> {
  const authStorePath = getByrAuthStorePath();
  let existed = true;
  try {
    await stat(authStorePath);
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT") {
      existed = false;
    } else {
      throw new CliAppError({
        code: "E_AUTH_INVALID",
        message: "Failed to inspect BYR auth store",
        details: {
          reason: nodeError.message,
        },
        cause: error,
      });
    }
  }

  try {
    await rm(authStorePath, { force: true });
    return existed;
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    throw new CliAppError({
      code: "E_AUTH_INVALID",
      message: "Failed to clear BYR auth store",
      details: {
        reason: nodeError.message,
      },
      cause: error,
    });
  }
}

export interface ParsedCookieInfo {
  uid?: string;
  pass?: string;
  sessionId?: string;
  authToken?: string;
  refreshToken?: string;
  cookieMap: Map<string, string>;
}

export function parseCookieHeader(cookieHeader: string): ParsedCookieInfo {
  const cookieMap = new Map<string, string>();

  for (const part of cookieHeader.split(";")) {
    const segment = part.trim();
    if (segment.length === 0) {
      continue;
    }

    const eqIndex = segment.indexOf("=");
    if (eqIndex <= 0) {
      continue;
    }

    const name = segment.slice(0, eqIndex).trim();
    const value = segment.slice(eqIndex + 1).trim();
    if (name.length > 0) {
      cookieMap.set(name, value);
    }
  }

  return {
    uid: cookieMap.get("uid"),
    pass: cookieMap.get("pass"),
    sessionId: cookieMap.get("session_id"),
    authToken: cookieMap.get("auth_token"),
    refreshToken: cookieMap.get("refresh_token"),
    cookieMap,
  };
}

export function validateByrCookie(cookieHeader: string): ParsedCookieInfo {
  const parsed = parseCookieHeader(cookieHeader);
  const hasLegacyCookie = Boolean(parsed.uid && parsed.pass);
  const hasSessionCookie = Boolean(parsed.sessionId && parsed.authToken);

  if (!hasLegacyCookie && !hasSessionCookie) {
    throw new CliAppError({
      code: "E_AUTH_INVALID",
      message: "BYR cookie must include uid/pass or session_id/auth_token",
      details: {
        requiredAnyOf: [
          ["uid", "pass"],
          ["session_id", "auth_token"],
        ],
      },
    });
  }

  return parsed;
}

export function maskCookieValue(value: string, visible = 4): string {
  if (value.length <= visible) {
    return "*".repeat(value.length);
  }

  return `${value.slice(0, visible)}${"*".repeat(Math.max(4, value.length - visible))}`;
}

export function maskCookieHeader(cookieHeader: string): string {
  const parsed = parseCookieHeader(cookieHeader);
  return Array.from(parsed.cookieMap.entries())
    .map(([name, value]) =>
      name === "uid" || name === "pass" ? `${name}=${maskCookieValue(value)}` : `${name}=***`,
    )
    .join("; ");
}
