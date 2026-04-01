import { forbiddenError, unauthorizedError } from "@share-mem/shared";
import type { ApiKeyRecord, ApiScope } from "@share-mem/shared";
import { sha256 } from "../lib/hash.js";
import { ApiKeyRepository } from "../storage/apikey-repository.js";

export class ApiKeyService {
  constructor(
    private readonly apiKeyRepository: ApiKeyRepository,
    private readonly salt: string
  ) {}

  async authorize(secret: string | null, requiredScopes: ApiScope[]): Promise<ApiKeyRecord> {
    if (!secret) {
      throw unauthorizedError("Missing API key");
    }

    const records = await this.apiKeyRepository.list();
    const hash = sha256(secret, this.salt);
    const matched = records.find((record) => record.key_hash === hash);

    if (!matched) {
      throw unauthorizedError("Invalid API key");
    }

    if (matched.revoked) {
      throw unauthorizedError("API key revoked");
    }

    if (matched.expires_at && Date.parse(matched.expires_at) <= Date.now()) {
      throw unauthorizedError("API key expired");
    }

    const missingScopes = requiredScopes.filter((scope) => !matched.scopes.includes(scope));

    if (missingScopes.length > 0) {
      throw forbiddenError("API key scope is insufficient");
    }

    return matched;
  }
}
