import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Catalog } from "@share-mem/shared";
import { MAX_ALWAYS_INJECT, MAX_SUMMARY_LENGTH, MAX_TAG_LINES, truncateText } from "./inject-limits.js";

const MANAGED_START = "<!-- share-mem:start -->";
const MANAGED_END = "<!-- share-mem:end -->";

export function renderInjectionBlock(catalog: Catalog): string {
  const lines = [
    "## Shared Memory Catalog",
    "",
    "Use `memory_query` or `memory_list` to discover entries, then `memory_get` to read full markdown on demand.",
    "",
    `Active entries: ${catalog.total_entries}`,
    ""
  ];

  if (catalog.tags.length > 0) {
    lines.push("Tags:");
    for (const tag of catalog.tags.slice(0, MAX_TAG_LINES)) {
      lines.push(`- ${tag.tag} (${tag.count}): ${truncateText(tag.description, MAX_SUMMARY_LENGTH)}`);
    }
    lines.push("");
  }

  if (catalog.always_inject.length > 0) {
    lines.push("Always inject summaries:");
    for (const entry of catalog.always_inject.slice(0, MAX_ALWAYS_INJECT)) {
      lines.push(
        `- ${entry.namespace}/${entry.key}: ${truncateText(entry.summary, MAX_SUMMARY_LENGTH)}`
      );
    }
    lines.push("");
  }

  return lines.join("\n").trim();
}

export async function writeCatalogCache(workspaceRoot: string, catalog: Catalog): Promise<string> {
  const target = join(workspaceRoot, ".share-mem", "catalog.json");
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
  return target;
}

export async function writeCursorInjection(workspaceRoot: string, content: string): Promise<string> {
  const target = join(workspaceRoot, ".cursor", "rules", "shared-memory.mdc");
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${content}\n`, "utf8");
  return target;
}

export async function writeClaudeManagedBlock(workspaceRoot: string, content: string): Promise<string> {
  const target = join(workspaceRoot, "CLAUDE.md");
  const managedBlock = `${MANAGED_START}\n${content}\n${MANAGED_END}`;
  let existing = "";

  try {
    existing = await readFile(target, "utf8");
  } catch {
    existing = "";
  }

  const next = updateManagedBlock(existing, managedBlock);
  await writeFile(target, `${next.trimEnd()}\n`, "utf8");
  return target;
}

function updateManagedBlock(existing: string, managedBlock: string): string {
  const startIndex = existing.indexOf(MANAGED_START);
  const endIndex = existing.indexOf(MANAGED_END);

  if (startIndex >= 0 && endIndex > startIndex) {
    const before = existing.slice(0, startIndex).trimEnd();
    const after = existing.slice(endIndex + MANAGED_END.length).trimStart();
    return [before, managedBlock, after].filter(Boolean).join("\n\n");
  }

  return existing.trim().length > 0 ? `${existing.trimEnd()}\n\n${managedBlock}` : managedBlock;
}
