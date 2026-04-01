import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

export async function atomicWriteFile(targetPath: string, content: string): Promise<void> {
  await mkdir(dirname(targetPath), { recursive: true });

  const tempPath = join(dirname(targetPath), `.tmp-${randomUUID()}`);
  await writeFile(tempPath, content, "utf8");
  await rename(tempPath, targetPath);
}
