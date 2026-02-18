import { CliAppError } from "@onemoreproduct/cli-core";

import type { ByrSearchItem, ByrTorrentDetail, ByrUserInfo } from "../types.js";

const SIZE_PATTERN = /\b\d+(?:\.\d+)?\s*(?:B|KB|MB|GB|TB|PB|KIB|MIB|GIB|TIB)\b/i;
const INTEGER_PATTERN = /^\d+$/;

export interface LoginFormConfig {
  action: string;
  usernameField: string;
  passwordField: string;
  hiddenFields: URLSearchParams;
  requiresManualField: string[];
}

export function parseLoginForm(html: string): LoginFormConfig {
  const forms = Array.from(html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi));

  for (const formMatch of forms) {
    const formAttrs = parseTagAttributes(formMatch[1]);
    const formBody = formMatch[2] ?? "";
    if (!/type\s*=\s*["']?password/i.test(formBody)) {
      continue;
    }

    const action = formAttrs.action ?? "/takelogin.php";
    const hiddenFields = new URLSearchParams();
    const inputs = Array.from(formBody.matchAll(/<input\b([^>]*)>/gi)).map((match) =>
      parseTagAttributes(match[1]),
    );

    let usernameField: string | undefined;
    let passwordField: string | undefined;
    const requiresManualField: string[] = [];

    for (const input of inputs) {
      const name = input.name?.trim();
      if (name === undefined || name.length === 0) {
        continue;
      }

      const type = (input.type ?? "text").toLowerCase();
      const value = input.value ?? "";

      if (type === "hidden") {
        hiddenFields.set(name, value);
      }

      if (type === "password") {
        passwordField = name;
        continue;
      }

      if (usernameField === undefined && (type === "text" || type === "email")) {
        if (looksLikeUsernameField(name)) {
          usernameField = name;
        }
      }

      if (isManualVerificationField(name) && type !== "hidden") {
        requiresManualField.push(name);
      }
    }

    if (usernameField === undefined) {
      const fallback = inputs.find((input) => {
        const type = (input.type ?? "text").toLowerCase();
        const name = input.name?.trim();
        if (name === undefined || name.length === 0) {
          return false;
        }

        if (type !== "text" && type !== "email") {
          return false;
        }

        return !isManualVerificationField(name);
      });

      usernameField = fallback?.name?.trim();
    }

    if (usernameField !== undefined && passwordField !== undefined) {
      return {
        action,
        usernameField,
        passwordField,
        hiddenFields,
        requiresManualField,
      };
    }
  }

  throw new CliAppError({
    code: "E_UPSTREAM_BAD_RESPONSE",
    message: "Unable to find BYR login form fields",
  });
}

function looksLikeUsernameField(name: string): boolean {
  return /user(name)?|email|login|uid/i.test(name);
}

function isManualVerificationField(name: string): boolean {
  return /captcha|verify|code|image|string|otp|token|2fa|security/i.test(name);
}

function parseTagAttributes(raw: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const matcher = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;

  for (const match of raw.matchAll(matcher)) {
    const key = match[1]?.toLowerCase();
    if (key === undefined) {
      continue;
    }

    const value = match[2] ?? match[3] ?? match[4] ?? "";
    attributes[key] = decodeHtmlEntities(value);
  }

  return attributes;
}

export function looksLikeLoginPage(html: string): boolean {
  const lower = html.toLowerCase();
  if (!lower.includes("password")) {
    return false;
  }

  if (lower.includes("takelogin.php") || lower.includes("login.php")) {
    return true;
  }

  return /登录|signin|sign in|not authorized|auth_form/.test(lower);
}

export function looksLikeNotFoundPage(html: string): boolean {
  return /not\s+found|不存在|沒有找到|没有找到|invalid\s+torrent|does\s+not\s+exist/i.test(html);
}

export function parseSearchItems(html: string, limit: number, baseUrl: string): ByrSearchItem[] {
  const items: ByrSearchItem[] = [];
  const scope = extractTableByClass(html, "torrents") ?? html;
  const rows = extractTopLevelRows(scope);

  for (const rowHtml of rows) {
    if (rowHtml.length === 0) {
      continue;
    }

    if (!/details\.php\?[^"']*id=\d+/i.test(rowHtml)) {
      continue;
    }

    const cells = extractTopLevelCells(rowHtml);
    const detailCellIndex = cells.findIndex((cell) => /details\.php\?[^"']*id=\d+/i.test(cell));
    const detailCell = detailCellIndex >= 0 ? cells[detailCellIndex] : rowHtml;

    const detailAnchor =
      /<a\b([^>]*)href\s*=\s*["']([^"']*details\.php\?[^"']*id=(\d+)[^"']*)["'][^>]*>([\s\S]*?)<\/a\s*>/i.exec(
        detailCell,
      ) ??
      /<a\b([^>]*)href\s*=\s*["']([^"']*details\.php\?[^"']*id=(\d+)[^"']*)["'][^>]*>([\s\S]*?)<\/a\s*>/i.exec(
        rowHtml,
      );
    if (detailAnchor === null || detailAnchor[3] === undefined) {
      continue;
    }

    const id = detailAnchor[3];
    const anchorAttrs = parseTagAttributes(detailAnchor[1] ?? "");
    const title = normalizeText(anchorAttrs.title ?? detailAnchor[4] ?? "");
    if (title.length === 0) {
      continue;
    }

    const categoryCell = detailCellIndex > 0 ? cells[detailCellIndex - 1] : rowHtml;
    const usesLegacyColumnOrder =
      detailCellIndex >= 0 && findSize([cells[detailCellIndex + 1] ?? ""]) !== undefined;
    const commentsCell =
      detailCellIndex >= 0 ? cells[detailCellIndex + (usesLegacyColumnOrder ? 4 : 1)] : undefined;
    const timeCell =
      detailCellIndex >= 0 ? cells[detailCellIndex + (usesLegacyColumnOrder ? 7 : 2)] : undefined;
    const sizeCell =
      detailCellIndex >= 0 ? cells[detailCellIndex + (usesLegacyColumnOrder ? 1 : 3)] : undefined;
    const seedersCell =
      detailCellIndex >= 0 ? cells[detailCellIndex + (usesLegacyColumnOrder ? 2 : 4)] : undefined;
    const leechersCell =
      detailCellIndex >= 0 ? cells[detailCellIndex + (usesLegacyColumnOrder ? 3 : 5)] : undefined;
    const completedCell =
      detailCellIndex >= 0 ? cells[detailCellIndex + (usesLegacyColumnOrder ? 5 : 6)] : undefined;
    const authorCell =
      detailCellIndex >= 0 ? cells[detailCellIndex + (usesLegacyColumnOrder ? 6 : 7)] : undefined;

    const subTitle = inferSubTitle(detailCell, title);
    const fallbackCells = extractTableCells(rowHtml);
    const { seeders: inferredSeeders, leechers: inferredLeechers } = inferPeers(
      rowHtml,
      fallbackCells,
    );
    const size = findSize([sizeCell ?? "", ...fallbackCells]) ?? "unknown";
    const sizeBytes = parseSizeToBytes(size);
    const url = resolveUrl(baseUrl, `/details.php?id=${id}`).toString();
    const link = normalizeDetailsToDownloadUrl(
      extractDownloadUrl(rowHtml, id, baseUrl) ??
        resolveUrl(baseUrl, `/download.php?id=${id}`).toString(),
    );

    const category = inferCategory(categoryCell) ?? inferCategory(rowHtml);
    const status = inferStatus(rowHtml);
    const progress = inferProgress(rowHtml);
    const seeders = parseCellInteger(seedersCell) ?? inferredSeeders;
    const leechers = parseCellInteger(leechersCell) ?? inferredLeechers;
    const completed =
      parseCellInteger(completedCell) ??
      extractPeerCountByPattern(rowHtml, /snatch|completed|完成/i) ??
      undefined;
    const comments =
      parseCellInteger(commentsCell) ??
      extractPeerCountByPattern(rowHtml, /comment|评论/i) ??
      undefined;
    const author = inferAuthor(authorCell ?? rowHtml) ?? normalizeCellText(authorCell);
    const timeRaw = inferTime(timeCell ?? rowHtml) ?? normalizeCellText(timeCell);
    const time = timeRaw ? normalizeDateValue(timeRaw) : undefined;
    const extImdb = inferExternalId(detailCell, /imdb/i) ?? inferExternalId(rowHtml, /imdb/i);
    const extDouban = inferExternalId(detailCell, /douban/i) ?? inferExternalId(rowHtml, /douban/i);

    items.push({
      id,
      title,
      size,
      seeders,
      leechers,
      tags: extractTags(title, rowHtml),
      subTitle: subTitle.length > 0 ? subTitle : undefined,
      url,
      link,
      category: category ?? undefined,
      status,
      progress,
      completed,
      comments,
      author,
      time: time && time.length > 0 ? time : undefined,
      extImdb,
      extDouban,
      sizeBytes,
    });

    if (items.length >= limit) {
      break;
    }
  }

  return items;
}

function extractTableByClass(html: string, className: string): string | undefined {
  const escapedClassName = className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const tableStartPattern = new RegExp(
    `<table\\b[^>]*class\\s*=\\s*["'][^"']*\\b${escapedClassName}\\b[^"']*["'][^>]*>`,
    "i",
  );
  const match = tableStartPattern.exec(html);
  if (match === null || match.index === undefined) {
    return undefined;
  }

  const endIndex = findMatchingTagEnd(html, match.index, "table");
  if (endIndex === undefined) {
    return undefined;
  }

  return html.slice(match.index, endIndex);
}

function findMatchingTagEnd(html: string, startIndex: number, tagName: string): number | undefined {
  const tagPattern = new RegExp(`<\\/?${tagName}\\b[^>]*>`, "gi");
  let depth = 0;
  let match: RegExpExecArray | null;

  while ((match = tagPattern.exec(html)) !== null) {
    const tag = match[0];
    const index = match.index;
    if (index < startIndex) {
      continue;
    }

    if (tag.startsWith("</")) {
      depth -= 1;
      if (depth === 0) {
        return index + tag.length;
      }
      continue;
    }

    depth += 1;
  }

  return undefined;
}

function extractTopLevelRows(tableHtml: string): string[] {
  return extractTopLevelTagBlocks(tableHtml, "tr");
}

function extractTopLevelCells(rowHtml: string): string[] {
  const cells = extractTopLevelTagBlocks(rowHtml, "td");
  return cells.map((cell) => extractInnerTagContent(cell, "td"));
}

function extractTopLevelTagBlocks(html: string, tagName: string): string[] {
  const blocks: string[] = [];
  const tagPattern = new RegExp(`<\\/?${tagName}\\b[^>]*>`, "gi");

  let depth = 0;
  let blockStart = -1;

  for (const match of html.matchAll(tagPattern)) {
    const tag = match[0];
    const index = match.index ?? -1;
    if (index < 0) {
      continue;
    }

    if (tag.startsWith("</")) {
      if (depth <= 0) {
        continue;
      }

      depth -= 1;
      if (depth === 0 && blockStart >= 0) {
        blocks.push(html.slice(blockStart, index + tag.length));
        blockStart = -1;
      }
      continue;
    }

    if (depth === 0) {
      blockStart = index;
    }
    depth += 1;
  }

  return blocks;
}

function extractInnerTagContent(block: string, tagName: string): string {
  const lower = block.toLowerCase();
  const closeTag = `</${tagName.toLowerCase()}>`;
  const openEnd = block.indexOf(">");
  const closeStart = lower.lastIndexOf(closeTag);

  if (openEnd < 0 || closeStart < 0 || closeStart <= openEnd) {
    return block;
  }

  return block.slice(openEnd + 1, closeStart);
}

export function parseTorrentDetail(html: string, id: string, baseUrl: string): ByrTorrentDetail {
  if (looksLikeNotFoundPage(html)) {
    throw new CliAppError({
      code: "E_NOT_FOUND_RESOURCE",
      message: `Torrent not found: ${id}`,
      details: { id },
    });
  }

  const title = extractDetailTitle(html);
  if (title.length === 0) {
    throw new CliAppError({
      code: "E_UPSTREAM_BAD_RESPONSE",
      message: "Unable to parse torrent title from BYR detail page",
      details: { id },
    });
  }

  const detailScope = extractTableByClass(html, "rowtable") ?? html;
  const labelValues = parseLabelValuePairs(detailScope);
  const cells = extractTableCells(detailScope);
  const basicInfo = pickLabelValue(labelValues, ["基本信息", "basic info"]) ?? "";
  const peerSummary = pickLabelValue(labelValues, ["同伴", "peers", "peer"]);
  const peerCounts = parsePeerSummary(peerSummary ?? detailScope);
  const size =
    pickLabelValue(labelValues, ["大小", "体积", "size"]) ??
    findSize([basicInfo, ...cells]) ??
    "unknown";

  const seeders =
    peerCounts?.seeders ??
    pickIntegerLabelValue(labelValues, ["做种", "seed", "seeders", "当前种子"]) ??
    extractPeerCountByPattern(detailScope, /seed(?:ers?)?/i) ??
    0;

  const leechers =
    peerCounts?.leechers ??
    pickIntegerLabelValue(labelValues, ["下载数", "下载者", "leech", "leechers", "吸血"]) ??
    extractPeerCountByPattern(detailScope, /leech(?:ers?)?|下载/i) ??
    0;

  const category =
    pickLabelValue(labelValues, ["分类", "类型", "category", "type"]) ??
    extractCategoryFromTypeSpan(detailScope) ??
    extractCategoryFromBasicInfo(basicInfo) ??
    "Unknown";
  const uploadedRaw =
    pickLabelValue(labelValues, [
      "发布时间",
      "发布于",
      "添加时间",
      "上传时间",
      "uploaded",
      "created",
    ]) ??
    extractPublishedTime(detailScope) ??
    "";
  const uploadedAt = normalizeDateValue(uploadedRaw);

  const sourceUrl = resolveUrl(baseUrl, `/details.php?id=${encodeURIComponent(id)}`).toString();
  const link = normalizeDetailsToDownloadUrl(
    extractDownloadUrl(detailScope, id, baseUrl) ??
      extractDownloadUrl(html, id, baseUrl) ??
      resolveUrl(baseUrl, `/download.php?id=${id}`).toString(),
  );

  const subTitle =
    pickLabelValue(labelValues, ["副标题", "subtitle"]) ?? inferSubTitle(detailScope, title);
  const extImdb = inferExternalId(detailScope, /imdb/i) ?? inferExternalId(html, /imdb/i);
  const extDouban = inferExternalId(detailScope, /douban/i) ?? inferExternalId(html, /douban/i);
  const sizeBytes = parseSizeToBytes(size);
  const completed =
    pickIntegerLabelValue(labelValues, ["完成", "snatch", "completed"]) ??
    extractPeerCountByPattern(detailScope, /completed|snatch|完成/i) ??
    undefined;
  const comments =
    pickIntegerLabelValue(labelValues, ["评论", "comment"]) ??
    extractPeerCountByPattern(detailScope, /comment|评论/i) ??
    undefined;
  const author = inferAuthor(detailScope) ?? inferAuthor(html);

  return {
    id,
    title,
    size,
    seeders,
    leechers,
    tags: extractTags(title, detailScope),
    uploadedAt,
    category,
    subTitle: subTitle.length > 0 ? subTitle : undefined,
    url: sourceUrl,
    link,
    status: inferStatus(detailScope),
    progress: inferProgress(detailScope),
    completed,
    comments,
    author,
    time: uploadedAt,
    extImdb,
    extDouban,
    sizeBytes,
  };
}

export function normalizeDetailsToDownloadUrl(url: string): string {
  if (url.includes("details.php")) {
    return url
      .replace(/details\.php\?id=(\d+)/i, "download.php?id=$1")
      .replace(/([?&])hit=1(&?)/i, (_, first: string, second: string) => (second ? first : ""))
      .replace(/[?&]$/, "");
  }

  return url;
}

export function extractDownloadUrl(html: string, id: string, baseUrl: string): string | undefined {
  const candidates = Array.from(
    html.matchAll(/href\s*=\s*["']([^"']*(?:download|details)[^"']*)["']/gi),
  ).map((match) => match[1] ?? "");

  for (const candidate of candidates) {
    if (candidate.includes(`id=${id}`)) {
      return normalizeDetailsToDownloadUrl(
        resolveUrl(baseUrl, decodeHtmlEntities(candidate)).toString(),
      );
    }
  }

  if (candidates.length > 0) {
    return normalizeDetailsToDownloadUrl(
      resolveUrl(baseUrl, decodeHtmlEntities(candidates[0])).toString(),
    );
  }

  return undefined;
}

export function parseUserIdFromIndex(html: string): string | undefined {
  const explicit = /href\s*=\s*["'][^"']*userdetails\.php\?[^"']*id=(\d+)[^"']*["']/i.exec(html);
  if (explicit !== null) {
    return explicit[1];
  }

  return undefined;
}

export function parseUserInfoFromDetails(
  html: string,
  fallbackId: string,
): Omit<
  ByrUserInfo,
  "bonusPerHour" | "seeding" | "seedingSizeBytes" | "uploads" | "levelProgress"
> {
  const labelValues = parseLabelValuePairs(html);

  const transferText =
    pickLabelValue(labelValues, ["传输", "傳送", "transfers", "分享率"]) ?? normalizeText(html);

  const uploadedBytes = parseTransferValue(
    transferText,
    /(上[传傳]量|uploaded).+?([\d.]+ ?[ZEPTGMK]?i?B)/i,
  );
  const trueUploadedBytes = parseTransferValue(
    transferText,
    /((?:实际|真实)上传量|(?:實際|真實)上傳量|(?:real|actual) uploaded).+?([\d.]+ ?[ZEPTGMK]?i?B)/i,
  );
  const downloadedBytes = parseTransferValue(
    transferText,
    /(下[载載]量|downloaded).+?([\d.]+ ?[ZEPTGMK]?i?B)/i,
  );
  const trueDownloadedBytes = parseTransferValue(
    transferText,
    /((?:实际|真实)下载量|(?:實際|真實)下載量|(?:real|actual) downloaded).+?([\d.]+ ?[ZEPTGMK]?i?B)/i,
  );

  const id = parseUserIdFromIndex(html) ?? fallbackId;
  const name =
    pickLabelValue(labelValues, ["用户名", "username", "用户", "user"]) ??
    inferUserName(html) ??
    "";

  const messageCount =
    firstInteger(
      pickLabelValue(labelValues, ["消息", "messages"]) ?? extractMessageCountSnippet(html),
    ) ?? 0;

  const levelName =
    pickLabelValue(labelValues, ["等级", "等級", "class"]) ?? inferLevelName(html) ?? "";
  const bonus = extractNumber(
    pickLabelValue(labelValues, ["魔力", "积分", "麦粒", "星焱", "karma"]) ?? "",
  );
  const seedingBonus = extractNumber(
    pickLabelValue(labelValues, ["做种积分", "做種積分", "seeding points", "保种积分"]) ?? "",
  );
  const joinTime = normalizeDateValue(
    pickLabelValue(labelValues, ["加入日期", "joindate", "join date"]) ?? "",
  );
  const lastAccessAt = normalizeDateValue(
    pickLabelValue(labelValues, ["最近动向", "最近動向", "last action"]) ?? "",
  );

  const hnrText = normalizeText(extractHnrSnippet(html));
  const hnrPreWarning = firstInteger(hnrText) ?? 0;
  const hnrUnsatisfied = /(\d+)\s*\/\s*(\d+)/.exec(hnrText)
    ? Number.parseInt((/(\d+)\s*\/\s*(\d+)/.exec(hnrText) as RegExpExecArray)[2], 10)
    : 0;

  const trueUploaded = trueUploadedBytes > 0 ? trueUploadedBytes : uploadedBytes;
  const trueDownloaded = trueDownloadedBytes > 0 ? trueDownloadedBytes : downloadedBytes;
  const ratio = trueDownloaded > 0 ? Number((trueUploaded / trueDownloaded).toFixed(3)) : 0;

  return {
    id,
    name,
    messageCount,
    uploadedBytes,
    downloadedBytes,
    trueUploadedBytes,
    trueDownloadedBytes,
    ratio,
    levelName,
    bonus,
    seedingBonus,
    hnrPreWarning,
    hnrUnsatisfied,
    joinTime,
    lastAccessAt,
  };
}

export function parseBonusPerHour(html: string): number {
  const possible = [
    /每小时能获取[^0-9]*([\d.]+)/i,
    /you are currently getting[^0-9]*([\d.]+)/i,
    /做种积分.*?([\d.]+)\s*\/\s*h/i,
    /bonus[^0-9]*per hour[^0-9]*([\d.]+)/i,
  ];

  for (const pattern of possible) {
    const match = pattern.exec(normalizeText(html));
    if (match !== null) {
      return Number.parseFloat(match[1]);
    }
  }

  return 0;
}

export function parseSeedingStatus(html: string): { seeding: number; seedingSizeBytes: number } {
  const normalized = normalizeText(html);
  const quick = /(\d+)\s*\|\s*([\d.]+\s*[ZEPTGMK]?i?B)/i.exec(normalized);
  if (quick !== null) {
    return {
      seeding: Number.parseInt(quick[1], 10),
      seedingSizeBytes: parseSizeToBytes(quick[2]) ?? 0,
    };
  }

  const rows = Array.from(html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi));
  if (rows.length <= 1) {
    return { seeding: 0, seedingSizeBytes: 0 };
  }

  let seeding = 0;
  let sizeSum = 0;
  for (const row of rows.slice(1)) {
    const cells = extractTableCells(row[0] ?? "");
    const size = findSize(cells);
    if (size) {
      seeding += 1;
      sizeSum += parseSizeToBytes(size) ?? 0;
    }
  }

  return {
    seeding,
    seedingSizeBytes: sizeSum,
  };
}

export function parseUploads(html: string): number {
  const keyword = /<b>(\d+)<\/b>(条记录| records|條記錄)/i.exec(html);
  if (keyword !== null) {
    return Number.parseInt(keyword[1], 10);
  }

  const rows = Array.from(html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi));
  return rows.length > 1 ? rows.length - 1 : 0;
}

function parseTransferValue(source: string, pattern: RegExp): number {
  const match = source.replace(/,/g, "").match(pattern);
  if (match === null) {
    return 0;
  }

  return parseSizeToBytes(match[2]) ?? 0;
}

function extractMessageCountSnippet(html: string): string {
  const match = /messages\.php[^>]*>([\s\S]{0,80})<\/a>/i.exec(html);
  return match?.[1] ?? "";
}

function extractHnrSnippet(html: string): string {
  const match = /myhr\.php[^>]*>([\s\S]{0,100})<\/a>/i.exec(html);
  return match?.[1] ?? "";
}

function inferUserName(html: string): string | undefined {
  const match = /userdetails\.php\?[^"']*id=\d+[^"']*["'][^>]*>([^<]+)</i.exec(html);
  if (match === null) {
    return undefined;
  }

  const text = normalizeText(match[1]);
  return text.length > 0 ? text : undefined;
}

function inferLevelName(html: string): string | undefined {
  const imageTitle = /(?:等级|等級|class)[\s\S]{0,200}?<img[^>]*title\s*=\s*["']([^"']+)["']/i.exec(
    html,
  );
  if (imageTitle !== null) {
    return normalizeText(imageTitle[1]);
  }

  const fallback = /(?:等级|等級|class)[\s\S]{0,100}?<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/i.exec(
    html,
  );
  if (fallback !== null) {
    const text = normalizeText(fallback[1]);
    return text.length > 0 ? text : undefined;
  }

  return undefined;
}

function inferSubTitle(rowHtml: string, title: string): string {
  let scope = rowHtml;
  const embeddedCell =
    /<td\b[^>]*class\s*=\s*["'][^"']*\bembedded\b[^"']*["'][^>]*>([\s\S]*?)<\/td>/i.exec(rowHtml);
  if (embeddedCell !== null) {
    scope = embeddedCell[1] ?? scope;
  }

  const split = scope.split(/<br\s*\/?>/i);
  if (split.length < 2) {
    return "";
  }

  for (const part of split.slice(1)) {
    const candidate = normalizeText(part);
    if (candidate.length === 0 || candidate === title) {
      continue;
    }

    return candidate;
  }

  return "";
}

function inferCategory(html: string): string | undefined {
  const catLink = /class\s*=\s*["'][^"']*\bcat-link\b[^"']*["'][^>]*>([\s\S]*?)<\/a\s*>/i.exec(
    html,
  );
  if (catLink !== null) {
    const text = normalizeText(catLink[1]);
    if (text.length > 0) {
      return text;
    }
  }

  const iconTitle = /cat-icon[^>]*(?:title|alt)\s*=\s*["']([^"']+)["']/i.exec(html);
  if (iconTitle !== null) {
    const text = normalizeText(iconTitle[1]);
    if (text.length > 0) {
      return text;
    }
  }

  const imageTitle = /<img[^>]*(?:title|alt)\s*=\s*["']([^"']+)["'][^>]*>/i.exec(html);
  if (imageTitle !== null) {
    const text = normalizeText(imageTitle[1]);
    if (
      !/download|seed|leech|comment|size|time|流量正常计算|下载本种|收藏/i.test(text) &&
      text.length > 0
    ) {
      return text;
    }
  }

  return undefined;
}

function inferStatus(html: string): ByrSearchItem["status"] {
  if (/finished\.png|completed/i.test(html)) {
    return "completed";
  }
  if (/seeding/i.test(html)) {
    return "seeding";
  }
  if (/leeching|downloading/i.test(html)) {
    return "downloading";
  }
  if (/inactive/i.test(html)) {
    return "inactive";
  }
  return "unknown";
}

function inferProgress(html: string): number | null {
  const titleMatch = /\btitle\s*=\s*["'][^"']*?\s(\d+(?:\.\d+)?)%["']/i.exec(html);
  if (titleMatch !== null) {
    return Number.parseFloat(titleMatch[1]);
  }

  return null;
}

function inferAuthor(html: string): string | undefined {
  const author = /sort=9[^>]*>([\s\S]*?)<\/a\s*>/i.exec(html);
  if (author !== null) {
    const text = normalizeText(author[1]);
    return text.length > 0 ? text : undefined;
  }

  const generic = /userdetails\.php\?[^"']*id=\d+[^"']*["'][^>]*>([\s\S]*?)<\/a\s*>/i.exec(html);
  if (generic !== null) {
    const text = normalizeText(generic[1]);
    return text.length > 0 ? text : undefined;
  }

  return undefined;
}

function inferTime(html: string): string | undefined {
  const withTitle = /<(?:span|time)\b[^>]*\btitle\s*=\s*["']([^"']+)["'][^>]*>/i.exec(html);
  if (withTitle !== null) {
    return withTitle[1];
  }

  const text = /icons\.time[\s\S]{0,120}?>\s*([^<]+)</i.exec(html);
  if (text !== null) {
    return text[1];
  }

  return undefined;
}

function inferExternalId(html: string, pattern: RegExp): string | null {
  const dataSpan = /<span[^>]*data-(doubanid|imdbid)\s*=\s*["']([^"']+)["']/gi;
  for (const match of html.matchAll(dataSpan)) {
    if (pattern.test(match[1])) {
      return match[2];
    }
  }

  if (pattern.test("imdb")) {
    const imdbPlugin = /imdbRatingPlugin[^>]*data-title\s*=\s*["']([^"']+)["']/i.exec(html);
    if (imdbPlugin !== null) {
      return imdbPlugin[1];
    }
  }

  const hrefMatch = /<a[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi;
  for (const match of html.matchAll(hrefMatch)) {
    if (pattern.test(match[1])) {
      return match[1];
    }
  }

  return null;
}

function parsePeerSummary(value: string): { seeders: number; leechers: number } | undefined {
  const match = /(\d+)\s*个做种者[\s\S]*?(\d+)\s*个下载者/i.exec(value);
  if (match === null) {
    return undefined;
  }

  return {
    seeders: Number.parseInt(match[1], 10),
    leechers: Number.parseInt(match[2], 10),
  };
}

function extractCategoryFromTypeSpan(html: string): string | undefined {
  const match = /id\s*=\s*["']type["'][^>]*>([\s\S]*?)<\/span>/i.exec(html);
  if (match === null) {
    return undefined;
  }

  const category = normalizeText(match[1]);
  return category.length > 0 ? category : undefined;
}

function extractCategoryFromBasicInfo(value: string): string | undefined {
  const match = /(?:类型|type)\s*[：:]\s*([^|]+)/i.exec(value);
  if (match === null) {
    return undefined;
  }

  const category = normalizeText(match[1]);
  return category.length > 0 ? category : undefined;
}

function extractPublishedTime(value: string): string | undefined {
  const match =
    /发布于\s*([0-9]{4}[年/-][0-9]{1,2}[月/-][0-9]{1,2}\s+[0-9]{1,2}:[0-9]{2}(?::[0-9]{2})?)/i.exec(
      value,
    );
  if (match === null) {
    return undefined;
  }

  return normalizeText(match[1]);
}

function parseLabelValuePairs(html: string): Map<string, string> {
  const pairs = new Map<string, string>();
  const rows = Array.from(html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi));

  for (const rowMatch of rows) {
    const cells = extractTableCells(rowMatch[0] ?? "");
    if (cells.length < 2) {
      continue;
    }

    for (let index = 0; index + 1 < cells.length; index += 2) {
      const label = normalizeLabel(cells[index]);
      const value = normalizeText(cells[index + 1]);

      if (label.length === 0 || value.length === 0) {
        continue;
      }

      if (!pairs.has(label)) {
        pairs.set(label, value);
      }
    }
  }

  return pairs;
}

function pickLabelValue(
  labelValues: Map<string, string>,
  candidates: string[],
): string | undefined {
  const normalizedCandidates = candidates.map((candidate) => normalizeLabel(candidate));

  for (const [label, value] of labelValues.entries()) {
    for (const candidate of normalizedCandidates) {
      if (label.includes(candidate)) {
        return value;
      }
    }
  }

  return undefined;
}

function pickIntegerLabelValue(
  labelValues: Map<string, string>,
  candidates: string[],
): number | undefined {
  const value = pickLabelValue(labelValues, candidates);
  if (value === undefined) {
    return undefined;
  }

  const parsed = firstInteger(value);
  return parsed ?? undefined;
}

function extractTableCells(html: string): string[] {
  const cells: string[] = [];

  for (const cellMatch of html.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)) {
    cells.push(cellMatch[1] ?? "");
  }

  return cells;
}

function inferPeers(rowHtml: string, cells: string[]): { seeders: number; leechers: number } {
  const seeders =
    extractPeerCountByPattern(rowHtml, /seed(?:ers?)?|做种/i) ?? inferPeerFromCells(cells, -2) ?? 0;
  const leechers =
    extractPeerCountByPattern(rowHtml, /leech(?:ers?)?|下载|吸血/i) ??
    inferPeerFromCells(cells, -1) ??
    0;

  return { seeders, leechers };
}

function parseCellInteger(cell: string | undefined): number | undefined {
  if (cell === undefined) {
    return undefined;
  }

  const value = firstInteger(cell);
  return value === null ? undefined : value;
}

function normalizeCellText(cell: string | undefined): string | undefined {
  if (cell === undefined) {
    return undefined;
  }

  const text = normalizeText(cell);
  return text.length > 0 ? text : undefined;
}

function extractPeerCountByPattern(html: string, keywordPattern: RegExp): number | undefined {
  const links = Array.from(
    html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a\s*>/gi),
  );

  for (const link of links) {
    const href = link[1] ?? "";
    if (!keywordPattern.test(href)) {
      continue;
    }

    const count = firstInteger(link[2] ?? "");
    if (count !== null) {
      return count;
    }
  }

  return undefined;
}

function inferPeerFromCells(cells: string[], positionFromEnd: number): number | undefined {
  const numericCells = cells
    .map((cell) => normalizeText(cell))
    .filter((cell) => INTEGER_PATTERN.test(cell))
    .map((cell) => Number.parseInt(cell, 10));

  if (numericCells.length === 0) {
    return undefined;
  }

  const index = numericCells.length + positionFromEnd;
  if (index < 0 || index >= numericCells.length) {
    return undefined;
  }

  return numericCells[index];
}

function findSize(cells: string[]): string | undefined {
  for (const cell of cells) {
    const text = normalizeText(cell);
    const match = SIZE_PATTERN.exec(text);
    if (match !== null) {
      return match[0];
    }
  }

  return undefined;
}

function extractDetailTitle(html: string): string {
  const headingMatch = /<(?:h1|h2)\b[^>]*>([\s\S]*?)<\/(?:h1|h2)>/i.exec(html);
  if (headingMatch !== null) {
    const heading = normalizeText(headingMatch[1] ?? "");
    if (heading.length > 0) {
      return heading;
    }
  }

  const titleTagMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (titleTagMatch !== null) {
    const titleTagText = normalizeText(titleTagMatch[1] ?? "");
    const quotedTitle = /["“”]([^"“”]+)["“”]/.exec(titleTagText);
    if (quotedTitle !== null) {
      return normalizeText(quotedTitle[1] ?? "");
    }

    return titleTagText
      .replace(/^BYRBT\s*::\s*/i, "")
      .replace(/-\s*Powered\s+by\s+NexusPHP$/i, "")
      .trim();
  }

  return "";
}

export function normalizeDateValue(value: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    return "";
  }

  const parsedDirect = new Date(normalized);
  if (Number.isFinite(parsedDirect.getTime())) {
    return parsedDirect.toISOString();
  }

  const match =
    /(?<year>\d{4})[年/-](?<month>\d{1,2})[月/-](?<day>\d{1,2})\D+(?<hour>\d{1,2}):(?<minute>\d{1,2})(?::(?<second>\d{1,2}))?/.exec(
      normalized,
    );

  if (match?.groups === undefined) {
    return normalized;
  }

  const year = Number.parseInt(match.groups.year, 10);
  const month = Number.parseInt(match.groups.month, 10) - 1;
  const day = Number.parseInt(match.groups.day, 10);
  const hour = Number.parseInt(match.groups.hour, 10);
  const minute = Number.parseInt(match.groups.minute, 10);
  const second = Number.parseInt(match.groups.second ?? "0", 10);

  const parsedCustom = new Date(Date.UTC(year, month, day, hour, minute, second));
  if (!Number.isFinite(parsedCustom.getTime())) {
    return normalized;
  }

  return parsedCustom.toISOString();
}

export function parseSizeToBytes(value: string): number | undefined {
  const match = /^\s*(\d+(?:\.\d+)?)\s*(B|KB|MB|GB|TB|PB|KIB|MIB|GIB|TIB)\s*$/i.exec(value);
  if (match === null) {
    return undefined;
  }

  const size = Number.parseFloat(match[1]);
  const unit = match[2].toUpperCase();
  if (!Number.isFinite(size)) {
    return undefined;
  }

  const base = unit.endsWith("IB") ? 1024 : 1000;
  const powerMap: Record<string, number> = {
    B: 0,
    KB: 1,
    MB: 2,
    GB: 3,
    TB: 4,
    PB: 5,
    KIB: 1,
    MIB: 2,
    GIB: 3,
    TIB: 4,
  };
  const power = powerMap[unit];
  if (power === undefined) {
    return undefined;
  }

  return Math.round(size * base ** power);
}

function resolveUrl(baseUrl: string, pathOrUrl: string): URL {
  if (/^https?:\/\//i.test(pathOrUrl)) {
    return new URL(pathOrUrl);
  }

  return new URL(pathOrUrl, baseUrl);
}

function normalizeText(html: string): string {
  return decodeHtmlEntities(stripHtmlTags(html)).replace(/\s+/g, " ").trim();
}

function normalizeLabel(value: string): string {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[：:]/g, "")
    .replace(/\s+/g, "");
}

function stripHtmlTags(value: string): string {
  return value.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ");
}

function decodeHtmlEntities(value: string): string {
  const numericEntityPattern = /&#(\d+);/g;
  const hexEntityPattern = /&#x([\da-fA-F]+);/g;

  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(hexEntityPattern, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(numericEntityPattern, (_, num: string) =>
      String.fromCodePoint(Number.parseInt(num, 10)),
    );
}

function firstInteger(value: string): number | null {
  const match = /\b(\d+)\b/.exec(normalizeText(value));
  if (match === null) {
    return null;
  }

  return Number.parseInt(match[1], 10);
}

function extractNumber(value: string): number {
  const normalized = value.replace(/,/g, "");
  const match = /[\d.]+/.exec(normalized);
  if (match === null) {
    return 0;
  }
  return Number.parseFloat(match[0]);
}

function extractTags(title: string, html: string): string[] {
  const tags = new Set<string>();

  for (const match of title.matchAll(/\[([^\]]+)\]/g)) {
    const tag = match[1]?.trim();
    if (tag !== undefined && tag.length > 0) {
      tags.add(tag);
    }
  }

  const promoTags: Array<[RegExp, string]> = [
    [/pro_free|免费/i, "Free"],
    [/pro_free2up|2xfree/i, "2xFree"],
    [/pro_2up/i, "2xUp"],
    [/pro_50pctdown2up|2x50/i, "2x50%"],
    [/pro_30pctdown|30%/i, "30%"],
    [/pro_50pctdown|50%/i, "50%"],
    [/hitandrun|h&r/i, "H&R"],
  ];
  for (const [pattern, label] of promoTags) {
    if (pattern.test(html)) {
      tags.add(label);
    }
  }

  return Array.from(tags);
}
