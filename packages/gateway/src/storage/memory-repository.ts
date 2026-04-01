import { readFile, readdir, rm } from "node:fs/promises";
import { basename, dirname, relative } from "node:path";
import {
  type InjectMode,
  type MemoryEntry,
  type MemoryListItem,
  validationError
} from "@share-mem/shared";
import { parseMemoryMarkdown } from "../lib/frontmatter.js";
import { stringifyMemoryMarkdown } from "../lib/frontmatter.js";
import { assertValidMemoryPath } from "../lib/path-validation.js";
import { notFoundError } from "@share-mem/shared";
import type { SpacePaths } from "./space-paths.js";
import { resolveMemoryFile } from "./space-paths.js";
import { atomicWriteFile } from "./atomic-write.js";

export class MemoryRepository {
  constructor(private readonly spacePaths: SpacePaths) {}

  async get(namespace: string, key: string): Promise<MemoryEntry> {
    assertValidMemoryPath(namespace, key);

    const filePath = resolveMemoryFile(this.spacePaths, namespace, key);

    try {
      const raw = await readFile(filePath, "utf8");
      return this.deserialize(filePath, raw);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw notFoundError(`Memory ${namespace}/${key} not found`, { namespace, key });
      }

      throw error;
    }
  }

  async list(): Promise<MemoryEntry[]> {
    const files = await this.collectMarkdownFiles(this.spacePaths.memDir);
    const entries = await Promise.all(files.map(async (filePath) => this.deserialize(filePath, await readFile(filePath, "utf8"))));
    return entries.sort((left, right) => right.meta.updated_at.localeCompare(left.meta.updated_at));
  }

  async listItems(): Promise<MemoryListItem[]> {
    const entries = await this.list();
    return entries.map((entry) => {
      const item: MemoryListItem = {
        namespace: entry.namespace,
        key: entry.key,
        title: entry.meta.title,
        tags: entry.meta.tags,
        inject_mode: entry.meta.inject_mode,
        updated_at: entry.meta.updated_at
      };

      if (entry.meta.summary !== undefined) {
        item.summary = entry.meta.summary;
      }

      return item;
    });
  }

  async save(entry: MemoryEntry): Promise<MemoryEntry> {
    assertValidMemoryPath(entry.namespace, entry.key);
    const filePath = resolveMemoryFile(this.spacePaths, entry.namespace, entry.key);
    await atomicWriteFile(filePath, stringifyMemoryMarkdown(entry.meta, entry.content));
    return entry;
  }

  async delete(namespace: string, key: string): Promise<void> {
    assertValidMemoryPath(namespace, key);
    const filePath = resolveMemoryFile(this.spacePaths, namespace, key);

    try {
      await rm(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw notFoundError(`Memory ${namespace}/${key} not found`, { namespace, key });
      }

      throw error;
    }
  }

  private async collectMarkdownFiles(dir: string): Promise<string[]> {
    const entries = await readdir(dir, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        return [];
      }

      throw error;
    });

    const files = await Promise.all(
      entries.map(async (entry) => {
        const fullPath = `${dir}/${entry.name}`;

        if (entry.isDirectory()) {
          return this.collectMarkdownFiles(fullPath);
        }

        if (!entry.isFile() || !entry.name.endsWith(".md") || entry.name === "_catalog.json") {
          return [];
        }

        return [fullPath];
      })
    );

    return files.flat();
  }

  private deserialize(filePath: string, raw: string): MemoryEntry {
    const rel = relative(this.spacePaths.memDir, filePath);
    const namespace = dirname(rel);
    const key = basename(rel, ".md");
    assertValidMemoryPath(namespace, key);

    const { meta, content } = parseMemoryMarkdown(raw);

    if (!meta.title || !meta.created_by || !meta.created_at || !meta.updated_at || meta.version === undefined) {
      throw validationError("Memory frontmatter is incomplete", { filePath });
    }

    const metaOut: MemoryEntry["meta"] = {
      title: meta.title,
      tags: Array.isArray(meta.tags) ? meta.tags.map(String) : [],
      inject_mode: this.normalizeInjectMode(meta.inject_mode),
      created_by: meta.created_by,
      created_at: meta.created_at,
      updated_at: meta.updated_at,
      version: meta.version
    };

    if (typeof meta.summary === "string") {
      metaOut.summary = meta.summary;
    }

    return {
      namespace,
      key,
      meta: metaOut,
      content
    };
  }

  private normalizeInjectMode(value: unknown): InjectMode {
    if (value === "always" || value === "archive") {
      return value;
    }

    return "on-demand";
  }
}
