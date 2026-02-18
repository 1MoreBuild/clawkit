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

const ORIGINAL_ENV = {
  BYR_COOKIE: process.env.BYR_COOKIE,
  BYR_USERNAME: process.env.BYR_USERNAME,
  BYR_PASSWORD: process.env.BYR_PASSWORD,
  BYR_BASE_URL: process.env.BYR_BASE_URL,
  BYR_TIMEOUT_MS: process.env.BYR_TIMEOUT_MS,
};

afterEach(() => {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) {
      delete process.env[key as keyof typeof ORIGINAL_ENV];
    } else {
      process.env[key as keyof typeof ORIGINAL_ENV] = value;
    }
  }
});

describe("CLI global behavior", () => {
  it("supports global help flags and command-level help", async () => {
    const stdout = new BufferWriter();
    const stderr = new BufferWriter();

    const helpExitCode = await runCli(["--help"], {
      client: createMockByrClient(),
      stdout,
      stderr,
    });
    expect(helpExitCode).toBe(0);
    expect(stdout.read()).toContain("byr CLI");
    expect(stdout.read()).toContain("byr browse");
    expect(stdout.read()).toContain("byr doctor");
    expect(stdout.read()).toContain("byr auth login");
    expect(stdout.read()).toContain("byr search");
    expect(stderr.read()).toBe("");

    stdout.chunks = [];
    const shortHelpExitCode = await runCli(["-h"], {
      client: createMockByrClient(),
      stdout,
      stderr,
    });
    expect(shortHelpExitCode).toBe(0);
    expect(stdout.read()).toContain("byr CLI");

    stdout.chunks = [];
    const searchHelpExitCode = await runCli(["search", "--help"], {
      client: createMockByrClient(),
      stdout,
      stderr,
    });
    expect(searchHelpExitCode).toBe(0);
    expect(stdout.read()).toContain("byr search");
  });

  it("supports version output via --version/-V/version", async () => {
    const stdout = new BufferWriter();
    const stderr = new BufferWriter();

    const versionExitCode = await runCli(["--version"], {
      client: createMockByrClient(),
      stdout,
      stderr,
    });
    expect(versionExitCode).toBe(0);
    expect(stdout.read().trim()).toMatch(/^byr-pt-cli \d+\.\d+\.\d+$/);
    expect(stderr.read()).toBe("");

    stdout.chunks = [];
    const shortVersionExitCode = await runCli(["-V"], {
      client: createMockByrClient(),
      stdout,
      stderr,
    });
    expect(shortVersionExitCode).toBe(0);
    expect(stdout.read().trim()).toMatch(/^byr-pt-cli \d+\.\d+\.\d+$/);

    stdout.chunks = [];
    const versionCommandExitCode = await runCli(["version"], {
      client: createMockByrClient(),
      stdout,
      stderr,
    });
    expect(versionCommandExitCode).toBe(0);
    expect(stdout.read().trim()).toMatch(/^byr-pt-cli \d+\.\d+\.\d+$/);
  });

  it("supports bird-like check and whoami commands", async () => {
    const stdout = new BufferWriter();
    const stderr = new BufferWriter();

    delete process.env.BYR_COOKIE;
    delete process.env.BYR_USERNAME;
    delete process.env.BYR_PASSWORD;

    const missingCheckExitCode = await runCli(["check"], {
      client: createMockByrClient(),
      stdout,
      stderr,
    });
    expect(missingCheckExitCode).toBe(3);
    expect(stderr.read()).toContain("E_AUTH_REQUIRED");

    stdout.chunks = [];
    stderr.chunks = [];
    process.env.BYR_COOKIE = "uid=mock; pass=mock";

    const okCheckExitCode = await runCli(["check", "--json"], {
      client: createMockByrClient(),
      stdout,
      stderr,
    });
    expect(okCheckExitCode).toBe(0);
    expect(JSON.parse(stdout.read())).toMatchObject({
      ok: true,
      data: {
        authenticated: true,
        source: "env",
      },
    });

    stdout.chunks = [];
    const whoamiExitCode = await runCli(["whoami", "--json"], {
      client: createMockByrClient(),
      stdout,
      stderr,
    });
    expect(whoamiExitCode).toBe(0);
    expect(JSON.parse(stdout.read())).toMatchObject({
      ok: true,
      data: {
        id: "101",
        name: "mock-user",
      },
    });
  });
});
