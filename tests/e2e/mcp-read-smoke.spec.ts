import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { serve } from "@hono/node-server";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { CallToolResultSchema, ReadResourceResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { createApp } from "../../packages/gateway/src/app.js";
import { stringifyMemoryMarkdown } from "../../packages/gateway/src/lib/frontmatter.js";
import { sha256 } from "../../packages/gateway/src/lib/hash.js";
import type { GatewayEnv } from "../../packages/gateway/src/env.js";
import type { ApiKeyRecord, MemoryMeta } from "../../packages/shared/src/types.js";

const createdDirs: string[] = [];
const MCP_SERVER_ENTRY = resolve("/Users/youxuezhe/vsproj/share_mem/packages/mcp-server/dist/index.js");

afterEach(async () => {
  await Promise.all(createdDirs.splice(0).map(async (dir) => rm(dir, { recursive: true, force: true })));
});

describe("mcp read smoke", () => {
  it("exposes memory tools and catalog resource over stdio", async () => {
    const fixture = await createFixture();
    const gatewayServer = await startGatewayServer(fixture.env);

    const client = new Client({
      name: "share-mem-mcp-test-client",
      version: "0.1.0"
    });

    const transport = new StdioClientTransport({
      command: "node",
      args: [MCP_SERVER_ENTRY],
      cwd: fixture.workspaceDir,
      stderr: "pipe",
      env: {
        ...process.env,
        SHARE_MEM_CONFIG: join(fixture.workspaceDir, ".share-mem", "config.json")
      } as Record<string, string>
    });
    let stderrOutput = "";
    transport.stderr?.on("data", (chunk) => {
      stderrOutput += chunk.toString();
    });

    try {
      await client.connect(transport);

      const tools = await client.listTools();
      expect(tools.tools.map((tool) => tool.name).sort()).toEqual(["memory_get", "memory_list", "memory_query"]);

      const query = await client.request(
        {
          method: "tools/call",
          params: {
            name: "memory_query",
            arguments: { tag: "android" }
          }
        },
        CallToolResultSchema
      );
      const queryText = query.content[0].type === "text" ? query.content[0].text : "";
      expect(queryText).toContain("Found 1 memory:");
      expect(queryText).toContain("[shared/android-coding-standards]");
      expect(queryText).toContain("Use memory_get to fetch full content");

      const getResult = await client.request(
        {
          method: "tools/call",
          params: {
            name: "memory_get",
            arguments: { namespace: "shared", key: "android-coding-standards" }
          }
        },
        CallToolResultSchema
      );
      const getText = getResult.content[0].type === "text" ? getResult.content[0].text : "";
      expect(getText).toContain("[shared/android-coding-standards] Android coding standards");
      expect(getText).toContain("Prefer feature modules");

      const resources = await client.listResources();
      expect(resources.resources.map((resource) => resource.uri)).toContain("share-mem://catalog");

      const catalog = await client.request(
        {
          method: "resources/read",
          params: { uri: "share-mem://catalog" }
        },
        ReadResourceResultSchema
      );
      const catalogBody = JSON.parse("text" in catalog.contents[0] ? catalog.contents[0].text : "{}");
      expect(catalogBody.total_entries).toBe(2);
    } catch (error) {
      const suffix = stderrOutput.trim() ? `\nMCP stderr:\n${stderrOutput.trim()}` : "";
      throw new Error(`${String(error)}${suffix}`);
    } finally {
      await client.close();
      gatewayServer.close();
    }
  });
});

async function createFixture(): Promise<{ env: GatewayEnv; workspaceDir: string }> {
  const workspaceDir = await mkdtemp(join(tmpdir(), "share-mem-mcp-"));
  createdDirs.push(workspaceDir);

  const spaceDir = join(workspaceDir, "space");
  const env: GatewayEnv = {
    port: 0,
    spaceDir,
    apiKeySalt: "test-salt"
  };

  await mkdir(join(spaceDir, "mem"), { recursive: true });
  await mkdir(join(spaceDir, "apikey"), { recursive: true });
  await mkdir(join(workspaceDir, ".share-mem"), { recursive: true });

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

  await writeFile(join(spaceDir, "apikey", `${apiKey.id}.json`), JSON.stringify(apiKey, null, 2));
  await writeMemory(spaceDir, "shared", "android-coding-standards", {
    title: "Android coding standards",
    tags: ["android", "shared"],
    inject_mode: "always",
    summary: "Use ktfmt and keep modules small.",
    created_by: "test-client",
    created_at: "2026-03-31T00:00:00.000Z",
    updated_at: "2026-03-31T01:00:00.000Z",
    version: 1
  }, "Prefer feature modules and avoid giant Gradle projects.");
  await writeMemory(spaceDir, "shared", "node-deployment", {
    title: "Node deployment",
    tags: ["backend", "shared"],
    inject_mode: "on-demand",
    created_by: "test-client",
    created_at: "2026-03-31T00:00:00.000Z",
    updated_at: "2026-03-31T02:00:00.000Z",
    version: 1
  }, "Use health checks and lock the Node major version.");

  await writeFile(
    join(workspaceDir, ".share-mem", "config.json"),
    JSON.stringify(
      {
        gatewayUrl: "http://127.0.0.1:0",
        apiKey: secret,
        defaultNamespace: "shared"
      },
      null,
      2
    )
  );

  return { env, workspaceDir };
}

async function startGatewayServer(env: GatewayEnv) {
  const app = createApp(env);

  const server = serve(
    {
      port: 0,
      fetch: app.fetch
    },
    async (info) => {
      const configPath = join(env.spaceDir, "..", ".share-mem", "config.json");
      const raw = JSON.parse(await readFile(configPath, "utf8")) as {
        gatewayUrl: string;
        apiKey: string;
        defaultNamespace: string;
      };
      raw.gatewayUrl = `http://127.0.0.1:${info.port}`;
      await writeFile(configPath, JSON.stringify(raw, null, 2));
    }
  );

  await new Promise((resolve) => server.on("listening", resolve));
  return server;
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
