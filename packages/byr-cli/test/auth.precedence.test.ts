import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { resolveClientConfig } from "../src/domain/auth/config.js";
import { getByrConfigDir, writeAuthStore } from "../src/domain/auth/store.js";

const ORIGINAL_HOME = process.env.HOME;

afterEach(() => {
  if (ORIGINAL_HOME === undefined) {
    delete process.env.HOME;
  } else {
    process.env.HOME = ORIGINAL_HOME;
  }
});

function createTempWorkspace(): { homeDir: string; projectDir: string } {
  const root = mkdtempSync(join(tmpdir(), "byr-cli-auth-"));
  const homeDir = join(root, "home");
  const projectDir = join(root, "project");
  mkdirSync(homeDir, { recursive: true });
  mkdirSync(projectDir, { recursive: true });
  process.env.HOME = homeDir;
  return { homeDir, projectDir };
}

function writeJson(path: string, data: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

describe("auth precedence", () => {
  it("resolves credentials by flags > env > project > global > store", async () => {
    const { projectDir } = createTempWorkspace();

    await writeAuthStore("uid=from-store; pass=from-store", "auth-store");

    const globalConfigPath = join(getByrConfigDir(), "config.json");
    writeJson(globalConfigPath, {
      cookie: "uid=from-global; pass=from-global",
      username: "global-user",
      password: "global-pass",
      baseUrl: "https://bt.byr.cn",
      timeoutMs: 5001,
    });

    const projectConfigPath = join(projectDir, ".byrrc.json");
    writeJson(projectConfigPath, {
      cookie: "uid=from-project; pass=from-project",
      username: "project-user",
      password: "project-pass",
      baseUrl: "https://byr.pt",
      timeoutMs: 4001,
    });

    const resolved = await resolveClientConfig({
      cwd: projectDir,
      env: {
        BYR_COOKIE: "uid=from-env; pass=from-env",
        BYR_USERNAME: "env-user",
        BYR_PASSWORD: "env-pass",
        BYR_BASE_URL: "https://env.byr.pt",
        BYR_TIMEOUT_MS: "3001",
      },
      getFlag: (key) => {
        if (key === "cookie") return "uid=from-flag; pass=from-flag";
        if (key === "username") return "flag-user";
        if (key === "password") return "flag-pass";
        if (key === "base-url") return "https://flag.byr.pt";
        if (key === "timeout-ms") return "2001";
        return undefined;
      },
    });

    expect(resolved).toMatchObject({
      cookie: "uid=from-flag; pass=from-flag",
      username: "flag-user",
      password: "flag-pass",
      baseUrl: "https://flag.byr.pt",
      timeoutMs: 2001,
      cookieSource: "flag",
    });
  });

  it("falls back to persisted store when no other source is present", async () => {
    const { projectDir } = createTempWorkspace();
    await writeAuthStore("uid=stored; pass=stored", "manual");

    const resolved = await resolveClientConfig({
      cwd: projectDir,
      env: {},
      getFlag: () => undefined,
    });

    expect(resolved.cookie).toBe("uid=stored; pass=stored");
    expect(resolved.cookieSource).toBe("manual");
  });
});
