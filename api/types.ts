/**
 * Keeper API TypeScript Types
 *
 * 对齐 docs/api.md 中的所有数据模型
 */

// ============ 通用类型 ============

/** RFC 7807 错误响应 */
export interface ApiError {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance?: string;
  errors?: ApiFieldError[];
}

export interface ApiFieldError {
  field: string;
  message: string;
  code: string;
}

/** 分页响应 */
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  limit?: number;
  offset?: number;
}

// ============ KDF 参数 ============

export interface KdfParams {
  algorithm: string;
  memory: number;
  iterations: number;
  parallelism: number;
  salt: string;
}

// ============ 认证 ============

export interface InitializeRequest {
  email: string;
  masterPasswordHash: string;
  encryptedUserKey: string;
  kdfParams: KdfParams;
}

export interface InitializeResponse {
  message: string;
  userId?: string;
}

export interface UnlockRequest {
  masterPasswordHash: string;
}

export interface UnlockResponse {
  message: string;
  encryptedUserKey: string;
  kdfParams: KdfParams;
}

export interface StatusResponseUnlocked {
  locked: false;
  sessionExpiresAt: string;
}

export interface StatusResponseLocked {
  locked: true;
}

export type AuthStatus = StatusResponseUnlocked | StatusResponseLocked;

// ============ 书签 ============

export interface UrlItem {
  url: string;
  lastUsed?: string;
}

export interface AccountItem {
  id: number;
  username: string;
  password: string;
  relatedIds: number[];
  createdAt: string;
  lastUsed: string;
}

export interface Bookmark {
  id: string;
  name: string;
  pinyinInitials: string;
  tagIds: number[];
  urls: UrlItem[];
  notes: string;
  accounts: AccountItem[];
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string;
}

export interface BookmarkCreate {
  name: string;
  pinyinInitials?: string;
  tagIds?: number[];
  urls?: UrlItem[];
  notes?: string;
  accounts?: AccountCreate[];
}

export interface AccountCreate {
  username: string;
  password: string;
  relatedIds?: number[];
}

export interface BookmarkUpdate extends BookmarkCreate {
  // PUT requires all fields
}

export interface BookmarkPatch {
  name?: string;
  pinyinInitials?: string;
  tagIds?: number[];
  urls?: UrlItem[];
  notes?: string;
  accounts?: AccountCreate[];
}

export interface BookmarkListParams {
  limit?: number;
  offset?: number;
  sort?: string;
  tagIds?: string;
  search?: string;
}

export type BookmarkListResponse = PaginatedResponse<Bookmark>;

export interface BookmarkUseRequest {
  url?: string;
  accountId?: number;
}

export interface BookmarkUseResponse {
  message: string;
  lastUsedAt: string;
}

// ============ 标签 ============

export interface Tag {
  id: number;
  name: string;
  color?: string;
  icon?: string;
  bookmarkCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface TagCreate {
  name: string;
  color?: string;
  icon?: string;
}

export interface TagUpdate extends TagCreate {}

export interface TagListParams {
  sort?: string;
}

export type TagListResponse = PaginatedResponse<Tag>;

// ============ 关联 ============

export type RelationType = 'phone' | 'email' | 'idcard' | 'social' | 'other';

export interface Relation {
  id: number;
  name: string;
  value?: string;
  type: RelationType;
  bookmarkCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface RelationCreate {
  name: string;
  value?: string;
  type: RelationType;
}

export interface RelationUpdate extends RelationCreate {}

export type RelationListResponse = PaginatedResponse<Relation>;

// ============ 统计 ============

export interface TagCount {
  id: number;
  name: string;
  count: number;
}

export interface RecentlyUsedBookmark {
  id: string;
  name: string;
  lastUsedAt: string;
}

export interface StatsResponse {
  totalBookmarks: number;
  totalTags: number;
  totalRelations: number;
  totalAccounts: number;
  mostUsedTags: TagCount[];
  recentlyUsed: RecentlyUsedBookmark[];
}

// ============ 导入导出 ============

export interface ExportResponse {
  version: string;
  exportedAt: string;
  bookmarks: Bookmark[];
  tags: Tag[];
  relations: Relation[];
}

export interface ImportRequest {
  merge?: boolean;
}

export interface ImportResponse {
  message: string;
  imported: {
    bookmarks: number;
    tags: number;
    relations: number;
  };
  skipped: {
    bookmarks: number;
    tags: number;
    relations: number;
  };
  errors: string[];
}

// ============ 健康检查 ============

export interface HealthResponse {
  status: 'healthy';
  version: string;
  database: 'connected';
  timestamp: string;
}
