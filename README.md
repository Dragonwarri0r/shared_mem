# Share Memory

Team shared memory system for AI-assisted development. Provides a lightweight catalog + on-demand full-content retrieval pattern that keeps LLM context windows small while giving agents access to team knowledge.

## Architecture

```
                         Docker Compose
                    ┌─────────────────────────┐
                    │  SilverBullet (:3000)    │  Web UI for editing
                    │         ↕ /space volume  │
                    │  Gateway (:8787)         │  API, auth, catalog
                    └────────────┬────────────┘
                                 │ HTTP + Bearer token
              ┌──────────────────┼──────────────────┐
              │                  │                   │
         CLI (local)      MCP Server (local)    Other HTTP clients
      init/sync/CRUD     stdio ← Cursor/Claude
```

- **Gateway** (server) — HTTP API for memory CRUD, catalog maintenance, API key auth
- **SilverBullet** (server) — Markdown storage + human editing UI, shares `/space` volume with Gateway
- **MCP Server** (local client) — Wraps Gateway API as MCP tools for AI clients (Cursor, Claude Code, etc.)
- **CLI** (local client) — Init workspace, sync catalog to local injection files, read/write memory
- **Shared** (library) — Types, validation, `GatewayClient` HTTP client used by MCP + CLI

## Quick Start

### 1. Prerequisites

- Node.js 20+, npm 10+
- Docker & Docker Compose

### 2. Install & Build

```bash
npm install
npm run build
```

### 3. Start Services

```bash
cp .env.example .env   # edit API_KEY_SALT for production
docker compose up --build -d
```

Default ports:
| Service | URL |
|---------|-----|
| SilverBullet | http://localhost:3000 |
| Gateway | http://localhost:8787 |

Verify Gateway is running:

```bash
curl http://localhost:8787/health
```

### 4. Create API Keys

Read-only key (for Cursor / Claude Code):

```bash
API_KEY_SALT=change-me npx tsx scripts/seed-apikey.ts \
  --space-dir /path/to/docker/volume \
  --name cursor-dev \
  --scopes catalog:read,memory:read
```

Read-write key (for maintainers):

```bash
API_KEY_SALT=change-me npx tsx scripts/seed-apikey.ts \
  --space-dir /path/to/docker/volume \
  --name maintainer \
  --scopes catalog:read,memory:read,memory:write
```

Save the output `secret` — it is shown only once.

> **Note**: `API_KEY_SALT` must match the value in your `.env` / `docker-compose.yml`.

### 5. Init Local Workspace

```bash
npx tsx packages/cli/src/index.ts init \
  --gateway-url http://localhost:8787 \
  --api-key "smk_..." \
  --default-namespace shared
```

Creates `.share-mem/config.json` in the current directory.

### 6. Sync Catalog to AI Clients

```bash
npx tsx packages/cli/src/index.ts sync --all
```

Generates:

| File | Purpose |
|------|---------|
| `.share-mem/catalog.json` | Local catalog cache |
| `.cursor/rules/shared-memory.mdc` | Cursor rules injection (lightweight catalog) |
| `CLAUDE.md` managed block | Claude Code injection (lightweight catalog) |

You can also target a single client: `--cursor` or `--claude-code`.

## Gateway API

All `/v1/*` endpoints require `Authorization: Bearer <secret>`.

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| GET | `/health` | — | Health check |
| GET | `/v1/catalog` | catalog:read | Lightweight catalog index |
| POST | `/v1/catalog/rebuild` | catalog:read | Force catalog rebuild |
| GET | `/v1/memory` | memory:read | Query/list memories (supports `?namespace=`, `?tag=`, `?search=`, `?limit=`, `?offset=`) |
| GET | `/v1/memory/:ns/:key` | memory:read | Get single memory with full content |
| POST | `/v1/memory/:ns/:key` | memory:write | Create or update memory |
| DELETE | `/v1/memory/:ns/:key` | memory:write | Delete memory |

### Examples

```bash
# Query by tag
curl -H "Authorization: Bearer $KEY" \
  "http://localhost:8787/v1/memory?tag=android"

# Keyword search
curl -H "Authorization: Bearer $KEY" \
  "http://localhost:8787/v1/memory?search=coding"

# Get full content
curl -H "Authorization: Bearer $KEY" \
  http://localhost:8787/v1/memory/shared/android-coding-standards

# Create memory
curl -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  http://localhost:8787/v1/memory/shared/android-coding-standards \
  -d '{
    "title": "Android coding standards",
    "tags": ["android", "shared"],
    "inject_mode": "always",
    "summary": "Use ktfmt and keep modules small.",
    "content": "# Android Standards\n\nPrefer feature modules..."
  }'
```

## CLI Commands

```bash
CLI="npx tsx packages/cli/src/index.ts"

$CLI init --gateway-url URL --api-key KEY --default-namespace NS
$CLI sync --all                           # sync catalog to all AI clients
$CLI list --tag android --query standards  # query index
$CLI get android-coding-standards          # read full content
$CLI set my-key --title "T" --content "C"  # create/update
$CLI delete my-key                         # delete
$CLI rebuild-catalog                       # force catalog rebuild
```

## MCP Server (AI Client Integration)

The MCP server runs locally as a stdio process, connecting AI clients to the remote Gateway.

### Configure in Cursor

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "share-mem": {
      "command": "node",
      "args": ["/absolute/path/to/packages/mcp-server/dist/index.js"],
      "env": {
        "SHARE_MEM_CONFIG": "/absolute/path/to/workspace/.share-mem/config.json"
      }
    }
  }
}
```

### Configure in Claude Code

Add to `.claude/settings.json`:

```json
{
  "mcpServers": {
    "share-mem": {
      "command": "node",
      "args": ["/absolute/path/to/packages/mcp-server/dist/index.js"],
      "env": {
        "SHARE_MEM_CONFIG": "/absolute/path/to/workspace/.share-mem/config.json"
      }
    }
  }
}
```

### Available MCP Tools

| Tool | Description |
|------|-------------|
| `memory_query` | Query index by tag, keyword, or namespace. Returns lightweight list. Set `with_content=true` for full markdown. |
| `memory_list` | List all entries with default pagination. Lightweight index only. |
| `memory_get` | Read one entry by namespace + key. Returns meta header + full markdown content. |

**Recommended workflow**: Use `memory_query` or `memory_list` to discover entries, then `memory_get` for full content.

### MCP Output Format

`memory_get` returns human-readable text, not JSON:

```
[shared/android-coding-standards] Android coding standards
Tags: android, shared | Updated: 2026-03-31
---
# Android Standards
Prefer feature modules...
```

`memory_query` / `memory_list` returns a lightweight index:

```
Found 3 memories:

1. [shared/android-coding-standards] Android coding standards
   Tags: android, shared | Updated: 2026-03-31
   Summary: Use ktfmt and keep modules small.

2. [shared/node-deployment] Node deployment
   Tags: backend, shared | Updated: 2026-03-31

Use memory_get to fetch full content of a specific entry.
```

## Data Storage

All data lives in the shared Docker volume at `/space`:

```
/space/
├── mem/
│   ├── <namespace>/
│   │   └── <key>.md        # Markdown + YAML frontmatter
│   └── _catalog.json        # Auto-maintained catalog index
└── apikey/
    └── <id>.json            # API key records (hashed)
```

Memory files use YAML frontmatter:

```markdown
---
title: Android coding standards
tags: [android, shared]
inject_mode: always
summary: Use ktfmt and keep modules small.
created_by: maintainer
created_at: 2026-03-31T10:00:00Z
updated_at: 2026-03-31T10:00:00Z
version: 1
---

# Android Standards
Prefer feature modules and baseline profiles...
```

## Development

```bash
npm install
npm run build          # build all packages
npm run typecheck      # type-check only
npm test               # run vitest (unit + integration + e2e)

npm run dev:gateway    # watch mode for gateway
npm run dev:cli        # watch mode for CLI
npm run dev:mcp        # watch mode for MCP server
```

### Project Layout

```
packages/
├── shared/         Types, validation, GatewayClient (dependency for all)
├── gateway/        Hono HTTP server, storage, services, auth
├── mcp-server/     MCP stdio server (local client → Gateway)
└── cli/            Commander CLI (local client → Gateway)
scripts/
└── seed-apikey.ts  API key generation utility
tests/
├── integration/    Gateway API + CLI tests (in-process)
└── e2e/            MCP stdio + API key smoke tests
```

## Key Design Decisions

- **Lightweight catalog injection**: Only tags + `always_inject` summaries are injected into LLM context (~200-400 tokens). Full content is fetched on demand.
- **Gateway owns business logic**: SilverBullet is storage + editing UI only. No SB plug/Lua dependencies.
- **MCP is a client, not a server**: MCP server runs locally, reads `.share-mem/config.json`, and forwards requests to the remote Gateway via HTTP.
- **Atomic file writes**: Write-to-temp + rename prevents corruption.
- **`inject_mode`**: `always` = included in catalog summaries, `on-demand` = discoverable via query, `archive` = hidden from active results.

## Notes

- `inject_mode=always` requires a `summary` field.
- `archive` entries are excluded from catalog and default queries.
- `sync` always refreshes `.share-mem/catalog.json` even if no client directories are detected.
- Catalog is auto-rebuilt on every create/update/delete. Use `rebuild-catalog` after editing files directly in SilverBullet.
- `namespace` allows `[a-z0-9-]`, `key` allows `[a-z0-9_.-]`. Path traversal is blocked.
