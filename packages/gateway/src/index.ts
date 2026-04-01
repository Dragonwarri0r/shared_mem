import { serve } from "@hono/node-server";
import { logger } from "hono/logger";
import { createApp } from "./app.js";
import { loadEnv } from "./env.js";

async function main(): Promise<void> {
  const env = await loadEnv();
  const app = createApp(env);
  app.use("*", logger());

  console.log(`share-mem gateway listening on http://0.0.0.0:${env.port}`);

  serve({
    port: env.port,
    fetch: app.fetch
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
