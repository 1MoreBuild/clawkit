import { afterEach, describe, expect, it } from "vitest";

import { runCli } from "../src/cli.js";
import { createMockByrClient, type ByrClient } from "../src/domain/client.js";

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

describe("browse and doctor commands", () => {
  it("returns browse output with JSON envelope", async () => {
    const stdout = new BufferWriter();
    const stderr = new BufferWriter();

    const exitCode = await runCli(["browse", "--limit", "2", "--json"], {
      client: createMockByrClient(),
      stdout,
      stderr,
    });

    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout.read())).toMatchObject({
      ok: true,
      data: {
        mode: "browse",
        total: 2,
      },
    });
    expect(stderr.read()).toBe("");
  });

  it("returns doctor report with warnings in default mode", async () => {
    delete process.env.BYR_COOKIE;
    const stdout = new BufferWriter();
    const stderr = new BufferWriter();

    const exitCode = await runCli(["doctor", "--json"], {
      client: createMockByrClient(),
      stdout,
      stderr,
    });

    expect(exitCode).toBe(0);
    const payload = JSON.parse(stdout.read());
    expect(payload).toMatchObject({
      ok: true,
      data: {
        verify: false,
        summary: {
          errors: 0,
        },
      },
    });
    expect(payload.data.summary.warnings).toBeGreaterThanOrEqual(1);
  });

  it("fails doctor --verify when online verification fails", async () => {
    process.env.BYR_COOKIE = "uid=doctor; pass=doctor";
    const stdout = new BufferWriter();
    const stderr = new BufferWriter();

    const client: ByrClient = {
      async browse() {
        return [];
      },
      async search() {
        return [];
      },
      async getById() {
        throw new Error("not used");
      },
      async getDownloadPlan() {
        throw new Error("not used");
      },
      async downloadTorrent() {
        throw new Error("not used");
      },
      async verifyAuth() {
        return { authenticated: false };
      },
    };

    const exitCode = await runCli(["doctor", "--verify", "--json"], {
      client,
      stdout,
      stderr,
    });

    expect(exitCode).toBe(3);
    expect(JSON.parse(stdout.read())).toMatchObject({
      ok: false,
      error: {
        code: "E_AUTH_INVALID",
      },
    });
    expect(stderr.read()).toBe("");
  });
});
