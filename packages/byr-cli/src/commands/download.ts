import { CliAppError } from "clawkit-cli-core";

import type { ByrClient } from "../domain/client.js";

export interface DownloadCommandInput {
  id: string;
  outputPath: string;
  dryRun: boolean;
  writeFile: (path: string, content: Uint8Array) => Promise<void>;
}

export interface DownloadCommandOutput {
  id: string;
  outputPath: string;
  fileName: string;
  sourceUrl: string;
  dryRun: boolean;
  bytesWritten: number;
}

export async function runDownloadCommand(
  client: ByrClient,
  input: DownloadCommandInput,
): Promise<DownloadCommandOutput> {
  if (input.id.trim().length === 0) {
    throw new CliAppError({
      code: "E_ARG_MISSING",
      message: "--id is required",
      details: { arg: "id" },
    });
  }

  if (input.outputPath.trim().length === 0) {
    throw new CliAppError({
      code: "E_ARG_MISSING",
      message: "--output is required",
      details: { arg: "output" },
    });
  }

  if (input.dryRun) {
    const plan = await client.getDownloadPlan(input.id);
    return {
      id: plan.id,
      outputPath: input.outputPath,
      fileName: plan.fileName,
      sourceUrl: plan.sourceUrl,
      dryRun: true,
      bytesWritten: 0,
    };
  }

  const payload = await client.downloadTorrent(input.id);
  await input.writeFile(input.outputPath, payload.content);

  return {
    id: payload.id,
    outputPath: input.outputPath,
    fileName: payload.fileName,
    sourceUrl: payload.sourceUrl,
    dryRun: false,
    bytesWritten: payload.content.byteLength,
  };
}

export function renderDownloadOutput(output: DownloadCommandOutput): string {
  return [
    `ID: ${output.id}`,
    `File: ${output.fileName}`,
    `Output: ${output.outputPath}`,
    `Source: ${output.sourceUrl}`,
    `Dry run: ${output.dryRun ? "yes" : "no"}`,
    `Bytes written: ${output.bytesWritten}`,
  ].join("\n");
}
