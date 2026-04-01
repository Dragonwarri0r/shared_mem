# Implementation Plan: Share Memory System MVP

**Branch**: `[001-share-memory-mvp]` | **Date**: 2026-03-31 | **Spec**: [/Users/youxuezhe/vsproj/share_mem/specs/001-share-memory-mvp/spec.md](/Users/youxuezhe/vsproj/share_mem/specs/001-share-memory-mvp/spec.md)
**Input**: Feature specification from `/specs/001-share-memory-mvp/spec.md`

## Summary

构建一个 Docker 化的 Share Memory MVP：以 SilverBullet 作为共享内容存储与 Web 编辑界面，以 Gateway 作为业务中枢，对外提供鉴权、记忆 CRUD、catalog 聚合与本地客户端接入。MCP Server 与 CLI 运行在用户本地，复用统一的 API Client 访问 Gateway；默认注入只同步轻量 catalog，不直接注入普通记忆正文。

与根目录旧方案相比，本计划的关键调整是：MVP 不把核心业务逻辑放进 SilverBullet plug，也不依赖未验证的远程 Lua/Plug 执行链路，而是让 Gateway 直接读写与 SilverBullet 共享的空间目录，从而保持 Docker 部署简单、实现可控、架构与 spec 一致。

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 20  
**Primary Dependencies**: Hono, `@modelcontextprotocol/sdk`, commander, tsup, nanoid, `gray-matter`, `async-mutex`, Node `fs/promises`  
**Storage**: Docker 共享卷中的 SilverBullet space 文件系统；记忆为 Markdown + frontmatter，catalog/API keys 为 JSON 文件  
**Testing**: Vitest 用于单元与集成测试，Node 脚本/CLI + `docker compose` 用于端到端 smoke 验证  
**Target Platform**: Docker Compose 中运行的 SilverBullet + Gateway；本地 macOS/Linux 上运行 CLI 与 MCP Server  
**Project Type**: npm workspaces monorepo（service + CLI + MCP + shared package）  
**Performance Goals**: 单条记忆读取和 catalog 查询在本地网络/单机 Docker 环境下 p95 小于 300ms；`sync` 生成注入文件在 50 条活跃记忆下小于 2 秒  
**Constraints**: 默认注入体量需控制在约 200-400 tokens；不得依赖未验证的 SB 服务端 Lua；写文件必须原子化；路径必须防止穿越；v1 采用 last-write-wins，不实现 CAS  
**Scale/Scope**: 单团队共享空间，数百条活跃记忆、数十个标签、多个本地 AI 客户端共享访问

## Constitution Check

当前仓库中的 `.specify/memory/constitution.md` 仍是占位模板，暂无正式生效的项目宪章。为避免计划失焦，本特性采用以下临时架构门禁，并全部满足：

1. **Docker-first**: 运行形态以 `docker compose` 为准，SilverBullet 与 Gateway 必须能容器化协同运行。  
   状态：通过。
2. **Gateway-owned business logic**: 记忆读写、catalog 维护、鉴权、错误语义由 Gateway 统一负责。  
   状态：通过。
3. **SilverBullet as storage/UI**: SilverBullet 负责内容承载和人类编辑入口，不承担 MVP 的核心业务编排。  
   状态：通过。
4. **Thin client injection**: Cursor/Claude Code 注入文件只承载轻量索引与工具指引。  
   状态：通过。
5. **Shared contracts**: Gateway、CLI、MCP 使用统一类型和响应模型，避免协议漂移。  
   状态：通过。

## Architecture Decisions

### 1. SilverBullet integration mode

Gateway 与 SilverBullet 共用同一个 Docker volume，并直接读写 SilverBullet 的 `/space` 目录：

- 记忆文件路径：`/space/mem/<namespace>/<key>.md`
- catalog 文件路径：`/space/mem/_catalog.json`
- API key 文件路径：`/space/apikey/<id>.json`

这样可以让 SilverBullet 立即展示 Gateway 写入的内容，也让用户在 Web UI 中直接编辑或查看这些页面。

### 1.1 SilverBullet editing policy

v1 阶段对 SilverBullet UI 的直接编辑做如下约束：

- Gateway 是唯一的 catalog 维护者
- 用户可以在 SilverBullet UI 中直接编辑记忆页面
- 这类直接编辑不会自动触发 catalog 增量更新
- 管理员需要通过 `share-mem rebuild-catalog` 手动重建 catalog
- 后续阶段再评估通过 Hook 或文件变更监听自动同步

### 2. Storage model

记忆正文以 Markdown 文件保存，frontmatter 存储结构化元信息。Gateway 在读写时负责：

- 解析 frontmatter 与正文
- 校验 `namespace` / `key` / `tags`
- 计算版本与时间戳
- 维护 `catalog`
- 对 JSON/Markdown 进行原子写入

### 2.1 Path validation rules

MVP 对路径字段采用白名单校验：

```ts
const NAMESPACE_REGEX = /^[a-z0-9-]{1,64}$/;
const KEY_REGEX = /^[a-z0-9_.-]{1,128}$/;
```

附加规则：

- `namespace` 只允许小写字母、数字、连字符
- `key` 只允许小写字母、数字、连字符、下划线、点
- 禁止包含 `..`
- 禁止包含 `/` 或 `\\`
- 非法值统一返回 `422 VALIDATION_ERROR`

### 3. Catalog maintenance

v1 以“写入时增量更新”为主，并保留一个内部 `rebuildCatalog()` 能力用于首次初始化和故障恢复。catalog 只聚合活跃条目，`archive` 不参与计数。

### 3.1 Catalog rebuild triggers

`rebuildCatalog()` 的触发条件如下：

- 首次启动且 `_catalog.json` 不存在时，Gateway 自动重建
- 管理员可通过 `share-mem rebuild-catalog` 手动触发
- catalog 损坏、缺失或与文件系统状态不一致时，不自动修复，由管理员手动重建
- 通过 SilverBullet UI 直接编辑记忆后，如需刷新索引，也通过管理员手动重建

### 4. Concurrency model

MVP 采用 last-write-wins。Gateway 对单进程内的写操作使用 `async-mutex` 的 `Mutex` 实现内存级互斥，文件落盘采用“临时文件 + rename”原子写策略。跨容器/跨进程复杂冲突处理留到后续 Phase 处理。

### 5. Auth model

API Key 元数据与哈希存放在 `/space/apikey/*.json`。Gateway 在每次请求中：

- 提取 `Authorization: Bearer <secret>`
- 计算 `sha256(secret)`
- 在 API key 存储中查找匹配项
- 校验 `revoked`、`expires_at`、`scopes`

CLI 的种子脚本直接通过 Gateway 或共享存储写入新 key 文件，明文 secret 只输出一次。

### 5.1 Standard error response

所有业务路由统一返回以下错误结构：

```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human readable message",
    "details": {
      "field": "namespace",
      "reason": "invalid characters"
    }
  }
}
```

其中 `details` 为可选对象，用于提供字段级上下文。

## Project Structure

### Documentation (this feature)

```text
specs/001-share-memory-mvp/
├── spec.md
├── plan.md
└── tasks.md
```

### Source Code (repository root)

```text
share_mem/
├── package.json
├── tsconfig.base.json
├── docker-compose.yml
├── .env.example
├── .dockerignore
├── .gitignore
├── tests/
│   ├── integration/
│   └── e2e/
├── packages/
│   ├── shared/
│   │   └── src/
│   │       ├── types.ts
│   │       ├── api-client.ts
│   │       ├── errors.ts
│   │       ├── validation.ts
│   │       └── index.ts
│   ├── gateway/
│   │   ├── Dockerfile
│   │   └── src/
│   │       ├── index.ts
│   │       ├── env.ts
│   │       ├── routes/
│   │       │   ├── catalog.ts
│   │       │   ├── memory.ts
│   │       │   └── health.ts
│   │       ├── middleware/
│   │       │   ├── auth.ts
│   │       │   └── error-handler.ts
│   │       ├── services/
│   │       │   ├── memory-service.ts
│   │       │   ├── catalog-service.ts
│   │       │   └── apikey-service.ts
│   │       ├── storage/
│   │       │   ├── space-paths.ts
│   │       │   ├── memory-repository.ts
│   │       │   ├── catalog-repository.ts
│   │       │   ├── apikey-repository.ts
│   │       │   └── atomic-write.ts
│   │       └── lib/
│   │           ├── frontmatter.ts
│   │           ├── path-validation.ts
│   │           ├── mutex.ts
│   │           └── hash.ts
│   ├── mcp-server/
│   │   └── src/
│   │       ├── index.ts
│   │       ├── config.ts
│   │       ├── tools.ts
│   │       └── resources.ts
│   └── cli/
│       └── src/
│           ├── index.ts
│           ├── commands/
│           │   ├── init.ts
│           │   ├── sync.ts
│           │   ├── get.ts
│           │   ├── set.ts
│           │   ├── list.ts
│           │   ├── delete.ts
│           │   └── rebuild-catalog.ts
│           └── lib/
│               ├── config.ts
│               ├── inject.ts
│               ├── inject-limits.ts
│               └── paths.ts
└── scripts/
    └── seed-apikey.ts
```

**Structure Decision**: 采用 monorepo 多包结构，保留 `shared / gateway / mcp-server / cli` 四个核心包。`sb-plug` 不纳入 MVP 核心实现，因为我们已经确认 Gateway 负责核心业务逻辑，SilverBullet 仅承担存储与编辑 UI。

## Delivery Phases

### Phase 0 - Workspace and runtime foundation

- 初始化 monorepo 根配置与 npm workspaces
- 配置 TypeScript 基线、构建脚本与 Docker 运行时
- 建立 `docker-compose.yml`，让 SilverBullet 与 Gateway 共享 `/space`

### Phase 1 - Shared contracts and storage abstraction

- 在 `packages/shared` 中定义类型、错误模型、请求参数与 API Client
- 在 `packages/gateway` 中实现路径规则、frontmatter 解析、原子写入与基础仓储层
- 建立统一输入校验与错误处理策略

### Phase 2 - P1 user stories

- US1: 读取 catalog、列表查询和单条读取
- US2: 记忆创建/更新/删除与 catalog 自动维护

这是 MVP 的最小可交付闭环。

### Phase 3 - P2 user stories

- US3: CLI 初始化、catalog 缓存与 Cursor/Claude Code 注入同步
- US4: API Key 种子生成、scope 校验与安全失败语义

### Phase 4 - Validation and hardening

- Docker Compose 全链路 smoke 验证
- 关键边界条件验证：空 catalog、archive、非法 key、无客户端目录
- 文档收尾与后续 Phase 迁移说明

## Docker Operations

### Image version pinning

MVP 默认锁定明确镜像版本，避免 `latest` 漂移：

```yaml
services:
  silverbullet:
    image: zefhemel/silverbullet:2.909
```

Gateway 镜像由仓库内 Dockerfile 构建，并随代码版本一起发布。

### Health checks

Gateway 提供 `GET /health`，返回：

```json
{ "ok": true, "sb_connected": true, "version": "1.0.0" }
```

`sb_connected` 在 MVP 中表示共享 `/space` 目录可访问且基础目录结构可读写。

### Logging

Gateway 使用 JSON 结构化日志，至少包含：

```json
{
  "level": "info",
  "time": "2026-03-31T10:00:00Z",
  "msg": "request completed",
  "method": "GET",
  "path": "/v1/catalog",
  "status": 200
}
```

日志级别通过 `LOG_LEVEL` 环境变量控制。

### Backup and restore

数据持久化依赖 Docker volume。建议提供以下备份方式：

```bash
docker run --rm \
  -v share-mem-sb-space:/data \
  -v "$(pwd)":/backup \
  alpine \
  tar czf /backup/sb-space-backup-$(date +%Y%m%d).tar.gz /data
```

## Security Notes

### Transport security

v1 假设 Gateway 运行在受信任网络，或位于提供 TLS 的反向代理之后。生产环境必须通过 HTTPS 暴露 Gateway。

```txt
share-mem.example.com -> reverse proxy (TLS) -> gateway:3000
```

### Secret handling

- API Key 通过请求头传输，生产环境必须使用 HTTPS
- 明文 secret 仅在创建时返回一次
- 系统只持久化 `sha256` 哈希

### Future hardening

- 请求频率限制
- API Key IP 白名单
- 审计日志
- 更细粒度的 namespace 权限隔离

## Implementation Notes By Story

### User Story 1 - 按需发现并读取团队记忆

- Gateway 提供 `GET /v1/catalog`、`GET /v1/memory/:namespace/:key`、`GET /v1/memory`
- `memory_query` 与 `memory_list` 共用 Gateway 的列表接口
- MCP 输出做成适合 LLM 阅读的纯文本，避免直接暴露原始 JSON

### User Story 2 - 维护结构化记忆并自动更新目录

- Gateway 提供 `POST /v1/memory/:namespace/:key` 与 `DELETE /v1/memory/:namespace/:key`
- 通过 `gray-matter` 序列化 frontmatter
- `catalog-service` 负责增量更新 `tags`、`always_inject`、`total_entries`
- 首次运行时若 `_catalog.json` 缺失，由 Gateway 自动创建

### User Story 3 - 将轻量目录同步到本地 AI 工作环境

- CLI `init` 负责连接校验与配置落盘
- CLI `sync` 负责写入 `.share-mem/catalog.json`
- `inject.ts` 只输出轻量目录与工具指引，不嵌入普通正文
- `CLAUDE.md` 更新必须用受管标记块包围

### User Story 4 - 通过 API Key 安全共享记忆能力

- Gateway 中间件为各路由声明所需 scope
- `scripts/seed-apikey.ts` 负责生成新 secret 并写入 key 元数据
- health 路由不需要 API Key，便于 Docker 健康检查
- 所有业务路由统一返回 `{ ok, data | error }`

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| SilverBullet 与 Gateway 共享卷下的并发写入导致文件竞争 | catalog 或记忆文件损坏 | Gateway 使用原子写入和单进程互斥；v1 避免在多个 Gateway 实例下横向扩容 |
| 用户直接在 SilverBullet UI 中修改 frontmatter，破坏字段格式 | Gateway 读取失败或 catalog 失真 | 在 Gateway 读取层做严格校验，并提供 `rebuildCatalog()` 恢复路径 |
| 目录注入信息过长，侵占 LLM 常驻上下文 | 影响使用体验 | `sync` 时限制标签数量和文本长度，并优先保留高价值摘要 |
| API Key 文件与记忆文件都放在 SB 空间中，权限边界不清晰 | 可能被 UI 误编辑 | 约定独立目录并在文档中标明只允许管理员维护；后续 Phase 可迁移到独立存储 |
| 根目录旧设计仍指向 SB plug 方案 | 实施时团队认知混乱 | 以本 plan 和 spec 为准，明确 MVP 不实现核心 sb-plug |

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| 无 | N/A | 当前方案已选用最小可行结构 |
