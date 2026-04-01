import { access } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const CONFIG_DIR_NAME = ".share-mem";
const CONFIG_FILE_NAME = "config.json";

export async function discoverConfigPath(startDir = process.cwd()): Promise<string | null> {
  let current = resolve(startDir);

  while (true) {
    const candidate = join(current, CONFIG_DIR_NAME, CONFIG_FILE_NAME);
    if (await exists(candidate)) {
      return candidate;
    }

    const parent = dirname(current);
    if (parent === current) {
      return null;
    }

    current = parent;
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
