import type {
  ByrCategoryFacet,
  ByrCategoryOption,
  ByrLevelRequirement,
  ByrSimpleFacet,
  ByrSimpleFacetOption,
} from "./types.js";

function aliases(value: number, ...extra: string[]): string[] {
  return [String(value), ...extra];
}

export const BYR_CATEGORY_FACET: ByrCategoryFacet = {
  key: "category",
  name: "类别",
  mode: "append",
  options: [
    { value: 408, name: "电影", aliases: aliases(408, "movie", "movies", "film") },
    { value: 401, name: "剧集", aliases: aliases(401, "series", "tv", "show", "drama") },
    { value: 404, name: "动漫", aliases: aliases(404, "anime", "animation") },
    { value: 402, name: "音乐", aliases: aliases(402, "music") },
    { value: 405, name: "综艺", aliases: aliases(405, "variety", "reality") },
    { value: 403, name: "游戏", aliases: aliases(403, "game", "games") },
    { value: 406, name: "软件", aliases: aliases(406, "software", "app", "apps") },
    { value: 407, name: "资料", aliases: aliases(407, "material", "materials", "doc", "docs") },
    { value: 409, name: "体育", aliases: aliases(409, "sports", "sport") },
    { value: 410, name: "纪录", aliases: aliases(410, "documentary", "documentaries", "docu") },
  ],
};

export const BYR_INCLDEAD_FACET: ByrSimpleFacet = {
  key: "incldead",
  name: "显示断种/活种",
  options: [
    { value: 0, name: "全部", aliases: aliases(0, "all") },
    { value: 1, name: "仅活种", aliases: aliases(1, "alive", "active") },
    { value: 2, name: "仅断种", aliases: aliases(2, "dead") },
  ],
};

export const BYR_SPSTATE_FACET: ByrSimpleFacet = {
  key: "spstate",
  name: "促销种子",
  options: [
    { value: 0, name: "全部", aliases: aliases(0, "all") },
    { value: 1, name: "普通", aliases: aliases(1, "normal", "none") },
    { value: 2, name: "免费", aliases: aliases(2, "free") },
    { value: 3, name: "2X", aliases: aliases(3, "2x") },
    { value: 4, name: "2X免费", aliases: aliases(4, "2xfree", "2x-free") },
    { value: 5, name: "50%", aliases: aliases(5, "50", "half") },
    { value: 6, name: "2X 50%", aliases: aliases(6, "2x50", "2x-50") },
    { value: 7, name: "30%", aliases: aliases(7, "30", "thirty") },
  ],
};

export const BYR_BOOKMARKED_FACET: ByrSimpleFacet = {
  key: "bookmarked",
  name: "显示收藏",
  options: [
    { value: 0, name: "全部", aliases: aliases(0, "all") },
    { value: 1, name: "仅收藏", aliases: aliases(1, "only", "bookmarked") },
    { value: 2, name: "仅未收藏", aliases: aliases(2, "unbookmarked", "not-bookmarked") },
  ],
};

export const BYR_LEVEL_REQUIREMENTS: ByrLevelRequirement[] = [
  {
    id: 1,
    name: "User",
    privilege: "新用户的默认级别：上传字幕；发布趣味盒；查看用户列表；查看NFO文档；",
  },
  {
    id: 2,
    name: "Power User",
    interval: "P14D",
    uploaded: "32GB",
    ratio: 1.05,
    privilege:
      "请求续种；查看排行榜；查看普通日志；删除自己上传的字幕；使用流量条；更新外部信息；新增求种",
  },
  {
    id: 3,
    name: "Elite User",
    interval: "P56D",
    uploaded: "512GB",
    ratio: 1.55,
    privilege: "查看其它用户的种子历史（如果用户隐私等级未设置为“强”）；直接发布种子",
  },
  {
    id: 4,
    name: "Crazy User",
    interval: "P84D",
    uploaded: "1024GB",
    ratio: 2.05,
    privilege: "购买邀请；发送邀请；在做种/下载/发布的时候选择匿名模式",
  },
  {
    id: 5,
    name: "Insane User",
    interval: "P168D",
    uploaded: "2048GB",
    ratio: 2.55,
    privilege: "申请发布徽章；更新外部信息；购买用户名特效",
  },
  {
    id: 6,
    name: "Veteran User",
    interval: "P168D",
    uploaded: "4096GB",
    ratio: 3.05,
    privilege: "查看其他用户的评论和帖子历史记录（如果用户隐私等级未设置为“强”）；查看种子结构",
  },
  {
    id: 7,
    name: "Extreme User",
    interval: "P168D",
    uploaded: "8192GB",
    ratio: 3.55,
    privilege: "可以购买用户名特效（动态）",
  },
  {
    id: 8,
    name: "Ultimate User",
    interval: "P336D",
    uploaded: "32768GB",
    ratio: 4.05,
    privilege: "更加高级",
  },
  {
    id: 9,
    name: "Nexus Master",
    interval: "P48W",
    uploaded: "131072GB",
    ratio: 4.55,
    privilege: "最高晋级用户等级：使用魔力值修改用户名（支持中文）；可以领取专属荣誉徽章",
  },
  {
    id: 100,
    name: "贵宾",
    groupType: "vip",
    privilege: "免除分享率考核",
  },
  {
    id: 200,
    name: "养老族",
    groupType: "manager",
    privilege: "免除上传速度监测",
  },
  {
    id: 201,
    name: "发布员",
    groupType: "manager",
    privilege: "查看匿名用户的真实身份；查看被禁止的种子；访问论坛工作组专区",
  },
  {
    id: 202,
    name: "总版主",
    groupType: "manager",
    privilege:
      "管理种子，包括编辑/删除/设优惠/置顶；管理种子评论；管理论坛帖子；管理群聊区；" +
      "管理趣味盒；管理字幕区；查看机密日志；查看管理组信箱",
  },
  {
    id: 203,
    name: "维护开发员",
    groupType: "manager",
    privilege: "管理站点设定和代码",
  },
  {
    id: 204,
    name: "主管",
    groupType: "manager",
    privilege:
      "管理组成员的任免；发放特殊用户组和管理组的工资（魔力值）；管理站点任务系统；其他未被提及的权限",
  },
];

export interface ParseAliasResult {
  values: number[];
  invalid: string[];
}

function normalizeAlias(value: string): string {
  return value.trim().toLowerCase();
}

function parseFacetValue(inputs: string[], options: ByrSimpleFacetOption[]): ParseAliasResult {
  const aliasMap = new Map<string, number>();
  for (const option of options) {
    aliasMap.set(String(option.value), option.value);
    for (const alias of option.aliases) {
      aliasMap.set(normalizeAlias(alias), option.value);
    }
  }

  const values: number[] = [];
  const invalid: string[] = [];

  for (const input of inputs) {
    for (const token of input.split(",")) {
      const key = normalizeAlias(token);
      if (key.length === 0) {
        continue;
      }
      const mapped = aliasMap.get(key);
      if (mapped === undefined) {
        invalid.push(token.trim());
        continue;
      }
      values.push(mapped);
    }
  }

  return {
    values: Array.from(new Set(values)),
    invalid,
  };
}

export function parseCategoryAliases(inputs: string[]): ParseAliasResult {
  return parseFacetValue(inputs, BYR_CATEGORY_FACET.options);
}

export function parseSimpleFacetAliases(facet: ByrSimpleFacet, inputs: string[]): ParseAliasResult {
  return parseFacetValue(inputs, facet.options);
}

export function guessByrLevelId(levelName: string): number | undefined {
  const normalized = normalizeAlias(levelName);
  if (normalized.length === 0) {
    return undefined;
  }

  const found = BYR_LEVEL_REQUIREMENTS.find((level) => normalizeAlias(level.name) === normalized);
  return found?.id;
}

export function getByrMetadata() {
  return {
    category: BYR_CATEGORY_FACET,
    incldead: BYR_INCLDEAD_FACET,
    spstate: BYR_SPSTATE_FACET,
    bookmarked: BYR_BOOKMARKED_FACET,
    levels: BYR_LEVEL_REQUIREMENTS,
  };
}

export function findFacetOption(
  facet: ByrSimpleFacet | ByrCategoryFacet,
  value: number,
): ByrSimpleFacetOption | ByrCategoryOption | undefined {
  return facet.options.find((option) => option.value === value);
}
