#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { join, resolve } from "node:path";
import { nanoid } from "nanoid";
import { validateScopes } from "../packages/shared/dist/validation.js";
import { sha256 } from "../packages/gateway/dist/lib/hash.js";

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.spaceDir || !args.name || !args.scopes) {
    throw new Error("Usage: seed-apikey --space-dir <dir> --name <name> --scopes <scope1,scope2> [--expires-at <iso>]");
  }

  const scopes = validateScopes(args.scopes.split(",").map((scope) => scope.trim()).filter(Boolean));
  const secret = `smk_${randomBytes(24).toString("base64url")}`;
  const id = `smk_${nanoid(12)}`;
  const record = {
    id,
    name: args.name,
    key_hash: sha256(secret, process.env.API_KEY_SALT ?? "change-me"),
    scopes,
    created_at: new Date().toISOString(),
    expires_at: args.expiresAt ?? null,
    revoked: false
  };

  const targetDir = join(resolve(args.spaceDir), "apikey");
  await mkdir(targetDir, { recursive: true });
  await writeFile(join(targetDir, `${id}.json`), `${JSON.stringify(record, null, 2)}\n`, "utf8");

  console.log(JSON.stringify({ id, secret, scopes }, null, 2));
}

function parseArgs(argv: string[]): { spaceDir?: string; name?: string; scopes?: string; expiresAt?: string } {
  const parsed: { spaceDir?: string; name?: string; scopes?: string; expiresAt?: string } = {};

  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      continue;
    }

    if (key === "--space-dir") parsed.spaceDir = value;
    if (key === "--name") parsed.name = value;
    if (key === "--scopes") parsed.scopes = value;
    if (key === "--expires-at") parsed.expiresAt = value;
  }

  return parsed;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
