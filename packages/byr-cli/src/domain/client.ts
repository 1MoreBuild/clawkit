import { CliAppError } from "clawkit-cli-core";

import {
  BYR_BOOKMARKED_FACET,
  BYR_CATEGORY_FACET,
  BYR_INCLDEAD_FACET,
  BYR_LEVEL_REQUIREMENTS,
  BYR_SPSTATE_FACET,
  guessByrLevelId,
  getByrMetadata,
} from "./byr-metadata.js";
import { validateByrCookie } from "./auth/store.js";
import { mapNonOkResponse, HttpSession } from "./http/session.js";
import {
  extractDownloadUrl,
  looksLikeLoginPage,
  looksLikeNotFoundPage,
  normalizeDetailsToDownloadUrl,
  parseBonusPerHour,
  parseLoginForm,
  parseSearchItems,
  parseSeedingStatus,
  parseSizeToBytes,
  parseTorrentDetail,
  parseUploads,
  parseUserIdFromIndex,
  parseUserInfoFromDetails,
} from "./nexusphp/parser.js";
import type {
  ByrBrowseOptions,
  ByrCategoryFacet,
  ByrDownloadPlan,
  ByrLevelRequirement,
  ByrSearchItem,
  ByrSearchOptions,
  ByrSimpleFacet,
  ByrTorrentDetail,
  ByrTorrentPayload,
  ByrUserInfo,
} from "./types.js";

export interface ByrClient {
  browse(limit: number, options?: ByrBrowseOptions): Promise<ByrSearchItem[]>;
  search(query: string, limit: number, options?: ByrSearchOptions): Promise<ByrSearchItem[]>;
  browseWithMeta?: (limit: number, options?: ByrBrowseOptions) => Promise<ByrTorrentListResult>;
  searchWithMeta?: (
    query: string,
    limit: number,
    options?: ByrSearchOptions,
  ) => Promise<ByrTorrentListResult>;
  getById(id: string): Promise<ByrTorrentDetail>;
  getDownloadPlan(id: string): Promise<ByrDownloadPlan>;
  downloadTorrent(id: string): Promise<ByrTorrentPayload>;
  getUserInfo?: () => Promise<ByrUserInfo>;
  getCategories?: () => Promise<{
    category: ByrCategoryFacet;
    incldead: ByrSimpleFacet;
    spstate: ByrSimpleFacet;
    bookmarked: ByrSimpleFacet;
  }>;
  getLevelRequirements?: () => Promise<ByrLevelRequirement[]>;
  verifyAuth?: () => Promise<{ authenticated: boolean }>;
}

export interface ByrClientOptions {
  baseUrl?: string;
  timeoutMs?: number;
  cookie?: string;
  username?: string;
  password?: string;
  fetchImpl?: typeof fetch;
}

const DEFAULT_BASE_URL = "https://byr.pt";
const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_AUTO_TORRENT_LIST_PAGES = 30;

export interface ByrTorrentListResult {
  items: ByrSearchItem[];
  matchedTotal?: number;
}

export function createByrClientFromEnv(env: NodeJS.ProcessEnv = process.env): ByrClient {
  return createByrClient({
    baseUrl: env.BYR_BASE_URL,
    timeoutMs: parseTimeoutMs(env.BYR_TIMEOUT_MS),
    cookie: env.BYR_COOKIE,
    username: env.BYR_USERNAME,
    password: env.BYR_PASSWORD,
  });
}

function parseTimeoutMs(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }

  return parsed;
}

export function createByrClient(options: ByrClientOptions = {}): ByrClient {
  const baseUrl = normalizeBaseUrl(options.baseUrl ?? DEFAULT_BASE_URL);
  const timeoutMs = sanitizeTimeout(options.timeoutMs);
  const cookie = options.cookie?.trim();
  if (cookie && cookie.length > 0) {
    validateByrCookie(cookie);
  }
  const username = options.username?.trim() ?? "";
  const password = options.password ?? "";

  const session = new HttpSession({
    baseUrl,
    timeoutMs,
    fetchImpl: options.fetchImpl,
    initialCookie: cookie,
    userAgent: "byr-pt-cli",
  });

  let authInitialized = session.cookieSize() > 0;

  async function ensureAuthenticated(forceRelogin = false): Promise<void> {
    if (forceRelogin) {
      session.clearCookies();
      authInitialized = false;
    }

    if (authInitialized) {
      return;
    }

    if (session.hasCookie("uid") && session.hasCookie("pass")) {
      authInitialized = true;
      return;
    }

    if (username.length === 0 || password.length === 0) {
      throw buildAuthMissingError();
    }

    await loginWithCredentials();
    authInitialized = true;
  }

  async function loginWithCredentials(): Promise<void> {
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
        message: "BYR login requires manual verification. Provide BYR_COOKIE instead.",
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

    const verifyResponse = await session.fetch({
      pathOrUrl: "/torrents.php",
      method: "GET",
      includeAuthCookie: true,
      redirect: "follow",
    });
    if (!verifyResponse.ok) {
      throw mapNonOkResponse(verifyResponse, "Unable to verify BYR login state");
    }
    const verifyHtml = await verifyResponse.text();

    if (looksLikeAuthPage(verifyResponse, verifyHtml)) {
      throw new CliAppError({
        code: "E_AUTH_INVALID",
        message: "BYR authentication failed. Check BYR_USERNAME/BYR_PASSWORD.",
      });
    }
  }

  async function fetchAuthenticatedHtml(pathOrUrl: string): Promise<string> {
    await ensureAuthenticated();

    const firstResponse = await session.fetch({
      pathOrUrl,
      method: "GET",
      includeAuthCookie: true,
      redirect: "follow",
    });
    if (!firstResponse.ok) {
      throw mapNonOkResponse(firstResponse, `Unable to request ${pathOrUrl}`);
    }
    const firstHtml = await firstResponse.text();

    if (!looksLikeAuthPage(firstResponse, firstHtml)) {
      return firstHtml;
    }

    if (username.length === 0 || password.length === 0) {
      throw buildAuthExpiredError();
    }

    await ensureAuthenticated(true);

    const secondResponse = await session.fetch({
      pathOrUrl,
      method: "GET",
      includeAuthCookie: true,
      redirect: "follow",
    });
    if (!secondResponse.ok) {
      throw mapNonOkResponse(secondResponse, `Unable to request ${pathOrUrl}`);
    }
    const secondHtml = await secondResponse.text();

    if (looksLikeAuthPage(secondResponse, secondHtml)) {
      throw new CliAppError({
        code: "E_AUTH_INVALID",
        message: "BYR authentication failed after relogin.",
      });
    }

    return secondHtml;
  }

  async function fetchTorrentList(input: {
    query?: string;
    limit: number;
    options: ByrSearchOptions | ByrBrowseOptions;
  }): Promise<ByrTorrentListResult> {
    const explicitPage = input.options.page;

    if (explicitPage !== undefined) {
      const params = buildTorrentListParams({
        query: input.query,
        options: input.options,
      });
      const html = await fetchAuthenticatedHtml(`/torrents.php?${params.toString()}`);
      return {
        items: parseSearchItems(html, input.limit, baseUrl),
        matchedTotal: parseMatchedTotalFromPager(html),
      };
    }

    const items: ByrSearchItem[] = [];
    const seenIds = new Set<string>();
    let matchedTotal: number | undefined;

    for (
      let pageIndex = 0;
      pageIndex < MAX_AUTO_TORRENT_LIST_PAGES && items.length < input.limit;
      pageIndex += 1
    ) {
      const pagedOptions: ByrSearchOptions | ByrBrowseOptions = {
        ...input.options,
        page: pageIndex === 0 ? undefined : pageIndex,
      };
      const params = buildTorrentListParams({
        query: input.query,
        options: pagedOptions,
      });
      const html = await fetchAuthenticatedHtml(`/torrents.php?${params.toString()}`);
      if (pageIndex === 0) {
        matchedTotal = parseMatchedTotalFromPager(html);
      }
      const pageItems = parseSearchItems(html, Number.MAX_SAFE_INTEGER, baseUrl);

      if (pageItems.length === 0) {
        break;
      }

      let added = 0;
      for (const item of pageItems) {
        if (seenIds.has(item.id)) {
          continue;
        }
        seenIds.add(item.id);
        items.push(item);
        added += 1;

        if (items.length >= input.limit) {
          break;
        }
      }

      if (added === 0) {
        break;
      }

      if (!hasPageLink(html, pageIndex + 1)) {
        break;
      }
    }

    return {
      items: items.slice(0, input.limit),
      matchedTotal,
    };
  }

  return {
    async browse(limit: number, options: ByrBrowseOptions = {}): Promise<ByrSearchItem[]> {
      const result = await fetchTorrentList({
        limit,
        options,
      });
      return result.items;
    },

    async browseWithMeta(
      limit: number,
      options: ByrBrowseOptions = {},
    ): Promise<ByrTorrentListResult> {
      return fetchTorrentList({
        limit,
        options,
      });
    },

    async search(
      query: string,
      limit: number,
      options: ByrSearchOptions = {},
    ): Promise<ByrSearchItem[]> {
      const result = await fetchTorrentList({
        limit,
        query,
        options,
      });
      return result.items;
    },

    async searchWithMeta(
      query: string,
      limit: number,
      options: ByrSearchOptions = {},
    ): Promise<ByrTorrentListResult> {
      return fetchTorrentList({
        limit,
        query,
        options,
      });
    },

    async getById(id: string): Promise<ByrTorrentDetail> {
      const html = await fetchAuthenticatedHtml(`/details.php?id=${encodeURIComponent(id)}&hit=1`);
      return parseTorrentDetail(html, id, baseUrl);
    },

    async getDownloadPlan(id: string): Promise<ByrDownloadPlan> {
      const html = await fetchAuthenticatedHtml(`/details.php?id=${encodeURIComponent(id)}&hit=1`);
      const detail = parseTorrentDetail(html, id, baseUrl);
      const sourceUrl =
        extractDownloadUrl(html, id, baseUrl) ??
        normalizeDetailsToDownloadUrl(
          resolveUrl(baseUrl, `/download.php?id=${encodeURIComponent(id)}`).toString(),
        );

      return {
        id: detail.id,
        fileName: deriveTorrentFileName(detail.id, detail.title),
        sourceUrl,
      };
    },

    async downloadTorrent(id: string): Promise<ByrTorrentPayload> {
      const plan = await this.getDownloadPlan(id);

      await ensureAuthenticated();
      const response = await session.fetch({
        pathOrUrl: plan.sourceUrl,
        method: "GET",
        includeAuthCookie: true,
        redirect: "follow",
      });

      if (!response.ok) {
        throw mapNonOkResponse(response, "Failed to download torrent payload");
      }

      const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
      if (contentType.includes("text/html")) {
        const html = await response.text();
        if (looksLikeAuthPage(response, html)) {
          throw buildAuthExpiredError();
        }

        if (looksLikeNotFoundPage(html)) {
          throw new CliAppError({
            code: "E_NOT_FOUND_RESOURCE",
            message: `Torrent not found: ${id}`,
            details: { id },
          });
        }

        throw new CliAppError({
          code: "E_UPSTREAM_BAD_RESPONSE",
          message: "BYR returned HTML instead of torrent content",
          details: {
            sourceUrl: plan.sourceUrl,
          },
        });
      }

      const content = new Uint8Array(await response.arrayBuffer());
      if (content.byteLength === 0) {
        throw new CliAppError({
          code: "E_UPSTREAM_BAD_RESPONSE",
          message: "BYR returned an empty torrent payload",
          details: {
            sourceUrl: plan.sourceUrl,
          },
        });
      }

      const fileName =
        extractFileNameFromContentDisposition(response.headers.get("content-disposition")) ??
        plan.fileName;

      return {
        ...plan,
        fileName,
        content,
      };
    },

    async getUserInfo(): Promise<ByrUserInfo> {
      const indexHtml = await fetchAuthenticatedHtml("/index.php");
      const userId = parseUserIdFromIndex(indexHtml);
      if (userId === undefined) {
        throw new CliAppError({
          code: "E_UPSTREAM_BAD_RESPONSE",
          message: "Unable to parse BYR user id from index page",
        });
      }

      const userDetailsHtml = await fetchAuthenticatedHtml(
        `/userdetails.php?id=${encodeURIComponent(userId)}`,
      );
      const parsed = parseUserInfoFromDetails(userDetailsHtml, userId);

      const bonusHtml = await fetchAuthenticatedHtml("/mybonus.php?show=seed");
      const bonusPerHour = parseBonusPerHour(bonusHtml);

      let seeding = 0;
      let seedingSizeBytes = 0;
      let uploads = 0;

      try {
        const seedingHtml = await fetchAuthenticatedHtml(
          `/getusertorrentlistajax.php?userid=${encodeURIComponent(userId)}&type=seeding`,
        );
        const seedingStatus = parseSeedingStatus(seedingHtml);
        seeding = seedingStatus.seeding;
        seedingSizeBytes = seedingStatus.seedingSizeBytes;
      } catch {}

      try {
        const uploadHtml = await fetchAuthenticatedHtml(
          `/getusertorrentlistajax.php?userid=${encodeURIComponent(userId)}&type=uploaded`,
        );
        uploads = parseUploads(uploadHtml);
      } catch {}

      const levelId = guessByrLevelId(parsed.levelName);
      const levelProgress = buildLevelProgress({
        levelId,
        levelName: parsed.levelName,
        trueUploadedBytes: parsed.trueUploadedBytes,
        joinTime: parsed.joinTime,
        ratio: parsed.ratio,
      });

      return {
        ...parsed,
        levelId,
        bonusPerHour,
        seeding,
        seedingSizeBytes,
        uploads,
        levelProgress,
      };
    },

    async getCategories() {
      return {
        category: BYR_CATEGORY_FACET,
        incldead: BYR_INCLDEAD_FACET,
        spstate: BYR_SPSTATE_FACET,
        bookmarked: BYR_BOOKMARKED_FACET,
      };
    },

    async getLevelRequirements() {
      return BYR_LEVEL_REQUIREMENTS;
    },

    async verifyAuth() {
      try {
        const html = await fetchAuthenticatedHtml("/torrents.php");
        return { authenticated: !looksLikeLoginPage(html) };
      } catch (error) {
        if (error instanceof CliAppError && error.code.startsWith("E_AUTH_")) {
          return { authenticated: false };
        }
        throw error;
      }
    },
  };
}

function buildLevelProgress(input: {
  levelId?: number;
  levelName: string;
  trueUploadedBytes: number;
  joinTime: string;
  ratio: number;
}) {
  const currentLevelId = input.levelId;
  const nextLevel = BYR_LEVEL_REQUIREMENTS.find(
    (level) =>
      (currentLevelId === undefined || level.id > currentLevelId) &&
      (level.groupType ?? "user") === "user",
  );

  if (nextLevel === undefined) {
    return {
      currentLevelId,
      currentLevelName: input.levelName,
      met: true,
      unmet: [],
    };
  }

  const unmet: Array<{
    field: string;
    required: string | number;
    current: string | number;
    met: boolean;
  }> = [];

  if (typeof nextLevel.uploaded === "string") {
    const requiredUploaded = parseSizeToBytes(nextLevel.uploaded) ?? 0;
    const met = input.trueUploadedBytes >= requiredUploaded;
    if (!met) {
      unmet.push({
        field: "uploaded",
        required: nextLevel.uploaded,
        current: formatBytes(input.trueUploadedBytes),
        met,
      });
    }
  }

  if (typeof nextLevel.ratio === "number") {
    const met = input.ratio >= nextLevel.ratio;
    if (!met) {
      unmet.push({
        field: "ratio",
        required: nextLevel.ratio,
        current: input.ratio,
        met,
      });
    }
  }

  if (typeof nextLevel.interval === "string") {
    const requiredMs = parseIsoDurationToMs(nextLevel.interval);
    const joinedMs = Date.parse(input.joinTime);
    if (requiredMs !== undefined && Number.isFinite(joinedMs)) {
      const actualMs = Date.now() - joinedMs;
      const met = actualMs >= requiredMs;
      if (!met) {
        unmet.push({
          field: "interval",
          required: nextLevel.interval,
          current: `${Math.floor(actualMs / 86_400_000)}d`,
          met,
        });
      }
    }
  }

  return {
    currentLevelId,
    currentLevelName: input.levelName,
    nextLevelId: nextLevel.id,
    nextLevelName: nextLevel.name,
    met: unmet.length === 0,
    unmet,
  };
}

function parseIsoDurationToMs(value: string): number | undefined {
  const match = /^P(?:(\d+)D)?(?:(\d+)W)?$/i.exec(value);
  if (match === null) {
    return undefined;
  }

  const days = Number.parseInt(match[1] ?? "0", 10);
  const weeks = Number.parseInt(match[2] ?? "0", 10);
  return (days + weeks * 7) * 86_400_000;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[index]}`;
}

function buildAuthMissingError(): CliAppError {
  return new CliAppError({
    code: "E_AUTH_REQUIRED",
    message: "Missing BYR credentials. Set BYR_COOKIE or BYR_USERNAME/BYR_PASSWORD.",
    details: {
      env: ["BYR_COOKIE", "BYR_USERNAME", "BYR_PASSWORD"],
    },
  });
}

function buildAuthExpiredError(): CliAppError {
  return new CliAppError({
    code: "E_AUTH_REQUIRED",
    message: "BYR authentication is required or expired.",
  });
}

function hasPageLink(html: string, page: number): boolean {
  if (!Number.isInteger(page) || page < 0) {
    return false;
  }

  const normalized = html.replaceAll("&amp;", "&");
  const pattern = new RegExp(`[?&]page=${page}(?:[&#"'\\s>]|$)`, "i");
  return pattern.test(normalized);
}

function parseMatchedTotalFromPager(html: string): number | undefined {
  const ranges = Array.from(
    html.matchAll(/<b[^>]*>\s*(\d+)\s*(?:&nbsp;|\s)+-\s*(?:&nbsp;|\s)+(\d+)\s*<\/b>/gi),
  );
  if (ranges.length === 0) {
    return undefined;
  }

  let maxUpper = 0;
  for (const match of ranges) {
    const upper = Number.parseInt(match[2] ?? "", 10);
    if (Number.isFinite(upper) && upper > maxUpper) {
      maxUpper = upper;
    }
  }

  return maxUpper > 0 ? maxUpper : undefined;
}

function looksLikeAuthPage(response: Response, html: string): boolean {
  if (isLoginRoute(response.url)) {
    return true;
  }

  return looksLikeLoginPage(html);
}

function isLoginRoute(responseUrl: string): boolean {
  try {
    const path = new URL(responseUrl).pathname.toLowerCase();
    return path === "/login" || path === "/login/" || path === "/login.php";
  } catch {
    return false;
  }
}

function sanitizeTimeout(timeoutMs: number | undefined): number {
  if (timeoutMs === undefined || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return DEFAULT_TIMEOUT_MS;
  }

  return Math.floor(timeoutMs);
}

function normalizeBaseUrl(baseUrl: string): string {
  const normalized = baseUrl.trim();
  if (normalized.length === 0) {
    return DEFAULT_BASE_URL;
  }

  return normalized.endsWith("/") ? normalized : `${normalized}/`;
}

function resolveUrl(baseUrl: string, pathOrUrl: string): URL {
  if (/^https?:\/\//i.test(pathOrUrl)) {
    return new URL(pathOrUrl);
  }

  return new URL(pathOrUrl, baseUrl);
}

function deriveTorrentFileName(id: string, title: string): string {
  const sanitized = title
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);

  if (sanitized.length === 0) {
    return `${id}.torrent`;
  }

  return `${sanitized}.torrent`;
}

function extractFileNameFromContentDisposition(headerValue: string | null): string | undefined {
  if (headerValue === null || headerValue.trim().length === 0) {
    return undefined;
  }

  const utf8Match = /filename\*=UTF-8''([^;]+)/i.exec(headerValue);
  if (utf8Match !== null) {
    return decodeURIComponentSafe(utf8Match[1]);
  }

  const plainMatch = /filename="?([^";]+)"?/i.exec(headerValue);
  if (plainMatch !== null) {
    return plainMatch[1]?.trim();
  }

  return undefined;
}

function decodeURIComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

const SAMPLE_TORRENTS: ByrTorrentDetail[] = [
  {
    id: "1001",
    title: "Ubuntu 24.04 LTS x64",
    size: "4.6 GB",
    seeders: 82,
    leechers: 5,
    tags: ["linux", "iso"],
    uploadedAt: "2026-01-10T10:00:00.000Z",
    category: "OS",
  },
  {
    id: "1002",
    title: "Fedora Workstation 42",
    size: "2.4 GB",
    seeders: 31,
    leechers: 3,
    tags: ["linux", "desktop"],
    uploadedAt: "2026-01-13T12:30:00.000Z",
    category: "OS",
  },
  {
    id: "1200",
    title: "Open Source Fonts Pack",
    size: "920 MB",
    seeders: 12,
    leechers: 2,
    tags: ["fonts", "design"],
    uploadedAt: "2026-02-01T08:45:00.000Z",
    category: "Assets",
  },
];

export function createMockByrClient(records: ByrTorrentDetail[] = SAMPLE_TORRENTS): ByrClient {
  return {
    async browse(limit: number): Promise<ByrSearchItem[]> {
      return records.slice(0, limit).map((item) => ({
        id: item.id,
        title: item.title,
        size: item.size,
        seeders: item.seeders,
        leechers: item.leechers,
        tags: item.tags,
        sizeBytes: parseSizeToBytes(item.size),
        time: item.uploadedAt,
        category: item.category,
      }));
    },

    async search(query: string, limit: number): Promise<ByrSearchItem[]> {
      const normalized = query.trim().toLowerCase();
      if (normalized.length === 0) {
        return [];
      }

      return records
        .filter((item) => item.title.toLowerCase().includes(normalized))
        .slice(0, limit)
        .map((item) => ({
          id: item.id,
          title: item.title,
          size: item.size,
          seeders: item.seeders,
          leechers: item.leechers,
          tags: item.tags,
          sizeBytes: parseSizeToBytes(item.size),
          time: item.uploadedAt,
          category: item.category,
        }));
    },

    async getById(id: string): Promise<ByrTorrentDetail> {
      const detail = records.find((item) => item.id === id);
      if (detail === undefined) {
        throw new CliAppError({
          code: "E_NOT_FOUND_RESOURCE",
          message: `Torrent not found: ${id}`,
          details: { id },
        });
      }
      return {
        ...detail,
        sizeBytes: parseSizeToBytes(detail.size),
        time: detail.uploadedAt,
      };
    },

    async getDownloadPlan(id: string): Promise<ByrDownloadPlan> {
      const detail = await this.getById(id);
      return {
        id: detail.id,
        fileName: `${detail.id}.torrent`,
        sourceUrl: `https://byr.pt/download.php?id=${detail.id}`,
      };
    },

    async downloadTorrent(id: string): Promise<ByrTorrentPayload> {
      const plan = await this.getDownloadPlan(id);
      const encoder = new TextEncoder();
      return {
        ...plan,
        content: encoder.encode(`mock torrent payload for ${id}`),
      };
    },

    async getUserInfo(): Promise<ByrUserInfo> {
      return {
        id: "101",
        name: "mock-user",
        messageCount: 0,
        uploadedBytes: 1024 * 1024,
        downloadedBytes: 1024,
        trueUploadedBytes: 1024 * 1024,
        trueDownloadedBytes: 1024,
        ratio: 1024,
        levelName: "User",
        levelId: 1,
        bonus: 100,
        seedingBonus: 0,
        bonusPerHour: 5,
        seeding: 10,
        seedingSizeBytes: 500 * 1024 * 1024,
        uploads: 3,
        hnrPreWarning: 0,
        hnrUnsatisfied: 0,
        joinTime: "2025-01-01T00:00:00.000Z",
        lastAccessAt: "2026-01-01T00:00:00.000Z",
        levelProgress: {
          currentLevelId: 1,
          currentLevelName: "User",
          nextLevelId: 2,
          nextLevelName: "Power User",
          met: true,
          unmet: [],
        },
      };
    },

    async getCategories() {
      return {
        category: BYR_CATEGORY_FACET,
        incldead: BYR_INCLDEAD_FACET,
        spstate: BYR_SPSTATE_FACET,
        bookmarked: BYR_BOOKMARKED_FACET,
      };
    },

    async getLevelRequirements() {
      return getByrMetadata().levels;
    },

    async verifyAuth() {
      return { authenticated: true };
    },
  };
}

function buildTorrentListParams(input: {
  query?: string;
  options: ByrSearchOptions | ByrBrowseOptions;
}): URLSearchParams {
  const params = new URLSearchParams({
    notnewword: "1",
  });

  const imdb = "imdb" in input.options ? input.options.imdb : undefined;
  if (typeof imdb === "string" && imdb.trim().length > 0) {
    params.set("search", imdb.trim());
    params.set("search_area", "4");
  } else if (typeof input.query === "string" && input.query.trim().length > 0) {
    params.set("search", input.query);
  }

  if (Array.isArray(input.options.categoryIds) && input.options.categoryIds.length > 0) {
    for (const categoryId of input.options.categoryIds) {
      params.set(`cat${categoryId}`, "1");
    }
  }
  if (input.options.incldead !== undefined) {
    params.set("incldead", String(input.options.incldead));
  }
  if (input.options.spstate !== undefined) {
    params.set("spstate", String(input.options.spstate));
  }
  if (input.options.bookmarked !== undefined) {
    params.set("inclbookmarked", String(input.options.bookmarked));
  }
  if (input.options.page !== undefined) {
    params.set("page", String(input.options.page));
  }

  return params;
}
