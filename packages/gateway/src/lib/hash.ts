import { createHash } from "node:crypto";

export function sha256(value: string, salt = ""): string {
  return createHash("sha256").update(`${salt}:${value}`).digest("hex");
}
