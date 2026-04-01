import type { ApiErrorShape } from "./types.js";

export class ShareMemError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details: Record<string, unknown> | undefined;

  constructor(status: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "ShareMemError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  toJSON(): ApiErrorShape {
    const payload: ApiErrorShape = {
      code: this.code,
      message: this.message
    };

    if (this.details !== undefined) {
      payload.details = this.details;
    }

    return payload;
  }
}

export const unauthorizedError = (message = "Unauthorized") =>
  new ShareMemError(401, "UNAUTHORIZED", message);

export const forbiddenError = (message = "Forbidden") =>
  new ShareMemError(403, "FORBIDDEN", message);

export const notFoundError = (message = "Not found", details?: Record<string, unknown>) =>
  new ShareMemError(404, "NOT_FOUND", message, details);

export const validationError = (message: string, details?: Record<string, unknown>) =>
  new ShareMemError(422, "VALIDATION_ERROR", message, details);

export const internalError = (message = "Internal server error", details?: Record<string, unknown>) =>
  new ShareMemError(500, "INTERNAL_ERROR", message, details);
