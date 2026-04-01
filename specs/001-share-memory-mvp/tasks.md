# Tasks: Share Memory System MVP

**Input**: Design documents from `/specs/001-share-memory-mvp/`  
**Prerequisites**: [plan.md](/Users/youxuezhe/vsproj/share_mem/specs/001-share-memory-mvp/plan.md), [spec.md](/Users/youxuezhe/vsproj/share_mem/specs/001-share-memory-mvp/spec.md)

**Tests**: 本特性要求端到端可验证，因此任务中包含集成测试和 smoke 验证任务。  
**Organization**: 任务按 user story 分组，确保每个故事都能独立实现、独立验证。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可并行执行（不同文件、无直接依赖）
- **[Story]**: 任务归属的用户故事，`US1` 到 `US4`
- 每个任务都包含明确文件路径

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: 初始化 monorepo、Docker 运行环境和基础目录结构

- [ ] T001 Create root workspace files in `/Users/youxuezhe/vsproj/share_mem/package.json`, `/Users/youxuezhe/vsproj/share_mem/tsconfig.base.json`, `/Users/youxuezhe/vsproj/share_mem/.gitignore`, `/Users/youxuezhe/vsproj/share_mem/.dockerignore`, and `/Users/youxuezhe/vsproj/share_mem/.env.example`
- [ ] T002 [P] Create package manifests and tsconfig files for `/Users/youxuezhe/vsproj/share_mem/packages/shared/package.json`, `/Users/youxuezhe/vsproj/share_mem/packages/gateway/package.json`, `/Users/youxuezhe/vsproj/share_mem/packages/mcp-server/package.json`, `/Users/youxuezhe/vsproj/share_mem/packages/cli/package.json`, and package-level `tsconfig.json` files
- [ ] T003 [P] Create Docker runtime files in `/Users/youxuezhe/vsproj/share_mem/docker-compose.yml` and `/Users/youxuezhe/vsproj/share_mem/packages/gateway/Dockerfile` with a shared `/space` volume for SilverBullet and Gateway
- [ ] T004 Create initial source and test directories under `/Users/youxuezhe/vsproj/share_mem/packages/` and `/Users/youxuezhe/vsproj/share_mem/tests/`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 建立所有 user story 都依赖的共享类型、存储抽象、错误处理和鉴权骨架

**⚠️ CRITICAL**: 本阶段完成前，不要开始任何 user story 实现

- [ ] T005 Create shared domain types and API envelopes in `/Users/youxuezhe/vsproj/share_mem/packages/shared/src/types.ts` and `/Users/youxuezhe/vsproj/share_mem/packages/shared/src/errors.ts`
- [ ] T006 [P] Create shared validation and export surface in `/Users/youxuezhe/vsproj/share_mem/packages/shared/src/validation.ts` and `/Users/youxuezhe/vsproj/share_mem/packages/shared/src/index.ts`
- [ ] T007 [P] Implement shared Gateway client in `/Users/youxuezhe/vsproj/share_mem/packages/shared/src/api-client.ts`
- [ ] T008 Create Gateway app bootstrap and environment loading in `/Users/youxuezhe/vsproj/share_mem/packages/gateway/src/index.ts`, `/Users/youxuezhe/vsproj/share_mem/packages/gateway/src/env.ts`, `/Users/youxuezhe/vsproj/share_mem/packages/gateway/src/routes/health.ts`, and `/Users/youxuezhe/vsproj/share_mem/packages/gateway/src/middleware/error-handler.ts`
- [ ] T008b [P] Implement `GET /health` with shared-space connectivity check and version response in `/Users/youxuezhe/vsproj/share_mem/packages/gateway/src/routes/health.ts`
- [ ] T009 [P] Implement storage path resolution and atomic file writes in `/Users/youxuezhe/vsproj/share_mem/packages/gateway/src/storage/space-paths.ts` and `/Users/youxuezhe/vsproj/share_mem/packages/gateway/src/storage/atomic-write.ts`
- [ ] T009b [P] Implement namespace/key path validation in `/Users/youxuezhe/vsproj/share_mem/packages/gateway/src/lib/path-validation.ts`
- [ ] T010 [P] Implement parsing and utility helpers in `/Users/youxuezhe/vsproj/share_mem/packages/gateway/src/lib/frontmatter.ts`, `/Users/youxuezhe/vsproj/share_mem/packages/gateway/src/lib/hash.ts`, and `/Users/youxuezhe/vsproj/share_mem/packages/gateway/src/lib/mutex.ts`
- [ ] T011a [P] Implement memory repository in `/Users/youxuezhe/vsproj/share_mem/packages/gateway/src/storage/memory-repository.ts`
- [ ] T011b [P] Implement catalog repository in `/Users/youxuezhe/vsproj/share_mem/packages/gateway/src/storage/catalog-repository.ts`
- [ ] T011c [P] Implement API key repository in `/Users/youxuezhe/vsproj/share_mem/packages/gateway/src/storage/apikey-repository.ts`
- [ ] T012a [P] Implement memory service base logic in `/Users/youxuezhe/vsproj/share_mem/packages/gateway/src/services/memory-service.ts`
- [ ] T012b [P] Implement catalog service base logic in `/Users/youxuezhe/vsproj/share_mem/packages/gateway/src/services/catalog-service.ts`
- [ ] T012c [P] Implement API key service base logic in `/Users/youxuezhe/vsproj/share_mem/packages/gateway/src/services/apikey-service.ts`
- [ ] T013 Implement auth middleware and route scope wiring in `/Users/youxuezhe/vsproj/share_mem/packages/gateway/src/middleware/auth.ts` and `/Users/youxuezhe/vsproj/share_mem/packages/gateway/src/index.ts`

**Checkpoint**: Gateway 已具备统一类型、存储访问、原子写入和鉴权骨架，user story 可以开始并行推进

---

## Phase 3: User Story 1 - 按需发现并读取团队记忆 (Priority: P1) 🎯 MVP

**Goal**: 提供 catalog、列表查询、单条读取和 MCP 只读接入  
**Independent Test**: 预置几条记忆文件后，通过 Gateway API 和 MCP 工具完成“先查索引、再读正文”的独立闭环

### Implementation for User Story 1

- [ ] T016 [US1] Implement catalog read route in `/Users/youxuezhe/vsproj/share_mem/packages/gateway/src/routes/catalog.ts`
- [ ] T017 [US1] Implement memory read and list routes in `/Users/youxuezhe/vsproj/share_mem/packages/gateway/src/routes/memory.ts`
- [ ] T018 [P] [US1] Implement MCP config discovery in `/Users/youxuezhe/vsproj/share_mem/packages/mcp-server/src/config.ts`
- [ ] T019 [P] [US1] Implement MCP tools for `memory_get`, `memory_query`, and `memory_list` in `/Users/youxuezhe/vsproj/share_mem/packages/mcp-server/src/tools.ts`
- [ ] T020 [US1] Implement MCP catalog resource and stdio bootstrap in `/Users/youxuezhe/vsproj/share_mem/packages/mcp-server/src/resources.ts` and `/Users/youxuezhe/vsproj/share_mem/packages/mcp-server/src/index.ts`

### Tests for User Story 1

- [ ] T014 [US1] [TDD] Add Gateway read-flow integration tests in `/Users/youxuezhe/vsproj/share_mem/tests/integration/gateway-read.spec.ts`
- [ ] T015 [US1] [TDD] Add MCP read-flow smoke tests in `/Users/youxuezhe/vsproj/share_mem/tests/e2e/mcp-read-smoke.spec.ts`

**Checkpoint**: User Story 1 完成后，团队成员已经可以在本地 AI 客户端里浏览共享记忆目录并按需读取正文

---

## Phase 4: User Story 2 - 维护结构化记忆并自动更新目录 (Priority: P1)

**Goal**: 支持记忆创建、更新、删除，并保持 catalog 自动同步  
**Independent Test**: 通过 Gateway 和 CLI 完成新增、更新、删除记忆，并验证 catalog 中标签计数、always_inject 和总数同步变化

### Implementation for User Story 2

- [ ] T023 [US2] Implement catalog rebuild and incremental update logic in `/Users/youxuezhe/vsproj/share_mem/packages/gateway/src/services/catalog-service.ts`
- [ ] T024 [US2] Implement memory create, update, delete logic in `/Users/youxuezhe/vsproj/share_mem/packages/gateway/src/services/memory-service.ts`
- [ ] T025 [US2] Extend Gateway memory routes with `POST /v1/memory/:namespace/:key` and `DELETE /v1/memory/:namespace/:key` in `/Users/youxuezhe/vsproj/share_mem/packages/gateway/src/routes/memory.ts`
- [ ] T026 [P] [US2] Implement CLI local path helpers and config access in `/Users/youxuezhe/vsproj/share_mem/packages/cli/src/lib/paths.ts` and `/Users/youxuezhe/vsproj/share_mem/packages/cli/src/lib/config.ts`
- [ ] T027 [P] [US2] Implement CLI memory commands in `/Users/youxuezhe/vsproj/share_mem/packages/cli/src/commands/get.ts`, `/Users/youxuezhe/vsproj/share_mem/packages/cli/src/commands/set.ts`, `/Users/youxuezhe/vsproj/share_mem/packages/cli/src/commands/list.ts`, and `/Users/youxuezhe/vsproj/share_mem/packages/cli/src/commands/delete.ts`
- [ ] T028 [US2] Wire CLI command registration in `/Users/youxuezhe/vsproj/share_mem/packages/cli/src/index.ts`
- [ ] T028b [US2] Implement `share-mem rebuild-catalog` command in `/Users/youxuezhe/vsproj/share_mem/packages/cli/src/commands/rebuild-catalog.ts` and register it in `/Users/youxuezhe/vsproj/share_mem/packages/cli/src/index.ts`

### Tests for User Story 2

- [ ] T021 [US2] [TDD] Add Gateway write-flow and catalog consistency tests in `/Users/youxuezhe/vsproj/share_mem/tests/integration/gateway-write.spec.ts`
- [ ] T022 [US2] [TDD] Add CRUD smoke tests against dockerized services in `/Users/youxuezhe/vsproj/share_mem/tests/e2e/crud-smoke.spec.ts`

**Checkpoint**: User Story 2 完成后，系统已经具备完整的共享记忆维护闭环，是 MVP 的核心生产能力

---

## Phase 5: User Story 3 - 将轻量目录同步到本地 AI 工作环境 (Priority: P2)

**Goal**: 让用户通过 `init` 和 `sync` 自动生成本地 catalog 缓存与 AI 客户端注入内容  
**Independent Test**: 在本地工作区执行 `share-mem init` 与 `share-mem sync --all`，验证 `.share-mem/catalog.json`、`.cursor/rules/shared-memory.mdc` 与 `CLAUDE.md` 受管块被正确更新

### Implementation for User Story 3

- [ ] T031 [US3] Implement injection rendering and file update helpers in `/Users/youxuezhe/vsproj/share_mem/packages/cli/src/lib/inject.ts`
- [ ] T031b [US3] Define injection size limits and truncation rules in `/Users/youxuezhe/vsproj/share_mem/packages/cli/src/lib/inject-limits.ts`
- [ ] T032 [US3] Implement `share-mem init` in `/Users/youxuezhe/vsproj/share_mem/packages/cli/src/commands/init.ts`
- [ ] T033 [US3] Implement `share-mem sync` in `/Users/youxuezhe/vsproj/share_mem/packages/cli/src/commands/sync.ts`
- [ ] T034 [US3] Update CLI entrypoint wiring for `init` and `sync` in `/Users/youxuezhe/vsproj/share_mem/packages/cli/src/index.ts`

### Tests for User Story 3

- [ ] T029 [US3] [TDD] Add CLI init/sync integration tests covering `CLAUDE.md` managed-block replacement and file creation in `/Users/youxuezhe/vsproj/share_mem/tests/integration/cli-sync.spec.ts`
- [ ] T030 [US3] [TDD] Add sync output smoke tests covering missing client directories and generated file layout in `/Users/youxuezhe/vsproj/share_mem/tests/e2e/sync-smoke.spec.ts`

**Checkpoint**: User Story 3 完成后，用户能把共享记忆以轻量目录形式稳定同步到本地 AI 工具链中

---

## Phase 6: User Story 4 - 通过 API Key 安全共享记忆能力 (Priority: P2)

**Goal**: 支持种子 API Key 生成、scope 校验和标准化授权失败语义  
**Independent Test**: 生成只读和读写两类 key，分别验证匿名请求、权限不足请求和授权成功请求的行为

### Implementation for User Story 4

- [ ] T037 [US4] Finalize API key verification and scope evaluation in `/Users/youxuezhe/vsproj/share_mem/packages/gateway/src/services/apikey-service.ts` and `/Users/youxuezhe/vsproj/share_mem/packages/gateway/src/middleware/auth.ts`
- [ ] T038 [P] [US4] Implement API key seed script in `/Users/youxuezhe/vsproj/share_mem/scripts/seed-apikey.ts`
- [ ] T039 [US4] Harden Gateway unauthorized/forbidden responses in `/Users/youxuezhe/vsproj/share_mem/packages/gateway/src/middleware/error-handler.ts`, `/Users/youxuezhe/vsproj/share_mem/packages/shared/src/api-client.ts`, and `/Users/youxuezhe/vsproj/share_mem/packages/cli/src/commands/init.ts`

### Tests for User Story 4

- [ ] T035 [US4] [TDD] Add auth scope integration tests in `/Users/youxuezhe/vsproj/share_mem/tests/integration/auth-scope.spec.ts`
- [ ] T036 [US4] [TDD] Add API key lifecycle smoke tests in `/Users/youxuezhe/vsproj/share_mem/tests/e2e/apikey-smoke.spec.ts`

**Checkpoint**: User Story 4 完成后，系统可安全地向不同客户端分发受限能力

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: 完成全链路收尾、边界条件验证和交付检查

- [ ] T040 [P] Add archive, invalid path, empty catalog, and empty tag-list regression tests in `/Users/youxuezhe/vsproj/share_mem/tests/integration/edge-cases.spec.ts`
- [ ] T040b [P] Add concurrent write behavior tests in `/Users/youxuezhe/vsproj/share_mem/tests/integration/concurrency.spec.ts`
- [ ] T040c [P] Add large-catalog performance tests in `/Users/youxuezhe/vsproj/share_mem/tests/integration/performance.spec.ts`
- [ ] T041 Enforce injection size limits and summary truncation in `/Users/youxuezhe/vsproj/share_mem/packages/cli/src/lib/inject.ts` and `/Users/youxuezhe/vsproj/share_mem/packages/gateway/src/services/catalog-service.ts`
- [ ] T042 [P] Add compose-based end-to-end validation runner in `/Users/youxuezhe/vsproj/share_mem/tests/e2e/run-compose-smoke.ts` and update root npm scripts in `/Users/youxuezhe/vsproj/share_mem/package.json`
- [ ] T043 Verify the full MVP flow manually and record any scope corrections in `/Users/youxuezhe/vsproj/share_mem/specs/001-share-memory-mvp/plan.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1: Setup**: 无依赖，可以立即开始
- **Phase 2: Foundational**: 依赖 Setup 完成，阻塞所有 user story
- **Phase 3-6: User Stories**: 都依赖 Foundational 完成
- **Phase 7: Polish**: 依赖目标 user stories 完成

### User Story Dependencies

- **US1 (P1)**: Foundational 完成后即可开始，不依赖其他 stories
- **US2 (P1)**: Foundational 完成后即可开始，但最好在 US1 的读接口完成后补充写接口
- **US3 (P2)**: 依赖 US1 的 catalog 读取能力，且最好在 US2 生成真实 catalog 后验证
- **US4 (P2)**: 依赖 Foundational 的 auth 骨架，可与 US3 并行推进

### Within Each User Story

- 先补测试和 smoke 验证，再实现主逻辑
- 先完成服务层，再完成路由或 CLI/MCP 接入层
- 先完成底层能力，再做格式化输出和用户体验打磨

## Parallel Opportunities

- T002 与 T003 可并行
- T006、T007、T008b、T009、T009b、T010 可并行
- US1 的 T018 与 T019 可并行
- US2 的 T026 与 T027 可并行
- US3 的 T031 与 T031b 可并行
- US4 的 T035、T036、T038 可并行
- Phase 7 的 T040、T040b、T040c 与 T042 可并行

## Implementation Strategy

### MVP First

1. 完成 Phase 1 和 Phase 2
2. 交付 US1，验证“轻目录 + 按需读取”闭环
3. 交付 US2，补齐写入和 catalog 自动维护
4. 在此时进行第一次 Docker 全链路演示

### Incremental Delivery

1. Setup + Foundational 完成后，Gateway 已具备成型骨架
2. 加入 US1，先让 AI 客户端可以读
3. 加入 US2，让知识维护者可以写
4. 加入 US3，把目录同步到本地 AI 工作区
5. 加入 US4，完善安全分发

### Notes

- 所有 `[P]` 任务都应尽量落在不同文件上，避免冲突
- 以 `/Users/youxuezhe/vsproj/share_mem/specs/001-share-memory-mvp/spec.md` 为范围边界
- 若实施过程中发现 SilverBullet 文件模型与本计划存在偏差，应优先修正 plan，再继续实现
- 标记为 `[TDD]` 的测试任务表示先写测试、后实现，以明确测试顺序
