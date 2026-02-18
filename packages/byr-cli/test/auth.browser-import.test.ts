import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, rmSync, statSync } from "node:fs";
import { createCipheriv, createHash, pbkdf2Sync } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { importCookieFromBrowser } from "../src/domain/auth/browser.js";

vi.mock("node:fs", () => ({
  copyFileSync: vi.fn(),
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  rmSync: vi.fn(),
  statSync: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  spawnSync: vi.fn(),
}));

const PLATFORM_DESCRIPTOR = Object.getOwnPropertyDescriptor(process, "platform");
const ORIGINAL_HOME = process.env.HOME;

const existsSyncMock = vi.mocked(existsSync);
const copyFileSyncMock = vi.mocked(copyFileSync);
const readFileSyncMock = vi.mocked(readFileSync);
const rmSyncMock = vi.mocked(rmSync);
const statSyncMock = vi.mocked(statSync);
const spawnSyncMock = vi.mocked(spawnSync);

function setPlatform(value: string): void {
  Object.defineProperty(process, "platform", {
    value,
    configurable: true,
  });
}

afterEach(() => {
  vi.clearAllMocks();

  if (PLATFORM_DESCRIPTOR) {
    Object.defineProperty(process, "platform", PLATFORM_DESCRIPTOR);
  }

  if (ORIGINAL_HOME === undefined) {
    delete process.env.HOME;
  } else {
    process.env.HOME = ORIGINAL_HOME;
  }
});

describe("browser cookie import", () => {
  it("rejects browser import on non-macOS", async () => {
    setPlatform("linux");

    await expect(importCookieFromBrowser("chrome")).rejects.toMatchObject({
      code: "E_AUTH_REQUIRED",
    });
  });

  it("imports uid/pass from Chrome sqlite cookies", async () => {
    setPlatform("darwin");
    process.env.HOME = "/Users/mock";

    existsSyncMock.mockImplementation((path) => String(path).endsWith("/Profile 1/Cookies"));
    copyFileSyncMock.mockImplementation(() => undefined);
    spawnSyncMock.mockImplementation((command) => {
      if (command === "mkdir") {
        return { status: 0, stdout: "", stderr: "" } as never;
      }
      if (command === "sqlite3") {
        return {
          status: 0,
          stdout: "uid\tu123\t\npass\tp456\t\n",
          stderr: "",
        } as never;
      }

      return { status: 1, stdout: "", stderr: "unsupported" } as never;
    });

    const imported = await importCookieFromBrowser("chrome", "Profile 1");

    expect(imported).toMatchObject({
      cookie: "uid=u123; pass=p456",
      source: "chrome:Profile 1",
    });
    expect(copyFileSyncMock).toHaveBeenCalled();
    expect(rmSyncMock).toHaveBeenCalled();
  });

  it("imports session cookie format from Chrome sqlite cookies", async () => {
    setPlatform("darwin");
    process.env.HOME = "/Users/mock";

    existsSyncMock.mockImplementation((path) => String(path).endsWith("/Default/Cookies"));
    copyFileSyncMock.mockImplementation(() => undefined);
    spawnSyncMock.mockImplementation((command) => {
      if (command === "mkdir") {
        return { status: 0, stdout: "", stderr: "" } as never;
      }
      if (command === "sqlite3") {
        return {
          status: 0,
          stdout: "session_id\tsid-1\t\nauth_token\tat-1\t\nrefresh_token\trt-1\t\n",
          stderr: "",
        } as never;
      }

      return { status: 1, stdout: "", stderr: "unsupported" } as never;
    });

    const imported = await importCookieFromBrowser("chrome");

    expect(imported).toMatchObject({
      cookie: "session_id=sid-1; auth_token=at-1; refresh_token=rt-1",
      source: "chrome:Default",
    });
    expect(rmSyncMock).toHaveBeenCalled();
  });

  it("strips Chrome host digest prefix from decrypted session cookies", async () => {
    setPlatform("darwin");
    process.env.HOME = "/Users/mock";

    existsSyncMock.mockImplementation((path) => String(path).endsWith("/Default/Cookies"));
    copyFileSyncMock.mockImplementation(() => undefined);

    const host = ".byr.pt";
    const password = "mock-safe-storage-password";
    const sessionIdHex = encryptChromeCookieWithHostDigest("ee6d-session-id", host, password);
    const authTokenHex = encryptChromeCookieWithHostDigest("ey.mock.jwt.token", host, password);
    const refreshTokenHex = encryptChromeCookieWithHostDigest(
      "refresh-token-value",
      host,
      password,
    );

    spawnSyncMock.mockImplementation((command) => {
      if (command === "mkdir") {
        return { status: 0, stdout: "", stderr: "" } as never;
      }
      if (command === "sqlite3") {
        return {
          status: 0,
          stdout:
            `session_id\t\t${sessionIdHex}\t${host}\n` +
            `auth_token\t\t${authTokenHex}\t${host}\n` +
            `refresh_token\t\t${refreshTokenHex}\t${host}\n`,
          stderr: "",
        } as never;
      }
      if (command === "security") {
        return {
          status: 0,
          stdout: `${password}\n`,
          stderr: "",
        } as never;
      }

      return { status: 1, stdout: "", stderr: "unsupported" } as never;
    });

    const imported = await importCookieFromBrowser("chrome");

    expect(imported).toMatchObject({
      cookie:
        "session_id=ee6d-session-id; auth_token=ey.mock.jwt.token; refresh_token=refresh-token-value",
      source: "chrome:Default",
    });
  });

  it("returns actionable error when Safari import cannot locate cookies", async () => {
    setPlatform("darwin");
    process.env.HOME = "/Users/mock";
    existsSyncMock.mockReturnValue(false);

    await expect(importCookieFromBrowser("safari")).rejects.toMatchObject({
      code: "E_AUTH_REQUIRED",
      details: {
        hint: expect.stringContaining("byr auth import-cookie --cookie"),
      },
    });
  });

  it("imports uid/pass from Safari sqlite cookies", async () => {
    setPlatform("darwin");
    process.env.HOME = "/Users/mock";

    existsSyncMock.mockImplementation((path) => String(path).endsWith("Cookies.sqlite"));
    spawnSyncMock.mockImplementation((command) => {
      if (command === "sqlite3") {
        return {
          status: 0,
          stdout: "uid\tu-id\t.byr.pt\npass\tp-id\t.byr.pt\n",
          stderr: "",
        } as never;
      }
      return { status: 1, stdout: "", stderr: "unsupported" } as never;
    });

    const imported = await importCookieFromBrowser("safari");

    expect(imported.cookie).toBe("uid=u-id; pass=p-id");
    expect(imported.source).toContain("safari-sqlite");

    expect(readFileSyncMock).not.toHaveBeenCalled();
    expect(statSyncMock).not.toHaveBeenCalled();
  });

  it("imports session cookie format from Safari sqlite cookies", async () => {
    setPlatform("darwin");
    process.env.HOME = "/Users/mock";

    existsSyncMock.mockImplementation((path) => String(path).endsWith("Cookies.sqlite"));
    spawnSyncMock.mockImplementation((command) => {
      if (command === "sqlite3") {
        return {
          status: 0,
          stdout: "session_id\tsid-2\t.byr.pt\nauth_token\tat-2\t.byr.pt\n",
          stderr: "",
        } as never;
      }
      return { status: 1, stdout: "", stderr: "unsupported" } as never;
    });

    const imported = await importCookieFromBrowser("safari");

    expect(imported.cookie).toBe("session_id=sid-2; auth_token=at-2");
    expect(imported.source).toContain("safari-sqlite");
  });
});

function encryptChromeCookieWithHostDigest(value: string, host: string, password: string): string {
  const key = pbkdf2Sync(password, "saltysalt", 1003, 16, "sha1");
  const iv = Buffer.alloc(16, 0x20);
  const hostDigest = createHash("sha256").update(host).digest();
  const plain = Buffer.concat([hostDigest, Buffer.from(value, "utf8")]);
  const cipher = createCipheriv("aes-128-cbc", key, iv);
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([Buffer.from("v10", "utf8"), encrypted]).toString("hex");
}
