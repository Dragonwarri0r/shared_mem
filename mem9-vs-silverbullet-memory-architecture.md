# mem9 vs SilverBullet：云端记忆体的思路对比与方向

如果你改用 [`mem9`](https://github.com/mem9-ai/mem9) 这个仓库，情况会完全不同。  
它**不是 SilverBullet 的平替**，而是**完全不同层面的工具**。

## mem9 是什么？（核心定位）

mem9（mnemo-server）是一个**专为 AI Agent 设计的持久化记忆后端（Persistent Memory Server）**。  
它的目标是解决 AI 代理（尤其是 Claude Code、OpenClaw、OpenCode 等）在会话间“失忆”、记忆孤岛、无法跨设备/跨团队共享的问题。

- 存储后端：TiDB Cloud（MySQL 兼容 + 原生向量搜索），支持**向量 + 关键词混合搜索**。
- 交互方式：纯 **REST API**（CRUD + Search），通过 API Key 认证。
- 插件支持：原生提供 Claude Code 插件、OpenClaw 插件、OpenCode 插件，能自动在 prompt 构建前搜索相关记忆并注入。
- 核心能力：让多个 Agent 共享同一个“记忆池”，实现**跨会话、跨代理、跨设备的长期记忆**。

简单说：**mem9 是 Agent 的“外部长期记忆大脑”**，而不是人类的笔记/知识库编辑工具。

## 与你原来 Gemini 方案（SilverBullet + MCP）的对比

| 维度                  | SilverBullet + silverbullet-mcp                  | mem9 (mem9-ai/mem9)                          | 谁更适合你的需求 |
|-----------------------|--------------------------------------------------|---------------------------------------------|------------------|
| **核心定位**         | 可编程的第二大脑（笔记 + 对象数据库 + UI）      | AI Agent 的持久化记忆后端                   | SB 更接近笔记系统 |
| **是否有 Web 编辑界面** | 有（丝滑 Markdown + 对象化编辑）                | **无**（纯后端，Roadmap 才有 UI）           | SB 胜           |
| **查询方式**         | SBQL + 对象精确过滤（type/lang/status 等）      | 向量语义搜索 + 关键词混合搜索               | 各有优势        |
| **MCP 支持**         | 原生/最佳支持（通过 MCP Bridge）                | **不支持 MCP**（用 REST API + 专用插件）    | SB 胜           |
| **实时协作/原子更新**| 支持（网页改动立即通过 API 可见，支持 Hook）   | 支持共享读写，但无实时编辑冲突处理       | SB 更强         |
| **Agent 集成**       | 通过 MCP 让 Claude Code / Cursor 像读数据库一样精准读写笔记 | 通过插件让 Agent 自动加载/保存记忆         | mem9 在“长期记忆注入”更自动 |
| **对象化/结构化**    | 极强（Frontmatter + Space Lua）                 | 中等（记忆对象，但更偏非结构化语义）       | SB 胜           |
| **自动化**           | Space Lua + Hook 非常灵活                       | 基本无（依赖 Agent 侧逻辑）                 | SB 胜           |
| **部署复杂度**       | Docker Compose 一键（SB + MCP）                 | Docker 单容器 + TiDB，需手动配 DSN           | 类似            |

**结论**：
- mem9 **不能替代** SilverBullet + MCP 那套架构。
- 它更适合作为 **补充层**：把 SB 当成“结构化知识库 + 编辑界面”，把 mem9 当成“Agent 的长期语义记忆池”。
- 如果你的核心痛点是“让 Claude Code / Cursor 能精准检索和修改我的笔记结构”，继续用 SB + MCP 更好。
- 如果你的痛点是“Agent 每次对话都忘掉历史项目经验、SOP、规则”，mem9 能提供更自动的记忆注入体验。

## mem9 的实际使用建议（如果你想尝试）

1. **部署方式**（推荐自建 TiDB 避免云依赖）：
   - 用 Docker 跑 TiDB（pingcap/tidb） + mnemo-server。
   - 社区已有 docker-compose 示例（可参考相关 Medium 文章）。
   - 设置 `MNEMO_DSN` 指向 TiDB，配置 API Key。

2. **与 Claude Code 集成**：
   - 通过插件市场安装 mem9 插件（`/plugin install mem9@mem9`）。
   - Agent 会自动在每次 prompt 前调用 `memory_search`，把相关记忆注入上下文。
   - 支持 `memory_store`、`memory_update` 等工具。

3. **与 Cursor 的兼容性**：
   - Cursor 对 mem9 支持较弱（无原生插件），需手动通过 REST API 调用，或等社区 MCP wrapper。

4. **优缺点总结**：
   - **优点**：部署后 Agent 记忆几乎“无限”，混合搜索效果好，TiDB 免费层够用，跨 Agent 共享方便。
   - **缺点**：没有人类友好的编辑界面、暂无 MCP 支持、结构化能力弱于 SB、实时协作能力一般。

## 我的最终推荐

- **主力仍推荐 SilverBullet + silverbullet-mcp**：它更接近你最初“API-First 在线协作 + Agent 精准检索笔记”的需求，尤其是你希望“网页端丝滑输入 + AI 像读数据库一样操作”。
- **可以把 mem9 作为增强**：让 SB 负责结构化规则、SOP、项目文档；让 mem9 负责 Agent 的长期项目经验、对话历史、隐性知识。两者通过 API 打通（例如让 SB 的 Space Lua 定期把重要对象同步到 mem9）。
- 如果你主要用 **OpenClaw** 而不是标准 Claude Code，那 mem9 的体验会更好。

## 你当前希望实现的方向（补充）

最好基于 SilverBullet 扩展实现：

1. 云端记忆体（长期记忆与检索/注入）。
2. 管理类 API：围绕“KV（键值）”的数据管理能力（读写、版本/状态、权限/鉴权等）。
3. 由 `MCP` 或 `Skill` 进行吊起（由外部 Agent 侧触发 SB 的 API/能力）。

接下来需要你补充/确认的点：

- 主要 Agent 是哪些？（Claude Code / OpenClaw / OpenCode / Cursor / 自研）
- KV 的粒度：按项目、按用户、还是按“memory namespace + key”？
- 需要哪些 API：`get/set/update/delete`、`search`、还是“事件流/变更日志”？
- 鉴权策略：API Key、OIDC、还是复用 SB 的登录态？

