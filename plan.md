---
name: Share Memory System
overview: >-
  基于 SilverBullet 构建多人协同记忆管理系统，全栈 TypeScript，以 MCP 为通用接入层
  支持 Cursor/Claude Code/其他客户端。核心创新：两级记忆架构（轻量 Catalog 索引 +
  按需 Content 拉取）解决 LLM 上下文注入平衡问题。
todos:
  - id: p1-docker-scaffold
    content: "Phase1-T0: 项目骨架 + Docker 环境 (monorepo, docker-compose, Dockerfile)"
    status: pending
  - id: p1-shared-types
    content: "Phase1-T1: packages/shared 类型定义 + API Client"
    status: pending
  - id: p1-sb-plug
    content: "Phase1-T2: packages/sb-plug 实现 sb-mem Plug"
    status: pending
  - id: p1-gateway
    content: "Phase1-T3: packages/gateway 实现 HTTP Gateway"
    status: pending
  - id: p1-mcp-server
    content: "Phase1-T4: packages/mcp-server 实现 MCP Server"
    status: pending
  - id: p1-cli
    content: "Phase1-T5: packages/cli 实现 CLI 工具"
    status: pending
  - id: p1-apikey-seed
    content: "Phase1-T6: 服务端 API Key 种子脚本"
    status: pending
  - id: p1-e2e
    content: "Phase1-T7: 端到端联调验证 (含 docker compose up 全链路)"
    status: pending
isProject: true
deprecated: true
deprecation_note: "此文档已过时。架构决策已变更：MVP 不再依赖 SilverBullet Plug 执行链路，改为 Gateway 直接读写共享文件系统。请以 specs/001-share-memory-mvp/ 目录下的 spec.md、plan.md、tasks.md 为准。"
---

> ⚠️ **已过时文档**
>
> 本文档描述的架构方案已被废弃。当前 MVP 实现采用 **Gateway 直接读写共享文件系统** 的方案，不再依赖 SilverBullet 的 Lua/Plug 执行链路。
>
> **请以 [`specs/001-share-memory-mvp/`](specs/001-share-memory-mvp/) 目录下的最新设计文档为准。**

---

# Share Memory — 多人协同记忆管理系统 · 详细设计

---

## 一、总体架构

```mermaid
flowchart TB
    subgraph clients ["LLM Clients"]
        Cursor["Cursor<br/>.cursor/rules/ + MCP"]
        CC["Claude Code<br/>CLAUDE.md + MCP"]
        OtherLLM["Other Agents<br/>MCP only"]
    end

    subgraph local ["Local Side"]
        CLI["CLI: share-mem"]
        MCPServer["MCP Server (stdio)"]
        LocalFiles[".share-mem/<br/>config.json + catalog.json"]
        InjectFiles["Inject Files<br/>.cursor/rules/*.mdc<br/>CLAUDE.md"]
    end

    subgraph cloud ["Cloud Side"]
        GW["HTTP Gateway (Hono/TS)"]
        AuthMW["Auth Middleware"]
    end

    subgraph sb ["SilverBullet Instance"]
        SBRuntime["Runtime API<br/>POST /api/lua"]
        SBPlug["sb-mem Plug"]
        MemPages["mem/:ns/:key.md"]
        CatalogPage["mem/_catalog.json"]
        APIKeys["apikey/:id.json"]
    end

    Cursor --> MCPServer
    CC --> MCPServer
    OtherLLM --> MCPServer
    CLI --> LocalFiles
    CLI -->|sync| InjectFiles

    MCPServer -->|reads| LocalFiles
    MCPServer -->|HTTP| GW
    CLI -->|HTTP| GW

    GW --> AuthMW
    AuthMW -->|"SB_AUTH_TOKEN"| SBRuntime
    SBRuntime -->|"invokeFunction"| SBPlug
    SBPlug --> MemPages
    SBPlug --> CatalogPage
    SBPlug --> APIKeys
```

## 二、技术栈

| 组件 | 选型 | 理由 |
|------|------|------|
| SB Plug | TypeScript | SB Plug 系统要求 |
| Gateway | Hono + Node.js | 轻量、性能好、TS 原生 |
| MCP Server | `@modelcontextprotocol/sdk` + stdio | 官方 SDK，跨客户端兼容 |
| CLI | commander.js | 成熟、零配置 |
| Monorepo | npm workspaces | 简单够用，共享 `shared/` |
| 构建 | tsup | 快速 TS 编译打包 |

---

## 三、数据模型详细定义

### 3.1 Memory Entry（记忆条目）

存储路径：`mem/<namespace>/<key>.md`（SB 页面）

**Frontmatter 字段：**

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `title` | string | Y | — | 记忆标题，用于 catalog 展示 |
| `tags` | string[] | Y | `[]` | 分类标签，catalog 发现的核心维度 |
| `inject_mode` | enum | N | `"on-demand"` | `"always"` / `"on-demand"` / `"archive"` |
| `summary` | string | N | — | 简短摘要（inject_mode=always 时用于注入） |
| `created_by` | string | Y | — | 创建者标识（API Key name） |
| `created_at` | ISO8601 | Y | — | 创建时间 |
| `updated_at` | ISO8601 | Y | — | 最后更新时间 |
| `version` | number | Y | `1` | 版本号（每次更新 +1，Phase3 CAS 用） |

**TypeScript 类型定义（`shared/types.ts`）：**

```typescript
interface MemoryMeta {
  title: string;
  tags: string[];
  inject_mode: "always" | "on-demand" | "archive";
  summary?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  version: number;
}

interface MemoryEntry {
  namespace: string;
  key: string;
  meta: MemoryMeta;
  content: string; // Markdown body
}

interface MemoryListItem {
  namespace: string;
  key: string;
  title: string;
  tags: string[];
  inject_mode: string;
  summary?: string;
  updated_at: string;
}
```

### 3.2 Catalog（目录索引）

存储路径：`mem/_catalog.json`（SB 页面）

```typescript
interface CatalogTagEntry {
  tag: string;
  description: string; // 第一次为该 tag 写入记忆时手动设置，后续可改
  count: number;
}

interface CatalogAlwaysInjectEntry {
  namespace: string;
  key: string;
  title: string;
  summary: string;
}

interface Catalog {
  updated_at: string;
  always_inject: CatalogAlwaysInjectEntry[];
  tags: CatalogTagEntry[];
  total_entries: number;
}
```

**Catalog 维护规则：**
- `memSet` 写入后：增量更新 tags 计数；若 `inject_mode=always`，加入 `always_inject`
- `memDel` 删除后：减少对应 tags 计数；从 `always_inject` 移除
- `tags[].description`：首次写入含该 tag 的记忆时，若 description 为空则用记忆 title 填充；也可通过 API 手动设置
- `total_entries`：所有非 archive 记忆的总数

### 3.3 API Key

存储路径：`apikey/<id>.json`（SB 页面）

```typescript
interface ApiKey {
  id: string;            // 格式：smk_<nanoid(16)>
  name: string;          // 人类可读名称，如 "cursor-dev"
  key_hash: string;      // sha256(secret) 的 hex
  scopes: ApiScope[];
  created_at: string;
  expires_at: string | null; // null = 永不过期
  revoked: boolean;
  revoked_at?: string;
}

type ApiScope =
  | "memory:read"     // 读取记忆
  | "memory:write"    // 创建/更新/删除记忆
  | "catalog:read";   // 读取 catalog
```

**v1 密钥格式：** `smk_<base62(32)>` — 前缀 `smk_` 标识为 share-mem key，后接 32 位 base62 随机串。

### 3.4 本地配置文件

**`.share-mem/config.json`：**

```typescript
interface LocalConfig {
  server: string;           // Gateway URL，如 "https://sb-gw.example.com"
  api_key: string;          // smk_xxxxxxxx
  default_namespace: string; // 默认 "shared"
}
```

**`.share-mem/catalog.json`：** 与服务端 Catalog 结构一致，由 `sync` 命令拉取写入。

---

## 四、Gateway HTTP API 详细接口

### 4.0 通用约定

**请求头：**
```
Authorization: Bearer smk_xxxxxxxxxxxxxxxx
Content-Type: application/json
```

**统一响应格式：**

成功：
```json
{ "ok": true, "data": { ... } }
```

失败：
```json
{ "ok": false, "error": { "code": "ERROR_CODE", "message": "Human readable" } }
```

**错误码表：**

| HTTP | code | 说明 |
|------|------|------|
| 401 | `UNAUTHORIZED` | 缺少或无效 API Key |
| 403 | `FORBIDDEN` | Key 无所需 scope |
| 404 | `NOT_FOUND` | 记忆/namespace 不存在 |
| 409 | `CONFLICT` | 版本冲突（Phase3 CAS） |
| 422 | `VALIDATION_ERROR` | 请求参数校验失败 |
| 500 | `INTERNAL_ERROR` | 服务内部错误 |

### 4.1 GET /v1/catalog

获取完整 catalog 索引。

**所需 scope：** `catalog:read`

**Response 200：**
```json
{
  "ok": true,
  "data": {
    "updated_at": "2026-03-27T10:00:00Z",
    "always_inject": [
      { "namespace": "shared", "key": "project-rules", "title": "项目基本规则", "summary": "代码风格、PR规范、分支策略" }
    ],
    "tags": [
      { "tag": "android", "description": "Android 开发规范", "count": 15 },
      { "tag": "error-codes", "description": "系统错误码速查", "count": 32 }
    ],
    "total_entries": 55
  }
}
```

### 4.2 GET /v1/memory/:namespace/:key

获取单条记忆完整内容。

**所需 scope：** `memory:read`

**Response 200：**
```json
{
  "ok": true,
  "data": {
    "namespace": "shared",
    "key": "android-coding-standards",
    "meta": {
      "title": "Android 编码规范",
      "tags": ["android", "coding-standards"],
      "inject_mode": "on-demand",
      "summary": null,
      "created_by": "admin",
      "created_at": "2026-03-27T10:00:00Z",
      "updated_at": "2026-03-27T10:00:00Z",
      "version": 1
    },
    "content": "## 命名规范\n\nActivity 以 Activity 结尾..."
  }
}
```

### 4.3 POST /v1/memory/:namespace/:key

创建或更新记忆。若 key 已存在则更新（version 自动 +1）。

**所需 scope：** `memory:write`

**Request Body：**
```json
{
  "title": "Android 编码规范",
  "content": "## 命名规范\n...",
  "tags": ["android", "coding-standards"],
  "inject_mode": "on-demand",
  "summary": "团队 Android 编码规范"
}
```

| 字段 | 必填 | 说明 |
|------|------|------|
| `title` | 创建时 Y，更新时 N | 不传则保留原值 |
| `content` | Y | Markdown 正文 |
| `tags` | 创建时 Y，更新时 N | 不传则保留原值 |
| `inject_mode` | N | 默认 `"on-demand"` |
| `summary` | N | inject_mode=always 时建议提供 |

**Response 200：**
```json
{
  "ok": true,
  "data": {
    "namespace": "shared",
    "key": "android-coding-standards",
    "version": 2,
    "updated_at": "2026-03-27T11:00:00Z"
  }
}
```

### 4.4 DELETE /v1/memory/:namespace/:key

删除记忆。

**所需 scope：** `memory:write`

**Response 200：**
```json
{ "ok": true, "data": { "deleted": true } }
```

### 4.5 GET /v1/memory

列出/查询记忆条目（不含 content 正文）。

**所需 scope：** `memory:read`

**Query Parameters：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `namespace` | string | 可选，限定 namespace |
| `tag` | string | 可选，按标签过滤（多个用逗号分隔 `tag=android,coding`） |
| `search` | string | 可选，标题关键词搜索 |
| `limit` | number | 可选，默认 50，最大 200 |
| `offset` | number | 可选，默认 0 |

**Response 200：**
```json
{
  "ok": true,
  "data": {
    "items": [
      {
        "namespace": "shared",
        "key": "android-coding-standards",
        "title": "Android 编码规范",
        "tags": ["android", "coding-standards"],
        "inject_mode": "on-demand",
        "summary": null,
        "updated_at": "2026-03-27T10:00:00Z"
      }
    ],
    "total": 15,
    "limit": 50,
    "offset": 0
  }
}
```

---

## 五、SB Plug (sb-mem) 函数定义

### 5.0 Gateway → SB 调用方式

Gateway 通过 SB 的 HTTP API 执行 Lua 脚本调用 Plug 函数：

```
POST /api/lua
Authorization: Bearer <SB_AUTH_TOKEN>
Content-Type: text/lua

return system.invokeFunction("sb-mem.memGet", "shared", "android-coding-standards")
```

SB 返回 Plug 函数的 JSON 序列化结果。

### 5.1 memGet(namespace: string, key: string)

读取单条记忆。

**实现：** `space.readPage("mem/" + namespace + "/" + key)`，解析 frontmatter + body。

**返回：**
```json
{
  "found": true,
  "namespace": "shared",
  "key": "android-coding-standards",
  "meta": { "title": "...", "tags": [...], ... },
  "content": "Markdown body"
}
```

**未找到返回：** `{ "found": false }`

### 5.2 memSet(namespace: string, key: string, data: object)

写入/更新记忆。

**参数 `data`：**
```json
{
  "title": "Android 编码规范",
  "content": "## ...",
  "tags": ["android"],
  "inject_mode": "on-demand",
  "summary": null,
  "created_by": "admin"
}
```

**实现逻辑：**
1. 尝试 `space.readPage` 读取已有页面
2. 若存在：合并 meta（保留原 created_at/created_by，更新 updated_at，version +1）
3. 若不存在：新建，设置 created_at = now，version = 1
4. 拼接 frontmatter + content，调用 `space.writePage`
5. 调用 `catalogUpdate("set", namespace, key, mergedMeta)`

**返回：**
```json
{ "version": 2, "updated_at": "2026-03-27T11:00:00Z", "created": false }
```

### 5.3 memDel(namespace: string, key: string)

删除记忆。

**实现：** `space.deletePage("mem/" + namespace + "/" + key)` + `catalogUpdate("del", namespace, key, oldMeta)`

**返回：** `{ "deleted": true }`

### 5.4 memList(params: object)

列出记忆条目。

**参数：**
```json
{ "namespace": "shared", "tag": "android", "search": "编码", "limit": 50, "offset": 0 }
```

**实现：** 使用 SB 的 `space.listPages()` 过滤 `mem/` 前缀页面，读取 frontmatter，在 Plug 层做 tag/search 过滤和分页。

**返回：**
```json
{
  "items": [{ "namespace": "...", "key": "...", "title": "...", "tags": [...], ... }],
  "total": 15
}
```

### 5.5 catalogGet()

返回 `mem/_catalog.json` 的内容。

**实现：** `space.readPage("mem/_catalog")` 并解析 JSON。

### 5.6 catalogUpdate(action: "set"|"del", namespace: string, key: string, meta?: object)

增量更新 catalog。在 memSet/memDel 内部调用。

**逻辑：**
- `action="set"`：更新 tags 计数；若 `meta.inject_mode === "always"`，更新 `always_inject` 列表
- `action="del"`：减少 tags 计数（降为 0 则移除）；从 `always_inject` 移除
- 更新 `total_entries` 和 `updated_at`
- 写回 `space.writePage("mem/_catalog", ...)`

### 5.7 apiKeyVerify(keyPlaintext: string, requiredScope: string)

校验 API Key。

**实现：**
1. 计算 `sha256(keyPlaintext)` 得到 hash
2. 遍历 `apikey/*.json` 页面（或用缓存索引），查找 `key_hash` 匹配项
3. 检查 `revoked`、`expires_at`、`scopes` 是否包含 `requiredScope`

**返回：**
```json
{ "valid": true, "key_id": "smk_abc123", "name": "cursor-dev", "scopes": ["memory:read", "catalog:read"] }
```
```json
{ "valid": false, "reason": "revoked" }
```

### 5.8 apiKeySeed(name: string, scopes: string[])

v1 服务端密钥生成脚本专用。

**实现：**
1. 生成 `id = "smk_" + nanoid(16)`
2. 生成 `secret = "smk_" + base62(32)`
3. 计算 `key_hash = sha256(secret)`
4. 写入 `apikey/<id>.json`
5. 返回 `{ id, secret, scopes }`（secret 仅此一次返回）

---

## 六、MCP Server 工具和资源定义

### 6.0 配置

MCP Server 启动时读取 `.share-mem/config.json` 获取 `server` 和 `api_key`。
配置文件查找顺序：当前目录 → 父级目录递归 → `$HOME/.share-mem/config.json`。

### 6.1 Tool: memory_get

```json
{
  "name": "memory_get",
  "description": "获取指定记忆的完整内容。需要 namespace 和 key。",
  "inputSchema": {
    "type": "object",
    "properties": {
      "namespace": { "type": "string", "description": "记忆所在的命名空间" },
      "key": { "type": "string", "description": "记忆的唯一标识" }
    },
    "required": ["namespace", "key"]
  }
}
```

**返回格式：** 文本内容（text/plain），包含 meta 摘要头 + Markdown 正文。

```
[shared/android-coding-standards] Android 编码规范
Tags: android, coding-standards | Updated: 2026-03-27
---
## 命名规范
Activity 以 Activity 结尾...
```

### 6.2 Tool: memory_query

```json
{
  "name": "memory_query",
  "description": "按标签或关键词查询记忆。返回匹配的记忆列表及内容摘要。",
  "inputSchema": {
    "type": "object",
    "properties": {
      "tag": { "type": "string", "description": "标签过滤，多个用逗号分隔" },
      "search": { "type": "string", "description": "标题关键词搜索" },
      "namespace": { "type": "string", "description": "限定命名空间（可选）" },
      "with_content": { "type": "boolean", "description": "是否返回完整内容（默认 false，仅返回索引）", "default": false }
    }
  }
}
```

**返回格式（with_content=false）：**
```
Found 3 memories with tag "android":

1. [shared/android-coding-standards] Android 编码规范
   Tags: android, coding-standards | Updated: 2026-03-27

2. [shared/android-common-issues] Android 常见问题
   Tags: android, troubleshooting | Updated: 2026-03-25

3. [shared/android-arch-guide] Android 架构指南
   Tags: android, architecture | Updated: 2026-03-20

Use memory_get to fetch full content of a specific entry.
```

**返回格式（with_content=true）：** 依次列出每条记忆的完整内容。

### 6.3 Tool: memory_list

```json
{
  "name": "memory_list",
  "description": "列出所有可用记忆条目的索引（不含内容）。可按 namespace 或 tag 过滤。",
  "inputSchema": {
    "type": "object",
    "properties": {
      "namespace": { "type": "string" },
      "tag": { "type": "string" }
    }
  }
}
```

### 6.4 Tool: memory_set（Phase 2）

```json
{
  "name": "memory_set",
  "description": "创建或更新一条记忆。",
  "inputSchema": {
    "type": "object",
    "properties": {
      "namespace": { "type": "string" },
      "key": { "type": "string" },
      "title": { "type": "string" },
      "content": { "type": "string", "description": "Markdown 格式的记忆内容" },
      "tags": { "type": "array", "items": { "type": "string" } },
      "inject_mode": { "type": "string", "enum": ["always", "on-demand", "archive"] },
      "summary": { "type": "string" }
    },
    "required": ["namespace", "key", "title", "content", "tags"]
  }
}
```

### 6.5 Resource: share-mem://catalog

```json
{
  "uri": "share-mem://catalog",
  "name": "Shared Memory Catalog",
  "description": "团队共享记忆的标签索引和始终注入项",
  "mimeType": "application/json"
}
```

返回 Catalog JSON（与 GET /v1/catalog 响应的 data 部分一致）。

---

## 七、CLI 命令详细定义

全局安装后命令名为 `share-mem`（或 `smem` 短别名）。

### 7.1 share-mem init

```
share-mem init [--server <url>] [--key <api_key>] [--namespace <ns>]
```

**行为：**
1. 交互式或通过 flags 收集 server URL、API Key、默认 namespace
2. 向 Gateway `GET /v1/catalog` 发请求验证连接和鉴权
3. 验证通过后写入 `.share-mem/config.json`
4. 自动执行一次 `sync`

### 7.2 share-mem sync

```
share-mem sync [--cursor] [--claude-code] [--all]
```

**行为：**
1. 从 Gateway `GET /v1/catalog` 拉取 catalog
2. 写入 `.share-mem/catalog.json`
3. 检测当前目录环境（`.cursor/` 存在 → cursor；`CLAUDE.md` 或 `.claude/` 存在 → claude-code）
4. 或通过 `--cursor` / `--claude-code` / `--all` 显式指定
5. 根据目标客户端生成注入文件

**Cursor 注入文件生成逻辑** → `.cursor/rules/shared-memory.mdc`：
```
---
description: 共享记忆系统 - 团队知识索引
alwaysApply: true
---
# Shared Team Memory

可用记忆（通过 MCP memory_query / memory_get 工具查询完整内容）：
{{#each tags}}
- {{tag}} ({{count}}): {{description}}
{{/each}}

{{#if always_inject.length}}
## 始终可用
{{#each always_inject}}
- [{{namespace}}/{{key}}] {{title}}: {{summary}}
{{/each}}
{{/if}}

synced: {{updated_at}}
```

**Claude Code 注入文件生成逻辑** → 在 `CLAUDE.md` 末尾追加或更新 `<!-- share-mem:start -->...<!-- share-mem:end -->` 标记块。

### 7.3 share-mem get

```
share-mem get <namespace/key>
```

**行为：** 调用 `GET /v1/memory/:ns/:key`，输出 Markdown 内容到 stdout。

### 7.4 share-mem set

```
share-mem set <namespace/key> --title <title> --tags <tag1,tag2> [--inject-mode <mode>] [--summary <text>] [--file <path> | --stdin]
```

**行为：**
1. 从 `--file` 或 stdin 读取 content
2. 调用 `POST /v1/memory/:ns/:key`
3. 输出创建/更新结果

### 7.5 share-mem list

```
share-mem list [--namespace <ns>] [--tag <tag>] [--search <keyword>]
```

**行为：** 调用 `GET /v1/memory?...`，表格输出条目索引。

### 7.6 share-mem delete

```
share-mem delete <namespace/key> [--yes]
```

**行为：** 确认后调用 `DELETE /v1/memory/:ns/:key`。

---

## 八、多客户端 Catalog 注入机制

### 8.1 设计原则

- 注入内容控制在 **200-400 tokens**（约 15-25 行）
- 只包含标签索引和 always_inject 摘要
- 不包含任何记忆正文内容
- 引导 LLM 使用 MCP 工具按需获取完整内容

### 8.2 Cursor 注入

文件：`.cursor/rules/shared-memory.mdc`

```markdown
---
description: 共享记忆系统 - 团队知识索引
alwaysApply: true
---
# Shared Team Memory

你可以通过 MCP 工具访问团队共享记忆。

## 可用主题
- android (15): Android 开发规范和常见问题
- error-codes (32): 各系统错误码速查
- project-mgmt (8): 项目管理SOP和模板

## 使用方式
- `memory_query(tag="android")` — 按标签查询记忆列表
- `memory_get(namespace="shared", key="android-coding-standards")` — 获取具体记忆
- `memory_list()` — 查看所有可用记忆

synced: 2026-03-27 10:00
```

### 8.3 Claude Code 注入

在 `CLAUDE.md` 中用标记块管理：

```markdown
<!-- share-mem:start -->
## Shared Team Memory

Available via MCP tools: memory_query, memory_get, memory_list.

Topics: android(15), error-codes(32), project-mgmt(8).

Example: memory_query(tag="android") to browse, memory_get(namespace="shared", key="android-coding-standards") to read.
<!-- share-mem:end -->
```

`sync` 命令替换标记块之间的内容，保留 CLAUDE.md 其他内容不变。

---

## 九、项目文件结构

```
share_mem/
├── package.json              # npm workspace root
├── tsconfig.base.json        # 共享 TS 配置
├── docker-compose.yml        # 本地开发：SB + Gateway 一键启动
├── docker-compose.prod.yml   # 生产参考配置
├── .env.example              # 环境变量模板
├── .dockerignore
│
├── packages/
│   ├── shared/               # T1: 共享类型 + API Client
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── types.ts          # Memory, Catalog, ApiKey, Config 类型
│   │       ├── api-client.ts     # GatewayClient class
│   │       └── index.ts          # 导出
│   │
│   ├── sb-plug/              # T2: SilverBullet Plug
│   │   ├── package.json
│   │   ├── sb-mem.plug.yaml      # Plug 声明文件
│   │   └── src/
│   │       ├── memory.ts         # memGet/memSet/memDel/memList
│   │       ├── catalog.ts        # catalogGet/catalogUpdate
│   │       └── apikey.ts         # apiKeyVerify/apiKeySeed
│   │
│   ├── gateway/              # T3: HTTP Gateway
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── Dockerfile            # 多阶段构建镜像
│   │   └── src/
│   │       ├── index.ts          # Hono app 入口 + 启动
│   │       ├── routes/
│   │       │   ├── catalog.ts    # GET /v1/catalog
│   │       │   └── memory.ts     # GET/POST/DELETE /v1/memory
│   │       ├── middleware/
│   │       │   └── auth.ts       # API Key 校验中间件
│   │       ├── services/
│   │       │   └── sb-client.ts  # SB Runtime API Lua 调用封装
│   │       └── env.ts            # 环境变量: SB_URL, SB_AUTH_TOKEN, PORT
│   │
│   ├── mcp-server/           # T4: MCP Server（本地运行，不容器化）
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts          # MCP Server stdio 入口
│   │       ├── tools.ts          # memory_get/query/list tool handlers
│   │       ├── resources.ts      # catalog resource handler
│   │       └── config.ts         # 读取 .share-mem/config.json
│   │
│   └── cli/                  # T5: CLI 工具（本地运行，不容器化）
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts          # commander 入口
│           ├── commands/
│           │   ├── init.ts
│           │   ├── sync.ts       # 核心：拉 catalog + 生成注入文件
│           │   ├── get.ts
│           │   ├── set.ts
│           │   ├── list.ts
│           │   └── delete.ts
│           └── lib/
│               ├── config.ts     # 读写 .share-mem/config.json
│               └── inject.ts     # 生成 Cursor Rule / CLAUDE.md 注入内容
│
├── scripts/
│   └── seed-apikey.ts        # T6: 服务端 API Key 种子生成脚本
│
├── plan.md                   # 本文档
└── mem9-vs-silverbullet-memory-architecture.md
```

---

## 十、Docker 容器化部署设计

### 10.0 容器化范围

| 组件 | 是否容器化 | 说明 |
|------|-----------|------|
| SilverBullet | Y | 官方镜像 `zefhemel/silverbullet`，挂载 sb-mem Plug |
| Gateway | Y | 自定义 Dockerfile，多阶段构建 |
| MCP Server | N | 运行在 LLM 客户端本地（stdio 进程） |
| CLI | N | 本地命令行工具 |

### 10.1 容器网络架构

```mermaid
flowchart LR
    subgraph docker_net ["Docker Network: share-mem-net"]
        SB["silverbullet:3000<br/>(internal only)"]
        GW["gateway:3000<br/>→ host:3000"]
    end

    subgraph external ["External (Host / Internet)"]
        CLIHost["CLI / MCP Server"]
        LLMClients["LLM Clients"]
    end

    GW -->|"http://silverbullet:3000<br/>SB_AUTH_TOKEN"| SB
    CLIHost -->|"http://localhost:3000<br/>API Key"| GW
    LLMClients -->|"via MCP → Gateway"| GW
```

- SilverBullet **不暴露到宿主机**（仅 Gateway 通过内部网络访问）
- Gateway **暴露 3000 端口**到宿主机，接受外部 CLI/MCP 请求
- 两个容器通过 Docker 内部网络 `share-mem-net` 通信

### 10.2 环境变量

**`.env.example`（提交到仓库的模板）：**

```bash
# SilverBullet
SB_USER=admin                    # SB 登录用户名
SB_PASSWORD=changeme             # SB 登录密码（设置后 SB 启用认证）

# Gateway
SB_URL=http://silverbullet:3000  # Docker 内部网络地址
SB_AUTH_TOKEN=admin:changeme     # Gateway 访问 SB 的认证凭据（user:password）
GATEWAY_PORT=3000                # Gateway 监听端口
```

**`.env`（不提交，本地创建）：** 从 `.env.example` 复制并填写实际值。

### 10.3 docker-compose.yml（本地开发）

```yaml
services:
  silverbullet:
    image: zefhemel/silverbullet:latest
    volumes:
      - sb-space:/space
      # 挂载编译后的 sb-mem Plug 到 SB 空间
      - ./packages/sb-plug/dist:/space/_plug/sb-mem:ro
    environment:
      SB_USER: "${SB_USER}:${SB_PASSWORD}"
    networks:
      - share-mem-net
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000"]
      interval: 10s
      timeout: 5s
      retries: 3

  gateway:
    build:
      context: .
      dockerfile: packages/gateway/Dockerfile
    ports:
      - "${GATEWAY_PORT:-3000}:3000"
    environment:
      SB_URL: "${SB_URL:-http://silverbullet:3000}"
      SB_AUTH_TOKEN: "${SB_AUTH_TOKEN}"
      PORT: "3000"
    depends_on:
      silverbullet:
        condition: service_healthy
    networks:
      - share-mem-net

volumes:
  sb-space:
    name: share-mem-sb-space

networks:
  share-mem-net:
    name: share-mem-net
```

### 10.4 Gateway Dockerfile（多阶段构建）

`packages/gateway/Dockerfile`：

```dockerfile
# ---- Stage 1: Build ----
FROM node:20-slim AS builder

WORKDIR /app

# 复制 workspace 根配置
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/gateway/package.json ./packages/gateway/

# 安装依赖（利用 Docker 缓存层）
RUN npm ci --workspace=packages/shared --workspace=packages/gateway

# 复制源码
COPY tsconfig.base.json ./
COPY packages/shared/ ./packages/shared/
COPY packages/gateway/ ./packages/gateway/

# 编译：先 shared 再 gateway
RUN npm run build -w packages/shared && npm run build -w packages/gateway

# ---- Stage 2: Production ----
FROM node:20-slim

WORKDIR /app

# 只复制产物和运行时依赖
COPY --from=builder /app/packages/gateway/dist ./dist
COPY --from=builder /app/packages/gateway/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/dist ./node_modules/@share-mem/shared/dist
COPY --from=builder /app/packages/shared/package.json ./node_modules/@share-mem/shared/

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "dist/index.js"]
```

### 10.5 SB Plug 部署方式

SilverBullet Plug 不需要独立容器，而是**挂载到 SB 容器的空间中**：

**开发阶段：**
- 在宿主机编译 Plug：`npm run build -w packages/sb-plug`
- 编译产物 `packages/sb-plug/dist/` 通过 volume 挂载到 SB 容器的 `/space/_plug/sb-mem/`
- 修改 Plug 后重新编译，SB 自动热加载

**生产阶段（可选自定义镜像）：**

```dockerfile
# deploy/Dockerfile.silverbullet（生产用，Phase 3）
FROM zefhemel/silverbullet:latest
COPY packages/sb-plug/dist/ /space/_plug/sb-mem/
```

Phase 1 直接用 volume 挂载即可。

### 10.6 .dockerignore

```
node_modules
*/node_modules
**/dist
.git
.env
.share-mem
*.md
!packages/*/package.json
```

### 10.7 开发工作流

```bash
# 1. 首次启动
cp .env.example .env           # 编辑填写密码
npm install                    # 安装所有依赖
npm run build -w packages/shared
npm run build -w packages/sb-plug
docker compose up -d           # 启动 SB + Gateway

# 2. 生成 API Key（SB 启动后）
npx tsx scripts/seed-apikey.ts --name "dev" --scopes "memory:read,memory:write,catalog:read"
# → 输出 smk_xxxxxx，填入 .share-mem/config.json 或 share-mem init

# 3. 验证
curl http://localhost:3000/v1/catalog -H "Authorization: Bearer smk_xxxxxx"

# 4. 开发迭代
npm run dev -w packages/gateway  # 本地热重载开发（绕过 Docker，直连 SB 容器）
```

### 10.8 未来 K8s 部署（Phase 3+）

Phase 1 不涉及 K8s。后续生产化时，结构规划：

```
deploy/
├── k8s/
│   ├── namespace.yaml
│   ├── silverbullet/
│   │   ├── deployment.yaml
│   │   ├── service.yaml        # ClusterIP（内部访问）
│   │   └── pvc.yaml            # PersistentVolumeClaim
│   ├── gateway/
│   │   ├── deployment.yaml
│   │   ├── service.yaml        # LoadBalancer 或 Ingress
│   │   └── configmap.yaml      # 环境变量
│   └── ingress.yaml            # 可选：统一入口
├── Dockerfile.silverbullet     # 生产 SB 镜像（内置 Plug）
└── helm/                       # 可选 Helm Chart
```

---

## 十一、Phase 1 详细任务分解

### T0: 项目骨架 + Docker 环境

**依赖：** 无（最先实现）

**任务清单：**
1. 初始化 monorepo：根 `package.json`（npm workspaces）、`tsconfig.base.json`
2. 创建 `.env.example`、`.dockerignore`、`.gitignore`
3. 创建 `docker-compose.yml`（SB + Gateway 服务定义）
4. 创建 `packages/gateway/Dockerfile`（多阶段构建）
5. 验证 `docker compose up silverbullet` 能启动 SB 实例并访问

**完成标准：** `docker compose up silverbullet` 后访问 `http://localhost:3001` 能看到 SB 界面（开发调试时可临时暴露端口）。

---

### T1: packages/shared — 类型定义 + API Client

**依赖：** T0（项目骨架）

**任务清单：**
1. 初始化 `packages/shared/package.json`（name: `@share-mem/shared`）
2. 创建 `tsconfig.json` 继承 root
3. 实现 `src/types.ts`：
   - `MemoryMeta`, `MemoryEntry`, `MemoryListItem`
   - `Catalog`, `CatalogTagEntry`, `CatalogAlwaysInjectEntry`
   - `ApiKey`, `ApiScope`
   - `LocalConfig`
   - `ApiResponse<T>`, `ApiError` — 统一响应包装
4. 实现 `src/api-client.ts`：
   - `class GatewayClient { constructor(server: string, apiKey: string) }`
   - `getCatalog(): Promise<Catalog>`
   - `getMemory(ns: string, key: string): Promise<MemoryEntry>`
   - `setMemory(ns: string, key: string, data: SetMemoryInput): Promise<SetMemoryResult>`
   - `deleteMemory(ns: string, key: string): Promise<void>`
   - `listMemory(params: ListMemoryParams): Promise<ListMemoryResult>`
   - 内部用 `fetch` 调用，统一错误处理
5. 导出 `src/index.ts`

**完成标准：** 类型可被其他 packages import；GatewayClient 可实例化（API 调用待 Gateway 就绪后联调）。

---

### T2: packages/sb-plug — SilverBullet Plug

**依赖：** T1（类型定义）

**任务清单：**
1. 初始化 `packages/sb-plug/package.json`
2. 创建 `sb-mem.plug.yaml` — Plug 声明，注册所有导出函数
3. 实现 `src/memory.ts`：
   - `memGet(ns, key)` — readPage → 解析 frontmatter + body → 返回 MemoryEntry
   - `memSet(ns, key, data)` — 读取已有 → 合并 meta → writePage → catalogUpdate
   - `memDel(ns, key)` — readPage 获取 meta → deletePage → catalogUpdate
   - `memList(params)` — listPages("mem/") → 过滤/搜索/分页
4. 实现 `src/catalog.ts`：
   - `catalogGet()` — readPage("mem/_catalog") → parse JSON
   - `catalogUpdate(action, ns, key, meta)` — 增量更新 tags/always_inject/total
   - 首次无 _catalog 时自动创建空 catalog
5. 实现 `src/apikey.ts`：
   - `apiKeyVerify(plaintext, requiredScope)` — hash → 遍历 apikey/*.json → 匹配+校验
   - `apiKeySeed(name, scopes)` — 生成 id/secret → hash → writePage → 返回 secret

**完成标准：** 在 SB 实例中安装 Plug 后，可通过 Lua `system.invokeFunction` 正确执行所有函数。

**需要确认的 SB API：**
- `space.readPage(path)` 返回格式（含 frontmatter？纯文本？）
- `space.writePage(path, content)` 写入格式
- `space.listPages(prefix)` 返回格式
- `space.deletePage(path)` 行为

---

### T3: packages/gateway — HTTP Gateway

**依赖：** T1（类型定义），T2（Plug 已部署到 SB）

**任务清单：**
1. 初始化 `packages/gateway/package.json`，依赖 `hono`, `@share-mem/shared`
2. 实现 `src/env.ts`：
   - `SB_URL` — SilverBullet 实例地址
   - `SB_AUTH_TOKEN` — SB 认证 token
   - `PORT` — Gateway 监听端口（默认 3000）
3. 实现 `src/services/sb-client.ts`：
   - `class SBClient { constructor(sbUrl: string, sbToken: string) }`
   - `invokePlug(fn: string, ...args: any[]): Promise<any>` — 拼接 Lua 脚本 → POST /api/lua
   - Lua 模板：`return system.invokeFunction("sb-mem.{fn}", {args...})`
4. 实现 `src/middleware/auth.ts`：
   - 提取 `Authorization: Bearer xxx`
   - 调用 SBClient → `apiKeyVerify(key, route所需scope)`
   - 校验通过挂载 `c.set("apiKey", keyInfo)`，失败返回 401/403
5. 实现 `src/routes/catalog.ts`：
   - `GET /v1/catalog` → `sbClient.invokePlug("catalogGet")`
6. 实现 `src/routes/memory.ts`：
   - `GET /v1/memory/:ns/:key` → `sbClient.invokePlug("memGet", ns, key)`
   - `POST /v1/memory/:ns/:key` → 校验 body → `sbClient.invokePlug("memSet", ns, key, body)`
   - `DELETE /v1/memory/:ns/:key` → `sbClient.invokePlug("memDel", ns, key)`
   - `GET /v1/memory` → 解析 query params → `sbClient.invokePlug("memList", params)`
7. 实现 `src/index.ts`：
   - 注册路由 + middleware
   - 统一错误处理
   - 启动 `Bun.serve` 或 `node:http`

**完成标准：** `curl -H "Authorization: Bearer smk_xxx" http://localhost:3000/v1/catalog` 返回正确 catalog。

---

### T4: packages/mcp-server — MCP Server

**依赖：** T1（类型 + API Client）

**任务清单：**
1. 初始化 `packages/mcp-server/package.json`，依赖 `@modelcontextprotocol/sdk`, `@share-mem/shared`
2. 实现 `src/config.ts`：
   - 按优先级查找 `.share-mem/config.json`：`cwd → parent dirs → $HOME`
   - 解析并返回 `LocalConfig`
3. 实现 `src/tools.ts`：
   - `memory_get` handler：调用 `GatewayClient.getMemory` → 格式化为可读文本
   - `memory_query` handler：调用 `GatewayClient.listMemory` → 格式化
   - `memory_list` handler：调用 `GatewayClient.listMemory` → 精简索引格式
4. 实现 `src/resources.ts`：
   - 注册 `share-mem://catalog` resource
   - handler：调用 `GatewayClient.getCatalog` → 返回 JSON
5. 实现 `src/index.ts`：
   - 创建 MCP Server（stdio transport）
   - 注册 tools + resources
   - 启动

**完成标准：** 在 Cursor MCP 配置中添加后，能通过 MCP 工具查询到记忆；在 Claude Code 中同样可用。

**MCP 客户端配置示例：**

Cursor（`.cursor/mcp.json`）：
```json
{
  "mcpServers": {
    "share-mem": {
      "command": "npx",
      "args": ["@share-mem/mcp-server"]
    }
  }
}
```

Claude Code（`.claude/mcp.json` 或 `claude_desktop_config.json`）：
```json
{
  "mcpServers": {
    "share-mem": {
      "command": "npx",
      "args": ["@share-mem/mcp-server"]
    }
  }
}
```

---

### T5: packages/cli — CLI 工具

**依赖：** T1（类型 + API Client）

**任务清单：**
1. 初始化 `packages/cli/package.json`，bin: `share-mem`，依赖 `commander`, `@share-mem/shared`
2. 实现 `src/lib/config.ts`：
   - `readConfig(): LocalConfig` — 读取 `.share-mem/config.json`
   - `writeConfig(config)` — 写入配置
   - 配置查找逻辑同 MCP Server
3. 实现 `src/lib/inject.ts`：
   - `generateCursorRule(catalog: Catalog): string` — 生成 .mdc 文件内容
   - `generateClaudeBlock(catalog: Catalog): string` — 生成 CLAUDE.md 标记块
   - `writeCursorRule(content: string)` — 写入 `.cursor/rules/shared-memory.mdc`
   - `updateClaudeMd(block: string)` — 读取 CLAUDE.md → 替换/追加标记块 → 写回
   - `detectClients(): string[]` — 检测 `.cursor/`、`.claude/`、`CLAUDE.md` 存在情况
4. 实现各命令：
   - `src/commands/init.ts` — 交互式收集配置 → 验证连接 → 写配置 → 执行 sync
   - `src/commands/sync.ts` — getCatalog → 写 catalog.json → 检测/生成注入文件
   - `src/commands/get.ts` — getMemory → 输出 content
   - `src/commands/set.ts` — 读 stdin/file → setMemory → 输出结果
   - `src/commands/list.ts` — listMemory → 表格输出
   - `src/commands/delete.ts` — 确认 → deleteMemory

**完成标准：** `share-mem init` → `share-mem set shared/test --title "Test" --tags test < content.md` → `share-mem get shared/test` → `share-mem sync --cursor` 完整流程通过。

---

### T6: 服务端 API Key 种子脚本

**依赖：** T2（SB Plug 已部署）

**任务清单：**
1. 创建 `scripts/seed-apikey.ts`
2. 逻辑：连接 SB → 调用 `apiKeySeed(name, scopes)` → 打印 secret 到 stdout
3. 用法：`npx tsx scripts/seed-apikey.ts --name "dev-key" --scopes "memory:read,memory:write,catalog:read"`

**完成标准：** 运行脚本后，Gateway 可用返回的 secret 通过鉴权。

---

### T7: 端到端联调验证

**依赖：** T1-T6 全部完成

**验证清单：**

| # | 场景 | 验证方式 | 预期结果 |
|---|------|----------|----------|
| 1 | 种子密钥 | 运行 seed-apikey.ts | 输出 smk_xxx secret |
| 2 | Gateway 鉴权 | curl /v1/catalog 无 header | 401 UNAUTHORIZED |
| 3 | Gateway 鉴权 | curl /v1/catalog 带正确 key | 200 + catalog JSON |
| 4 | 写入记忆 | CLI `share-mem set shared/test ...` | 200 + version=1 |
| 5 | 读取记忆 | CLI `share-mem get shared/test` | 输出正文内容 |
| 6 | Catalog 更新 | curl /v1/catalog | tags/total 反映新增记忆 |
| 7 | 列表查询 | CLI `share-mem list --tag test` | 显示 test 条目 |
| 8 | 删除记忆 | CLI `share-mem delete shared/test --yes` | 删除成功 |
| 9 | Catalog 删后 | curl /v1/catalog | tags/total 反映减少 |
| 10 | Sync 生成 | `share-mem sync --cursor` | `.cursor/rules/shared-memory.mdc` 生成正确 |
| 11 | MCP Cursor | Cursor 中调用 memory_query | 返回记忆列表 |
| 12 | MCP CC | Claude Code 中调用 memory_get | 返回记忆内容 |

---

## 十二、Phase 2 任务概要（增强写入 + 标签管理）

| Task | 内容 | 依赖 |
|------|------|------|
| P2-T1 | MCP `memory_set` tool 实现 | Phase1 |
| P2-T2 | `always_inject` 内容注入：sync 时拉取 always 记忆内容，直接嵌入注入文件 | Phase1 |
| P2-T3 | 标签 description 管理：`POST /v1/tags/:tag` 设置描述 | Phase1 |
| P2-T4 | `share-mem tag list/rename/merge` CLI 命令 | P2-T3 |
| P2-T5 | Cursor Skill 可选增强（memory-query/memory-write） | Phase1 |

## 十三、Phase 3 任务概要（生产化）

| Task | 内容 | 依赖 |
|------|------|------|
| P3-T1 | CLI `share-mem keygen` + `POST /v1/apikey/create` API | Phase1 |
| P3-T2 | API Key scope 精细化：namespace 级别隔离 | P3-T1 |
| P3-T3 | CAS 冲突处理：POST 时传 `expected_version`，409 冲突 | Phase1 |
| P3-T4 | 审计日志：memSet/memDel 写入 `audit/*.json` | Phase1 |
| P3-T5 | 全文搜索增强：SB space query 或外接搜索引擎 | Phase1 |
| P3-T6 | 多租户/团队：namespace 与 API Key 绑定 | P3-T2 |

---

## 十四、关键调用链路图

### 写入记忆完整链路

```mermaid
sequenceDiagram
    participant LLM as LLM Client
    participant MCP as MCP Server
    participant GW as Gateway
    participant SB as SilverBullet
    participant Plug as sb-mem Plug

    LLM->>MCP: memory_set(ns, key, title, content, tags)
    MCP->>MCP: 读取 .share-mem/config.json
    MCP->>GW: POST /v1/memory/:ns/:key<br/>Authorization: Bearer smk_xxx
    GW->>SB: POST /api/lua<br/>apiKeyVerify(smk_xxx, "memory:write")
    SB->>Plug: apiKeyVerify()
    Plug-->>SB: {valid: true, scopes: [...]}
    SB-->>GW: 鉴权通过
    GW->>SB: POST /api/lua<br/>memSet(ns, key, data)
    SB->>Plug: memSet()
    Plug->>SB: space.writePage("mem/ns/key.md")
    Plug->>Plug: catalogUpdate("set", ns, key, meta)
    Plug->>SB: space.writePage("mem/_catalog.json")
    Plug-->>SB: {version: 1, updated_at: "..."}
    SB-->>GW: result
    GW-->>MCP: {ok: true, data: {version: 1}}
    MCP-->>LLM: Memory saved: ns/key (v1)
```

### Catalog 同步链路

```mermaid
sequenceDiagram
    participant User as 用户
    participant CLI as share-mem CLI
    participant GW as Gateway
    participant FS as 本地文件系统

    User->>CLI: share-mem sync --cursor --claude-code
    CLI->>CLI: 读取 .share-mem/config.json
    CLI->>GW: GET /v1/catalog<br/>Authorization: Bearer smk_xxx
    GW-->>CLI: Catalog JSON
    CLI->>FS: 写入 .share-mem/catalog.json
    CLI->>CLI: generateCursorRule(catalog)
    CLI->>FS: 写入 .cursor/rules/shared-memory.mdc
    CLI->>CLI: generateClaudeBlock(catalog)
    CLI->>FS: 更新 CLAUDE.md 标记块
    CLI-->>User: Synced. Cursor rule + CLAUDE.md updated.
```
