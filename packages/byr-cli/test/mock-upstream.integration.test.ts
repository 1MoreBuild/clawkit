import { describe, expect, it } from "vitest";

import { createMockByrClient } from "../src/domain/client.js";

describe("mock upstream integration", () => {
  it("search + get + plan produces consistent IDs", async () => {
    const client = createMockByrClient();

    const result = await client.search("ubuntu", 3);
    expect(result.length).toBeGreaterThan(0);

    const detail = await client.getById(result[0].id);
    const plan = await client.getDownloadPlan(detail.id);

    expect(plan.id).toBe(detail.id);
    expect(plan.fileName).toBe(`${detail.id}.torrent`);
    expect(plan.sourceUrl).toContain(detail.id);
  });
});
