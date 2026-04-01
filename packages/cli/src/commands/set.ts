import { GatewayClient, validationError } from "@share-mem/shared";
import type { UpsertMemoryInput } from "@share-mem/shared";
import type { Command } from "commander";
import { loadConfig } from "../lib/config.js";

export function registerSetCommand(program: Command): void {
  program
    .command("set")
    .argument("<key>", "memory key")
    .requiredOption("--content <content>", "markdown content")
    .option("-n, --namespace <namespace>", "memory namespace")
    .option("--title <title>", "memory title")
    .option("--tags <tags>", "comma separated tags")
    .option("--inject-mode <mode>", "always | on-demand | archive")
    .option("--summary <summary>", "short summary")
    .action(
      async (
        key: string,
        options: {
          namespace?: string;
          title?: string;
          tags?: string;
          injectMode?: "always" | "on-demand" | "archive";
          summary?: string;
          content: string;
        }
      ) => {
        const config = await loadConfig();
        const client = GatewayClient.fromConfig(config);

        if (
          options.injectMode !== undefined &&
          options.injectMode !== "always" &&
          options.injectMode !== "on-demand" &&
          options.injectMode !== "archive"
        ) {
          throw validationError("Invalid inject mode", { value: options.injectMode });
        }

        const input: UpsertMemoryInput = {
          content: options.content
        };

        if (options.title !== undefined) input.title = options.title;
        if (options.tags !== undefined) {
          input.tags = options.tags.split(",").map((tag) => tag.trim()).filter(Boolean);
        }
        if (options.injectMode !== undefined) input.inject_mode = options.injectMode;
        if (options.summary !== undefined) input.summary = options.summary;

        const entry = await client.upsertMemory(options.namespace ?? config.defaultNamespace, key, input);

        console.log(JSON.stringify(entry, null, 2));
      }
    );
}
