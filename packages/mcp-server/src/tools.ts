import { GatewayClient } from "@share-mem/shared";
import type { LocalConfig, MemoryEntry, MemoryListItem, MemoryQueryParams } from "@share-mem/shared";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";

const MEMORY_GET_INPUT_SCHEMA = {
  namespace: z.string().min(1).describe("Memory namespace"),
  key: z.string().min(1).describe("Memory key")
} as any;

const MEMORY_QUERY_INPUT_SCHEMA = {
  namespace: z.string().optional().describe("Optional namespace filter"),
  tag: z.string().optional().describe("Optional tag filter"),
  search: z.string().optional().describe("Optional title or summary keyword"),
  with_content: z.boolean().optional().describe("Return full content for each entry (default false)"),
  limit: z.number().int().min(1).max(200).optional().describe("Page size"),
  offset: z.number().int().min(0).optional().describe("Page offset"),
  includeArchived: z.boolean().optional().describe("Include archive entries")
} as any;

const MEMORY_LIST_INPUT_SCHEMA = {
  namespace: z.string().optional().describe("Optional namespace filter"),
  limit: z.number().int().min(1).max(200).optional().describe("Page size"),
  offset: z.number().int().min(0).optional().describe("Page offset")
} as any;

export function registerMemoryTools(server: McpServer, config: LocalConfig): void {
  const client = GatewayClient.fromConfig(config);

  server.registerTool(
    "memory_get",
    {
      title: "Get Memory",
      description: "Read one shared memory entry by namespace and key. Returns meta header + full markdown content.",
      inputSchema: MEMORY_GET_INPUT_SCHEMA
    },
    async (args: any) => {
      const { namespace, key } = args as { namespace: string; key: string };
      const entry = await client.getMemory(namespace, key);
      return textResult(formatMemoryEntry(entry));
    }
  );

  server.registerTool(
    "memory_query",
    {
      title: "Query Memory",
      description: "Query shared memory index by namespace, tag, or keyword. Returns lightweight index by default; set with_content=true to include full markdown.",
      inputSchema: MEMORY_QUERY_INPUT_SCHEMA
    },
    async (args: any) => {
      const parsedArgs = args as {
        namespace?: string;
        tag?: string;
        search?: string;
        with_content?: boolean;
        limit?: number;
        offset?: number;
        includeArchived?: boolean;
      };

      const query: MemoryQueryParams = {};
      if (parsedArgs.namespace !== undefined) query.namespace = parsedArgs.namespace;
      if (parsedArgs.tag !== undefined) query.tag = parsedArgs.tag;
      if (parsedArgs.search !== undefined) query.search = parsedArgs.search;
      if (parsedArgs.limit !== undefined) query.limit = parsedArgs.limit;
      if (parsedArgs.offset !== undefined) query.offset = parsedArgs.offset;
      if (parsedArgs.includeArchived !== undefined) query.includeArchived = parsedArgs.includeArchived;

      const result = await client.queryMemory(query);

      if (parsedArgs.with_content && result.items.length > 0) {
        const entries = await Promise.all(
          result.items.map((item) => client.getMemory(item.namespace, item.key))
        );
        return textResult(formatQueryResultWithContent(result.items, entries, result.total));
      }

      return textResult(formatQueryResult(result.items, result.total));
    }
  );

  server.registerTool(
    "memory_list",
    {
      title: "List Memory",
      description: "List shared memory index entries using default pagination. Returns lightweight index without content.",
      inputSchema: MEMORY_LIST_INPUT_SCHEMA
    },
    async (args: any) => {
      const parsedArgs = args as { namespace?: string; limit?: number; offset?: number };
      const query: MemoryQueryParams = {};

      if (parsedArgs.namespace !== undefined) query.namespace = parsedArgs.namespace;
      if (parsedArgs.limit !== undefined) query.limit = parsedArgs.limit;
      if (parsedArgs.offset !== undefined) query.offset = parsedArgs.offset;

      const result = await client.queryMemory(query);
      return textResult(formatQueryResult(result.items, result.total));
    }
  );
}

function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function formatMemoryEntry(entry: MemoryEntry): string {
  const lines = [
    `[${entry.namespace}/${entry.key}] ${entry.meta.title}`,
    `Tags: ${entry.meta.tags.join(", ") || "(none)"} | Updated: ${entry.meta.updated_at.slice(0, 10)}`,
    "---",
    entry.content
  ];
  return lines.join("\n");
}

function formatListItem(item: MemoryListItem, index: number): string {
  const line1 = `${index}. [${item.namespace}/${item.key}] ${item.title}`;
  const parts = [`Tags: ${item.tags.join(", ") || "(none)"} | Updated: ${item.updated_at.slice(0, 10)}`];
  if (item.summary) {
    parts.push(`Summary: ${item.summary}`);
  }
  return `${line1}\n   ${parts.join("\n   ")}`;
}

function formatQueryResult(items: MemoryListItem[], total: number): string {
  if (items.length === 0) {
    return "No memories found.";
  }

  const lines = [`Found ${total} memor${total === 1 ? "y" : "ies"}:`, ""];
  for (let i = 0; i < items.length; i++) {
    lines.push(formatListItem(items[i]!, i + 1));
    lines.push("");
  }
  lines.push("Use memory_get to fetch full content of a specific entry.");
  return lines.join("\n");
}

function formatQueryResultWithContent(
  items: MemoryListItem[],
  entries: MemoryEntry[],
  total: number
): string {
  const lines = [`Found ${total} memor${total === 1 ? "y" : "ies"} (with content):`, ""];
  for (let i = 0; i < entries.length; i++) {
    lines.push(formatMemoryEntry(entries[i]!));
    if (i < entries.length - 1) {
      lines.push("", "===", "");
    }
  }
  return lines.join("\n");
}
