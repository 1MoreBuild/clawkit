import { CliAppError } from "@onemoreproduct/cli-core";

export interface HttpSessionOptions {
  baseUrl: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
  initialCookie?: string;
  userAgent?: string;
}

export interface SessionRequestOptions {
  pathOrUrl: string;
  method?: "GET" | "POST";
  body?: string;
  headers?: Headers | Array<[string, string]> | Record<string, string>;
  includeAuthCookie?: boolean;
  redirect?: "follow" | "manual" | "error";
}

export class HttpSession {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly userAgent: string;
  private readonly cookieJar = new Map<string, string>();

  public constructor(options: HttpSessionOptions) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
    this.timeoutMs = sanitizeTimeout(options.timeoutMs);
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.userAgent = options.userAgent ?? "byr-pt-cli";

    if (typeof this.fetchImpl !== "function") {
      throw new CliAppError({
        code: "E_UNKNOWN",
        message: "Global fetch is unavailable. Use Node 18+ or provide fetchImpl.",
      });
    }

    mergeCookieHeader(this.cookieJar, options.initialCookie);
  }

  public hasCookie(name: string): boolean {
    return this.cookieJar.has(name);
  }

  public cookieSize(): number {
    return this.cookieJar.size;
  }

  public clearCookies(): void {
    this.cookieJar.clear();
  }

  public serializeCookies(): string {
    return serializeCookieJar(this.cookieJar);
  }

  public mergeCookieHeader(cookieHeader: string | undefined): void {
    mergeCookieHeader(this.cookieJar, cookieHeader);
  }

  public async fetch(options: SessionRequestOptions): Promise<Response> {
    const headers = new Headers(options.headers);

    if (options.includeAuthCookie) {
      const cookieHeader = serializeCookieJar(this.cookieJar);
      if (cookieHeader.length > 0) {
        headers.set("cookie", cookieHeader);
      }
    }

    if (!headers.has("user-agent")) {
      headers.set("user-agent", this.userAgent);
    }

    const url = resolveUrl(this.baseUrl, options.pathOrUrl);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(url, {
        method: options.method,
        headers,
        body: options.body,
        redirect: options.redirect,
        signal: controller.signal,
      });

      mergeSetCookies(this.cookieJar, response.headers);
      return response;
    } catch (error) {
      if (error instanceof CliAppError) {
        throw error;
      }

      if (error instanceof Error && error.name === "AbortError") {
        throw new CliAppError({
          code: "E_UPSTREAM_TIMEOUT",
          message: `BYR request timed out after ${this.timeoutMs}ms`,
          details: {
            url: url.toString(),
          },
        });
      }

      throw new CliAppError({
        code: "E_UPSTREAM_NETWORK",
        message: "Failed to reach BYR upstream",
        details: {
          url: url.toString(),
          reason: error instanceof Error ? error.message : String(error),
        },
        cause: error,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  public async fetchText(options: SessionRequestOptions, contextMessage: string): Promise<string> {
    const response = await this.fetch(options);
    if (!response.ok) {
      throw mapNonOkResponse(response, contextMessage);
    }
    return response.text();
  }
}

export function mapNonOkResponse(response: Response, contextMessage: string): CliAppError {
  if (response.status === 404) {
    return new CliAppError({
      code: "E_NOT_FOUND_RESOURCE",
      message: "BYR resource was not found",
      details: {
        status: response.status,
      },
    });
  }

  return new CliAppError({
    code: "E_UPSTREAM_BAD_RESPONSE",
    message: `${contextMessage} (status ${response.status})`,
    details: {
      status: response.status,
    },
  });
}

function sanitizeTimeout(timeoutMs: number | undefined): number {
  if (timeoutMs === undefined || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return 15_000;
  }

  return Math.floor(timeoutMs);
}

function normalizeBaseUrl(baseUrl: string): string {
  const normalized = baseUrl.trim();
  if (normalized.length === 0) {
    return "https://byr.pt/";
  }

  return normalized.endsWith("/") ? normalized : `${normalized}/`;
}

function resolveUrl(baseUrl: string, pathOrUrl: string): URL {
  if (/^https?:\/\//i.test(pathOrUrl)) {
    return new URL(pathOrUrl);
  }

  return new URL(pathOrUrl, baseUrl);
}

function mergeCookieHeader(cookieJar: Map<string, string>, cookieHeader: string | undefined): void {
  if (cookieHeader === undefined || cookieHeader.trim().length === 0) {
    return;
  }

  for (const part of cookieHeader.split(";")) {
    const segment = part.trim();
    if (segment.length === 0) {
      continue;
    }

    const eqIndex = segment.indexOf("=");
    if (eqIndex <= 0) {
      continue;
    }

    const name = segment.slice(0, eqIndex).trim();
    const value = segment.slice(eqIndex + 1).trim();
    if (name.length > 0) {
      cookieJar.set(name, value);
    }
  }
}

function serializeCookieJar(cookieJar: Map<string, string>): string {
  return Array.from(cookieJar.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

function mergeSetCookies(cookieJar: Map<string, string>, headers: Headers): void {
  const setCookieHeaders = readSetCookieHeaders(headers);
  for (const raw of setCookieHeaders) {
    const firstSegment = raw.split(";", 1)[0]?.trim();
    if (firstSegment === undefined || firstSegment.length === 0) {
      continue;
    }

    const eqIndex = firstSegment.indexOf("=");
    if (eqIndex <= 0) {
      continue;
    }

    const cookieName = firstSegment.slice(0, eqIndex).trim();
    const cookieValue = firstSegment.slice(eqIndex + 1).trim();
    if (cookieName.length === 0) {
      continue;
    }

    if (cookieValue.length === 0 || cookieValue === "deleted") {
      cookieJar.delete(cookieName);
      continue;
    }

    cookieJar.set(cookieName, cookieValue);
  }
}

function readSetCookieHeaders(headers: Headers): string[] {
  const headersWithSetCookie = headers as Headers & {
    getSetCookie?: () => string[];
    raw?: () => Record<string, string[]>;
  };

  if (typeof headersWithSetCookie.getSetCookie === "function") {
    return headersWithSetCookie.getSetCookie();
  }

  if (typeof headersWithSetCookie.raw === "function") {
    return headersWithSetCookie.raw()["set-cookie"] ?? [];
  }

  const fallback = headers.get("set-cookie");
  if (fallback === null) {
    return [];
  }

  return splitCombinedSetCookieHeader(fallback);
}

function splitCombinedSetCookieHeader(raw: string): string[] {
  const parts: string[] = [];
  let buffer = "";
  let insideExpires = false;

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    const tail = raw.slice(index).toLowerCase();

    if (tail.startsWith("expires=")) {
      insideExpires = true;
    }

    if (char === "," && !insideExpires) {
      const normalized = buffer.trim();
      if (normalized.length > 0) {
        parts.push(normalized);
      }
      buffer = "";
      continue;
    }

    if (char === ";") {
      insideExpires = false;
    }

    buffer += char;
  }

  const normalized = buffer.trim();
  if (normalized.length > 0) {
    parts.push(normalized);
  }

  return parts;
}
