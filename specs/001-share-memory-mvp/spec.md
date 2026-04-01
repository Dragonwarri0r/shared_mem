# Feature Specification: Share Memory System MVP

**Feature Branch**: `[001-share-memory-mvp]`  
**Created**: 2026-03-31  
**Status**: Draft  
**Input**: User description: "基于根目录 `plan.md` 与 `mem9-vs-silverbullet-memory-architecture.md` 的需求，分析当前项目目标、调研相关功能，并产出一版可执行 spec。"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 按需发现并读取团队记忆 (Priority: P1)

作为日常使用 Cursor、Claude Code 或其他 MCP 客户端的开发者/Agent，我希望先看到轻量的共享记忆目录，再按 namespace、key、tag 或标题关键词按需拉取完整内容，这样我能在不挤占上下文窗口的前提下获得准确团队知识。

**Why this priority**: 这是本项目的核心价值，也是与“把全文直接塞进 prompt”或“纯语义记忆后端”最大的差异点。没有“轻目录 + 按需正文”的体验，系统就无法成立。

**Independent Test**: 预置若干记忆条目后，用户只通过 catalog、列表查询和单条读取能力，就能独立完成“发现相关知识并读取正文”的完整流程，无需写入能力即可交付 MVP 价值。

**Acceptance Scenarios**:

1. **Given** 系统中已存在多个记忆条目且本地已完成配置，**When** 用户执行 `share-mem sync` 并在 MCP 客户端调用 `memory_query(tag="android")`，**Then** 用户能先看到轻量索引结果，而不是被动注入完整正文。
2. **Given** 用户已从索引中定位到目标条目，**When** 用户调用 `memory_get(namespace="shared", key="android-coding-standards")`，**Then** 系统返回带元信息摘要头的完整 Markdown 正文。
3. **Given** 用户请求不存在的 `namespace/key`，**When** 系统处理读取请求，**Then** 系统返回明确的未找到错误，而不是空成功结果或模糊失败。

---

### User Story 2 - 维护结构化记忆并自动更新目录 (Priority: P1)

作为知识维护者，我希望能够创建、更新、删除结构化记忆条目，并让目录索引、标签计数和始终注入摘要自动保持一致，这样团队知识可以持续演进而不需要手工重建索引。

**Why this priority**: 共享记忆只有在可维护时才有长期价值。若目录不能自动跟随内容变化，系统会很快失真，Agent 也会被错误索引误导。

**Independent Test**: 仅实现写入、更新、删除和目录同步逻辑，就能独立验证“系统是否能作为团队共享记忆底座运行”，即使 MCP 和客户端注入还未接入，也已具备核心运营价值。

**Acceptance Scenarios**:

1. **Given** 某个 `namespace/key` 尚不存在，**When** 维护者通过 CLI 或 Gateway 创建一条记忆并提供标题、标签、正文，**Then** 系统持久化该记忆并在目录中增加对应标签计数和总条目数。
2. **Given** 某条记忆已存在，**When** 维护者更新其标题、标签或摘要，**Then** 系统保留创建信息、递增版本号并反映新的目录索引状态。
3. **Given** 某条记忆被删除，**When** 用户再次读取目录，**Then** 对应标签计数、`always_inject` 项和总条目数都应同步减少或移除。

---

### User Story 3 - 将轻量目录同步到本地 AI 工作环境 (Priority: P2)

作为本地开发者，我希望在项目目录中执行一次初始化和同步，就让 Cursor 规则文件、Claude Code 注入块以及本地 catalog 缓存自动生成或更新，这样我的工具链能持续知道“有哪些团队记忆可查”，但不会被大量正文常驻占满上下文。

**Why this priority**: 这是把共享记忆真正嵌入日常开发工作流的关键一步，但它建立在“目录可读、记忆可取”的核心能力之上，因此优先级低于读写主链路。

**Independent Test**: 在已有 catalog 的前提下，用户只需完成 `init` 和 `sync`，就可以独立验证本地配置发现、客户端检测、规则文件生成和 `CLAUDE.md` 标记块更新是否正常。

**Acceptance Scenarios**:

1. **Given** 用户所在工作区包含 `.cursor/`，**When** 用户执行 `share-mem sync --cursor`，**Then** 系统生成或更新 `.cursor/rules/shared-memory.mdc`，内容仅包含目录索引和 `always_inject` 摘要。
2. **Given** 用户所在工作区存在 `CLAUDE.md` 或 `.claude/`，**When** 用户执行 `share-mem sync --claude-code`，**Then** 系统只替换 `<!-- share-mem:start -->` 与 `<!-- share-mem:end -->` 之间的内容，不破坏其他手写内容。
3. **Given** 用户同时使用多个客户端，**When** 用户执行 `share-mem sync --all`，**Then** 系统为所有受支持客户端更新注入内容，并把最新 catalog 缓存到 `.share-mem/catalog.json`。
4. **Given** `.cursor/rules/` 目录不存在，**When** 用户执行 `share-mem sync --cursor`，**Then** 系统自动创建目录并生成注入文件。
5. **Given** `CLAUDE.md` 不存在且工作区存在 `.claude/`，**When** 用户执行 `share-mem sync --claude-code`，**Then** 系统创建 `CLAUDE.md` 并写入受管块。

---

### User Story 4 - 通过 API Key 安全共享记忆能力 (Priority: P2)

作为系统运营者，我希望用 API Key 为不同客户端开放只读或读写能力，并在每次请求时校验 scope，这样共享记忆既能被多端使用，也不会在没有授权的情况下泄露或被篡改。

**Why this priority**: 该系统的目标是多人协同和多客户端接入，没有可执行的鉴权模型就无法安全落地。但相较于读写主体验，它更偏基础设施保障。

**Independent Test**: 在系统可正常读写记忆的前提下，仅通过密钥生成、带 scope 的访问控制和错误响应，就能独立验证“共享给谁、能做什么”的关键安全边界。

**Acceptance Scenarios**:

1. **Given** 客户端未携带 API Key，**When** 它请求 catalog 或 memory API，**Then** 系统返回 `401 UNAUTHORIZED`。
2. **Given** 客户端携带有效但 scope 不足的 API Key，**When** 它尝试写入记忆，**Then** 系统返回 `403 FORBIDDEN`，且不发生实际写入。
3. **Given** 运营者通过种子脚本创建了新的 API Key，**When** 客户端使用该密钥发起授权范围内的请求，**Then** 系统成功完成操作，且明文 secret 只在创建时返回一次。

---

### Edge Cases

- 首次部署时 `catalog` 不存在或为空，系统必须能自动初始化空目录，而不是要求人工预建。
- 删除最后一个带某标签的记忆时，该标签应从目录中移除，而不是保留 `count=0` 的脏数据。
- 当条目被标记为 `archive` 时，它不应继续计入活跃目录和默认注入内容。
- 用户只更新部分字段时，系统应保留未显式修改的元信息，而不是把缺失字段清空。
- 本地工作区同时存在 `.cursor/`、`.claude/` 和 `CLAUDE.md` 时，`sync` 必须按目标更新所有受支持入口。
- `CLAUDE.md` 不存在标记块时，系统应追加受管块；已存在时应替换受管块；任何情况下都不能覆盖块外内容。
- `namespace` 或 `key` 中如果包含非法路径字符或潜在路径穿越片段，系统必须拒绝请求。
- `always` 模式的记忆若缺少摘要，系统至少要给出警告或阻止提交，避免生成低质量注入内容。
- 若本地没有任何受支持客户端目录，`sync` 仍应成功刷新本地 catalog 缓存，并明确说明未生成客户端注入文件。
- 系统应避免把核心业务逻辑耦合到难以远程编排的 SilverBullet 服务端执行能力上，以免 Docker 化部署后出现不可维护的集成路径。

## Requirements *(mandatory)*

### Local Tool Responsibilities

| 工具 | 职责 | 离线支持 |
|------|------|----------|
| CLI `init` | 初始化本地配置并验证服务可用性 | 否，必须联网 |
| CLI `sync` | 拉取最新 catalog 并生成本地注入文件 | 否，必须联网 |
| CLI `get/set/list/delete` | 直接调用云端 Gateway 读写共享记忆 | 否，必须联网 |
| CLI `rebuild-catalog` | 管理员触发 catalog 重建 | 否，必须联网 |
| MCP Server | 为 AI 客户端代理访问 Gateway API | 否，无本地缓存与离线模式 |

### Functional Requirements

- **FR-001**: 系统 MUST 以 `namespace + key` 为唯一标识管理记忆条目，并为每个条目保存标题、标签、注入模式、摘要、创建者、创建时间、更新时间、版本号和 Markdown 正文。
- **FR-002**: 系统 MUST 提供受鉴权保护的读取接口，用于按 `namespace/key` 获取单条记忆的完整内容。
- **FR-003**: 系统 MUST 提供受鉴权保护的列表/查询接口，用于按 `namespace`、`tag`、标题关键词、分页参数返回不含正文的轻量索引结果；其中 `limit` 默认 50、最大 200，`offset` 默认 0。
- **FR-004**: 系统 MUST 提供受鉴权保护的创建、更新和删除接口，用于维护记忆条目；更新操作时未传入的字段保留原值，`content` 字段在创建和更新时都必须提供。
- **FR-005**: 系统 MUST 在每次创建、更新或删除记忆后自动维护 catalog，包括 `updated_at`、`always_inject`、标签描述、标签计数和活跃总条目数。
- **FR-006**: 系统 MUST 将 `archive` 视为非活跃条目；它们不得出现在默认 catalog 活跃统计和默认注入内容中。
- **FR-007**: 系统 MUST 提供本地 CLI 初始化流程，用于收集或接收服务地址、API Key、默认 namespace，并在写入配置前验证连接与鉴权。
- **FR-008**: 系统 MUST 提供本地同步流程，用于拉取 catalog、写入 `.share-mem/catalog.json`，并按用户指定或自动检测结果生成 Cursor/Claude Code 注入内容。
- **FR-009**: 系统 MUST 保证默认注入内容是“轻量目录”，仅包含标签索引、`always_inject` 摘要和工具使用提示，而不注入普通记忆全文。
- **FR-010**: 系统 MUST 将默认注入内容控制在适合 LLM 常驻上下文的体量内，目标为约 200-400 tokens 或等价信息密度。
- **FR-011**: 系统 MUST 提供 MCP 读取能力，至少包含单条读取、条件查询、索引列出三个工具，以及一个返回 catalog 的资源入口。
- **FR-012**: 系统 MUST 通过 API Key 实施鉴权，并至少区分 `catalog:read`、`memory:read`、`memory:write` 三类权限范围。
- **FR-013**: 系统 MUST 对缺失密钥、无效密钥、权限不足、目标不存在、校验失败和服务内部错误返回统一格式的错误响应。
- **FR-014**: 系统 MUST 支持服务端生成种子 API Key，并且明文 secret 仅在创建时返回一次；后续系统只存储可校验但不可逆的哈希。
- **FR-015**: 系统 MUST 支持本地配置文件的递归发现逻辑，优先查找当前目录，再查找父目录，最后回退到用户主目录下的全局配置。
- **FR-016**: 系统 MUST 在更新 `CLAUDE.md` 时仅管理受标记块包裹的内容，保留标记块外的所有既有内容。
- **FR-017**: 系统 MUST 支持多人共享同一记忆库，并允许不同客户端通过同一 Gateway 协议访问同一份记忆数据。
- **FR-018**: 系统 MUST 在 v1 范围内优先提供确定性检索能力，即按标签、标题关键词、命名空间和精确键读取；语义向量搜索不属于 MVP 必选项。
- **FR-019**: 系统 MUST 允许 `always_inject` 条目携带可直接注入的简短摘要，以便客户端在不读取正文的情况下理解其用途。
- **FR-020**: 系统 MUST 支持增量演进到后续阶段，包括 MCP 写入、标签管理、版本冲突处理、审计日志和更细粒度权限，而不破坏 v1 数据模型。
- **FR-021**: 系统 MUST 以 Docker 作为 v1 的标准运行形态，至少支持通过 `docker compose` 启动 SilverBullet 与共享记忆服务端组件，并为本地 CLI/MCP 提供可访问入口。
- **FR-022**: 系统 MUST 保留 SilverBullet 作为用户可编辑的知识承载层和系统基础依赖，而不是完全替换为独立记忆后端。
- **FR-023**: 系统 MUST 采用“SilverBullet 负责存储与编辑界面，Gateway 负责 API、鉴权、catalog 维护与外部接入”的分层架构；核心业务逻辑不得依赖未验证的远程服务端 Lua/Plug 执行链路。
- **FR-024**: 系统 SHOULD 建议单条记忆正文限制在 100KB 以内；超过时应返回明确警告或拒绝写入策略中的一种，并在实现中保持一致。
- **FR-025**: Gateway SHOULD 对上游请求设置合理超时时间，建议默认 30 秒，并在超时时返回明确错误码和人类可读错误信息。

### Key Entities *(include if feature involves data)*

- **Memory Entry**: 团队共享记忆的核心对象，由 `namespace`、`key`、元信息和 Markdown 正文构成。
- **Memory Meta**: 记忆的结构化元数据，包含标题、标签、注入模式、摘要、作者与版本时间信息。
- **Catalog**: 面向客户端常驻注入的轻量目录索引，聚合活跃标签、`always_inject` 摘要和总条目数。
- **Catalog Tag Entry**: catalog 中每个标签的展示与统计单元，记录标签名、描述和计数。
- **Always Inject Entry**: catalog 中允许常驻注入的简要摘要条目，引用具体 `namespace/key` 但不携带正文。
- **API Key**: 客户端访问共享记忆系统的授权凭证，包含名称、哈希、权限范围、失效/吊销状态。
- **Local Config**: 本地 CLI/MCP 使用的配置对象，至少包含 Gateway 地址、API Key 和默认 namespace。
- **Generated Injection Block**: 由 `sync` 生成的客户端侧提示内容，用于让 LLM 了解可查询的团队记忆范围。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 新用户在已获取有效 API Key 的前提下，能在 3 分钟内完成一次 `init + sync + query/get` 的首轮接入流程，且无需手工编辑多个配置文件。
- **SC-002**: 在包含至少 50 条活跃记忆的环境中，生成的默认注入内容仍保持在约 25 行或等价 400 tokens 以内，并能明确提示用户使用查询工具按需取正文。
- **SC-003**: 任意一次创建、更新或删除操作完成后，下一次读取 catalog 时都能反映正确的标签计数、`always_inject` 内容和总条目数，无需手工重建索引。
- **SC-004**: 对未授权请求和权限不足请求，系统在 100% 的验证场景下返回正确的 `401` 或 `403`，且不泄露受保护的记忆内容。
- **SC-005**: MVP 上线时，CLI 的 `init/sync/get/set/list/delete` 与 MCP 的 `memory_get/memory_query/memory_list` 可在同一开发环境内完成端到端联通验证。

## Assumptions

- v1/MVP 的首要目标是交付“轻量目录 + 按需正文 + 多客户端接入”的共享记忆主链路，而不是做语义搜索、自动记忆抽取或复杂协作冲突处理。
- v1 为单实例单团队部署，不涉及多租户隔离、负载均衡和服务发现。
- 主要使用场景面向 Cursor、Claude Code 和其他支持 MCP 的 Agent 客户端；其他客户端可通过 Gateway HTTP API 兼容接入。
- 记忆正文以 Markdown 文本为主，v1 不处理二进制附件、富媒体嵌入和超大对象存储。
- API Key 是 v1 的默认鉴权方式；OIDC、用户态登录和更细粒度租户隔离不属于 MVP 范围。
- Phase 1 只要求 MCP 具备读取能力；通过 MCP 写入记忆属于后续增强阶段。
- v1 不强制提供向量搜索或语义召回，标签和标题关键词已足够支撑第一阶段的准确发现需求。
- `plan.md` 中描述的数据模型、CLI 命令集和 Phase 切分总体可作为产品范围基线，但实现时应按“Gateway 为业务中枢、SilverBullet 为底层存储/UI”重组技术方案。
- Docker 内的 SilverBullet 应被视为共享记忆内容的承载与编辑入口，而不是唯一的 API/权限治理层。
- 数据持久化依赖 Docker volume；备份、恢复和镜像版本锁定策略在 plan.md 中定义。
