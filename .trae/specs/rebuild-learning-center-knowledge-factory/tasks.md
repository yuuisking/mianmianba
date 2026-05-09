# Tasks
- [x] Task 1: 定义内容与存储基线，完成“文件优先 + 索引辅助”的知识仓方案。
  - [x] SubTask 1.1: 设计公开文档、资源文件、目录元数据、来源记录、草稿与发布版本的目标目录结构。
  - [x] SubTask 1.2: 定义哪些数据写入文件系统，哪些数据保留在数据库或任务索引层。
  - [x] SubTask 1.3: 设计从 `data/learning-center.json` 向新内容仓迁移的映射规则。

- [x] Task 2: 重构公开学习中心的信息架构与 API 契约。
  - [x] SubTask 2.1: 设计知识库大类入口页的数据结构、筛选方式和展示字段。
  - [x] SubTask 2.2: 设计知识库阅读工作区的三栏数据契约：目录树、文档正文、右侧大纲。
  - [x] SubTask 2.3: 设计公开学习中心的路由规则、文档定位规则与 SEO/分享元信息。

- [x] Task 3: 设计语雀式阅读工作区与文档块规范。
  - [x] SubTask 3.1: 细化三栏布局、层级目录交互、文档大宽度阅读区和右侧大纲交互。
  - [x] SubTask 3.2: 定义 Markdown 文档块规范，包含图片、Mermaid、流程图、架构图、代码示例、面试问答和提示块。
  - [x] SubTask 3.3: 定义文档首页、空状态、未发布节点、长文滚动和移动端折叠策略。

- [x] Task 4: 设计“学练一体化”能力。
  - [x] SubTask 4.1: 设计文档内 AI 一键总结的交互、输入上下文和结果展示方式。
  - [x] SubTask 4.2: 设计学习中心机器人入口，支持岗位 JD / 目标驱动的学习计划生成。
  - [x] SubTask 4.3: 设计从文档一键进入专项训练的上下文透传结构。

- [x] Task 5: 重构管理员后台为知识工厂。
  - [x] SubTask 5.1: 设计管理员的知识库管理、目录管理、来源管理、草稿管理、发布管理五类工作台。
  - [x] SubTask 5.2: 明确管理员权限边界与普通用户隔离策略。
  - [x] SubTask 5.3: 设计“简单添加文档但质量高”的后台主流程，降低单人运维负担。

- [x] Task 6: 设计多来源采集与来源治理链路。
  - [x] SubTask 6.1: 设计手动贴链接、批量导入、定时扫描三种入口。
  - [x] SubTask 6.2: 设计来源白名单、抓取状态、去重策略、失败重试与来源可追溯能力。
  - [x] SubTask 6.3: 明确 GitHub、网页、语雀等来源进入系统后的统一中间表示。

- [x] Task 7: 设计多 AI 协同造文档流水线。
  - [x] SubTask 7.1: 定义目录规划 AI、路由分类 AI、摘要总述 AI、正文生成 AI、图例生成 AI、代码示例 AI、面试问答 AI、合成审核 AI 的角色与输入输出。
  - [x] SubTask 7.2: 设计单篇文档的状态流转：待采集 -> 待分类 -> 待创作 -> 待审核 -> 已发布。
  - [x] SubTask 7.3: 设计原创化约束、来源引用记录和反抄袭防线。

- [x] Task 8: 设计调度、审核和发布闭环。
  - [x] SubTask 8.1: 设计每日定时扫描、增量更新和失败任务补偿机制。
  - [x] SubTask 8.2: 设计管理员审核台，支持查看来源、查看草稿差异、二次编辑和发布。
  - [x] SubTask 8.3: 设计发布后的索引刷新、学习中心可见性切换和版本追踪。

- [x] Task 9: 设计重构实施顺序与验收标准。
  - [x] SubTask 9.1: 拆分最小上线版本：先公开学习中心重构，再后台知识工厂升级，再自动采集与定时任务。
  - [x] SubTask 9.2: 为每个阶段定义可验证的页面、接口、任务流和数据迁移验收点。
  - [x] SubTask 9.3: 明确与专项训练、认证系统、现有 AI 能力和内容迁移的依赖关系。

- [x] Task 10: 按最新产品反馈重做公开学习中心入口页。
  - [x] SubTask 10.1: 去掉入口页的大段说明模块，只保留知识库大类入口和角标式学习计划入口。
  - [x] SubTask 10.2: 将知识库卡片收口为“名称、简介、更新时间”三项信息，避免大卡片与花哨信息堆叠。

- [x] Task 11: 重构学习计划展示结构为“历史目标列表 + 体系分组链接”。
  - [x] SubTask 11.1: 将学习计划入口收口到知识库页角标位置，避免与文档阅读工作区抢主视觉。
  - [x] SubTask 11.2: 将计划结果改为浏览器内历史目标列表，并把每个目标的结果整理成“体系 -> 文档链接列表”。
  - [x] SubTask 11.3: 移除学习计划中的专项训练引导，只保留公开知识库文档链接。

- [x] Task 12: 二次收敛语雀式阅读工作区体验。
  - [x] SubTask 12.1: 重新调研语雀页面结构，按“左目录、正文留白、右侧轻量大纲”重排工作区。
  - [x] SubTask 12.2: 将 AI 总结从右侧重面板移回正文流内，避免工作区气泡化与拥挤感。
  - [x] SubTask 12.3: 统一工作区字体、段落节奏、目录密度与右栏权重，向更克制的阅读体验收口。

- [x] Task 13: 为知识工厂补齐自动来源发现能力。
  - [x] SubTask 13.1: 新增自动来源发现入口，不再强依赖管理员预先知道 GitHub 或网站链接。
  - [x] SubTask 13.2: 默认补齐官方文档与社区资料两类来源，并直接登记到知识工厂来源池中。

- [x] Task 14: 继续细化学习中心入口与语雀式阅读体验。
  - [x] SubTask 14.1: 学习计划面板在没有历史记录时只保留输入区，不再额外展示空历史容器；有历史记录后改为独立滚动容器，避免把知识库列表整体顶得过长。
  - [x] SubTask 14.2: 阅读工作区左侧目录与右侧本页目录支持拖拽调宽，并限制在可读范围内。
  - [x] SubTask 14.3: 继续按语雀阅读页收口字体栈、标题节奏、正文字号、行高与栏宽。
  - [x] SubTask 14.4: 将本轮学习中心收口版重新部署到 ECS 并完成公开页面与学习计划接口复验。

- [x] Task 15: 修复学习中心第二轮上线后的权限与体验问题。
  - [x] SubTask 15.1: 修复 ECS 上 `data/learning-center` 目录属主错误导致的新建知识库 `EACCES` 问题，并验证 `deploy` 进程可写。
  - [x] SubTask 15.2: 将知识工厂工作台收口成“采集、归类、总结发布、调度”四步顺序卡片，减少术语和面板复杂度。
  - [x] SubTask 15.3: 继续收口学习计划面板的滚动行为与视觉层次，降低 AI 味，保留更克制的目标与文档结构。
  - [x] SubTask 15.4: 将修复版重新部署到 ECS 并完成公开页、权限写入和学习计划接口复验。

- [x] Task 16: 去除文档 AI 总结的 mock 感并建立真实性约束。
  - [x] SubTask 16.1: 重构 AI 总结输入校验，明确区分“正文充足可总结”与“信息不足不可总结”两种路径。
  - [x] SubTask 16.2: 移除会在正文缺失时凭标题或极少元信息编造总结的兜底策略。
  - [x] SubTask 16.3: 为总结结果增加依据校验与空态提示，确保总结只围绕当前文档真实内容生成。

- [x] Task 17: 为文档阅读页增加 DeepSeek 风格的机器人对话助手。
  - [x] SubTask 17.1: 设计机器人 Logo 入口、对话面板、消息流和历史会话列表的交互结构。
  - [x] SubTask 17.2: 设计会话存储、会话标题生成、历史会话切换和继续对话机制。
  - [x] SubTask 17.3: 设计文档级上下文工程，明确当前文档、相邻文档、知识库范围和用户提问如何共同进入模型上下文。
  - [x] SubTask 17.4: 设计与 DeepSeek 对齐的多轮问答策略、边界提示和无依据拒答策略。

- [x] Task 18: 重构学习计划生成逻辑与展示依据。
  - [x] SubTask 18.1: 重新定义学习计划数据结构，要求输出学习顺序、推荐原因、能力缺口和覆盖范围。
  - [x] SubTask 18.2: 为 Java、前端、Vue 等成熟方向补充主流学习路线参考框架，作为学习计划排序基线。
  - [x] SubTask 18.3: 将前端展示从“只给链接”改为“阶段/体系 + 为什么学 + 对应文档依据”的可解释结果。
  - [x] SubTask 18.4: 明确知识库覆盖不足时的提示策略，禁止用不存在的内容凑路线。

- [x] Task 19: 将知识工厂重做为“输入课题即可自动生成”的单入口自动化系统。
  - [x] SubTask 19.1: 将后台主入口收敛为单课题输入流，例如输入“Java”“Vue”“前端”即可启动自动建库。
  - [x] SubTask 19.2: 设计自动来源筛选规则，优先官方文档、权威社区资料和高 star GitHub 项目，并明确去重、相关性和质量门槛。
  - [x] SubTask 19.3: 设计自动目录生成与知识领域边界隔离策略，确保“Java 不混 Android、Vue 不混无关前端专题”。
  - [x] SubTask 19.4: 设计自动执行链路：采集 -> 筛选 -> 目录生成 -> 草稿生成 -> 人审发布，默认无需管理员手工串联每一步。

- [x] Task 20: 重构知识文档生成模板与质量标准。
  - [x] SubTask 20.1: 为每篇正式文档固定骨架：总结归纳、正文解析、流程图/架构图/代码实例、面试常考。
  - [x] SubTask 20.2: 明确哪些主题必须生成流程图、哪些主题必须生成架构图或代码实例，避免只产出空泛段落。
  - [x] SubTask 20.3: 设计“缺失即标记，不用废话填充”的降级规则，保证内容真实可用。
  - [x] SubTask 20.4: 为草稿审核补充质量检查项，确保发布前可验证文档结构完整度和主题纯度。

- [x] Task 21: 定义这一轮学习中心与知识工厂重构的验证闭环。
  - [x] SubTask 21.1: 列出文档 AI 总结、机器人对话、学习计划、单课题自动建库四类核心回归路径。
  - [x] SubTask 21.2: 明确本地与 ECS 侧的验证步骤，包括接口、页面、会话、来源质量和生成结果抽检。
  - [x] SubTask 21.3: 规定上线前必须通过的真实性检查，避免再次出现 mock 感强、主题混乱和低质量内容灌入。

- [x] Task 22: 修复 Task21 最终验证暴露出的环境阻断与线上回归问题。
  - [x] SubTask 22.1: 修复 ECS `POST /api/learning/plan` 仍返回旧版 `groups` 结构的问题，重新部署为 `trackKey / trackLabel / coverageOverview / steps / uncovered` 新契约。
  - [x] SubTask 22.2: 将 `POST /api/learning/assistant` 正确部署到 ECS 并完成真测，确保文档机器人问答不再返回 `404`。
  - [x] SubTask 22.3: 补齐本地验证环境，提供有效的 PostgreSQL `DATABASE_URL` 与 `DEEPSEEK_API_KEY`，确保管理员登录、后台自动建库和文档助手回归可在本地完成。
    - 结果：本地 `.env.local` 已补齐合法 `DATABASE_URL`、`NEXTAUTH_SECRET`、`NEXTAUTH_URL` 与有效 `DEEPSEEK_API_KEY`；重启 `next dev` 后已真测通过管理员登录、`/admin/learning` 单入口页面、后台自动建库与文档助手。
  - [x] SubTask 22.4: 在上述修复完成后重跑 Task21 四类回归路径，并据结果回填 checklist 与 Task21。
    - 结果：本地与 ECS 已分别完成管理员登录、单入口自动建库、学习计划、文档 AI 总结、文档助手四类回归；其中 ECS 额外暴露的认证 `500` 已通过远端重新生成 Prisma Client、重新构建生产包并重启服务修复。

- [x] Task 23: 修复学习后台创建知识库样式与旧智能生成链路的 JSON 报错。
  - [x] SubTask 23.1: 将 `/admin/learning` 从旧“题库工厂 + 弹窗建库”页面切换回当前 spec 对齐的知识工厂驾驶舱样式，恢复单入口自动建库体验。
  - [x] SubTask 23.2: 将后台创建动作接入 `POST /api/admin/learning/auto-build`，避免首页继续走旧题库 Prisma 链路与过时结构。
  - [x] SubTask 23.3: 为旧 `POST /api/admin/learning/generate-kb` 增加代码围栏清洗、首个 JSON 对象提取与解析报错兜底，修复模型返回附带说明时的 JSON 解析失败问题。
  - [x] SubTask 23.4: 完成本地 `eslint`、`tsc` 与 `npm run build` 验证，并同步回填本轮任务文档。

# Task Dependencies
- [Task 2] depends on [Task 1]
- [Task 3] depends on [Task 2]
- [Task 4] depends on [Task 2]
- [Task 5] depends on [Task 1]
- [Task 6] depends on [Task 5]
- [Task 7] depends on [Task 6]
- [Task 8] depends on [Task 7]
- [Task 9] depends on [Task 1], [Task 2], [Task 3], [Task 4], [Task 5], [Task 6], [Task 7], [Task 8]
- [Task 10] depends on [Task 2], [Task 3], [Task 4]
- [Task 11] depends on [Task 4], [Task 10]
- [Task 12] depends on [Task 3], [Task 10]
- [Task 13] depends on [Task 5], [Task 6], [Task 7]
- [Task 14] depends on [Task 10], [Task 11], [Task 12], [Task 13]
- [Task 15] depends on [Task 13], [Task 14]
- [Task 16] depends on [Task 4], [Task 12], [Task 15]
- [Task 17] depends on [Task 4], [Task 12], [Task 16]
- [Task 18] depends on [Task 11], [Task 15]
- [Task 19] depends on [Task 5], [Task 6], [Task 7], [Task 15]
- [Task 20] depends on [Task 7], [Task 19]
- [Task 21] depends on [Task 16], [Task 17], [Task 18], [Task 19], [Task 20]
- [Task 22] depends on [Task 21]
