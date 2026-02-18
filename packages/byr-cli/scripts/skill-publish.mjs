#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";

const skillRoot = resolve(process.cwd(), "skill-openclaw");
const publishConfigPath = resolve(skillRoot, "publish.json");

/** @type {{ slug: string; name: string; version: string; tags?: string[]; changelog?: string }} */
let publishConfig;

try {
  publishConfig = JSON.parse(readFileSync(publishConfigPath, "utf8"));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[skill:publish] Failed to read ${publishConfigPath}: ${message}`);
  process.exit(1);
}

for (const field of ["slug", "name", "version"]) {
  if (typeof publishConfig[field] !== "string" || publishConfig[field].trim().length === 0) {
    console.error(`[skill:publish] publish.json is missing required field: ${field}`);
    process.exit(1);
  }
}

const args = [
  "publish",
  "./skill-openclaw",
  "--slug",
  publishConfig.slug,
  "--name",
  publishConfig.name,
  "--version",
  publishConfig.version,
];

if (Array.isArray(publishConfig.tags) && publishConfig.tags.length > 0) {
  args.push("--tags", publishConfig.tags.join(","));
}

if (typeof publishConfig.changelog === "string" && publishConfig.changelog.trim().length > 0) {
  args.push("--changelog", publishConfig.changelog.trim());
}

const result = spawnSync("clawhub", args, {
  stdio: "inherit",
  cwd: process.cwd(),
});

if (result.error !== undefined) {
  if (/** @type {{ code?: string }} */ (result.error).code === "ENOENT") {
    console.error("[skill:publish] clawhub command not found. Install it first: npm i -g clawhub");
  } else {
    console.error(`[skill:publish] Failed to run clawhub publish: ${result.error.message}`);
  }
  process.exit(1);
}

process.exit(result.status ?? 1);
