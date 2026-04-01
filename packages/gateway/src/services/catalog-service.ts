import type { Catalog, CatalogTagEntry } from "@share-mem/shared";
import { CatalogRepository } from "../storage/catalog-repository.js";
import { MemoryRepository } from "../storage/memory-repository.js";
import { withWriteLock } from "../lib/mutex.js";

export class CatalogService {
  constructor(
    private readonly catalogRepository: CatalogRepository,
    private readonly memoryRepository: MemoryRepository
  ) {}

  async getCatalog(): Promise<Catalog> {
    const existing = await this.catalogRepository.get();

    if (existing) {
      return existing;
    }

    return this.rebuildCatalog();
  }

  async rebuildCatalog(): Promise<Catalog> {
    return withWriteLock(async () => {
      const entries = await this.memoryRepository.list();
      const activeEntries = entries.filter((entry) => entry.meta.inject_mode !== "archive");
      const tags = new Map<string, CatalogTagEntry>();

      for (const entry of activeEntries) {
        for (const tag of entry.meta.tags) {
          const current = tags.get(tag);

          if (current) {
            current.count += 1;
          } else {
            tags.set(tag, {
              tag,
              description: entry.meta.title,
              count: 1
            });
          }
        }
      }

      const catalog: Catalog = {
        updated_at: new Date().toISOString(),
        always_inject: activeEntries
          .filter((entry) => entry.meta.inject_mode === "always" && entry.meta.summary)
          .map((entry) => ({
            namespace: entry.namespace,
            key: entry.key,
            title: entry.meta.title,
            summary: entry.meta.summary!
          })),
        tags: [...tags.values()].sort((left, right) => left.tag.localeCompare(right.tag)),
        total_entries: activeEntries.length
      };

      return this.catalogRepository.save(catalog);
    });
  }

  async syncCatalog(): Promise<Catalog> {
    return this.rebuildCatalog();
  }
}
