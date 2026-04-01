import { join } from "node:path";
import type { GatewayEnv } from "../env.js";

export interface SpacePaths {
  root: string;
  memDir: string;
  apiKeyDir: string;
  catalogFile: string;
}

export function resolveSpacePaths(env: GatewayEnv): SpacePaths {
  const memDir = join(env.spaceDir, "mem");
  const apiKeyDir = join(env.spaceDir, "apikey");

  return {
    root: env.spaceDir,
    memDir,
    apiKeyDir,
    catalogFile: join(memDir, "_catalog.json")
  };
}

export function resolveMemoryFile(spacePaths: SpacePaths, namespace: string, key: string): string {
  return join(spacePaths.memDir, namespace, `${key}.md`);
}

export function resolveApiKeyFile(spacePaths: SpacePaths, id: string): string {
  return join(spacePaths.apiKeyDir, `${id}.json`);
}
