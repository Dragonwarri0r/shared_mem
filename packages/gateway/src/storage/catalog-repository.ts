import { mkdir, readFile } from "node:fs/promises";
import type { Catalog } from "@share-mem/shared";
import { atomicWriteFile } from "./atomic-write.js";
import type { SpacePaths } from "./space-paths.js";

const EMPTY_CATALOG: Catalog = {
  updated_at: new Date(0).toISOString(),
  always_inject: [],
  tags: [],
  total_entries: 0
};

export class CatalogRepository {
  constructor(private readonly spacePaths: SpacePaths) {}

  async get(): Promise<Catalog | null> {
    try {
      const raw = await readFile(this.spacePaths.catalogFile, "utf8");
      return JSON.parse(raw) as Catalog;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }

      throw error;
    }
  }

  async save(catalog: Catalog): Promise<Catalog> {
    await mkdir(this.spacePaths.memDir, { recursive: true });
    await atomicWriteFile(this.spacePaths.catalogFile, `${JSON.stringify(catalog, null, 2)}\n`);
    return catalog;
  }

  empty(): Catalog {
    return structuredClone(EMPTY_CATALOG);
  }
}
