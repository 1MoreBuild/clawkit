import { CliAppError } from "clawkit-cli-core";

import type { ByrClient } from "../domain/client.js";
import type { ByrBrowseOptions } from "../domain/types.js";

export interface BrowseCommandInput {
  limit: number;
  options?: ByrBrowseOptions;
}

export interface BrowseCommandOutput {
  mode: "browse";
  filters?: ByrBrowseOptions;
  matchedTotal?: number;
  returned: number;
  total: number;
  items: Awaited<ReturnType<ByrClient["browse"]>>;
}

export async function runBrowseCommand(
  client: ByrClient,
  input: BrowseCommandInput,
): Promise<BrowseCommandOutput> {
  if (!Number.isInteger(input.limit) || input.limit <= 0) {
    throw new CliAppError({
      code: "E_ARG_INVALID",
      message: "--limit must be a positive integer",
      details: { arg: "limit", value: input.limit },
    });
  }

  const result = client.browseWithMeta
    ? await client.browseWithMeta(input.limit, input.options)
    : {
        items: await client.browse(input.limit, input.options),
      };
  const items = result.items;
  const returned = items.length;

  return {
    mode: "browse",
    filters: input.options,
    matchedTotal: result.matchedTotal,
    returned,
    total: returned,
    items,
  };
}

export function renderBrowseOutput(output: BrowseCommandOutput): string {
  const lines: string[] = ["Browse: latest"];
  if (typeof output.matchedTotal === "number") {
    lines.push(`Matched: ${output.matchedTotal}`);
  }
  lines.push(`Returned: ${output.returned}`);

  for (const item of output.items) {
    lines.push(
      `${item.id} | ${item.title} | ${item.size} | S:${item.seeders} L:${item.leechers}${item.category ? ` | ${item.category}` : ""}`,
    );
  }

  return lines.join("\n");
}
