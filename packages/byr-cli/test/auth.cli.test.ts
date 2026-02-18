import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { runCli } from "../src/cli.js";
import { createMockByrClient } from "../src/domain/client.js";

class BufferWriter {
  public chunks: string[] = [];

  public write(chunk: string): boolean {
    this.chunks.push(chunk);
    return true;
  }

  public read(): string {
    return this.chunks.join("");
  }
}

const ORIGINAL_HOME = process.env.HOME;
const ORIGINAL_ENV = {
  BYR_COOKIE: process.env.BYR_COOKIE,
  BYR_USERNAME: process.env.BYR_USERNAME,
  BYR_PASSWORD: process.env.BYR_PASSWORD,
  BYR_BASE_URL: process.env.BYR_BASE_URL,
  BYR_TIMEOUT_MS: process.env.BYR_TIMEOUT_MS,
};

afterEach(() => {
  if (ORIGINAL_HOME === undefined) {
    delete process.env.HOME;
  } else {
    process.env.HOME = ORIGINAL_HOME;
  }

  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) {
      delete process.env[key as keyof typeof ORIGINAL_ENV];
    } else {
      process.env[key as keyof typeof ORIGINAL_ENV] = value;
    }
  }
});

function isolateHome(): void {
  const root = mkdtempSync(join(tmpdir(), "byr-cli-auth-cli-"));
  const homeDir = join(root, "home");
  mkdirSync(homeDir, { recursive: true });
  process.env.HOME = homeDir;

  delete process.env.BYR_COOKIE;
  delete process.env.BYR_USERNAME;
  delete process.env.BYR_PASSWORD;
  delete process.env.BYR_BASE_URL;
  delete process.env.BYR_TIMEOUT_MS;
}

describe("auth command flow", () => {
  it("imports manual cookie, reports status, and logs out", async () => {
    isolateHome();

    const stdout = new BufferWriter();
    const stderr = new BufferWriter();

    const importCode = await runCli(
      ["auth", "import-cookie", "--cookie", "uid=u1; pass=p1", "--json"],
      {
        stdout,
        stderr,
      },
    );

    expect(importCode).toBe(0);
    expect(JSON.parse(stdout.read())).toMatchObject({
      ok: true,
      data: {
        source: "manual",
      },
    });

    stdout.chunks = [];

    const statusCode = await runCli(["auth", "status", "--json"], {
      stdout,
      stderr,
    });

    expect(statusCode).toBe(0);
    expect(JSON.parse(stdout.read())).toMatchObject({
      ok: true,
      data: {
        hasCredentials: true,
        source: "manual",
      },
    });

    stdout.chunks = [];

    const logoutCode = await runCli(["auth", "logout", "--json"], {
      stdout,
      stderr,
    });

    expect(logoutCode).toBe(0);
    expect(JSON.parse(stdout.read())).toMatchObject({
      ok: true,
      data: {
        deleted: true,
      },
    });

    stdout.chunks = [];

    const statusAfterLogout = await runCli(["auth", "status", "--json"], {
      stdout,
      stderr,
    });

    expect(statusAfterLogout).toBe(0);
    expect(JSON.parse(stdout.read())).toMatchObject({
      ok: true,
      data: {
        hasCredentials: false,
        source: "none",
      },
    });

    stdout.chunks = [];
    const logoutAgainCode = await runCli(["auth", "logout", "--json"], {
      stdout,
      stderr,
    });

    expect(logoutAgainCode).toBe(0);
    expect(JSON.parse(stdout.read())).toMatchObject({
      ok: true,
      data: {
        deleted: false,
      },
    });
  });

  it("supports online verification in auth status", async () => {
    isolateHome();
    process.env.BYR_COOKIE = "uid=verify; pass=verify";

    const stdout = new BufferWriter();
    const stderr = new BufferWriter();

    const exitCode = await runCli(["auth", "status", "--verify", "--json"], {
      client: createMockByrClient(),
      stdout,
      stderr,
    });

    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout.read())).toMatchObject({
      ok: true,
      data: {
        hasCredentials: true,
        source: "env",
        verify: {
          authenticated: true,
        },
      },
    });
  });

  it("accepts session_id/auth_token cookie format for import", async () => {
    isolateHome();
    const stdout = new BufferWriter();
    const stderr = new BufferWriter();

    const importCode = await runCli(
      [
        "auth",
        "import-cookie",
        "--cookie",
        "session_id=s1; auth_token=a1; refresh_token=r1",
        "--json",
      ],
      {
        stdout,
        stderr,
      },
    );

    expect(importCode).toBe(0);
    expect(JSON.parse(stdout.read())).toMatchObject({
      ok: true,
      data: {
        source: "manual",
      },
    });

    stdout.chunks = [];
    const statusCode = await runCli(["auth", "status", "--json"], {
      stdout,
      stderr,
    });
    expect(statusCode).toBe(0);
    expect(JSON.parse(stdout.read())).toMatchObject({
      ok: true,
      data: {
        hasCredentials: true,
        source: "manual",
      },
    });
  });
});
