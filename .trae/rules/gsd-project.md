# 面面吧 V2 项目规则

在执行 V2 相关实现前，先阅读以下文件：

- `.planning/PROJECT.md`
- `.planning/REQUIREMENTS.md`
- `.planning/ROADMAP.md`
- `.planning/STATE.md`
- `说明文档.md`

## 执行原则

- 任何实现、重构、修复都必须先确认属于哪个 Phase 和哪些 REQ-ID。
- 如果某项工作不能映射到当前 phase，就先不要做，避免再次超范围扩散。
- 优先保护统一状态机、证据链、报告可信度和迁移护栏，不为短期页面体验破坏底座。
- 对用户可见结论，必须能回溯到证据、Judge 输出或状态机决策。
- brownfield 实施遵循“并存、验证、切换、清理”，禁止直接把旧链路一次性推倒。

## 更新要求

- 每完成一个阶段性任务，同步更新 `说明文档.md` 的进度记录。
- 若需求或阶段边界变化，先更新 `.planning/PROJECT.md` / `.planning/REQUIREMENTS.md` / `.planning/ROADMAP.md`，再动代码。
