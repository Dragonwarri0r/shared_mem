import { access, constants } from "node:fs/promises";
import { Hono } from "hono";
import type { GatewayEnv } from "../env.js";

export function createHealthRouter(env: GatewayEnv): Hono {
  const app = new Hono();

  app.get("/", async (c) => {
    await access(env.spaceDir, constants.R_OK | constants.W_OK);

    return c.json({
      ok: true,
      data: {
        status: "ok",
        version: "0.1.0",
        spaceDir: env.spaceDir
      }
    });
  });

  return app;
}
