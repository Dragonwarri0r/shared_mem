import { readFile, readdir } from "node:fs/promises";
import type { ApiKeyRecord } from "@share-mem/shared";
import type { SpacePaths } from "./space-paths.js";

export class ApiKeyRepository {
  constructor(private readonly spacePaths: SpacePaths) {}

  async list(): Promise<ApiKeyRecord[]> {
    const entries = await readdir(this.spacePaths.apiKeyDir, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        return [];
      }

      throw error;
    });

    const files = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".json"));
    const records = await Promise.all(
      files.map(async (file) =>
        JSON.parse(await readFile(`${this.spacePaths.apiKeyDir}/${file.name}`, "utf8")) as ApiKeyRecord
      )
    );

    return records;
  }
}
