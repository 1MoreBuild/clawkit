import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { spawn } from "node:child_process";
import {
  CliAppError,
  createCommandContext,
  createErrorEnvelope,
  createSuccessEnvelope,
  EXIT_CODES,
  mapErrorCodeToExitCode,
  toCliAppError,
} from "clawkit-cli-core";

type EngineName = "claude" | "codex";

type FlagValue = string | boolean | string[];

interface ParsedArgs {
  command?: string;
  flags: Map<string, FlagValue>;
}

interface Config {
  defaultEngine: EngineName;
  engines: Record<EngineName, { command: string[] }>;
}

interface DoctorCheck {
  engine: EngineName;
  command: string[];
  binary: { ok: boolean; message: string };
  auth?: { ok: boolean; message: string };
}

interface DoctorReport {
  defaultEngine: EngineName;
  authProbe: boolean;
  engines: DoctorCheck[];
}

const CONFIG_PATH = join(homedir(), ".config", "agent-search", "config.json");

const DEFAULT_CONFIG: Config = {
  defaultEngine: "claude",
  engines: {
    claude: { command: ["claude", "-p", "{prompt}", "--output-format", "json"] },
    codex: { command: ["codex", "exec", "--skip-git-repo-check", "{prompt}"] },
  },
};

const SYSTEM_PROMPT = `You are an agentic web research engine. Search the web and return strict JSON only.\n\nReturn JSON object:\n{\n  "query": "...",\n  "results": [\n    {\n      "title": "...",\n      "url": "https://...",\n      "summary": "1-2 sentence summary",\n      "source_type": "official|news|blog|community|other"\n    }\n  ]\n}`;

export async function runCli(argv: string[]): Promise<number> {
  const parsed = parseArgs(argv);
  const json = hasFlag(parsed.flags, "json");
  const verbose = hasFlag(parsed.flags, "verbose");
  const context = createCommandContext({ verbose });

  try {
    if (
      hasFlag(parsed.flags, "help") ||
      parsed.command === "help" ||
      parsed.command === undefined
    ) {
      return writeOk(json, context, { help: renderHelp() }, renderHelp());
    }

    if (hasFlag(parsed.flags, "version") || parsed.command === "version") {
      return writeOk(
        json,
        context,
        loadVersionInfo(),
        `${loadVersionInfo().name} ${loadVersionInfo().version}`,
      );
    }

    const cfg = await loadConfig();

    if (parsed.command === "config") {
      if (hasFlag(parsed.flags, "show")) {
        return writeOk(json, context, cfg, JSON.stringify(cfg, null, 2));
      }
      const setDefault = getString(parsed.flags, "set-default");
      if (setDefault !== undefined) {
        if (setDefault !== "claude" && setDefault !== "codex") {
          throw new CliAppError({
            code: "E_ARG_INVALID",
            message: "--set-default must be claude|codex",
          });
        }
        cfg.defaultEngine = setDefault;
        await saveConfig(cfg);
        return writeOk(
          json,
          context,
          { defaultEngine: cfg.defaultEngine },
          `default engine: ${cfg.defaultEngine}`,
        );
      }
      throw new CliAppError({
        code: "E_ARG_MISSING",
        message: "config requires --show or --set-default",
      });
    }

    if (parsed.command === "search") {
      const query = getString(parsed.flags, "query") ?? "";
      if (query.trim().length === 0) {
        throw new CliAppError({ code: "E_ARG_MISSING", message: "--query is required" });
      }
      const deep = hasFlag(parsed.flags, "deep");
      const count = deep ? 12 : 5;
      const engine =
        (getString(parsed.flags, "engine") as EngineName | undefined) ?? cfg.defaultEngine;
      if (engine !== "claude" && engine !== "codex") {
        throw new CliAppError({ code: "E_ARG_INVALID", message: "--engine must be claude|codex" });
      }

      const payload = await runEngine(engine, query, count, cfg);
      const normalized = normalizePayload(query, engine, payload);
      return writeOk(json, context, normalized, JSON.stringify(normalized, null, 2));
    }

    if (parsed.command === "doctor") {
      const result = await runDoctor(cfg, hasFlag(parsed.flags, "auth"));
      const hasFailure = result.engines.some(
        (e) => !e.binary.ok || (result.authProbe && !e.auth?.ok),
      );
      if (hasFailure) {
        throw new CliAppError({
          code: "E_UPSTREAM_BAD_RESPONSE",
          message: "doctor found one or more engine issues",
          details: result,
        });
      }
      return writeOk(json, context, result, renderDoctor(result));
    }

    throw new CliAppError({
      code: "E_ARG_UNSUPPORTED",
      message: `Unknown command: ${parsed.command}`,
    });
  } catch (error) {
    const appError = toCliAppError(error);
    const code = mapErrorCodeToExitCode(appError.code);
    if (json) {
      process.stdout.write(
        `${JSON.stringify(createErrorEnvelope(appError.code, appError.message, appError.details))}\n`,
      );
    } else {
      process.stderr.write(`Error (${appError.code}): ${appError.message}\n`);
    }
    return code;
  }
}

function writeOk(
  json: boolean,
  context: ReturnType<typeof createCommandContext>,
  data: unknown,
  text: string,
): number {
  if (json)
    process.stdout.write(`${JSON.stringify(createSuccessEnvelope(data, context.toMeta()))}\n`);
  else process.stdout.write(`${text}\n`);
  return EXIT_CODES.SUCCESS;
}

async function runEngine(
  engine: EngineName,
  query: string,
  count: number,
  cfg: Config,
): Promise<unknown> {
  const template = cfg.engines[engine]?.command;
  if (!Array.isArray(template) || template.length === 0) {
    throw new CliAppError({ code: "E_ARG_INVALID", message: `engine not configured: ${engine}` });
  }
  const prompt = `${SYSTEM_PROMPT}\n\nUser query: ${query}\nPreferred result count: ${count}`;
  const cmd = template.map((x) => x.replace("{prompt}", prompt));
  const out = await spawnCapture(cmd[0]!, cmd.slice(1));
  const parsed = extractJson(out);
  if (parsed === undefined) {
    throw new CliAppError({
      code: "E_UPSTREAM_BAD_RESPONSE",
      message: `${engine} returned non-JSON output`,
    });
  }
  return parsed;
}

function normalizePayload(query: string, engine: EngineName, payload: unknown) {
  const resultsRaw =
    typeof payload === "object" &&
    payload !== null &&
    Array.isArray((payload as { results?: unknown[] }).results)
      ? (payload as { results: unknown[] }).results
      : [];
  const results = resultsRaw
    .filter((x) => typeof x === "object" && x !== null)
    .map((x) => {
      const r = x as Record<string, unknown>;
      return {
        title: String(r.title ?? "").trim(),
        url: String(r.url ?? "").trim(),
        summary: String(r.summary ?? "").trim(),
        source_type: String(r.source_type ?? "other").trim() || "other",
      };
    })
    .filter((r) => r.title.length > 0 && r.url.length > 0);

  return { query, engine, count: results.length, results };
}

async function runDoctor(cfg: Config, authProbe: boolean): Promise<DoctorReport> {
  const engines: DoctorCheck[] = [];
  const names: EngineName[] = ["claude", "codex"];

  for (const engine of names) {
    const command = cfg.engines[engine]?.command ?? [];
    const binary = command[0] ?? "";
    const check: DoctorCheck = {
      engine,
      command,
      binary: { ok: false, message: "not checked" },
    };

    if (binary.length === 0) {
      check.binary = { ok: false, message: "empty command" };
      engines.push(check);
      continue;
    }

    try {
      await spawnCapture(binary, ["--version"]);
      check.binary = { ok: true, message: `${binary} found` };
    } catch (error) {
      const msg = toCliAppError(error).message;
      check.binary = { ok: false, message: msg };
      engines.push(check);
      continue;
    }

    if (authProbe) {
      try {
        const prompt = 'Reply with strict JSON only: {"ok":true}';
        const probeCmd = command.map((x) => x.replace("{prompt}", prompt));
        const out = await spawnCapture(probeCmd[0]!, probeCmd.slice(1));
        const parsed = extractJson(out);
        if (parsed === undefined) {
          check.auth = { ok: false, message: "no JSON returned from auth probe" };
        } else {
          check.auth = { ok: true, message: "auth probe succeeded" };
        }
      } catch (error) {
        check.auth = { ok: false, message: toCliAppError(error).message };
      }
    }

    engines.push(check);
  }

  return {
    defaultEngine: cfg.defaultEngine,
    authProbe,
    engines,
  };
}

function renderDoctor(report: DoctorReport): string {
  const lines: string[] = [];
  lines.push(`default engine: ${report.defaultEngine}`);
  lines.push(`auth probe: ${report.authProbe ? "on" : "off"}`);
  lines.push("");
  for (const engine of report.engines) {
    lines.push(`[${engine.engine}]`);
    lines.push(`  binary: ${engine.binary.ok ? "ok" : "fail"} (${engine.binary.message})`);
    if (report.authProbe) {
      lines.push(
        `  auth: ${engine.auth?.ok ? "ok" : "fail"} (${engine.auth?.message ?? "not checked"})`,
      );
    }
  }
  return lines.join("\n");
}

async function loadConfig(): Promise<Config> {
  try {
    const raw = await readFile(CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw) as Config;
    return {
      defaultEngine: parsed.defaultEngine ?? DEFAULT_CONFIG.defaultEngine,
      engines: {
        claude: parsed.engines?.claude ?? DEFAULT_CONFIG.engines.claude,
        codex: parsed.engines?.codex ?? DEFAULT_CONFIG.engines.codex,
      },
    };
  } catch {
    await saveConfig(DEFAULT_CONFIG);
    return DEFAULT_CONFIG;
  }
}

async function saveConfig(cfg: Config): Promise<void> {
  await mkdir(dirname(CONFIG_PATH), { recursive: true });
  await writeFile(CONFIG_PATH, `${JSON.stringify(cfg, null, 2)}\n`, "utf8");
}

function parseArgs(argv: string[]): ParsedArgs {
  const flags = new Map<string, FlagValue>();
  let command: string | undefined;
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]!;
    if (token === "-h") {
      flags.set("help", true);
      continue;
    }
    if (token === "-V") {
      flags.set("version", true);
      continue;
    }
    if (token === "-v") {
      flags.set("verbose", true);
      continue;
    }
    if (token.startsWith("--")) {
      const key = token.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("-")) {
        flags.set(key, next);
        i += 1;
      } else flags.set(key, true);
      continue;
    }
    if (command === undefined) {
      command = token;
      continue;
    }
  }
  return { command, flags };
}

function hasFlag(flags: Map<string, FlagValue>, key: string): boolean {
  return flags.get(key) === true;
}

function getString(flags: Map<string, FlagValue>, key: string): string | undefined {
  const v = flags.get(key);
  return typeof v === "string" ? v : undefined;
}

function getInt(flags: Map<string, FlagValue>, key: string, fallback: number): number {
  const v = getString(flags, key);
  if (v === undefined) return fallback;
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n) || n <= 0)
    throw new CliAppError({ code: "E_ARG_INVALID", message: `--${key} must be positive integer` });
  return n;
}

function extractJson(text: string): unknown | undefined {
  try {
    return JSON.parse(text);
  } catch {}

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i]!;
    if (!(line.startsWith("{") || line.startsWith("["))) continue;
    try {
      return JSON.parse(line);
    } catch {}
  }

  const s = text.indexOf("{");
  const e = text.lastIndexOf("}");
  if (s >= 0 && e > s) {
    try {
      return JSON.parse(text.slice(s, e + 1));
    } catch {}
  }
  return undefined;
}

function spawnCapture(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => {
      out += String(d);
    });
    child.stderr.on("data", (d) => {
      err += String(d);
    });
    child.on("error", (e) =>
      reject(new CliAppError({ code: "E_UPSTREAM_BAD_RESPONSE", message: e.message })),
    );
    child.on("close", (code) => {
      if (code === 0) resolve(out.trim());
      else
        reject(
          new CliAppError({
            code: "E_UPSTREAM_BAD_RESPONSE",
            message: err.trim() || out.trim() || "engine command failed",
          }),
        );
    });
  });
}

function loadVersionInfo(): { name: string; version: string } {
  try {
    const require = createRequire(import.meta.url);
    const pkg = require("../package.json") as { name?: string; version?: string };
    return { name: pkg.name ?? "agent-search-cli", version: pkg.version ?? "0.0.0" };
  } catch {
    return { name: "agent-search-cli", version: "0.0.0" };
  }
}

function renderHelp(): string {
  return [
    "agent-search",
    "",
    "Usage:",
    "  agent-search search --query <text> [--engine claude|codex] [--deep] [--json]",
    "  agent-search config --show [--json]",
    "  agent-search config --set-default claude|codex [--json]",
    "  agent-search doctor [--auth] [--json]",
    "  agent-search version [--json]",
    "  agent-search help",
    "",
    "Search modes:",
    "  default: 5 results",
    "  --deep:  12 results",
  ].join("\n");
}
