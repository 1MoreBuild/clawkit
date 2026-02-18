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

describe("download --dry-run", () => {
  it("does not write files during dry run", async () => {
    let getPlanCalls = 0;
    let downloadCalls = 0;
    let writeCalls = 0;

    const client: ByrClient = {
      async search() {
        return [];
      },
      async getById(id) {
        return {
          id,
          title: "Sample",
          size: "1 GB",
          seeders: 1,
          leechers: 0,
          tags: ["sample"],
          uploadedAt: "2026-01-01T00:00:00.000Z",
          category: "OS",
        };
      },
      async getDownloadPlan(id) {
        getPlanCalls += 1;
        return {
          id,
          fileName: `${id}.torrent`,
          sourceUrl: `https://byr.pt/torrents/${id}/download`,
        };
      },
      async downloadTorrent(id) {
        downloadCalls += 1;
        return {
          id,
          fileName: `${id}.torrent`,
          sourceUrl: `https://byr.pt/torrents/${id}/download`,
          content: new TextEncoder().encode("payload"),
        };
      },
    };

    const stdout = new BufferWriter();
    const stderr = new BufferWriter();

    const exitCode = await runCli(
      ["download", "--id", "1001", "--output", "/tmp/1001.torrent", "--dry-run", "--json"],
      {
        client,
        stdout,
        stderr,
        fileWriter: async () => {
          writeCalls += 1;
        },
        requestIdFactory: () => "req-dry-run",
        clock: () => 1000,
        now: () => new Date("2026-02-13T01:00:00.000Z"),
      },
    );

    expect(exitCode).toBe(0);
    expect(getPlanCalls).toBe(1);
    expect(downloadCalls).toBe(0);
    expect(writeCalls).toBe(0);
    expect(JSON.parse(stdout.read())).toMatchObject({
      ok: true,
      data: {
        dryRun: true,
        bytesWritten: 0,
      },
    });
    expect(stderr.read()).toBe("");
  });

  it("writes files when dry run is disabled", async () => {
    let writeCalls = 0;

    const stdout = new BufferWriter();
    const stderr = new BufferWriter();

    const exitCode = await runCli(
      ["download", "--id", "1001", "--output", "/tmp/1001.torrent", "--json"],
      {
        client: createMockByrClient(),
        stdout,
        stderr,
        fileWriter: async () => {
          writeCalls += 1;
        },
        requestIdFactory: () => "req-write",
        clock: () => 1000,
        now: () => new Date("2026-02-13T01:00:00.000Z"),
      },
    );

    expect(exitCode).toBe(0);
    expect(writeCalls).toBe(1);
    expect(JSON.parse(stdout.read())).toMatchObject({
      ok: true,
      data: {
        dryRun: false,
      },
    });
  });
});
