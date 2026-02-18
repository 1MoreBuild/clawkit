export type ByrTorrentStatus = "unknown" | "downloading" | "seeding" | "inactive" | "completed";

export interface ByrSearchItem {
  id: string;
  title: string;
  size: string;
  seeders: number;
  leechers: number;
  tags: string[];
  subTitle?: string;
  url?: string;
  link?: string;
  category?: string | number;
  status?: ByrTorrentStatus;
  progress?: number | null;
  completed?: number;
  comments?: number;
  author?: string | number;
  time?: string;
  extImdb?: string | null;
  extDouban?: string | null;
  sizeBytes?: number;
}

export interface ByrTorrentDetail extends ByrSearchItem {
  uploadedAt: string;
  category: string;
}

export interface ByrDownloadPlan {
  id: string;
  fileName: string;
  sourceUrl: string;
}

export interface ByrTorrentPayload extends ByrDownloadPlan {
  content: Uint8Array;
}

export interface ByrSearchOptions {
  categoryIds?: number[];
  incldead?: 0 | 1 | 2;
  spstate?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
  bookmarked?: 0 | 1 | 2;
  imdb?: string;
  page?: number;
}

export interface ByrCategoryOption {
  value: number;
  name: string;
  aliases: string[];
}

export interface ByrCategoryFacet {
  key: string;
  name: string;
  mode: "append";
  options: ByrCategoryOption[];
}

export interface ByrSimpleFacetOption {
  value: number;
  name: string;
  aliases: string[];
}

export interface ByrSimpleFacet {
  key: "incldead" | "spstate" | "bookmarked";
  name: string;
  options: ByrSimpleFacetOption[];
}

export interface ByrLevelRequirement {
  id: number;
  name: string;
  groupType?: "user" | "vip" | "manager";
  interval?: string;
  uploaded?: string;
  ratio?: number | [number, number];
  privilege?: string;
}

export interface ByrLevelProgressRequirement {
  field: string;
  required: string | number;
  current: string | number;
  met: boolean;
}

export interface ByrLevelProgress {
  currentLevelId?: number;
  currentLevelName?: string;
  nextLevelId?: number;
  nextLevelName?: string;
  met: boolean;
  unmet: ByrLevelProgressRequirement[];
}

export interface ByrUserInfo {
  id: string;
  name: string;
  messageCount: number;
  uploadedBytes: number;
  downloadedBytes: number;
  trueUploadedBytes: number;
  trueDownloadedBytes: number;
  ratio: number;
  levelName: string;
  levelId?: number;
  bonus: number;
  seedingBonus: number;
  bonusPerHour: number;
  seeding: number;
  seedingSizeBytes: number;
  uploads: number;
  hnrPreWarning: number;
  hnrUnsatisfied: number;
  joinTime: string;
  lastAccessAt: string;
  levelProgress: ByrLevelProgress;
}
