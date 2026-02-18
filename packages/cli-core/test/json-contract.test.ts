import { describe, expect, it } from "vitest";

import { createErrorEnvelope, createSuccessEnvelope } from "../src/envelope.js";

const META = {
  requestId: "req-contract",
  startedAt: "2026-02-13T09:00:00.000Z",
  finishedAt: "2026-02-13T09:00:01.500Z",
  durationMs: 1500,
  verbose: true,
};

describe("json contract snapshots", () => {
  it("matches success envelope snapshot", () => {
    expect(createSuccessEnvelope({ id: "1001", state: "ok" }, META)).toMatchInlineSnapshot(`
      {
        "data": {
          "id": "1001",
          "state": "ok",
        },
        "meta": {
          "durationMs": 1500,
          "finishedAt": "2026-02-13T09:00:01.500Z",
          "requestId": "req-contract",
          "startedAt": "2026-02-13T09:00:00.000Z",
          "verbose": true,
        },
        "ok": true,
      }
    `);
  });

  it("matches error envelope snapshot", () => {
    expect(
      createErrorEnvelope("E_ARG_MISSING", "Missing required argument", {
        field: "id",
      }),
    ).toMatchInlineSnapshot(`
      {
        "error": {
          "code": "E_ARG_MISSING",
          "details": {
            "field": "id",
          },
          "message": "Missing required argument",
        },
        "ok": false,
      }
    `);
  });
});
