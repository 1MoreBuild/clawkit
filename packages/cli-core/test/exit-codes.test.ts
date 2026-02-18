import { describe, expect, it } from "vitest";

import { EXIT_CODES, mapErrorCodeToExitCode } from "../src/exit-codes.js";

describe("exit code mapping", () => {
  it("maps argument errors", () => {
    expect(mapErrorCodeToExitCode("E_ARG_INVALID")).toBe(EXIT_CODES.ARGUMENT_ERROR);
  });

  it("maps auth errors", () => {
    expect(mapErrorCodeToExitCode("E_AUTH_REQUIRED")).toBe(EXIT_CODES.AUTH_OR_CONFIG_ERROR);
  });

  it("maps not-found errors", () => {
    expect(mapErrorCodeToExitCode("E_NOT_FOUND_RESOURCE")).toBe(EXIT_CODES.NOT_FOUND);
  });

  it("maps upstream errors", () => {
    expect(mapErrorCodeToExitCode("E_UPSTREAM_TIMEOUT")).toBe(EXIT_CODES.UPSTREAM_ERROR);
  });

  it("maps unknown errors", () => {
    expect(mapErrorCodeToExitCode("E_UNKNOWN")).toBe(EXIT_CODES.UNKNOWN_ERROR);
  });
});
