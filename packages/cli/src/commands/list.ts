import { GatewayClient } from "@share-mem/shared";
import type { MemoryQueryParams } from "@share-mem/shared";
import type { Command } from "commander";
import { loadConfig } from "../lib/config.js";

export function registerListCommand(program: Command): void {
  program
    .command("list")
    .option("-n, --namespace <namespace>", "memory namespace")
    .option("-t, --tag <tag>", "tag filter")
    .option("-q, --query <query>", "title or summary keyword")
    .option("--limit <limit>", "page size", Number)
    .option("--offset <offset>", "page offset", Number)
    .option("--include-archived", "include archive entries")
    .action(
      async (options: {
        namespace?: string;
        tag?: string;
        query?: string;
        limit?: number;
        offset?: number;
        includeArchived?: boolean;
      }) => {
        const config = await loadConfig();
        const client = GatewayClient.fromConfig(config);
        const query: MemoryQueryParams = {};

        if (options.namespace !== undefined) query.namespace = options.namespace;
        if (options.tag !== undefined) query.tag = options.tag;
        if (options.query !== undefined) query.search = options.query;
        if (options.limit !== undefined) query.limit = options.limit;
        if (options.offset !== undefined) query.offset = options.offset;
        if (options.includeArchived !== undefined) query.includeArchived = options.includeArchived;

        const result = await client.queryMemory(query);
        console.log(JSON.stringify(result, null, 2));
      }
    );
}
