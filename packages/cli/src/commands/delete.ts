import { GatewayClient } from "@share-mem/shared";
import type { Command } from "commander";
import { loadConfig } from "../lib/config.js";

export function registerDeleteCommand(program: Command): void {
  program
    .command("delete")
    .argument("<key>", "memory key")
    .option("-n, --namespace <namespace>", "memory namespace")
    .action(async (key: string, options: { namespace?: string }) => {
      const config = await loadConfig();
      const client = GatewayClient.fromConfig(config);
      const result = await client.deleteMemory(options.namespace ?? config.defaultNamespace, key);
      console.log(JSON.stringify(result, null, 2));
    });
}
