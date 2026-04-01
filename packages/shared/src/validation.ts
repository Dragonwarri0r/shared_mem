import { validationError } from "./errors.js";
import type { ApiScope, MemoryQueryParams } from "./types.js";

export const NAMESPACE_REGEX = /^[a-z0-9-]{1,64}$/;
export const KEY_REGEX = /^[a-z0-9_.-]{1,128}$/;
export const MAX_CONTENT_BYTES = 100 * 1024;
export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 200;

export function validateNamespace(namespace: string): string {
  if (!NAMESPACE_REGEX.test(namespace) || namespace.includes("..")) {
    throw validationError("Invalid namespace", { field: "namespace", value: namespace });
  }

  return namespace;
}

export function validateKey(key: string): string {
  if (!KEY_REGEX.test(key) || key.includes("..")) {
    throw validationError("Invalid key", { field: "key", value: key });
  }

  return key;
}

export function validateScopes(scopes: string[]): ApiScope[] {
  const allowed: ApiScope[] = ["catalog:read", "memory:read", "memory:write"];
  const invalid = scopes.filter((scope) => !allowed.includes(scope as ApiScope));

  if (invalid.length > 0) {
    throw validationError("Invalid API scopes", { invalid });
  }

  return scopes as ApiScope[];
}

export function normalizeQueryParams(params: MemoryQueryParams): Required<Pick<MemoryQueryParams, "limit" | "offset">> &
  Omit<MemoryQueryParams, "limit" | "offset"> {
  const limit = Math.min(Math.max(params.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const offset = Math.max(params.offset ?? 0, 0);

  return {
    ...params,
    limit,
    offset
  };
}

export function validateContent(content: string): string {
  if (content.trim().length === 0) {
    throw validationError("Content is required", { field: "content" });
  }

  if (Buffer.byteLength(content, "utf8") > MAX_CONTENT_BYTES) {
    throw validationError("Content exceeds size limit", {
      field: "content",
      limitBytes: MAX_CONTENT_BYTES
    });
  }

  return content;
}

export function validateTags(tags: string[]): string[] {
  const normalized = [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))];

  if (normalized.some((tag) => tag.length > 64)) {
    throw validationError("Tag length exceeds limit", { field: "tags" });
  }

  return normalized.sort();
}
