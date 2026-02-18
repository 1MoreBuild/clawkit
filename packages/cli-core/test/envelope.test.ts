import { describe, expect, it } from "vitest";

import { createErrorEnvelope, createSuccessEnvelope, type Meta } from "../src/envelope.js";

const META: Meta = {
  requestId: "req-test-1",
  startedAt: "2026-02-13T00:00:00.000Z",
  finishedAt: "2026-02-13T00:00:01.000Z",
  durationMs: 1000,
  verbose: false,
};

describe("envelope", () => {
  it("serializes success envelope", () => {
    const envelope = createSuccessEnvelope({ value: "ok" }, META);

    expect(JSON.parse(JSON.stringify(envelope))).toEqual({
      ok: true,
      data: { value: "ok" },
      meta: META,
    });
  });

  it("serializes error envelope with optional details", () => {
    const envelope = createErrorEnvelope("E_UPSTREAM_NETWORK", "Upstream unavailable", {
      status: 503,
    });

    expect(JSON.parse(JSON.stringify(envelope))).toEqual({
      ok: false,
      error: {
        code: "E_UPSTREAM_NETWORK",
        message: "Upstream unavailable",
        details: { status: 503 },
      },
    });
  });

  it("omits details when undefined", () => {
    const envelope = createErrorEnvelope("E_ARG_INVALID", "Bad arg");

    expect(JSON.parse(JSON.stringify(envelope))).toEqual({
      ok: false,
      error: {
        code: "E_ARG_INVALID",
        message: "Bad arg",
      },
    });
  });
});
