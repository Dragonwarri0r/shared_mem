import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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

describe("gateway write flow", () => {
  it("creates, updates, deletes memory and keeps catalog in sync", async () => {
    const { env, writeSecret, readSecret } = await createFixtureEnv();
    const app = createApp(env);

    const forbidden = await app.request("/v1/memory/shared/android-guide", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${readSecret}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        title: "Android Guide",
        tags: ["android", "team"],
        inject_mode: "always",
        summary: "Core Android rules",
        content: "Keep modules small."
      })
    });
    expect(forbidden.status).toBe(403);

    const createResponse = await app.request("/v1/memory/shared/android-guide", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${writeSecret}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        title: "Android Guide",
        tags: ["android", "team"],
        inject_mode: "always",
        summary: "Core Android rules",
        content: "Keep modules small."
      })
    });
    expect(createResponse.status).toBe(200);
    const created = await createResponse.json();
    expect(created.data.meta.version).toBe(1);
    expect(created.data.meta.created_by).toBe("writer-client");

    const createdCatalog = JSON.parse(await readFile(join(env.spaceDir, "mem", "_catalog.json"), "utf8"));
    expect(createdCatalog.total_entries).toBe(1);
    expect(createdCatalog.always_inject).toHaveLength(1);

    const updateResponse = await app.request("/v1/memory/shared/android-guide", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${writeSecret}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        tags: ["android", "mobile"],
        content: "Use baseline profiles."
      })
    });
    expect(updateResponse.status).toBe(200);
    const updated = await updateResponse.json();
    expect(updated.data.meta.version).toBe(2);
    expect(updated.data.meta.title).toBe("Android Guide");
    expect(updated.data.meta.summary).toBe("Core Android rules");

    const queryResponse = await app.request("/v1/memory?tag=mobile", {
      headers: { Authorization: `Bearer ${readSecret}` }
    });
    const query = await queryResponse.json();
    expect(query.data.total).toBe(1);

    const deleteResponse = await app.request("/v1/memory/shared/android-guide", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${writeSecret}` }
    });
    expect(deleteResponse.status).toBe(200);

    const deletedCatalog = JSON.parse(await readFile(join(env.spaceDir, "mem", "_catalog.json"), "utf8"));
    expect(deletedCatalog.total_entries).toBe(0);
    expect(deletedCatalog.tags).toEqual([]);
    expect(deletedCatalog.always_inject).toEqual([]);
  });
});

async function createFixtureEnv(): Promise<{ env: GatewayEnv; writeSecret: string; readSecret: string }> {
  const spaceDir = await mkdtemp(join(tmpdir(), "share-mem-write-"));
  createdDirs.push(spaceDir);

  await mkdir(join(spaceDir, "mem"), { recursive: true });
  await mkdir(join(spaceDir, "apikey"), { recursive: true });

  const env: GatewayEnv = {
    port: 0,
    spaceDir,
    apiKeySalt: "test-salt"
  };

  const writeSecret = "smk_write_secret";
  const readSecret = "smk_read_secret";

  const records: ApiKeyRecord[] = [
    {
      id: "smk_writer",
      name: "writer-client",
      key_hash: sha256(writeSecret, env.apiKeySalt),
      scopes: ["catalog:read", "memory:read", "memory:write"],
      created_at: new Date().toISOString(),
      expires_at: null,
      revoked: false
    },
    {
      id: "smk_reader",
      name: "reader-client",
      key_hash: sha256(readSecret, env.apiKeySalt),
      scopes: ["catalog:read", "memory:read"],
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

  return { env, writeSecret, readSecret };
}
