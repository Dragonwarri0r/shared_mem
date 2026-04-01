import { Hono } from "hono";
import { CatalogService } from "../services/catalog-service.js";

export function createCatalogRouter(catalogService: CatalogService): Hono {
  const app = new Hono();

  app.get("/", async (c) => c.json({ ok: true, data: await catalogService.getCatalog() }));

  app.post("/rebuild", async (c) => c.json({ ok: true, data: await catalogService.rebuildCatalog() }));

  return app;
}
