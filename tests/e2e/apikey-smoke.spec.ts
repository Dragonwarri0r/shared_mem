import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const createdDirs: string[] = [];
const SEED_SCRIPT = resolve("/Users/youxuezhe/vsproj/share_mem/scripts/seed-apikey.ts");

afterEach(async () => {
  await Promise.all(createdDirs.splice(0).map(async (dir) => rm(dir, { recursive: true, force: true })));
});

describe("apikey seed smoke", () => {
  it("creates one apikey file and returns secret once", async () => {
    const spaceDir = await mkdtemp(join(tmpdir(), "share-mem-seed-"));
    createdDirs.push(spaceDir);
    await mkdir(join(spaceDir, "apikey"), { recursive: true });

    const { stdout } = await execFileAsync(
      "node_modules/.bin/tsx",
      [
        SEED_SCRIPT,
        "--space-dir",
        spaceDir,
        "--name",
        "cursor-dev",
        "--scopes",
        "catalog:read,memory:read"
      ],
      {
        cwd: "/Users/youxuezhe/vsproj/share_mem",
        env: {
          ...process.env,
          API_KEY_SALT: "test-salt"
        }
      }
    );

    const payload = JSON.parse(stdout);
    expect(payload.secret.startsWith("smk_")).toBe(true);

    const file = await readFile(join(spaceDir, "apikey", `${payload.id}.json`), "utf8");
    const record = JSON.parse(file);
    expect(record.name).toBe("cursor-dev");
    expect(record.scopes).toEqual(["catalog:read", "memory:read"]);
    expect(record.key_hash).not.toBe(payload.secret);
  });
});
