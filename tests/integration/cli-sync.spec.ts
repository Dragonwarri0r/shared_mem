import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { serve } from "@hono/node-server";
import { createApp } from "../../packages/gateway/src/app.js";
import { stringifyMemoryMarkdown } from "../../packages/gateway/src/lib/frontmatter.js";
import { sha256 } from "../../packages/gateway/src/lib/hash.js";
import type { GatewayEnv } from "../../packages/gateway/src/env.js";
import type { ApiKeyRecord, MemoryMeta } from "../../packages/shared/src/types.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const createdDirs: string[] = [];
const CLI_ENTRY = resolve("/Users/youxuezhe/vsproj/share_mem/packages/cli/src/index.ts");

afterEach(async () => {
  await Promise.all(createdDirs.splice(0).map(async (dir) => rm(dir, { recursive: true, force: true })));
});

describe("cli init/sync", () => {
  it("creates config, catalog cache, cursor rule, and CLAUDE managed block", async () => {
    const fixture = await createFixture();
    const { server, baseUrl } = await startGatewayServer(fixture.env);

    try {
      await execCli(
        [
          "init",
          "--gateway-url",
          baseUrl,
          "--api-key",
          fixture.secret,
          "--default-namespace",
          "shared",
          "--cwd",
          fixture.workspaceDir
        ],
        fixture.workspaceDir
      );

      const config = JSON.parse(await readFile(join(fixture.workspaceDir, ".share-mem", "config.json"), "utf8"));
      expect(config.defaultNamespace).toBe("shared");

      await execCli(["sync", "--all", "--cwd", fixture.workspaceDir], fixture.workspaceDir);

      const catalog = JSON.parse(await readFile(join(fixture.workspaceDir, ".share-mem", "catalog.json"), "utf8"));
      expect(catalog.total_entries).toBe(2);

      const cursorRule = await readFile(join(fixture.workspaceDir, ".cursor", "rules", "shared-memory.mdc"), "utf8");
      expect(cursorRule).toContain("Shared Memory Catalog");
      expect(cursorRule).toContain("android");

      const claude = await readFile(join(fixture.workspaceDir, "CLAUDE.md"), "utf8");
      expect(claude).toContain("manual intro");
      expect(claude).toContain("<!-- share-mem:start -->");
      expect(claude).toContain("android-coding-standards");
    } finally {
      server.close();
    }
  });
});

async function execCli(args: string[], cwd: string): Promise<string> {
  const result = await execFileAsync("node_modules/.bin/tsx", [CLI_ENTRY, ...args], {
    cwd: "/Users/youxuezhe/vsproj/share_mem"
  });
  return result.stdout;
}

async function createFixture(): Promise<{ env: GatewayEnv; workspaceDir: string; secret: string }> {
  const workspaceDir = await mkdtemp(join(tmpdir(), "share-mem-cli-"));
  createdDirs.push(workspaceDir);

  const spaceDir = join(workspaceDir, "space");
  const env: GatewayEnv = { port: 0, spaceDir, apiKeySalt: "test-salt" };
  const secret = "smk_cli_secret";

  await mkdir(join(spaceDir, "mem"), { recursive: true });
  await mkdir(join(spaceDir, "apikey"), { recursive: true });
  await mkdir(join(workspaceDir, ".cursor"), { recursive: true });
  await mkdir(join(workspaceDir, ".claude"), { recursive: true });
  await writeFile(join(workspaceDir, "CLAUDE.md"), "manual intro\n", "utf8");

  const key: ApiKeyRecord = {
    id: "smk_cli",
    name: "cli-client",
    key_hash: sha256(secret, env.apiKeySalt),
    scopes: ["catalog:read", "memory:read"],
    created_at: new Date().toISOString(),
    expires_at: null,
    revoked: false
  };
  await writeFile(join(spaceDir, "apikey", "smk_cli.json"), JSON.stringify(key, null, 2));

  await writeMemory(spaceDir, "shared", "android-coding-standards", {
    title: "Android coding standards",
    tags: ["android", "shared"],
    inject_mode: "always",
    summary: "Use ktfmt and keep modules small.",
    created_by: "cli-client",
    created_at: "2026-03-31T00:00:00.000Z",
    updated_at: "2026-03-31T01:00:00.000Z",
    version: 1
  }, "Prefer feature modules.");
  await writeMemory(spaceDir, "shared", "backend-guide", {
    title: "Backend guide",
    tags: ["backend"],
    inject_mode: "on-demand",
    created_by: "cli-client",
    created_at: "2026-03-31T00:00:00.000Z",
    updated_at: "2026-03-31T02:00:00.000Z",
    version: 1
  }, "Use health checks.");

  return { env, workspaceDir, secret };
}

async function startGatewayServer(env: GatewayEnv) {
  const app = createApp(env);
  let baseUrl = "";
  const server = serve(
    { port: 0, fetch: app.fetch },
    (info) => {
      baseUrl = `http://127.0.0.1:${info.port}`;
    }
  );
  await new Promise((resolve) => server.on("listening", resolve));
  return { server, baseUrl };
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
