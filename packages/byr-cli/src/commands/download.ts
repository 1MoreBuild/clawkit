import { CliAppError } from "clawkit-cli-core";

import type { ByrClient } from "../domain/client.js";

export interface DownloadCommandInput {
  id: string;
  outputPath: string;
  dryRun: boolean;
  writeFile: (path: string, content: Uint8Array) => Promise<void>;
  resolveOutputPath?: (path: string, fileName: string) => Promise<string>;
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

  const resolveOutputPath =
    input.resolveOutputPath ?? (async (path: string, _fileName: string) => path);

  if (input.dryRun) {
    const plan = await client.getDownloadPlan(input.id);
    const outputPath = await resolveOutputPath(input.outputPath, plan.fileName);
    return {
      id: plan.id,
      outputPath,
      fileName: plan.fileName,
      sourceUrl: plan.sourceUrl,
      dryRun: true,
      bytesWritten: 0,
    };
  }

  const payload = await client.downloadTorrent(input.id);
  const outputPath = await resolveOutputPath(input.outputPath, payload.fileName);

  try {
    await input.writeFile(outputPath, payload.content);
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code === "EISDIR") {
      throw new CliAppError({
        code: "E_ARG_INVALID",
        message: "--output must be a file path, not a directory",
        details: { arg: "output", outputPath },
      });
    }
    throw error;
  }

  return {
    id: payload.id,
    outputPath,
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
