import { CliAppError } from "@onemoreproduct/cli-core";

import type { ByrClient } from "../domain/client.js";

export interface GetCommandInput {
  id: string;
}

export type GetCommandOutput = Awaited<ReturnType<ByrClient["getById"]>>;

export async function runGetCommand(
  client: ByrClient,
  input: GetCommandInput,
): Promise<GetCommandOutput> {
  if (input.id.trim().length === 0) {
    throw new CliAppError({
      code: "E_ARG_MISSING",
      message: "--id is required",
      details: { arg: "id" },
    });
  }

  return client.getById(input.id);
}

export function renderGetOutput(output: GetCommandOutput): string {
  return [
    `ID: ${output.id}`,
    `Title: ${output.title}`,
    `Category: ${output.category}`,
    output.subTitle ? `Subtitle: ${output.subTitle}` : undefined,
    `Size: ${output.size}`,
    `Seeders/Leechers: ${output.seeders}/${output.leechers}`,
    `Tags: ${output.tags.join(", ")}`,
    output.status ? `Status: ${output.status}` : undefined,
    output.link ? `Download: ${output.link}` : undefined,
    `Uploaded: ${output.uploadedAt}`,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}
