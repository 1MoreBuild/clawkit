import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { CliAppError, type CliErrorCode } from "clawkit-cli-core";

import type { ByrClient } from "../domain/client.js";
import { resolveClientConfig, type FlagValue } from "../domain/auth/config.js";
import {
  getByrAuthStorePath,
  getByrGlobalConfigPath,
  validateByrCookie,
} from "../domain/auth/store.js";

type DoctorLevel = "info" | "warn" | "error";

export interface DoctorCheck {
  id: string;
  level: DoctorLevel;
  ok: boolean;
  message: string;
  details?: unknown;
  errorCode?: CliErrorCode;
}

export interface DoctorSummary {
  total: number;
  infos: number;
  warnings: number;
  errors: number;
}

export interface DoctorCommandOutput {
  verify: boolean;
  checks: DoctorCheck[];
  summary: DoctorSummary;
}

export interface DoctorCommandInput {
  cwd: string;
  env: NodeJS.ProcessEnv;
  verify: boolean;
  getFlag?: (key: string) => FlagValue | undefined;
}

const MIN_NODE_VERSION = "22.12.0";

export async function runDoctorCommand(
  client: ByrClient,
  input: DoctorCommandInput,
): Promise<DoctorCommandOutput> {
  const checks: DoctorCheck[] = [];

  checks.push(checkNodeVersion());
  checks.push(await checkJsonFile("project-config", join(input.cwd, ".byrrc.json")));
  checks.push(await checkJsonFile("global-config", getByrGlobalConfigPath()));
  checks.push(await checkJsonFile("auth-store", getByrAuthStorePath()));
  checks.push(checkBrowserImportRuntime());

  const resolved = await resolveClientConfig({
    cwd: input.cwd,
    env: input.env,
    getFlag: input.getFlag ?? (() => undefined),
  });
  const cookie = resolved.cookie?.trim();

  if (!cookie) {
    checks.push({
      id: "credentials",
      level: "warn",
      ok: false,
      message: "No credentials found in current auth priority chain.",
      details: {
        hint: "Set BYR_COOKIE or run `byr auth import-cookie` / `byr auth login`.",
      },
    });
  } else {
    try {
      const parsed = validateByrCookie(cookie);
      checks.push({
        id: "credentials",
        level: "info",
        ok: true,
        message: "Credentials are present and parseable.",
        details: {
          source: resolved.cookieSource ?? "unknown",
          mode: parsed.uid && parsed.pass ? "legacy" : "session",
        },
      });
    } catch (error) {
      const appError = toCliError(error, "E_AUTH_INVALID");
      checks.push({
        id: "credentials",
        level: "error",
        ok: false,
        message: appError.message,
        details: appError.details,
        errorCode: appError.code,
      });
    }
  }

  if (input.verify) {
    if (!cookie) {
      checks.push({
        id: "verify-auth",
        level: "warn",
        ok: false,
        message: "Skipped online verification because credentials are missing.",
      });
    } else if (typeof client.verifyAuth !== "function") {
      checks.push({
        id: "verify-auth",
        level: "warn",
        ok: false,
        message: "Client does not support online auth verification.",
      });
    } else {
      try {
        const verified = await client.verifyAuth();
        if (verified.authenticated) {
          checks.push({
            id: "verify-auth",
            level: "info",
            ok: true,
            message: "Online authentication verification passed.",
          });
        } else {
          checks.push({
            id: "verify-auth",
            level: "error",
            ok: false,
            message: "Online authentication verification failed.",
            errorCode: "E_AUTH_INVALID",
          });
        }
      } catch (error) {
        const appError = toCliError(error, "E_UPSTREAM_NETWORK");
        checks.push({
          id: "verify-auth",
          level: "error",
          ok: false,
          message: appError.message,
          details: appError.details,
          errorCode: appError.code,
        });
      }
    }
  } else {
    checks.push({
      id: "verify-auth",
      level: "info",
      ok: true,
      message: "Online verification skipped (use --verify to enable).",
    });
  }

  const summary = summarizeChecks(checks);
  return {
    verify: input.verify,
    checks,
    summary,
  };
}

export function getDoctorFailureCode(report: DoctorCommandOutput): CliErrorCode | undefined {
  const firstError = report.checks.find((check) => check.level === "error");
  return firstError?.errorCode ?? (firstError ? "E_UNKNOWN" : undefined);
}

export function renderDoctorOutput(report: DoctorCommandOutput): string {
  const lines: string[] = [
    `Doctor summary: ${report.summary.errors} error(s), ${report.summary.warnings} warning(s), ${report.summary.infos} info`,
  ];

  for (const check of report.checks) {
    lines.push(`[${check.level}] ${check.id}: ${check.message}`);
  }

  return lines.join("\n");
}

function summarizeChecks(checks: DoctorCheck[]): DoctorSummary {
  let infos = 0;
  let warnings = 0;
  let errors = 0;

  for (const check of checks) {
    if (check.level === "info") {
      infos += 1;
      continue;
    }
    if (check.level === "warn") {
      warnings += 1;
      continue;
    }
    errors += 1;
  }

  return {
    total: checks.length,
    infos,
    warnings,
    errors,
  };
}

function checkNodeVersion(): DoctorCheck {
  const current = process.versions.node;
  if (compareSemver(current, MIN_NODE_VERSION) >= 0) {
    return {
      id: "node-version",
      level: "info",
      ok: true,
      message: `Node.js ${current} satisfies >= ${MIN_NODE_VERSION}.`,
    };
  }

  return {
    id: "node-version",
    level: "error",
    ok: false,
    message: `Node.js ${current} is below required >= ${MIN_NODE_VERSION}.`,
    errorCode: "E_UNKNOWN",
  };
}

async function checkJsonFile(id: string, path: string): Promise<DoctorCheck> {
  try {
    const content = await readFile(path, "utf8");
    JSON.parse(content);
    return {
      id,
      level: "info",
      ok: true,
      message: `Readable JSON: ${path}`,
    };
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT") {
      return {
        id,
        level: "info",
        ok: true,
        message: `Optional file not found: ${path}`,
      };
    }

    return {
      id,
      level: "error",
      ok: false,
      message: `Invalid or unreadable JSON: ${path}`,
      details: {
        reason: nodeError.message,
      },
      errorCode: "E_AUTH_INVALID",
    };
  }
}

function checkBrowserImportRuntime(): DoctorCheck {
  if (process.platform !== "darwin") {
    return {
      id: "browser-import-runtime",
      level: "warn",
      ok: false,
      message: "Browser cookie import is only supported on macOS.",
      details: {
        platform: process.platform,
      },
    };
  }

  const sqliteCheck = spawnSync("sqlite3", ["-version"], { encoding: "utf8" });
  const securityCheck = spawnSync("security", ["-h"], { encoding: "utf8" });

  const missing: string[] = [];
  if (sqliteCheck.status !== 0) {
    missing.push("sqlite3");
  }
  if (securityCheck.status !== 0) {
    missing.push("security");
  }

  if (missing.length > 0) {
    return {
      id: "browser-import-runtime",
      level: "warn",
      ok: false,
      message: "Browser import dependencies are incomplete.",
      details: {
        missing,
      },
    };
  }

  return {
    id: "browser-import-runtime",
    level: "info",
    ok: true,
    message: "Browser import runtime dependencies are available.",
  };
}

function compareSemver(a: string, b: string): number {
  const aParts = parseSemver(a);
  const bParts = parseSemver(b);

  for (let index = 0; index < 3; index += 1) {
    const delta = (aParts[index] ?? 0) - (bParts[index] ?? 0);
    if (delta !== 0) {
      return delta > 0 ? 1 : -1;
    }
  }

  return 0;
}

function parseSemver(value: string): number[] {
  return value
    .split(".")
    .slice(0, 3)
    .map((part) => Number.parseInt(part, 10))
    .map((part) => (Number.isFinite(part) ? part : 0));
}

function toCliError(error: unknown, fallbackCode: CliErrorCode): CliAppError {
  if (error instanceof CliAppError) {
    return error;
  }

  if (error instanceof Error) {
    return new CliAppError({
      code: fallbackCode,
      message: error.message,
      details: { name: error.name },
      cause: error,
    });
  }

  return new CliAppError({
    code: fallbackCode,
    message: "Unknown error",
    details: error,
  });
}
