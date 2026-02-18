import { describe, expect, it } from "vitest";

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

describe("CLI parameter validation", () => {
  it("fails with argument error when query is missing", async () => {
    const stdout = new BufferWriter();
    const stderr = new BufferWriter();

    const exitCode = await runCli(["search"], {
      client: createMockByrClient(),
      stdout,
      stderr,
      requestIdFactory: () => "req-1",
      clock: () => 0,
      now: () => new Date("2026-02-13T00:00:00.000Z"),
    });

    expect(exitCode).toBe(2);
    expect(stderr.read()).toContain("E_ARG_MISSING");
  });

  it("fails when --query and --imdb are provided together", async () => {
    const stdout = new BufferWriter();
    const stderr = new BufferWriter();

    const exitCode = await runCli(["search", "--query", "matrix", "--imdb", "tt0133093"], {
      client: createMockByrClient(),
      stdout,
      stderr,
    });

    expect(exitCode).toBe(2);
    expect(stderr.read()).toContain("E_ARG_CONFLICT");
  });

  it("fails when browse is called with --query or --imdb", async () => {
    const stdout = new BufferWriter();
    const stderr = new BufferWriter();

    const exitCode = await runCli(["browse", "--query", "matrix"], {
      client: createMockByrClient(),
      stdout,
      stderr,
    });

    expect(exitCode).toBe(2);
    expect(stderr.read()).toContain("E_ARG_UNSUPPORTED");
  });

  it("accepts category aliases and comma-separated category ids", async () => {
    let capturedOptions: unknown;
    const client: ByrClient = {
      async browse() {
        return [];
      },
      async search(_query, _limit, options) {
        capturedOptions = options;
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
    };

    const stdout = new BufferWriter();
    const stderr = new BufferWriter();

    const exitCode = await runCli(
      ["search", "--query", "example", "--category", "movie,401", "--category", "anime", "--json"],
      {
        client,
        stdout,
        stderr,
      },
    );

    expect(exitCode).toBe(0);
    expect(capturedOptions).toMatchObject({
      categoryIds: [408, 401, 404],
    });
  });

  it("fails when category input contains invalid aliases", async () => {
    const stdout = new BufferWriter();
    const stderr = new BufferWriter();

    const exitCode = await runCli(["search", "--query", "x", "--category", "not-a-category"], {
      client: createMockByrClient(),
      stdout,
      stderr,
    });

    expect(exitCode).toBe(2);
    expect(stderr.read()).toContain("E_ARG_INVALID");
  });

  it("returns not-found when id does not exist", async () => {
    const stdout = new BufferWriter();
    const stderr = new BufferWriter();

    const exitCode = await runCli(["get", "--id", "404"], {
      client: createMockByrClient(),
      stdout,
      stderr,
      requestIdFactory: () => "req-2",
      clock: () => 0,
      now: () => new Date("2026-02-13T00:00:00.000Z"),
    });

    expect(exitCode).toBe(4);
    expect(stderr.read()).toContain("E_NOT_FOUND_RESOURCE");
  });

  it("returns clear validation error when writer raises EISDIR", async () => {
    const stdout = new BufferWriter();
    const stderr = new BufferWriter();

    const exitCode = await runCli(["download", "--id", "1001", "--output", "./out", "--json"], {
      client: createMockByrClient(),
      stdout,
      stderr,
      fileWriter: async () => {
        const error = new Error("EISDIR: illegal operation on a directory") as NodeJS.ErrnoException;
        error.code = "EISDIR";
        throw error;
      },
    });

    expect(exitCode).toBe(2);
    expect(JSON.parse(stdout.read())).toMatchObject({
      ok: false,
      error: {
        code: "E_ARG_INVALID",
        message: "--output must be a file path, not a directory",
      },
    });
    expect(stderr.read()).toBe("");
  });
});
