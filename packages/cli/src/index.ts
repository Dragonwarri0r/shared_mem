#!/usr/bin/env node
import { Command } from "commander";
import { registerDeleteCommand } from "./commands/delete.js";
import { registerGetCommand } from "./commands/get.js";
import { registerInitCommand } from "./commands/init.js";
import { registerListCommand } from "./commands/list.js";
import { registerRebuildCatalogCommand } from "./commands/rebuild-catalog.js";
import { registerSetCommand } from "./commands/set.js";
import { registerSyncCommand } from "./commands/sync.js";

const program = new Command();

program.name("share-mem").description("Share Memory CLI").version("0.1.0");

registerGetCommand(program);
registerInitCommand(program);
registerSetCommand(program);
registerListCommand(program);
registerDeleteCommand(program);
registerRebuildCatalogCommand(program);
registerSyncCommand(program);

program.parseAsync(process.argv).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
