import {
  normalizeQueryParams,
  validateContent,
  validateKey,
  validateNamespace,
  validateTags,
  validationError
} from "@share-mem/shared";
import type { InjectMode, MemoryEntry, MemoryListItem, MemoryQueryParams, UpsertMemoryInput } from "@share-mem/shared";
import { CatalogService } from "./catalog-service.js";
import { MemoryRepository } from "../storage/memory-repository.js";

export class MemoryService {
  constructor(
    private readonly memoryRepository: MemoryRepository,
    private readonly catalogService: CatalogService
  ) {}

  async getMemory(namespace: string, key: string): Promise<MemoryEntry> {
    validateNamespace(namespace);
    validateKey(key);
    return this.memoryRepository.get(namespace, key);
  }

  async queryMemory(params: MemoryQueryParams): Promise<{ items: MemoryListItem[]; total: number }> {
    const normalized = normalizeQueryParams(params);
    const items = await this.memoryRepository.listItems();

    const filtered = items.filter((item) => {
      if (!normalized.includeArchived && item.inject_mode === "archive") {
        return false;
      }

      if (normalized.namespace && item.namespace !== normalized.namespace) {
        return false;
      }

      if (normalized.tag && !item.tags.includes(normalized.tag)) {
        return false;
      }

      if (normalized.search) {
        const query = normalized.search.toLowerCase();
        const haystacks = [item.title, item.summary ?? "", item.key].map((value) => value.toLowerCase());

        if (!haystacks.some((value) => value.includes(query))) {
          return false;
        }
      }

      return true;
    });

    return {
      items: filtered.slice(normalized.offset, normalized.offset + normalized.limit),
      total: filtered.length
    };
  }

  async upsertMemory(namespace: string, key: string, input: UpsertMemoryInput, actor: string): Promise<MemoryEntry> {
    validateNamespace(namespace);
    validateKey(key);
    validateContent(input.content);

    const now = new Date().toISOString();
    const existing = await this.memoryRepository.get(namespace, key).catch((error: Error & { code?: string }) => {
      if (error.code === "NOT_FOUND") {
        return null;
      }

      throw error;
    });

    const title = input.title ?? existing?.meta.title;
    if (!title) {
      throw validationError("Title is required when creating memory", { field: "title" });
    }

    const injectMode = (input.inject_mode ?? existing?.meta.inject_mode ?? "on-demand") as InjectMode;
    const summary = input.summary ?? existing?.meta.summary;
    if (injectMode === "always" && !summary) {
      throw validationError("Always injected memory requires a summary", { field: "summary" });
    }

    const entry: MemoryEntry = {
      namespace,
      key,
      meta: {
        title,
        tags: validateTags(input.tags ?? existing?.meta.tags ?? []),
        inject_mode: injectMode,
        created_by: existing?.meta.created_by ?? actor,
        created_at: existing?.meta.created_at ?? now,
        updated_at: now,
        version: (existing?.meta.version ?? 0) + 1
      },
      content: input.content
    };

    if (summary !== undefined) {
      entry.meta.summary = summary;
    }

    const saved = await this.memoryRepository.save(entry);
    await this.catalogService.syncCatalog();
    return saved;
  }

  async deleteMemory(namespace: string, key: string): Promise<{ deleted: true }> {
    validateNamespace(namespace);
    validateKey(key);
    await this.memoryRepository.delete(namespace, key);
    await this.catalogService.syncCatalog();
    return { deleted: true };
  }
}
