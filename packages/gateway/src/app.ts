import { Hono } from "hono";
import type { GatewayEnv } from "./env.js";
import { createAuthMiddleware } from "./middleware/auth.js";
import { errorHandler, onError } from "./middleware/error-handler.js";
import { createCatalogRouter } from "./routes/catalog.js";
import { createHealthRouter } from "./routes/health.js";
import { createMemoryRouter } from "./routes/memory.js";
import { ApiKeyService } from "./services/apikey-service.js";
import { CatalogService } from "./services/catalog-service.js";
import { MemoryService } from "./services/memory-service.js";
import { ApiKeyRepository } from "./storage/apikey-repository.js";
import { CatalogRepository } from "./storage/catalog-repository.js";
import { MemoryRepository } from "./storage/memory-repository.js";
import { resolveSpacePaths } from "./storage/space-paths.js";

export function createApp(env: GatewayEnv): Hono {
  const app = new Hono();
  const spacePaths = resolveSpacePaths(env);
  const memoryRepository = new MemoryRepository(spacePaths);
  const catalogRepository = new CatalogRepository(spacePaths);
  const apiKeyRepository = new ApiKeyRepository(spacePaths);
  const catalogService = new CatalogService(catalogRepository, memoryRepository);
  const memoryService = new MemoryService(memoryRepository, catalogService);
  const apiKeyService = new ApiKeyService(apiKeyRepository, env.apiKeySalt);

  app.onError(onError);
  app.use("/v1/*", createAuthMiddleware(apiKeyService));

  app.route("/health", createHealthRouter(env));
  app.route("/v1/catalog", createCatalogRouter(catalogService));
  app.route("/v1/memory", createMemoryRouter(memoryService));

  return app;
}
