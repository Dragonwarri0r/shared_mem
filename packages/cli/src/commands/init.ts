import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { GatewayClient, validationError } from "@share-mem/shared";
import type { Command } from "commander";

export function registerInitCommand(program: Command): void {
  program
    .command("init")
    .requiredOption("--gateway-url <url>", "gateway base URL")
    .requiredOption("--api-key <key>", "API key")
    .requiredOption("--default-namespace <namespace>", "default namespace")
    .option("--cwd <cwd>", "workspace root", process.cwd())
    .action(
      async (options: {
        gatewayUrl: string;
        apiKey: string;
        defaultNamespace: string;
        cwd: string;
      }) => {
        if (!options.gatewayUrl || !options.apiKey || !options.defaultNamespace) {
          throw validationError("init requires gateway-url, api-key and default-namespace");
        }

        const client = new GatewayClient({
          baseUrl: options.gatewayUrl,
          apiKey: options.apiKey
        });

        await client.health();
        await client.getCatalog();

        const workspaceRoot = resolve(options.cwd);
        const configDir = join(workspaceRoot, ".share-mem");
        await mkdir(configDir, { recursive: true });
        const configPath = join(configDir, "config.json");

        await writeFile(
          configPath,
          `${JSON.stringify(
            {
              gatewayUrl: options.gatewayUrl,
              apiKey: options.apiKey,
              defaultNamespace: options.defaultNamespace
            },
            null,
            2
          )}\n`,
          "utf8"
        );

        console.log(JSON.stringify({ ok: true, configPath }, null, 2));
      }
    );
}
