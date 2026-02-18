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

  const items = await client.browse(input.limit, input.options);

  return {
    mode: "browse",
    filters: input.options,
    total: items.length,
    items,
  };
}

export function renderBrowseOutput(output: BrowseCommandOutput): string {
  const lines: string[] = ["Browse: latest", `Returned: ${output.total}`];

  for (const item of output.items) {
    lines.push(
      `${item.id} | ${item.title} | ${item.size} | S:${item.seeders} L:${item.leechers}${item.category ? ` | ${item.category}` : ""}`,
    );
  }

  return lines.join("\n");
}
