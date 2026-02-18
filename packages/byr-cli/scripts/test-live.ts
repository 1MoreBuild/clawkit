#!/usr/bin/env tsx

import process from "node:process";

import { CliAppError } from "clawkit-cli-core";

import { createByrClientFromEnv } from "../src/domain/client.js";

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim().length === 0) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

async function main(): Promise<void> {
  if (process.env.BYR_LIVE !== "1") {
    console.log("[test:live] skipped: set BYR_LIVE=1 to enable live BYR smoke test");
    return;
  }

  const hasCookie =
    typeof process.env.BYR_COOKIE === "string" && process.env.BYR_COOKIE.trim().length > 0;
  const hasUserPass =
    typeof process.env.BYR_USERNAME === "string" &&
    process.env.BYR_USERNAME.trim().length > 0 &&
    typeof process.env.BYR_PASSWORD === "string" &&
    process.env.BYR_PASSWORD.trim().length > 0;

  if (!hasCookie && !hasUserPass) {
    throw new CliAppError({
      code: "E_AUTH_REQUIRED",
      message:
        "Live smoke requires BYR_COOKIE or BYR_USERNAME/BYR_PASSWORD (plus optional BYR_BASE_URL)",
    });
  }

  const client = createByrClientFromEnv(process.env);
  const query = process.env.BYR_LIVE_QUERY ?? "ubuntu";
  const limit = parsePositiveInt(process.env.BYR_LIVE_LIMIT, 3);

  console.log(`[test:live] search query="${query}" limit=${limit}`);
  const searchItems = await client.search(query, limit);
  if (searchItems.length === 0) {
    throw new CliAppError({
      code: "E_NOT_FOUND_RESOURCE",
      message: "Live smoke search returned no results",
      details: { query, limit },
    });
  }

  const targetId = process.env.BYR_LIVE_ID ?? searchItems[0].id;
  console.log(`[test:live] get id=${targetId}`);
  const detail = await client.getById(targetId);

  console.log(`[test:live] download --dry-run id=${targetId}`);
  const plan = await client.getDownloadPlan(targetId);

  console.log("[test:live] user info");
  const userInfo =
    typeof client.getUserInfo === "function" ? await client.getUserInfo() : undefined;

  console.log(
    JSON.stringify(
      {
        ok: true,
        data: {
          search: {
            query,
            total: searchItems.length,
            firstId: searchItems[0].id,
          },
          get: {
            id: detail.id,
            title: detail.title,
            size: detail.size,
          },
          dryRun: {
            id: plan.id,
            fileName: plan.fileName,
            sourceUrl: plan.sourceUrl,
            dryRun: true,
          },
          user: userInfo
            ? {
                id: userInfo.id,
                levelName: userInfo.levelName,
                ratio: userInfo.ratio,
              }
            : null,
        },
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  if (error instanceof CliAppError) {
    console.error(
      JSON.stringify(
        {
          ok: false,
          error: {
            code: error.code,
            message: error.message,
            details: error.details,
          },
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }

  console.error(error);
  process.exit(1);
});
