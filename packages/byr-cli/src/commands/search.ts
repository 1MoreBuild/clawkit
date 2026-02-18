import { CliAppError } from "clawkit-cli-core";

import type { ByrClient } from "../domain/client.js";
import type { ByrSearchOptions } from "../domain/types.js";

export interface SearchCommandInput {
  query: string;
  limit: number;
  options?: ByrSearchOptions;
}

export interface SearchCommandOutput {
  query: string;
  imdb?: string;
  filters?: ByrSearchOptions;
  total: number;
  items: Awaited<ReturnType<ByrClient["search"]>>;
}

export async function runSearchCommand(
  client: ByrClient,
  input: SearchCommandInput,
): Promise<SearchCommandOutput> {
  const query = input.query.trim();
  const imdb = input.options?.imdb?.trim();

  if (query.length === 0 && (!imdb || imdb.length === 0)) {
    throw new CliAppError({
      code: "E_ARG_MISSING",
      message: "--query or --imdb is required",
      details: { arg: "query|imdb" },
    });
  }

  if (!Number.isInteger(input.limit) || input.limit <= 0) {
    throw new CliAppError({
      code: "E_ARG_INVALID",
      message: "--limit must be a positive integer",
      details: { arg: "limit", value: input.limit },
    });
  }

  const items = await client.search(input.query, input.limit, input.options);

  return {
    query: input.query,
    imdb: imdb && imdb.length > 0 ? imdb : undefined,
    filters: input.options,
    total: items.length,
    items,
  };
}

export function renderSearchOutput(output: SearchCommandOutput): string {
  const searchText = output.imdb ? `imdb:${output.imdb}` : output.query;
  const lines: string[] = [`Search: ${searchText}`, `Returned: ${output.total}`];

  for (const item of output.items) {
    lines.push(
      `${item.id} | ${item.title} | ${item.size} | S:${item.seeders} L:${item.leechers}${item.category ? ` | ${item.category}` : ""}`,
    );
  }

  return lines.join("\n");
}
