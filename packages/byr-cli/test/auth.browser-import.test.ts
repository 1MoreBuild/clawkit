import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, statSync } from "node:fs";

import { afterEach, describe, expect, it, vi } from "vitest";

import { importCookieFromBrowser } from "../src/domain/auth/browser.js";

vi.mock("node:fs", () => ({
  copyFileSync: vi.fn(),
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
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
});
