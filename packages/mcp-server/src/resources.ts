import { GatewayClient } from "@share-mem/shared";
import type { LocalConfig } from "@share-mem/shared";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export const CATALOG_RESOURCE_URI = "share-mem://catalog";

export function registerCatalogResources(server: McpServer, config: LocalConfig): void {
  const client = GatewayClient.fromConfig(config);

  server.registerResource(
    "catalog",
    CATALOG_RESOURCE_URI,
    {
      title: "Share Memory Catalog",
      description: "Lightweight shared memory catalog for AI clients.",
      mimeType: "application/json"
    },
    async () => {
      const catalog = await client.getCatalog();

      return {
        contents: [
          {
            uri: CATALOG_RESOURCE_URI,
            mimeType: "application/json",
            text: JSON.stringify(catalog, null, 2)
          }
        ]
      };
    }
  );
}
