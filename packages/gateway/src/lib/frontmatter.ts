import matter from "gray-matter";
import type { MemoryMeta } from "@share-mem/shared";

export function parseMemoryMarkdown(raw: string): { meta: Partial<MemoryMeta>; content: string } {
  const parsed = matter(raw);

  return {
    meta: parsed.data as Partial<MemoryMeta>,
    content: parsed.content.trim()
  };
}

export function stringifyMemoryMarkdown(meta: MemoryMeta, content: string): string {
  return matter.stringify(content.trim(), meta as unknown as Record<string, unknown>);
}
