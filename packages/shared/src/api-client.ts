import { ShareMemError } from "./errors.js";
import type {
  ApiFailure,
  ApiResponse,
  Catalog,
  LocalConfig,
  MemoryEntry,
  MemoryListItem,
  MemoryQueryParams,
  UpsertMemoryInput
} from "./types.js";

export interface GatewayClientOptions {
  baseUrl: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
}

export class GatewayClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: GatewayClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  static fromConfig(config: LocalConfig, fetchImpl?: typeof fetch): GatewayClient {
    const options: GatewayClientOptions = {
      baseUrl: config.gatewayUrl,
      apiKey: config.apiKey
    };

    if (fetchImpl !== undefined) {
      options.fetchImpl = fetchImpl;
    }

    return new GatewayClient(options);
  }

  async health(): Promise<{ status: string; version: string; spaceDir: string }> {
    return this.request("/health");
  }

  async getCatalog(): Promise<Catalog> {
    return this.request("/v1/catalog");
  }

  async getMemory(namespace: string, key: string): Promise<MemoryEntry> {
    return this.request(`/v1/memory/${namespace}/${key}`);
  }

  async queryMemory(params: MemoryQueryParams): Promise<{ items: MemoryListItem[]; total: number }> {
    const search = new URLSearchParams();

    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        search.set(key, String(value));
      }
    }

    const suffix = search.size > 0 ? `?${search.toString()}` : "";
    return this.request(`/v1/memory${suffix}`);
  }

  async upsertMemory(namespace: string, key: string, input: UpsertMemoryInput): Promise<MemoryEntry> {
    return this.request(`/v1/memory/${namespace}/${key}`, {
      method: "POST",
      body: JSON.stringify(input)
    });
  }

  async deleteMemory(namespace: string, key: string): Promise<{ deleted: true }> {
    return this.request(`/v1/memory/${namespace}/${key}`, {
      method: "DELETE"
    });
  }

  async rebuildCatalog(): Promise<Catalog> {
    return this.request("/v1/catalog/rebuild", { method: "POST" });
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
        ...(init?.headers ?? {})
      }
    });

    const payload = (await response.json()) as ApiResponse<T>;

    if (!response.ok || !payload.ok) {
      const error = (payload as ApiFailure).error;
      throw new ShareMemError(response.status, error.code, error.message, error.details);
    }

    return payload.data;
  }
}
