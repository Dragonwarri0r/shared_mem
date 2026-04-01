import { access, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { GatewayClient } from "@share-mem/shared";
import type { Command } from "commander";
import { loadConfig } from "../lib/config.js";
import {
  renderInjectionBlock,
  writeCatalogCache,
  writeClaudeManagedBlock,
  writeCursorInjection
} from "../lib/inject.js";

export function registerSyncCommand(program: Command): void {
  program
    .command("sync")
    .option("--cursor", "update Cursor rules")
    .option("--claude-code", "update CLAUDE.md managed block")
    .option("--all", "update all supported clients")
    .option("--cwd <cwd>", "workspace root", process.cwd())
    .action(async (options: { cursor?: boolean; claudeCode?: boolean; all?: boolean; cwd: string }) => {
      const workspaceRoot = resolve(options.cwd);
      const config = await loadConfig(workspaceRoot);
      const client = GatewayClient.fromConfig(config);
      const catalog = await client.getCatalog();
      const block = renderInjectionBlock(catalog);

      const outputs: string[] = [];
      outputs.push(await writeCatalogCache(workspaceRoot, catalog));

      const targets = await resolveSyncTargets(workspaceRoot, options);

      if (targets.cursor) {
        outputs.push(await writeCursorInjection(workspaceRoot, block));
      }

      if (targets.claudeCode) {
        outputs.push(await writeClaudeManagedBlock(workspaceRoot, block));
      }

      console.log(JSON.stringify({ ok: true, outputs }, null, 2));
    });
}

async function resolveSyncTargets(
  workspaceRoot: string,
  options: { cursor?: boolean; claudeCode?: boolean; all?: boolean }
): Promise<{ cursor: boolean; claudeCode: boolean }> {
  if (options.all) {
    return { cursor: true, claudeCode: true };
  }

  if (options.cursor || options.claudeCode) {
    return {
      cursor: Boolean(options.cursor),
      claudeCode: Boolean(options.claudeCode)
    };
  }

  return {
    cursor: await exists(join(workspaceRoot, ".cursor")),
    claudeCode: (await exists(join(workspaceRoot, "CLAUDE.md"))) || (await exists(join(workspaceRoot, ".claude")))
  };
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
