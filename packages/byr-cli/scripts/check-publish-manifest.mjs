import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const manifestPath = path.resolve(process.cwd(), "package.json");
const raw = fs.readFileSync(manifestPath, "utf8");
const manifest = JSON.parse(raw);

const fields = ["dependencies", "optionalDependencies", "peerDependencies"];

const violations = [];

for (const field of fields) {
  const deps = manifest[field];
  if (!deps || typeof deps !== "object") {
    continue;
  }

  for (const [name, range] of Object.entries(deps)) {
    if (typeof range === "string" && range.startsWith("workspace:")) {
      violations.push(`${field}.${name}=${range}`);
    }
  }
}

if (violations.length > 0) {
  console.error("Found workspace protocol ranges in publish manifest:");
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exitCode = 1;
}
