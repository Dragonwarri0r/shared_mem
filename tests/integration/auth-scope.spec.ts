import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../../packages/gateway/src/app.js";
import { sha256 } from "../../packages/gateway/src/lib/hash.js";
import type { GatewayEnv } from "../../packages/gateway/src/env.js";
import type { ApiKeyRecord } from "../../packages/shared/src/types.js";

const createdDirs: string[] = [];

afterEach(async () => {
  await Promise.all(createdDirs.splice(0).map(async (dir) => rm(dir, { recursive: true, force: true })));
});

describe("auth scope enforcement", () => {
  it("returns 401 for missing key and 403 for insufficient scope", async () => {
    const { env, readSecret, writeSecret } = await createFixture();
    const app = createApp(env);

    const anonymous = await app.request("/v1/catalog");
    expect(anonymous.status).toBe(401);

    const forbidden = await app.request("/v1/catalog/rebuild", {
      method: "POST",
      headers: { Authorization: `Bearer ${readSecret}` }
    });
    expect(forbidden.status).toBe(403);

    const allowed = await app.request("/v1/catalog/rebuild", {
      method: "POST",
      headers: { Authorization: `Bearer ${writeSecret}` }
    });
    expect(allowed.status).toBe(200);
  });
});

async function createFixture(): Promise<{ env: GatewayEnv; readSecret: string; writeSecret: string }> {
  const spaceDir = await mkdtemp(join(tmpdir(), "share-mem-auth-"));
  createdDirs.push(spaceDir);
  await mkdir(join(spaceDir, "mem"), { recursive: true });
  await mkdir(join(spaceDir, "apikey"), { recursive: true });

  const env: GatewayEnv = { port: 0, spaceDir, apiKeySalt: "test-salt" };
  const readSecret = "smk_read_auth";
  const writeSecret = "smk_write_auth";

  const records: ApiKeyRecord[] = [
    {
      id: "reader",
      name: "reader",
      key_hash: sha256(readSecret, env.apiKeySalt),
      scopes: ["catalog:read", "memory:read"],
      created_at: new Date().toISOString(),
      expires_at: null,
      revoked: false
    },
    {
      id: "writer",
      name: "writer",
      key_hash: sha256(writeSecret, env.apiKeySalt),
      scopes: ["catalog:read", "memory:read", "memory:write"],
      created_at: new Date().toISOString(),
      expires_at: null,
      revoked: false
    }
  ];

  await Promise.all(
    records.map(async (record) =>
      writeFile(join(spaceDir, "apikey", `${record.id}.json`), JSON.stringify(record, null, 2))
    )
  );

  return { env, readSecret, writeSecret };
}
