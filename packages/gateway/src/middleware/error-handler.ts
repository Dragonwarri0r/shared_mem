import type { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";
import { ShareMemError, internalError } from "@share-mem/shared";

function jsonErrorResponse(status: number, payload: { ok: false; error: ReturnType<ShareMemError["toJSON"]> }): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8"
    }
  });
}

export async function errorHandler(c: Context, next: Next): Promise<Response | void> {
  try {
    await next();
  } catch (error) {
    if (error instanceof ShareMemError) {
      return jsonErrorResponse(error.status, { ok: false, error: error.toJSON() });
    }

    if (error instanceof HTTPException) {
      const wrapped = internalError(error.message);
      return jsonErrorResponse(error.status, { ok: false, error: wrapped.toJSON() });
    }

    const wrapped = internalError();
    return jsonErrorResponse(500, { ok: false, error: wrapped.toJSON() });
  }
}

export function onError(error: unknown): Response {
  if (error instanceof ShareMemError) {
    return jsonErrorResponse(error.status, { ok: false, error: error.toJSON() });
  }

  if (error instanceof HTTPException) {
    const wrapped = internalError(error.message);
    return jsonErrorResponse(error.status, { ok: false, error: wrapped.toJSON() });
  }

  const wrapped = internalError();
  return jsonErrorResponse(500, { ok: false, error: wrapped.toJSON() });
}
