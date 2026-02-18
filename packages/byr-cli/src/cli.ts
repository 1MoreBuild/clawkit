import { stat, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { createRequire } from "node:module";
import { createInterface } from "node:readline/promises";

import {
  CliAppError,
  createCommandContext,
  createErrorEnvelope,
  createSuccessEnvelope,
  EXIT_CODES,
  mapErrorCodeToExitCode,
  toCliAppError,
} from "clawkit-cli-core";

import { runBrowseCommand, renderBrowseOutput } from "./commands/browse.js";
import { runDownloadCommand, renderDownloadOutput } from "./commands/download.js";
import { getDoctorFailureCode, renderDoctorOutput, runDoctorCommand } from "./commands/doctor.js";
import { runGetCommand, renderGetOutput } from "./commands/get.js";
import { runSearchCommand, renderSearchOutput } from "./commands/search.js";
import {
  BYR_BOOKMARKED_FACET,
  BYR_INCLDEAD_FACET,
  BYR_SPSTATE_FACET,
  parseCategoryAliases,
  parseSimpleFacetAliases,
  getByrMetadata,
} from "./domain/byr-metadata.js";
import { createByrClient, type ByrClient } from "./domain/client.js";
import { importCookieFromBrowser } from "./domain/auth/browser.js";
import { resolveClientConfig, type FlagValue } from "./domain/auth/config.js";
import { loginByrWithCredentials } from "./domain/auth/login.js";
import {
  clearAuthStore,
  maskCookieHeader,
  validateByrCookie,
  writeAuthStore,
} from "./domain/auth/store.js";
import type { ByrBrowseOptions, ByrSearchOptions, ByrSimpleFacet } from "./domain/types.js";

interface WritableLike {
  write: (chunk: string) => unknown;
}

export interface ByrCliDeps {
  client?: ByrClient;
  stdout?: WritableLike;
  stderr?: WritableLike;
  fileWriter?: (path: string, content: Uint8Array) => Promise<void>;
  loginWithCredentials?: (input: {
    baseUrl?: string;
    timeoutMs?: number;
    username: string;
    password: string;
  }) => Promise<{ cookie: string }>;
  promptInput?: (input: PromptInput) => Promise<string>;
  isInteractive?: boolean;
  clock?: () => number;
  now?: () => Date;
  requestIdFactory?: () => string;
}

interface ParsedArgs {
  command: string | undefined;
  flags: Map<string, FlagValue>;
  positional: string[];
}

interface HelpTarget {
  command?: string;
  subcommand?: string;
}

interface VersionInfo {
  name: string;
  version: string;
}

interface PromptInput {
  key: "username" | "password";
  message: string;
  secret?: boolean;
}

const SHORT_FLAG_ALIASES: Record<string, string> = {
  "-h": "help",
  "-V": "version",
  "-v": "verbose",
};

const CLI_VERSION = loadVersionInfo();
const DEFAULT_LIST_LIMIT = 50;

export async function runCli(argv: string[], deps: ByrCliDeps = {}): Promise<number> {
  const stdout = deps.stdout ?? process.stdout;
  const stderr = deps.stderr ?? process.stderr;
  const loginWithCredentials = deps.loginWithCredentials ?? loginByrWithCredentials;
  const promptInput = deps.promptInput ?? defaultPromptInput;
  const isInteractive = deps.isInteractive ?? Boolean(process.stdin.isTTY && process.stdout.isTTY);
  const parsed = parseArgs(argv);
  const json = getBooleanFlag(parsed.flags, "json");
  const verbose = getBooleanFlag(parsed.flags, "verbose");

  const context = createCommandContext({
    clock: deps.clock,
    now: deps.now,
    requestIdFactory: deps.requestIdFactory,
    verbose,
  });

  if (hasFlag(parsed.flags, "version") || parsed.command === "version") {
    if (json) {
      stdout.write(`${JSON.stringify(createSuccessEnvelope(CLI_VERSION, context.toMeta()))}\n`);
    } else {
      stdout.write(`${CLI_VERSION.name} ${CLI_VERSION.version}\n`);
    }
    return EXIT_CODES.SUCCESS;
  }

  if (parsed.command === undefined || parsed.command === "help" || hasFlag(parsed.flags, "help")) {
    const helpTarget = resolveHelpTarget(parsed);
    const helpText = renderHelp(helpTarget.command, helpTarget.subcommand);
    if (json) {
      const helpData: Record<string, unknown> = {
        help: helpText,
      };
      if (helpTarget.command) {
        helpData.command = helpTarget.command;
      }
      if (helpTarget.subcommand) {
        helpData.subcommand = helpTarget.subcommand;
      }
      stdout.write(`${JSON.stringify(createSuccessEnvelope(helpData, context.toMeta()))}\n`);
    } else {
      stdout.write(`${helpText}\n`);
    }
    return EXIT_CODES.SUCCESS;
  }

  let resolvedClient: ByrClient | undefined;
  const getClient = async (): Promise<ByrClient> => {
    if (deps.client) {
      return deps.client;
    }

    if (resolvedClient) {
      return resolvedClient;
    }

    const resolved = await resolveClientConfig({
      cwd: process.cwd(),
      env: process.env,
      getFlag: (key) => parsed.flags.get(key),
    });

    resolvedClient = createByrClient({
      baseUrl: resolved.baseUrl,
      timeoutMs: resolved.timeoutMs,
      cookie: resolved.cookie,
      username: resolved.username,
      password: resolved.password,
    });
    return resolvedClient;
  };

  try {
    const result = await dispatch(parsed, {
      getClient,
      fileWriter: deps.fileWriter ?? writeFile,
      loginWithCredentials,
      promptInput,
      isInteractive,
    });

    if (json) {
      stdout.write(`${JSON.stringify(createSuccessEnvelope(result.data, context.toMeta()))}\n`);
    } else {
      stdout.write(`${result.humanOutput}\n`);
    }

    return EXIT_CODES.SUCCESS;
  } catch (error) {
    const appError = toCliAppError(error);
    const exitCode = mapErrorCodeToExitCode(appError.code);

    if (json) {
      stdout.write(
        `${JSON.stringify(
          createErrorEnvelope(appError.code, appError.message, appError.details),
        )}\n`,
      );
    } else {
      stderr.write(formatHumanError(appError));
    }

    return exitCode;
  }
}

interface DispatchDeps {
  getClient: () => Promise<ByrClient>;
  fileWriter: (path: string, content: Uint8Array) => Promise<void>;
  loginWithCredentials: (input: {
    baseUrl?: string;
    timeoutMs?: number;
    username: string;
    password: string;
  }) => Promise<{ cookie: string }>;
  promptInput: (input: PromptInput) => Promise<string>;
  isInteractive: boolean;
}

interface DispatchResult {
  data: unknown;
  humanOutput: string;
}

async function dispatch(parsed: ParsedArgs, deps: DispatchDeps): Promise<DispatchResult> {
  switch (parsed.command) {
    case "check":
      return dispatchCheck(parsed, deps);
    case "whoami":
      return dispatchWhoami(parsed, deps);
    case "browse":
      return dispatchBrowse(parsed, deps);
    case "doctor":
      return dispatchDoctor(parsed, deps);
    case "search":
      return dispatchSearch(parsed, deps);
    case "get":
      return dispatchGet(parsed, deps);
    case "download":
      return dispatchDownload(parsed, deps);
    case "user":
      return dispatchUser(parsed, deps);
    case "meta":
      return dispatchMeta(parsed, deps);
    case "auth":
      return dispatchAuth(parsed, deps);
    default:
      throw createArgumentError("E_ARG_UNSUPPORTED", `Unknown command: ${parsed.command}`, {
        command: parsed.command,
      });
  }
}

async function dispatchSearch(parsed: ParsedArgs, deps: DispatchDeps): Promise<DispatchResult> {
  const query = getOptionalString(parsed.flags, "query") ?? "";
  const imdb = getOptionalString(parsed.flags, "imdb");
  const limit = getPositiveInteger(parsed.flags, "limit", DEFAULT_LIST_LIMIT);

  if (query.trim().length === 0 && (imdb === undefined || imdb.trim().length === 0)) {
    throw createArgumentError("E_ARG_MISSING", "--query or --imdb is required", {
      arg: "query|imdb",
    });
  }
  if (query.trim().length > 0 && imdb !== undefined) {
    throw createArgumentError("E_ARG_CONFLICT", "--query and --imdb cannot be used together", {
      args: ["query", "imdb"],
    });
  }

  const categoryRaw = getStringValues(parsed.flags, "category");
  const categoryParsed = parseCategoryAliases(categoryRaw);
  if (categoryParsed.invalid.length > 0) {
    throw createArgumentError("E_ARG_INVALID", "--category contains invalid values", {
      invalid: categoryParsed.invalid,
      allowed: getByrMetadata()
        .category.options.map((option) => option.aliases)
        .flat(),
    });
  }

  const incldead = parseSingleFacetFlag(parsed.flags, "incldead", BYR_INCLDEAD_FACET);
  const spstate = parseSingleFacetFlag(parsed.flags, "spstate", BYR_SPSTATE_FACET);
  const bookmarked = parseSingleFacetFlag(parsed.flags, "bookmarked", BYR_BOOKMARKED_FACET);
  const page = getOptionalPositiveInteger(parsed.flags, "page");

  const options: ByrSearchOptions = {
    categoryIds: categoryParsed.values.length > 0 ? categoryParsed.values : undefined,
    incldead: incldead as ByrSearchOptions["incldead"],
    spstate: spstate as ByrSearchOptions["spstate"],
    bookmarked: bookmarked as ByrSearchOptions["bookmarked"],
    imdb,
    page,
  };

  const output = await runSearchCommand(await deps.getClient(), {
    query,
    limit,
    options,
  });
  return {
    data: output,
    humanOutput: renderSearchOutput(output),
  };
}

async function dispatchBrowse(parsed: ParsedArgs, deps: DispatchDeps): Promise<DispatchResult> {
  const limit = getPositiveInteger(parsed.flags, "limit", DEFAULT_LIST_LIMIT);

  if (hasFlag(parsed.flags, "query") || hasFlag(parsed.flags, "imdb")) {
    throw createArgumentError("E_ARG_UNSUPPORTED", "browse does not support --query or --imdb", {
      args: ["query", "imdb"],
    });
  }

  const categoryRaw = getStringValues(parsed.flags, "category");
  const categoryParsed = parseCategoryAliases(categoryRaw);
  if (categoryParsed.invalid.length > 0) {
    throw createArgumentError("E_ARG_INVALID", "--category contains invalid values", {
      invalid: categoryParsed.invalid,
      allowed: getByrMetadata()
        .category.options.map((option) => option.aliases)
        .flat(),
    });
  }

  const incldead = parseSingleFacetFlag(parsed.flags, "incldead", BYR_INCLDEAD_FACET);
  const spstate = parseSingleFacetFlag(parsed.flags, "spstate", BYR_SPSTATE_FACET);
  const bookmarked = parseSingleFacetFlag(parsed.flags, "bookmarked", BYR_BOOKMARKED_FACET);
  const page = getOptionalPositiveInteger(parsed.flags, "page");

  const options: ByrBrowseOptions = {
    categoryIds: categoryParsed.values.length > 0 ? categoryParsed.values : undefined,
    incldead: incldead as ByrBrowseOptions["incldead"],
    spstate: spstate as ByrBrowseOptions["spstate"],
    bookmarked: bookmarked as ByrBrowseOptions["bookmarked"],
    page,
  };

  const output = await runBrowseCommand(await deps.getClient(), {
    limit,
    options,
  });
  return {
    data: output,
    humanOutput: renderBrowseOutput(output),
  };
}

async function dispatchDoctor(parsed: ParsedArgs, deps: DispatchDeps): Promise<DispatchResult> {
  const verify = getBooleanFlag(parsed.flags, "verify");
  const report = await runDoctorCommand(await deps.getClient(), {
    cwd: process.cwd(),
    env: process.env,
    verify,
    getFlag: (key) => parsed.flags.get(key),
  });

  const failureCode = getDoctorFailureCode(report);
  if (failureCode) {
    throw new CliAppError({
      code: failureCode,
      message: `Doctor found ${report.summary.errors} error(s).`,
      details: report,
    });
  }

  return {
    data: report,
    humanOutput: renderDoctorOutput(report),
  };
}

async function dispatchGet(parsed: ParsedArgs, deps: DispatchDeps): Promise<DispatchResult> {
  const id = getRequiredString(parsed.flags, "id");
  const output = await runGetCommand(await deps.getClient(), { id });
  return {
    data: output,
    humanOutput: renderGetOutput(output),
  };
}

async function dispatchDownload(parsed: ParsedArgs, deps: DispatchDeps): Promise<DispatchResult> {
  const id = getRequiredString(parsed.flags, "id");
  const outputPath = getRequiredString(parsed.flags, "output");
  const dryRun = getBooleanFlag(parsed.flags, "dry-run");

  const output = await runDownloadCommand(await deps.getClient(), {
    id,
    outputPath,
    dryRun,
    writeFile: deps.fileWriter,
    resolveOutputPath: resolveDownloadOutputPath,
  });

  return {
    data: output,
    humanOutput: renderDownloadOutput(output),
  };
}

async function resolveDownloadOutputPath(path: string, fileName: string): Promise<string> {
  try {
    const fileStat = await stat(path);
    if (fileStat.isDirectory()) {
      return join(path, basename(fileName));
    }
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code !== "ENOENT") {
      throw error;
    }
  }

  return path;
}

async function dispatchUser(parsed: ParsedArgs, deps: DispatchDeps): Promise<DispatchResult> {
  const subcommand = parsed.positional[0];
  if (subcommand !== "info") {
    throw createArgumentError("E_ARG_UNSUPPORTED", "user subcommand must be: info", {
      subcommand,
    });
  }

  const client = await deps.getClient();
  if (typeof client.getUserInfo !== "function") {
    throw createArgumentError("E_ARG_UNSUPPORTED", "Current client does not support user info", {});
  }

  const info = await client.getUserInfo();
  return {
    data: info,
    humanOutput: [
      `User: ${info.name} (${info.id})`,
      `Level: ${info.levelName}${info.levelId ? ` (#${info.levelId})` : ""}`,
      `Ratio: ${info.ratio}`,
      `Uploaded/Downloaded: ${info.trueUploadedBytes}/${info.trueDownloadedBytes}`,
      `Messages: ${info.messageCount}`,
      `Bonus/h: ${info.bonusPerHour}`,
      `Seeding: ${info.seeding} (${info.seedingSizeBytes} bytes)`,
      `Uploads: ${info.uploads}`,
      `Last access: ${info.lastAccessAt}`,
    ].join("\n"),
  };
}

async function dispatchMeta(parsed: ParsedArgs, deps: DispatchDeps): Promise<DispatchResult> {
  const subcommand = parsed.positional[0];
  const client = await deps.getClient();

  if (subcommand === "categories") {
    const categories =
      typeof client.getCategories === "function" ? await client.getCategories() : getByrMetadata();
    return {
      data: categories,
      humanOutput: [
        "BYR categories:",
        ...categories.category.options.map((item) => `  ${item.value}: ${item.name}`),
      ].join("\n"),
    };
  }

  if (subcommand === "levels") {
    const levels =
      typeof client.getLevelRequirements === "function"
        ? await client.getLevelRequirements()
        : getByrMetadata().levels;
    return {
      data: levels,
      humanOutput: ["BYR levels:", ...levels.map((level) => `  #${level.id} ${level.name}`)].join(
        "\n",
      ),
    };
  }

  throw createArgumentError("E_ARG_UNSUPPORTED", "meta subcommand must be: categories|levels", {
    subcommand,
  });
}

async function dispatchAuth(parsed: ParsedArgs, deps: DispatchDeps): Promise<DispatchResult> {
  const subcommand = parsed.positional[0];

  switch (subcommand) {
    case "status": {
      const verify = getBooleanFlag(parsed.flags, "verify");
      const resolved = await resolveClientConfig({
        cwd: process.cwd(),
        env: process.env,
        getFlag: (key) => parsed.flags.get(key),
      });

      const hasCredentials =
        typeof resolved.cookie === "string" && resolved.cookie.trim().length > 0;

      const result: Record<string, unknown> = {
        hasCredentials,
        source: resolved.cookieSource ?? "none",
        cookie: hasCredentials ? maskCookieHeader(resolved.cookie as string) : undefined,
      };

      if (verify && hasCredentials) {
        const client = deps.getClient();
        const verifier = (await client).verifyAuth;
        if (typeof verifier === "function") {
          result.verify = await verifier();
        } else {
          result.verify = { authenticated: false };
        }
      }

      return {
        data: result,
        humanOutput: [
          `Credentials: ${hasCredentials ? "present" : "missing"}`,
          `Source: ${String(result.source)}`,
          verify
            ? `Verified: ${String((result.verify as { authenticated: boolean } | undefined)?.authenticated ?? false)}`
            : undefined,
        ]
          .filter((line): line is string => Boolean(line))
          .join("\n"),
      };
    }

    case "login": {
      const resolved = await resolveClientConfig({
        cwd: process.cwd(),
        env: process.env,
        getFlag: (key) => parsed.flags.get(key),
      });

      let username = getOptionalString(parsed.flags, "username") ?? resolved.username;
      let password = getOptionalString(parsed.flags, "password") ?? resolved.password;

      if (!username && deps.isInteractive) {
        username = (
          await deps.promptInput({
            key: "username",
            message: "BYR username: ",
          })
        ).trim();
      }

      if (!password && deps.isInteractive) {
        password = await deps.promptInput({
          key: "password",
          message: "BYR password: ",
          secret: true,
        });
      }

      const normalizedUsername = username?.trim();
      const normalizedPassword = password;

      const missingArgs: string[] = [];
      if (!normalizedUsername) {
        missingArgs.push("username");
      }
      if (!normalizedPassword) {
        missingArgs.push("password");
      }

      if (missingArgs.length > 0) {
        throw createArgumentError(
          "E_ARG_MISSING",
          "--username/--password are required (or provide interactive input in a TTY)",
          {
            missing: missingArgs,
          },
        );
      }

      const login = await deps.loginWithCredentials({
        baseUrl: resolved.baseUrl,
        timeoutMs: resolved.timeoutMs,
        username: normalizedUsername as string,
        password: normalizedPassword as string,
      });

      const saved = await writeAuthStore(login.cookie, "login");
      return {
        data: {
          source: saved.source,
          updatedAt: saved.updatedAt,
          cookie: maskCookieHeader(saved.cookie),
        },
        humanOutput: ["BYR login success.", `Updated: ${saved.updatedAt}`].join("\n"),
      };
    }

    case "import-cookie": {
      const manualCookie = getOptionalString(parsed.flags, "cookie");
      const fromBrowser = getOptionalString(parsed.flags, "from-browser");
      const profile = getOptionalString(parsed.flags, "profile");

      if ((manualCookie && fromBrowser) || (!manualCookie && !fromBrowser)) {
        throw createArgumentError("E_ARG_CONFLICT", "Use either --cookie or --from-browser", {
          args: ["cookie", "from-browser"],
        });
      }

      let cookieToStore: string;
      let source: string;

      if (manualCookie) {
        validateByrCookie(manualCookie);
        cookieToStore = manualCookie;
        source = "manual";
      } else {
        if (fromBrowser !== "chrome" && fromBrowser !== "safari") {
          throw createArgumentError("E_ARG_INVALID", "--from-browser must be chrome|safari", {
            value: fromBrowser,
          });
        }

        const imported = await importCookieFromBrowser(fromBrowser, profile);
        validateByrCookie(imported.cookie);
        cookieToStore = imported.cookie;
        source = imported.source;
      }

      const saved = await writeAuthStore(cookieToStore, source);
      return {
        data: {
          source: saved.source,
          updatedAt: saved.updatedAt,
          cookie: maskCookieHeader(saved.cookie),
        },
        humanOutput: [
          "BYR cookie imported.",
          `Source: ${saved.source}`,
          `Updated: ${saved.updatedAt}`,
        ].join("\n"),
      };
    }

    case "logout": {
      const deleted = await clearAuthStore();
      return {
        data: { deleted },
        humanOutput: deleted ? "BYR auth store cleared." : "BYR auth store was already empty.",
      };
    }

    default:
      throw createArgumentError(
        "E_ARG_UNSUPPORTED",
        "auth subcommand must be: status|login|import-cookie|logout",
        {
          subcommand,
        },
      );
  }
}

async function dispatchCheck(parsed: ParsedArgs, deps: DispatchDeps): Promise<DispatchResult> {
  if (parsed.positional.length > 0) {
    throw createArgumentError("E_ARG_UNSUPPORTED", "check command does not accept subcommands", {
      positional: parsed.positional,
    });
  }

  const resolved = await resolveClientConfig({
    cwd: process.cwd(),
    env: process.env,
    getFlag: (key) => parsed.flags.get(key),
  });

  const hasCredentials = typeof resolved.cookie === "string" && resolved.cookie.trim().length > 0;
  if (!hasCredentials) {
    throw new CliAppError({
      code: "E_AUTH_REQUIRED",
      message: "Missing BYR credentials. Set BYR_COOKIE or run `byr auth import-cookie`.",
    });
  }

  const client = await deps.getClient();
  let authenticated = true;
  if (typeof client.verifyAuth === "function") {
    const verify = await client.verifyAuth();
    authenticated = verify.authenticated;
  }

  if (!authenticated) {
    throw new CliAppError({
      code: "E_AUTH_INVALID",
      message: "BYR credentials are present but verification failed.",
    });
  }

  const result = {
    hasCredentials: true,
    authenticated: true,
    source: resolved.cookieSource ?? "none",
  };

  return {
    data: result,
    humanOutput: ["Authentication: valid", `Source: ${result.source}`].join("\n"),
  };
}

async function dispatchWhoami(parsed: ParsedArgs, deps: DispatchDeps): Promise<DispatchResult> {
  if (parsed.positional.length > 0) {
    throw createArgumentError("E_ARG_UNSUPPORTED", "whoami command does not accept subcommands", {
      positional: parsed.positional,
    });
  }

  const client = await deps.getClient();
  if (typeof client.getUserInfo !== "function") {
    throw createArgumentError("E_ARG_UNSUPPORTED", "Current client does not support user info", {});
  }

  const info = await client.getUserInfo();
  const result = {
    id: info.id,
    name: info.name,
    levelName: info.levelName,
    levelId: info.levelId,
    ratio: info.ratio,
  };

  return {
    data: result,
    humanOutput: `${info.name} (${info.id}) | Level: ${info.levelName}${info.levelId ? ` (#${info.levelId})` : ""} | Ratio: ${info.ratio}`,
  };
}

function parseArgs(argv: string[]): ParsedArgs {
  let command: string | undefined;
  const flags = new Map<string, FlagValue>();
  const positional: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    const shortAlias = SHORT_FLAG_ALIASES[token];
    if (shortAlias !== undefined) {
      flags.set(shortAlias, true);
      continue;
    }

    if (token.startsWith("--")) {
      const stripped = token.slice(2);
      const eqIndex = stripped.indexOf("=");
      if (eqIndex >= 0) {
        const key = stripped.slice(0, eqIndex);
        const value = stripped.slice(eqIndex + 1);
        appendFlagValue(flags, key, value);
        continue;
      }

      const next = argv[index + 1];
      if (next !== undefined && !next.startsWith("-")) {
        appendFlagValue(flags, stripped, next);
        index += 1;
        continue;
      }

      flags.set(stripped, true);
      continue;
    }

    if (command === undefined) {
      command = token;
      continue;
    }

    positional.push(token);
  }

  return {
    command,
    flags,
    positional,
  };
}

function hasFlag(flags: Map<string, FlagValue>, key: string): boolean {
  return flags.has(key);
}

function appendFlagValue(flags: Map<string, FlagValue>, key: string, value: string): void {
  const previous = flags.get(key);
  if (previous === undefined) {
    flags.set(key, value);
    return;
  }

  if (Array.isArray(previous)) {
    flags.set(key, [...previous, value]);
    return;
  }

  if (typeof previous === "string") {
    flags.set(key, [previous, value]);
    return;
  }

  flags.set(key, value);
}

function getBooleanFlag(flags: Map<string, FlagValue>, key: string): boolean {
  const value = flags.get(key);
  if (value === undefined) {
    return false;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    const candidate = value.at(-1);
    if (candidate === "true") {
      return true;
    }
    if (candidate === "false") {
      return false;
    }
    throw createArgumentError("E_ARG_INVALID", `--${key} must be true or false`, {
      arg: key,
      value: candidate,
    });
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  throw createArgumentError("E_ARG_INVALID", `--${key} must be true or false`, {
    arg: key,
    value,
  });
}

function getRequiredString(flags: Map<string, FlagValue>, key: string): string {
  const value = getOptionalString(flags, key);
  if (value === undefined || value.trim().length === 0) {
    throw createArgumentError("E_ARG_MISSING", `--${key} is required`, {
      arg: key,
    });
  }

  return value;
}

function getOptionalString(flags: Map<string, FlagValue>, key: string): string | undefined {
  const value = flags.get(key);
  if (value === undefined || typeof value === "boolean") {
    return undefined;
  }

  if (Array.isArray(value)) {
    const candidate = value.at(-1);
    return candidate !== undefined && candidate.trim().length > 0 ? candidate : undefined;
  }

  return value.trim().length > 0 ? value : undefined;
}

function getStringValues(flags: Map<string, FlagValue>, key: string): string[] {
  const value = flags.get(key);
  if (value === undefined || typeof value === "boolean") {
    return [];
  }

  const values = Array.isArray(value) ? value : [value];
  return values.filter((item) => item.trim().length > 0);
}

function getPositiveInteger(flags: Map<string, FlagValue>, key: string, fallback: number): number {
  const value = getOptionalString(flags, key);
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw createArgumentError("E_ARG_INVALID", `--${key} must be a positive integer`, {
      arg: key,
      value,
    });
  }

  return parsed;
}

function getOptionalPositiveInteger(
  flags: Map<string, FlagValue>,
  key: string,
): number | undefined {
  const value = getOptionalString(flags, key);
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw createArgumentError("E_ARG_INVALID", `--${key} must be a positive integer`, {
      arg: key,
      value,
    });
  }
  return parsed;
}

function parseSingleFacetFlag(
  flags: Map<string, FlagValue>,
  key: string,
  facet: ByrSimpleFacet,
): number | undefined {
  const values = getStringValues(flags, key);
  if (values.length === 0) {
    return undefined;
  }

  const parsed = parseSimpleFacetAliases(facet, values);
  if (parsed.invalid.length > 0) {
    throw createArgumentError("E_ARG_INVALID", `--${key} contains invalid values`, {
      invalid: parsed.invalid,
      allowed: facet.options.map((option) => option.aliases).flat(),
    });
  }
  if (parsed.values.length !== 1) {
    throw createArgumentError("E_ARG_INVALID", `--${key} expects exactly one value`, {
      values,
    });
  }
  return parsed.values[0];
}

function resolveHelpTarget(parsed: ParsedArgs): HelpTarget {
  if (parsed.command === "help") {
    return {
      command: parsed.positional[0],
      subcommand: parsed.positional[1],
    };
  }

  if (hasFlag(parsed.flags, "help")) {
    return {
      command: parsed.command,
      subcommand: parsed.positional[0],
    };
  }

  return {};
}

function renderHelp(command?: string, subcommand?: string): string {
  if (command === "search") {
    return [
      "byr search",
      "",
      "Usage:",
      "  byr search --query <text> [--limit <n, default 50>] [--category <alias|id>] [--incldead <alias|id>] [--spstate <alias|id>] [--bookmarked <alias|id>] [--page <n>] [--json]",
      "  byr search --imdb <tt-id> [--limit <n, default 50>] [--json]",
      "Notes:",
      "  --page omitted: auto-fetches subsequent pages until --limit is reached.",
      "  --page specified: fetches only that page.",
    ].join("\n");
  }

  if (command === "get") {
    return ["byr get", "", "Usage:", "  byr get --id <torrent-id> [--json]"].join("\n");
  }

  if (command === "download") {
    return [
      "byr download",
      "",
      "Usage:",
      "  byr download --id <torrent-id> --output <path|directory> [--dry-run] [--json]",
      "Notes:",
      "  If --output is a directory, file name is auto-derived from the torrent metadata.",
    ].join("\n");
  }

  if (command === "browse") {
    return [
      "byr browse",
      "",
      "Usage:",
      "  byr browse [--limit <n, default 50>] [--category <alias|id>] [--incldead <alias|id>] [--spstate <alias|id>] [--bookmarked <alias|id>] [--page <n>] [--json]",
      "Notes:",
      "  --page omitted: auto-fetches subsequent pages until --limit is reached.",
      "  --page specified: fetches only that page.",
    ].join("\n");
  }

  if (command === "user") {
    return ["byr user", "", "Usage:", "  byr user info [--json]"].join("\n");
  }

  if (command === "meta") {
    return [
      "byr meta",
      "",
      "Usage:",
      "  byr meta categories [--json]",
      "  byr meta levels [--json]",
    ].join("\n");
  }

  if (command === "auth") {
    if (subcommand === "status") {
      return ["byr auth status", "", "Usage:", "  byr auth status [--verify] [--json]"].join("\n");
    }
    if (subcommand === "import-cookie") {
      return [
        "byr auth import-cookie",
        "",
        "Usage:",
        '  byr auth import-cookie --cookie "uid=...; pass=..." [--json]',
        "  byr auth import-cookie --from-browser <chrome|safari> [--profile <name>] [--json]",
      ].join("\n");
    }
    if (subcommand === "login") {
      return [
        "byr auth login",
        "",
        "Usage:",
        "  byr auth login [--username <name>] [--password <password>] [--json]",
      ].join("\n");
    }
    if (subcommand === "logout") {
      return ["byr auth logout", "", "Usage:", "  byr auth logout [--json]"].join("\n");
    }

    return [
      "byr auth",
      "",
      "Usage:",
      "  byr auth status [--verify] [--json]",
      "  byr auth login [--username <name>] [--password <password>] [--json]",
      '  byr auth import-cookie --cookie "uid=...; pass=..." [--json]',
      "  byr auth import-cookie --from-browser <chrome|safari> [--profile <name>] [--json]",
      "  byr auth logout [--json]",
    ].join("\n");
  }

  if (command === "check") {
    return ["byr check", "", "Usage:", "  byr check [--json]"].join("\n");
  }

  if (command === "whoami") {
    return ["byr whoami", "", "Usage:", "  byr whoami [--json]"].join("\n");
  }

  if (command === "version") {
    return ["byr version", "", "Usage:", "  byr version [--json]"].join("\n");
  }

  if (command === "doctor") {
    return ["byr doctor", "", "Usage:", "  byr doctor [--verify] [--json]"].join("\n");
  }

  return [
    "byr CLI",
    "",
    "Usage:",
    "  byr [--help|-h] [--version|-V]",
    "  byr help [command]",
    "  byr version [--json]",
    "  byr check [--json]",
    "  byr whoami [--json]",
    "  byr browse [--limit <n, default 50>] [--category <alias|id>] [--incldead <alias|id>] [--spstate <alias|id>] [--bookmarked <alias|id>] [--page <n>] [--json]",
    "  byr search --query <text> [--limit <n, default 50>] [--category <alias|id>] [--incldead <alias|id>] [--spstate <alias|id>] [--bookmarked <alias|id>] [--page <n>] [--json]",
    "  byr search --imdb <tt-id> [--limit <n, default 50>] [--json]",
    "  byr get --id <torrent-id> [--json]",
    "  byr download --id <torrent-id> --output <path|directory> [--dry-run] [--json]",
    "  byr doctor [--verify] [--json]",
    "  byr user info [--json]",
    "  byr meta categories [--json]",
    "  byr meta levels [--json]",
    "  byr auth status [--verify] [--json]",
    "  byr auth login [--username <name>] [--password <password>] [--json]",
    '  byr auth import-cookie --cookie "uid=...; pass=..." [--json]',
    "  byr auth import-cookie --from-browser <chrome|safari> [--profile <name>] [--json]",
    "  byr auth logout [--json]",
    "",
    "Auth priority:",
    "  CLI flags > ENV > ./.byrrc.json > ~/.config/byr-cli/config.json > ~/.config/byr-cli/auth.json",
    "",
    "Flags:",
    "  -h, --help   Show help",
    "  -V, --version Show CLI version",
    "  --json       Output CliEnvelope JSON",
    "  --dry-run    Validate and show write plan without writing files",
    "  -v, --verbose Include verbose mode in metadata",
  ].join("\n");
}

function loadVersionInfo(): VersionInfo {
  try {
    const require = createRequire(import.meta.url);
    const pkg = require("../package.json") as { name?: string; version?: string };
    return {
      name: typeof pkg.name === "string" ? pkg.name : "byr-pt-cli",
      version: typeof pkg.version === "string" ? pkg.version : "0.0.0",
    };
  } catch {
    return {
      name: "byr-pt-cli",
      version: "0.0.0",
    };
  }
}

async function defaultPromptInput(input: PromptInput): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new CliAppError({
      code: "E_ARG_MISSING",
      message: "Interactive prompt is unavailable in non-TTY mode.",
    });
  }

  if (input.secret) {
    return promptHiddenInput(input.message);
  }

  const readline = createInterface({
    input: process.stdin,
    output: process.stderr,
  });

  try {
    return (await readline.question(input.message)).trim();
  } finally {
    readline.close();
  }
}

async function promptHiddenInput(message: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const input = process.stdin;
    const output = process.stderr;

    if (!input.isTTY || typeof input.setRawMode !== "function") {
      reject(
        new CliAppError({
          code: "E_ARG_MISSING",
          message: "Interactive password prompt is unavailable in non-TTY mode.",
        }),
      );
      return;
    }

    let value = "";
    output.write(message);

    const onData = (chunk: Buffer | string): void => {
      const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");

      for (const char of text) {
        if (char === "\r" || char === "\n") {
          cleanup();
          output.write("\n");
          resolve(value);
          return;
        }

        if (char === "\u0003") {
          cleanup();
          reject(
            new CliAppError({
              code: "E_UNKNOWN",
              message: "Prompt interrupted by user.",
            }),
          );
          return;
        }

        if (char === "\u007f" || char === "\b") {
          if (value.length > 0) {
            value = value.slice(0, -1);
          }
          continue;
        }

        value += char;
      }
    };

    const cleanup = (): void => {
      input.off("data", onData);
      try {
        input.setRawMode(false);
      } catch {}
      input.pause();
    };

    input.resume();
    input.setRawMode(true);
    input.on("data", onData);
  });
}

function createArgumentError(
  code: "E_ARG_INVALID" | "E_ARG_MISSING" | "E_ARG_CONFLICT" | "E_ARG_UNSUPPORTED",
  message: string,
  details?: unknown,
): CliAppError {
  return new CliAppError({
    code,
    message,
    details,
  });
}

function formatHumanError(error: CliAppError): string {
  const details = error.details === undefined ? "" : `\nDetails: ${JSON.stringify(error.details)}`;
  return `Error (${error.code}): ${error.message}${details}\n`;
}
