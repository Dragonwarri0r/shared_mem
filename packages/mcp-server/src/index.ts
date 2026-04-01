import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { registerCatalogResources } from "./resources.js";
import { registerMemoryTools } from "./tools.js";

export async function createMcpServer(startDir = process.cwd()): Promise<McpServer> {
  const config = await loadConfig(startDir);
  const server = new McpServer(
    {
      name: "share-mem-mcp-server",
      version: "0.1.0"
    },
    {
      instructions: "Use memory_query or memory_list to discover entries, then memory_get to read full markdown."
    }
  );

  registerMemoryTools(server, config);
  registerCatalogResources(server, config);

  return server;
}

async function main(): Promise<void> {
  const server = await createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("share-mem mcp server running on stdio");
}

main().catch((error) => {
  console.error("share-mem mcp server failed:", error);
  process.exit(1);
});
