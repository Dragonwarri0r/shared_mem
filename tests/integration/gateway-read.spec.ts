import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../../packages/gateway/src/app.js";
import { sha256 } from "../../packages/gateway/src/lib/hash.js";
import { stringifyMemoryMarkdown } from "../../packages/gateway/src/lib/frontmatter.js";
import type { GatewayEnv } from "../../packages/gateway/src/env.js";
import type { ApiKeyRecord, MemoryMeta } from "../../packages/shared/src/types.js";

const createdDirs: string[] = [];

afterEach(async () => {
  await Promise.all(createdDirs.splice(0).map(async (dir) => rm(dir, { recursive: true, force: true })));
});

describe("gateway read flow", () => {
  it("rejects anonymous catalog access", async () => {
    const env = await createFixtureEnv();
    const app = createApp(env);

    const response = await app.request("/v1/catalog");

    expect(response.status).toBe(401);
  });

  it("builds catalog from existing memory files and supports read/query flow", async () => {
    const { env, secret, spaceDir } = await createFixtureEnvWithData();
    const app = createApp(env);
    const headers = { Authorization: `Bearer ${secret}` };

    const catalogResponse = await app.request("/v1/catalog", { headers });
    expect(catalogResponse.status).toBe(200);

    const catalogPayload = await catalogResponse.json();
    expect(catalogPayload.ok).toBe(true);
    expect(catalogPayload.data.total_entries).toBe(2);
    expect(catalogPayload.data.tags).toEqual([
      { tag: "android", description: "Android coding standards", count: 1 },
      { tag: "backend", description: "Node deployment", count: 1 },
      { tag: "shared", description: "Node deployment", count: 2 }
    ]);
    expect(catalogPayload.data.always_inject).toEqual([
      {
        namespace: "shared",
        key: "android-coding-standards",
        title: "Android coding standards",
        summary: "Use ktfmt and keep modules small."
      }
    ]);

    const queryResponse = await app.request("/v1/memory?tag=android&search=standards", { headers });
    expect(queryResponse.status).toBe(200);
    const queryPayload = await queryResponse.json();
    expect(queryPayload.data.total).toBe(1);
    expect(queryPayload.data.items[0]).toMatchObject({
      namespace: "shared",
      key: "android-coding-standards"
    });

    const getResponse = await app.request("/v1/memory/shared/android-coding-standards", { headers });
    expect(getResponse.status).toBe(200);
    const getPayload = await getResponse.json();
    expect(getPayload.data.content).toContain("Prefer feature modules");

    const savedCatalog = JSON.parse(await readFile(join(spaceDir, "mem", "_catalog.json"), "utf8"));
    expect(savedCatalog.total_entries).toBe(2);
  });
});

async function createFixtureEnv(): Promise<GatewayEnv> {
  const spaceDir = await mkdtemp(join(tmpdir(), "share-mem-read-"));
  createdDirs.push(spaceDir);

  await mkdir(join(spaceDir, "mem"), { recursive: true });
  await mkdir(join(spaceDir, "apikey"), { recursive: true });

  return {
    port: 0,
    spaceDir,
    apiKeySalt: "test-salt"
  };
}

async function createFixtureEnvWithData(): Promise<{ env: GatewayEnv; secret: string; spaceDir: string }> {
  const env = await createFixtureEnv();
  const secret = "smk_test_secret";

  const apiKey: ApiKeyRecord = {
    id: "smk_test",
    name: "test-client",
    key_hash: sha256(secret, env.apiKeySalt),
    scopes: ["catalog:read", "memory:read"],
    created_at: new Date().toISOString(),
    expires_at: null,
    revoked: false
  };

  await writeFile(join(env.spaceDir, "apikey", `${apiKey.id}.json`), JSON.stringify(apiKey, null, 2));

  await writeMemory(env.spaceDir, "shared", "android-coding-standards", {
    title: "Android coding standards",
    tags: ["android", "shared"],
    inject_mode: "always",
    summary: "Use ktfmt and keep modules small.",
    created_by: "test-client",
    created_at: "2026-03-31T00:00:00.000Z",
    updated_at: "2026-03-31T01:00:00.000Z",
    version: 1
  }, "Prefer feature modules and avoid giant Gradle projects.");

  await writeMemory(env.spaceDir, "shared", "node-deployment", {
    title: "Node deployment",
    tags: ["backend", "shared"],
    inject_mode: "on-demand",
    created_by: "test-client",
    created_at: "2026-03-31T00:00:00.000Z",
    updated_at: "2026-03-31T02:00:00.000Z",
    version: 1
  }, "Use health checks and lock the Node major version.");

  await writeMemory(env.spaceDir, "shared", "old-note", {
    title: "Old note",
    tags: ["android"],
    inject_mode: "archive",
    created_by: "test-client",
    created_at: "2026-03-31T00:00:00.000Z",
    updated_at: "2026-03-31T03:00:00.000Z",
    version: 1
  }, "This should stay out of active catalog results.");

  return { env, secret, spaceDir: env.spaceDir };
}

async function writeMemory(
  spaceDir: string,
  namespace: string,
  key: string,
  meta: MemoryMeta,
  content: string
): Promise<void> {
  const dir = join(spaceDir, "mem", namespace);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${key}.md`), stringifyMemoryMarkdown(meta, content));
}
