import { access, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { LocalConfig } from "@share-mem/shared";
import { validationError } from "@share-mem/shared";

const CONFIG_DIR_NAME = ".share-mem";
const CONFIG_FILE_NAME = "config.json";

export async function loadConfig(startDir = process.cwd()): Promise<LocalConfig> {
  const explicitPath = process.env.SHARE_MEM_CONFIG;

  if (explicitPath) {
    return parseConfigFile(resolve(explicitPath));
  }

  const discovered = await discoverConfigPath(startDir);

  if (!discovered) {
    throw validationError("Share memory config not found", { startDir });
  }

  return parseConfigFile(discovered);
}

export async function discoverConfigPath(startDir: string): Promise<string | null> {
  let current = resolve(startDir);

  while (true) {
    const candidate = join(current, CONFIG_DIR_NAME, CONFIG_FILE_NAME);

    if (await fileExists(candidate)) {
      return candidate;
    }

    const parent = dirname(current);
    if (parent === current) {
      break;
    }

    current = parent;
  }

  const homeCandidate = join(homedir(), CONFIG_DIR_NAME, CONFIG_FILE_NAME);
  return (await fileExists(homeCandidate)) ? homeCandidate : null;
}

async function parseConfigFile(path: string): Promise<LocalConfig> {
  const raw = JSON.parse(await readFile(path, "utf8")) as Partial<LocalConfig>;

  if (!raw.gatewayUrl || !raw.apiKey || !raw.defaultNamespace) {
    throw validationError("Share memory config is incomplete", { path });
  }

  return {
    gatewayUrl: raw.gatewayUrl,
    apiKey: raw.apiKey,
    defaultNamespace: raw.defaultNamespace
  };
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
