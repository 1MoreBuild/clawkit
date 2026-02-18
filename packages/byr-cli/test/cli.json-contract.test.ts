import { describe, expect, it } from "vitest";

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

describe("CLI JSON contract", () => {
  it("returns success envelope for search", async () => {
    const stdout = new BufferWriter();
    const stderr = new BufferWriter();

    const exitCode = await runCli(["search", "--query", "ubuntu", "--json", "--limit", "1"], {
      client: createMockByrClient(),
      stdout,
      stderr,
      requestIdFactory: () => "req-json",
      clock: () => 1000,
      now: () => new Date("2026-02-13T01:00:00.000Z"),
    });

    expect(exitCode).toBe(0);

    const payload = JSON.parse(stdout.read());
    expect(payload).toMatchObject({
      ok: true,
      data: {
        query: "ubuntu",
        total: 1,
        items: [
          {
            id: "1001",
            sizeBytes: expect.any(Number),
            category: "OS",
            time: expect.any(String),
          },
        ],
      },
      meta: {
        requestId: "req-json",
      },
    });
    expect(stderr.read()).toBe("");
  });

  it("returns success envelope for user/meta/auth commands", async () => {
    const stdout = new BufferWriter();
    const stderr = new BufferWriter();

    const userCode = await runCli(["user", "info", "--json"], {
      client: createMockByrClient(),
      stdout,
      stderr,
    });
    expect(userCode).toBe(0);
    expect(JSON.parse(stdout.read())).toMatchObject({
      ok: true,
      data: {
        id: "101",
        levelProgress: {
          met: true,
        },
      },
    });

    stdout.chunks = [];
    const categoriesCode = await runCli(["meta", "categories", "--json"], {
      client: createMockByrClient(),
      stdout,
      stderr,
    });
    expect(categoriesCode).toBe(0);
    expect(JSON.parse(stdout.read())).toMatchObject({
      ok: true,
      data: {
        category: {
          key: "category",
        },
      },
    });

    stdout.chunks = [];
    const originalCookie = process.env.BYR_COOKIE;
    process.env.BYR_COOKIE = "uid=env-user; pass=env-pass";
    const authCode = await runCli(["auth", "status", "--json"], {
      client: createMockByrClient(),
      stdout,
      stderr,
    });
    if (originalCookie === undefined) {
      delete process.env.BYR_COOKIE;
    } else {
      process.env.BYR_COOKIE = originalCookie;
    }
    expect(authCode).toBe(0);
    expect(JSON.parse(stdout.read())).toMatchObject({
      ok: true,
      data: {
        hasCredentials: true,
        source: "env",
      },
    });
  });

  it("returns error envelope for invalid args", async () => {
    const stdout = new BufferWriter();
    const stderr = new BufferWriter();

    const exitCode = await runCli(["download", "--json", "--id", "1001"], {
      client: createMockByrClient(),
      stdout,
      stderr,
      requestIdFactory: () => "req-json-error",
      clock: () => 1000,
      now: () => new Date("2026-02-13T01:00:00.000Z"),
    });

    expect(exitCode).toBe(2);
    expect(JSON.parse(stdout.read())).toMatchObject({
      ok: false,
      error: {
        code: "E_ARG_MISSING",
      },
    });
    expect(stderr.read()).toBe("");
  });
});
