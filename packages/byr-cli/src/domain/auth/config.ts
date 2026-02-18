import { join } from "node:path";

import { readAuthStore, readJsonFile, getByrGlobalConfigPath } from "./store.js";

export interface ByrrcConfig {
  cookie?: string;
  username?: string;
  password?: string;
  baseUrl?: string;
  timeoutMs?: number;
}

export type FlagValue = string | boolean | string[] | undefined;

export interface ResolveClientConfigInput {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  getFlag: (key: string) => FlagValue;
}

export interface ResolvedClientConfig {
  cookie?: string;
  username?: string;
  password?: string;
  baseUrl?: string;
  timeoutMs?: number;
  cookieSource?: string;
}

function firstString(value: FlagValue): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (Array.isArray(value)) {
    const candidate = value.at(-1);
    return typeof candidate === "string" ? candidate : undefined;
  }
  return typeof value === "string" ? value : undefined;
}

function toValidTimeout(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }

  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return undefined;
}

function nonEmpty(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function getProjectConfigPath(cwd: string): string {
  return join(cwd, ".byrrc.json");
}

export async function resolveClientConfig(
  input: ResolveClientConfigInput,
): Promise<ResolvedClientConfig> {
  const env = input.env ?? process.env;
  const projectConfig = (await readJsonFile<ByrrcConfig>(getProjectConfigPath(input.cwd))) ?? {};
  const globalConfig = (await readJsonFile<ByrrcConfig>(getByrGlobalConfigPath())) ?? {};
  const authStore = await readAuthStore();

  const cookieFromFlag = nonEmpty(firstString(input.getFlag("cookie")));
  const usernameFromFlag = nonEmpty(firstString(input.getFlag("username")));
  const passwordFromFlag = nonEmpty(firstString(input.getFlag("password")));
  const baseUrlFromFlag = nonEmpty(firstString(input.getFlag("base-url")));
  const timeoutFromFlag = toValidTimeout(firstString(input.getFlag("timeout-ms")));

  const cookieFromEnv = nonEmpty(env.BYR_COOKIE);
  const usernameFromEnv = nonEmpty(env.BYR_USERNAME);
  const passwordFromEnv = nonEmpty(env.BYR_PASSWORD);
  const baseUrlFromEnv = nonEmpty(env.BYR_BASE_URL);
  const timeoutFromEnv = toValidTimeout(env.BYR_TIMEOUT_MS);

  const cookieFromProject = nonEmpty(projectConfig.cookie);
  const usernameFromProject = nonEmpty(projectConfig.username);
  const passwordFromProject = nonEmpty(projectConfig.password);
  const baseUrlFromProject = nonEmpty(projectConfig.baseUrl);
  const timeoutFromProject = toValidTimeout(projectConfig.timeoutMs);

  const cookieFromGlobal = nonEmpty(globalConfig.cookie);
  const usernameFromGlobal = nonEmpty(globalConfig.username);
  const passwordFromGlobal = nonEmpty(globalConfig.password);
  const baseUrlFromGlobal = nonEmpty(globalConfig.baseUrl);
  const timeoutFromGlobal = toValidTimeout(globalConfig.timeoutMs);

  const cookieFromStore = nonEmpty(authStore?.cookie);

  const cookie =
    cookieFromFlag ?? cookieFromEnv ?? cookieFromProject ?? cookieFromGlobal ?? cookieFromStore;

  const cookieSource =
    cookie === undefined
      ? undefined
      : cookie === cookieFromFlag
        ? "flag"
        : cookie === cookieFromEnv
          ? "env"
          : cookie === cookieFromProject
            ? "project-config"
            : cookie === cookieFromGlobal
              ? "global-config"
              : (authStore?.source ?? "auth-store");

  const username = usernameFromFlag ?? usernameFromEnv ?? usernameFromProject ?? usernameFromGlobal;
  const password = passwordFromFlag ?? passwordFromEnv ?? passwordFromProject ?? passwordFromGlobal;
  const baseUrl = baseUrlFromFlag ?? baseUrlFromEnv ?? baseUrlFromProject ?? baseUrlFromGlobal;
  const timeoutMs = timeoutFromFlag ?? timeoutFromEnv ?? timeoutFromProject ?? timeoutFromGlobal;

  return {
    cookie,
    username,
    password,
    baseUrl,
    timeoutMs,
    cookieSource,
  };
}
