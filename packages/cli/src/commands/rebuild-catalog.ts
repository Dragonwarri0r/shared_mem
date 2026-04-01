import { GatewayClient } from "@share-mem/shared";
import type { Command } from "commander";
import { loadConfig } from "../lib/config.js";

export function registerRebuildCatalogCommand(program: Command): void {
  program.command("rebuild-catalog").action(async () => {
    const config = await loadConfig();
    const client = GatewayClient.fromConfig(config);
    const catalog = await client.rebuildCatalog();
    console.log(JSON.stringify(catalog, null, 2));
  });
}
