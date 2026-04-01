import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { internalError } from "@share-mem/shared";

export interface GatewayEnv {
  port: number;
  spaceDir: string;
  apiKeySalt: string;
}

export async function loadEnv(): Promise<GatewayEnv> {
  const port = Number(process.env.GATEWAY_PORT ?? "8787");
  const spaceDir = resolve(process.env.SPACE_DIR ?? "/space");
  const apiKeySalt = process.env.API_KEY_SALT ?? "change-me";

  if (Number.isNaN(port) || port <= 0) {
    throw internalError("Invalid GATEWAY_PORT");
  }

  await mkdir(spaceDir, { recursive: true });

  return {
    port,
    spaceDir,
    apiKeySalt
  };
}
