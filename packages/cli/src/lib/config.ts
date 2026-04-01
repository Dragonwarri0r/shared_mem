import { readFile } from "node:fs/promises";
import type { LocalConfig } from "@share-mem/shared";
import { validationError } from "@share-mem/shared";
import { discoverConfigPath } from "./paths.js";

export async function loadConfig(startDir = process.cwd()): Promise<LocalConfig> {
  const explicitPath = process.env.SHARE_MEM_CONFIG;
  const configPath = explicitPath ?? (await discoverConfigPath(startDir));

  if (!configPath) {
    throw validationError("Share memory config not found", { startDir });
  }

  const raw = JSON.parse(await readFile(configPath, "utf8")) as Partial<LocalConfig>;
  if (!raw.gatewayUrl || !raw.apiKey || !raw.defaultNamespace) {
    throw validationError("Share memory config is incomplete", { configPath });
  }

  return {
    gatewayUrl: raw.gatewayUrl,
    apiKey: raw.apiKey,
    defaultNamespace: raw.defaultNamespace
  };
}
