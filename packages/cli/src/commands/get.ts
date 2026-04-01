import { GatewayClient } from "@share-mem/shared";
import type { Command } from "commander";
import { loadConfig } from "../lib/config.js";

export function registerGetCommand(program: Command): void {
  program
    .command("get")
    .argument("<key>", "memory key")
    .option("-n, --namespace <namespace>", "memory namespace")
    .action(async (key: string, options: { namespace?: string }) => {
      const config = await loadConfig();
      const client = GatewayClient.fromConfig(config);
      const entry = await client.getMemory(options.namespace ?? config.defaultNamespace, key);
      console.log(JSON.stringify(entry, null, 2));
    });
}
