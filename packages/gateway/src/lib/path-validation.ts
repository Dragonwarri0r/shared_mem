import { validateKey, validateNamespace } from "@share-mem/shared";

export function assertValidMemoryPath(namespace: string, key: string): void {
  validateNamespace(namespace);
  validateKey(key);
}
