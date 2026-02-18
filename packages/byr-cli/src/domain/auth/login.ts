import { CliAppError } from "clawkit-cli-core";

import { HttpSession } from "../http/session.js";
import { looksLikeLoginPage, parseLoginForm } from "../nexusphp/parser.js";
import { validateByrCookie } from "./store.js";

export interface ByrLoginOptions {
  baseUrl?: string;
  timeoutMs?: number;
  username: string;
  password: string;
  fetchImpl?: typeof fetch;
}

export interface ByrLoginResult {
  cookie: string;
}

const DEFAULT_BASE_URL = "https://byr.pt";
const DEFAULT_TIMEOUT_MS = 15_000;

export async function loginByrWithCredentials(options: ByrLoginOptions): Promise<ByrLoginResult> {
  const username = options.username.trim();
  const password = options.password;

  if (username.length === 0 || password.length === 0) {
    throw new CliAppError({
      code: "E_ARG_MISSING",
      message: "username and password are required for auth login",
      details: {
        args: ["username", "password"],
      },
    });
  }

  const session = new HttpSession({
    baseUrl: options.baseUrl ?? DEFAULT_BASE_URL,
    timeoutMs: sanitizeTimeout(options.timeoutMs),
    fetchImpl: options.fetchImpl,
    userAgent: "byr-pt-cli",
  });

  const loginPageHtml = await session.fetchText(
    {
      pathOrUrl: "/login.php",
      method: "GET",
      includeAuthCookie: false,
      redirect: "follow",
    },
    "Unable to load BYR login page",
  );
  const form = parseLoginForm(loginPageHtml);

  if (form.requiresManualField.length > 0) {
    throw new CliAppError({
      code: "E_AUTH_REQUIRED",
      message: "BYR login requires manual verification. Use `byr auth import-cookie`.",
      details: {
        fields: form.requiresManualField,
      },
    });
  }

  const payload = new URLSearchParams(form.hiddenFields);
  payload.set(form.usernameField, username);
  payload.set(form.passwordField, password);

  await session.fetch({
    pathOrUrl: form.action,
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: payload.toString(),
    includeAuthCookie: false,
    redirect: "manual",
  });

  const verifyHtml = await session.fetchText(
    {
      pathOrUrl: "/torrents.php",
      method: "GET",
      includeAuthCookie: true,
      redirect: "follow",
    },
    "Unable to verify BYR login state",
  );

  if (looksLikeLoginPage(verifyHtml)) {
    throw new CliAppError({
      code: "E_AUTH_INVALID",
      message: "BYR authentication failed. Check username/password.",
    });
  }

  const cookie = session.serializeCookies();
  if (cookie.trim().length === 0) {
    throw new CliAppError({
      code: "E_AUTH_INVALID",
      message: "BYR login did not return auth cookies.",
    });
  }

  validateByrCookie(cookie);
  return { cookie };
}

function sanitizeTimeout(timeoutMs: number | undefined): number {
  if (timeoutMs === undefined || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return DEFAULT_TIMEOUT_MS;
  }

  return Math.floor(timeoutMs);
}
