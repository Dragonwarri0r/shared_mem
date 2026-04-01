import type { Context, Next } from "hono";
import type { ApiKeyRecord, ApiScope } from "@share-mem/shared";
import { ApiKeyService } from "../services/apikey-service.js";

export function createAuthMiddleware(apiKeyService: ApiKeyService) {
  return async function authMiddleware(c: Context, next: Next): Promise<void> {
    const requiredScopes = resolveScopes(c.req.method, c.req.path);

    if (requiredScopes.length === 0) {
      await next();
      return;
    }

    const header = c.req.header("authorization");
    const secret = header?.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : null;
    const apiKey = await apiKeyService.authorize(secret, requiredScopes);
    c.set("apiKey", apiKey);
    await next();
  };
}

function resolveScopes(method: string, path: string): ApiScope[] {
  if (path.startsWith("/v1/catalog")) {
    if (method !== "GET") {
      return ["memory:write"];
    }

    return ["catalog:read"];
  }

  if (path.startsWith("/v1/memory")) {
    if (method === "GET") {
      return ["memory:read"];
    }

    return ["memory:write"];
  }

  return [];
}
