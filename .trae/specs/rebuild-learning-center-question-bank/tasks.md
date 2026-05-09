# Tasks

## Phase 1: 数据层重建（基础）

- [ ] Task 1: 设计并创建新的 Prisma 数据模型
  - [ ] SubTask 1.1: 定义 KnowledgeBase 模型（知识库）
  - [ ] SubTask 1.2: 定义 Category 模型（分类）
  - [ ] SubTask 1.3: 定义 Question 模型（题目）
  - [ ] SubTask 1.4: 定义 UserQuestionProgress 模型（用户刷题进度）
  - [ ] SubTask 1.5: 运行 prisma migrate，创建数据库表

- [ ] Task 2: 创建基础 API 路由
  - [ ] SubTask 2.1: GET /api/learning/kbs — 获取所有知识库列表
  - [ ] SubTask 2.2: GET /api/learning/kbs/[kbId]/categories — 获取知识库下的分类
  - [ ] SubTask 2.3: GET /api/learning/categories/[categoryId]/questions — 获取分类下的题目列表（支持分页、难度筛选）
  - [ ] SubTask 2.4: GET /api/learning/questions/[questionId] — 获取题目详情
  - [ ] SubTask 2.5: POST /api/learning/progress — 记录用户刷题进度
  - [ ] SubTask 2.6: GET /api/learning/progress — 获取用户刷题进度统计

## Phase 2: 前台学习中心重构（用户可见）

- [ ] Task 3: 重建学习中心入口页
  - [x] SubTask 3.1: 设计知识库卡片列表（类似面试鸭首页）
  - [x] SubTask 3.2: 实现分类筛选（Java、前端、MySQL等）
  - [x] SubTask 3.3: 展示每个知识库的统计（题目数、分类数、已掌握率）

- [ ] Task 4: 重建分类页（题目列表）
  - [ ] SubTask 4.1: 设计题目列表表格（题目、难度、标签、出现频率）
  - [ ] SubTask 4.2: 实现难度筛选和标签筛选
  - [ ] SubTask 4.3: 实现分页
  - [ ] SubTask 4.4: 展示用户在该分类的进度（已刷/总题数）

- [ ] Task 5: 重建题目详情页（学习模式）
  - [ ] SubTask 5.1: 展示题目题干
  - [ ] SubTask 5.2: "查看答案"按钮，点击后展开结构化答案
  - [ ] SubTask 5.3: 答案结构：核心要点 -> 详细解析 -> 代码示例 -> 关联题目
  - [ ] SubTask 5.4: "上一题"/"下一题"导航
  - [ ] SubTask 5.5: "去训练"按钮（跳转到模拟面试）
  - [ ] SubTask 5.6: "收藏"按钮

- [ ] Task 6: 实现刷题模式
  - [ ] SubTask 6.1: 刷题设置弹窗（顺序/随机/按难度、难度筛选、范围选择）
  - [ ] SubTask 6.2: 单题展示界面（只显示题干）
  - [ ] SubTask 6.3: 用户输入答案区域
  - [ ] SubTask 6.4: "提交答案" -> AI 评估（调用 DeepSeek API）
  - [ ] SubTask 6.5: 展示 AI 评估结果 + 参考答案
  - [ ] SubTask 6.6: 用户标记状态（掌握了/还需要练/收藏）
  - [ ] SubTask 6.7: 自动进入下一题

- [ ] Task 7: 实现进度追踪面板
  - [ ] SubTask 7.1: 用户总览（已刷题数、掌握率、连续打卡天数）
  - [ ] SubTask 7.2: 分类掌握率图表
  - [ ] SubTask 7.3: 薄弱分类高亮
  - [ ] SubTask 7.4: 收藏题目列表

## Phase 3: 后台题库工厂（管理员）

- [ ] Task 8: 重建后台管理首页
  - [ ] SubTask 8.1: 统计面板（知识库数、题目总数、草稿数、待审核数）
  - [ ] SubTask 8.2: 知识库管理（创建、编辑、删除知识库）
  - [ ] SubTask 8.3: 分类管理（在每个知识库下创建分类）

- [ ] Task 9: 实现题目管理
  - [ ] SubTask 9.1: 题目列表（支持按状态、分类、难度筛选）
  - [ ] SubTask 9.2: 题目编辑页面（可编辑所有字段）
  - [ ] SubTask 9.3: 题目状态切换（草稿->发布->归档）
  - [ ] SubTask 9.4: 草稿审核队列

- [ ] Task 10: 实现 AI 内容采集引擎
  - [ ] SubTask 10.1: 设计 AI Prompt：从文本中提取面试题
  - [ ] SubTask 10.2: 实现 URL 内容抓取（GitHub、博客等）
  - [ ] SubTask 10.3: 实现文本直接输入生成题目
  - [ ] SubTask 10.4: 实现批量生成（输入主题，AI生成多道题）
  - [ ] SubTask 10.5: 生成结果保存为草稿

- [ ] Task 11: 实现来源管理
  - [ ] SubTask 11.1: 登记来源（URL、类型、状态）
  - [ ] SubTask 11.2: 来源去重（避免同一URL重复采集）
  - [ ] SubTask 11.3: 来源质量评分

## Phase 4: 整合与升级

- [ ] Task 12: 升级学习计划
  - [ ] SubTask 12.1: 基于题库生成学习计划（推荐分类和题目）
  - [ ] SubTask 12.2: 结合面试报告薄弱点推荐题目

- [ ] Task 13: 升级学练联动
  - [ ] SubTask 13.1: 从题目详情页一键进入专项训练（带入题目主题）
  - [ ] SubTask 13.2: 面试报告关联到具体题目分类

- [ ] Task 14: 升级文档助手
  - [x] SubTask 14.1: 在题目详情页集成 AI 助手
  - [x] SubTask 14.2: 助手上下文包含当前题目和答案

- [x] Task 16: 修复学习中心题库入口报错，并校正助手可见性与隔离边界。
  - [x] SubTask 16.1: 修复 `GET /api/learning/kbs` 在题库表未就绪时导致入口页报错的问题，回退到文件知识库兜底返回列表。
  - [x] SubTask 16.2: 修复知识库详情页与分类页的数据加载容错，避免因接口返回异常结构导致前端直接崩溃。
  - [x] SubTask 16.3: 确保“面面吧智能助手”在 `/learning` 首页独立可见，不依赖进入题目详情后才出现。
  - [x] SubTask 16.4: 将题目详情页 AI 助手拆分为独立的“题目助手”，不再直接复用“面面吧智能助手”组件与交互。

## Phase 5: 数据迁移与清理

- [ ] Task 15: 清理旧数据
  - [ ] SubTask 15.1: 备份现有 learning-center 文件数据
  - [ ] SubTask 15.2: 删除旧的数据文件和API路由（保留备份）
  - [ ] SubTask 15.3: 清理前端旧组件

## Follow-up: 本次 checklist 核对后续任务（2026-05-04）

- [ ] Task 17: 补齐题库 Prisma 迁移落库证据并完成表结构验收
  - [ ] SubTask 17.1: 新增包含 `KnowledgeBase`、`Category`、`Question`、`UserQuestionProgress` 的 Prisma migration
  - [ ] SubTask 17.2: 在本地 PostgreSQL 执行迁移并核对四张表及索引实际存在
  - [ ] SubTask 17.3: 将迁移结果与校验命令回填到 `说明文档.md` 和 checklist

- [ ] Task 18: 补齐学习中心入口页真正的“按分类筛选知识库”能力
  - [ ] SubTask 18.1: 设计可复用的分类维度聚合接口或前端聚合逻辑
  - [ ] SubTask 18.2: 在 `/learning` 首页提供分类筛选控件，而不只是关键字搜索
  - [ ] SubTask 18.3: 为题库数据与文件兜底数据统一输出可筛选分类字段

- [ ] Task 19: 收口题目详情页学习模式剩余交互
  - [x] SubTask 19.1: 实现“上一题 / 下一题”导航并基于当前分类顺序跳转
  - [x] SubTask 19.2: 修复收藏状态初始化与持久化回显，确保刷新后状态正确
  - [ ] SubTask 19.3: 将“去训练”从当前刷题模式区分为真正的模拟面试 / 专项训练入口，满足 spec 文案语义

- [ ] Task 20: 收口刷题模式的标记与收藏闭环
  - [ ] SubTask 20.1: 在刷题模式补充“收藏”操作并写入 `bookmarked`
  - [ ] SubTask 20.2: 为“还需要练”增加明确的持久化字段或弱项标记策略
  - [ ] SubTask 20.3: 让刷题页在继续下一题前回显本题已提交状态与参考答案摘要

- [ ] Task 21: 实现进度面板前端展示
  - [x] SubTask 21.1: 在学习中心或个人页接入 `/api/learning/progress` 总览统计
  - [ ] SubTask 21.2: 展示分类掌握率与薄弱分类列表
  - [ ] SubTask 21.3: 展示收藏题目列表，并与题目详情 / 刷题模式联动

- [ ] Task 22: 收口题库后台工作台 UI 与筛选能力
  - [x] SubTask 22.1: 在后台题目列表补齐状态 / 分类 / 难度筛选器
  - [ ] SubTask 22.2: 补齐真实可访问的题目编辑页面，支持修改所有字段
  - [x] SubTask 22.3: 补齐草稿、发布、归档三态切换与后台回显
  - [x] SubTask 22.4: 将草稿审核队列做成独立可见的后台工作区，而不是仅停留在接口层

- [ ] Task 23: 补齐 AI 采集与来源管理缺口
  - [ ] SubTask 23.1: 支持从 URL 抓取正文后生成题目，并补充可验证的成功路径
  - [ ] SubTask 23.2: 明确“批量生成”与“单次生成”的后台交互入口和结果回显
  - [ ] SubTask 23.3: 增加来源登记、来源去重与来源状态管理页面/接口闭环

- [ ] Task 24: 补齐题库与学习计划 / 面试报告联动
  - [ ] SubTask 24.1: 让学习计划输出推荐具体题目或题目分类引用
  - [ ] SubTask 24.2: 为面试报告补充题目分类关联字段或映射逻辑
  - [ ] SubTask 24.3: 增加从题目页进入专项训练并带入题目主题的联动能力

- [ ] Task 25: 完成题库旧链路清理与最终验收
  - [ ] SubTask 25.1: 备份并清理与题库重构冲突的旧 learning 数据/API/组件
  - [ ] SubTask 25.2: 执行用户链路与管理员链路全流程回归
  - [ ] SubTask 25.3: 补充移动端适配与题目列表性能验证结果

- [x] Task 26: 修复学习中心分类页题目列表链路兜底与稳定返回
  - [x] SubTask 26.1: 为 `GET /api/learning/categories/[categoryId]/questions` 增加 `Prisma` 空结果/异常时的文件仓题目兜底，并保持分页结构稳定返回
  - [x] SubTask 26.2: 为 `GET /api/learning/questions/[questionId]` 增加文件仓详情兜底，打通分类页进入题目详情的读取链路
  - [x] SubTask 26.3: 为题目助手与刷题评估增加文件仓题目上下文兼容，但不改动 `/api/learning/assistant` 的“面面吧智能助手”链路
  - [x] SubTask 26.4: 为分类页/刷题页/题目助手补充 `kbId`、`categoryId` 定位参数，避免文件仓分类或题目 ID 重名导致串库
  - [x] SubTask 26.5: 为文件仓题目访问补充进度写入的无副作用兜底，并完成 `tsc` + `build` 验证

- [x] Task 27: 高质量重构题库版学习中心与后台工作台前端
  - [x] SubTask 27.1: 将 `/learning` 首页重构为“品牌化学习中心入口 + 学习计划工作台 + 知识库目录”三段式布局，并恢复学习计划生成面板
  - [x] SubTask 27.2: 将知识库页与分类页升级为统一的编排式浏览体验，补齐标签筛选、进度信息与更完整的内容编排
  - [x] SubTask 27.3: 将题目详情页重构为语雀式阅读工作区，补齐目录、要点、代码、图示、关联题与前后题导航
  - [x] SubTask 27.4: 重构 `admin/learning/[kbId]` 工作台，让管理员直接看到自动生成文章目录、草稿审核队列、来源池与发布成果
  - [x] SubTask 27.5: 修复缺失的 `.btn-outline` / `.input` 基础样式，收口学习中心与后台工作台的粗糙视觉
  - [x] SubTask 27.6: 保持“面面吧智能助手”核心能力与题库独立题目助手边界不变，仅调整前端挂载位置与页面布局
  - [x] SubTask 27.7: 执行 `eslint`、`tsc` 与 `build` 完成验收，并将结果回填文档

# Task Dependencies

- Phase 1 (Task 1-2) 是基础，必须先完成
- Phase 2 (Task 3-7) 依赖 Phase 1
- Phase 3 (Task 8-11) 依赖 Phase 1
- Phase 4 (Task 12-14) 依赖 Phase 2 和 Phase 3
- Phase 5 (Task 15) 最后执行
- Task 16 依赖 Task 3 与 Task 14

并行执行：
- Task 3-7（前台）和 Task 8-11（后台）可以并行开发
