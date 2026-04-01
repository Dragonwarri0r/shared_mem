export type InjectMode = "always" | "on-demand" | "archive";

export type ApiScope = "catalog:read" | "memory:read" | "memory:write";

export interface MemoryMeta {
  title: string;
  tags: string[];
  inject_mode: InjectMode;
  summary?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  version: number;
}

export interface MemoryEntry {
  namespace: string;
  key: string;
  meta: MemoryMeta;
  content: string;
}

export interface MemoryListItem {
  namespace: string;
  key: string;
  title: string;
  tags: string[];
  inject_mode: InjectMode;
  summary?: string;
  updated_at: string;
}

export interface CatalogTagEntry {
  tag: string;
  description: string;
  count: number;
}

export interface CatalogAlwaysInjectEntry {
  namespace: string;
  key: string;
  title: string;
  summary: string;
}

export interface Catalog {
  updated_at: string;
  always_inject: CatalogAlwaysInjectEntry[];
  tags: CatalogTagEntry[];
  total_entries: number;
}

export interface ApiKeyRecord {
  id: string;
  name: string;
  key_hash: string;
  scopes: ApiScope[];
  created_at: string;
  expires_at: string | null;
  revoked: boolean;
  revoked_at?: string;
}

export interface LocalConfig {
  gatewayUrl: string;
  apiKey: string;
  defaultNamespace: string;
}

export interface MemoryQueryParams {
  namespace?: string;
  tag?: string;
  search?: string;
  limit?: number;
  offset?: number;
  includeArchived?: boolean;
}

export interface UpsertMemoryInput {
  title?: string;
  tags?: string[];
  inject_mode?: InjectMode;
  summary?: string;
  content: string;
}

export interface ApiSuccess<T> {
  ok: true;
  data: T;
}

export interface ApiErrorShape {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ApiFailure {
  ok: false;
  error: ApiErrorShape;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;
