import { describe, expect, it } from "vitest";

import {
  BYR_BOOKMARKED_FACET,
  BYR_INCLDEAD_FACET,
  BYR_SPSTATE_FACET,
  getByrMetadata,
  guessByrLevelId,
  parseCategoryAliases,
  parseSimpleFacetAliases,
} from "../src/domain/byr-metadata.js";

describe("BYR metadata mappings", () => {
  it("parses category aliases and category ids", () => {
    const parsed = parseCategoryAliases(["movie,401", "anime"]);
    expect(parsed.invalid).toEqual([]);
    expect(parsed.values).toEqual([408, 401, 404]);
  });

  it("parses simple facet aliases", () => {
    expect(parseSimpleFacetAliases(BYR_INCLDEAD_FACET, ["dead"]).values).toEqual([2]);
    expect(parseSimpleFacetAliases(BYR_SPSTATE_FACET, ["2xfree"]).values).toEqual([4]);
    expect(parseSimpleFacetAliases(BYR_BOOKMARKED_FACET, ["unbookmarked"]).values).toEqual([2]);
  });

  it("keeps metadata and levels compatible with BYR definitions", () => {
    const metadata = getByrMetadata();
    expect(metadata.category.options).toHaveLength(10);
    expect(metadata.category.options.map((item) => item.value)).toEqual([
      408, 401, 404, 402, 405, 403, 406, 407, 409, 410,
    ]);
    expect(metadata.levels.find((item) => item.id === 9)?.name).toBe("Nexus Master");
    expect(guessByrLevelId("Power User")).toBe(2);
  });
});
