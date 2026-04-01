import { Hono } from "hono";
import type { MemoryQueryParams, UpsertMemoryInput } from "@share-mem/shared";
import { validationError } from "@share-mem/shared";
import { MemoryService } from "../services/memory-service.js";

export function createMemoryRouter(memoryService: MemoryService): Hono {
  const app = new Hono();

  app.get("/", async (c) => {
    const params: MemoryQueryParams = {};
    const namespace = c.req.query("namespace");
    const tag = c.req.query("tag");
    const search = c.req.query("search");
    const limit = c.req.query("limit");
    const offset = c.req.query("offset");

    if (namespace !== undefined) {
      params.namespace = namespace;
    }

    if (tag !== undefined) {
      params.tag = tag;
    }

    if (search !== undefined) {
      params.search = search;
    }

    if (limit !== undefined) {
      params.limit = Number(limit);
    }

    if (offset !== undefined) {
      params.offset = Number(offset);
    }

    if (c.req.query("includeArchived") === "true") {
      params.includeArchived = true;
    }

    return c.json({
      ok: true,
      data: await memoryService.queryMemory(params)
    });
  });

  app.get("/:namespace/:key", async (c) =>
    c.json({
      ok: true,
      data: await memoryService.getMemory(c.req.param("namespace"), c.req.param("key"))
    })
  );

  app.post("/:namespace/:key", async (c) => {
    const body = (await c.req.json().catch(() => {
      throw validationError("Invalid JSON body");
    })) as UpsertMemoryInput;
    const apiKey = (c as unknown as { var?: { apiKey?: { name?: string } } }).var?.apiKey;

    return c.json({
      ok: true,
      data: await memoryService.upsertMemory(
        c.req.param("namespace"),
        c.req.param("key"),
        body,
        apiKey?.name ?? "unknown"
      )
    });
  });

  app.delete("/:namespace/:key", async (c) =>
    c.json({
      ok: true,
      data: await memoryService.deleteMemory(c.req.param("namespace"), c.req.param("key"))
    })
  );

  return app;
}
