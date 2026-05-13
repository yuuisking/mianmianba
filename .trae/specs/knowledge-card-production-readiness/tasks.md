# Tasks

- [x] Task 1: 将专项范围重规划为“今晚可上线、明早可验收”的知识卡片 MVP 闭环。
  - [x] SubTask 1.1: 明确本轮只做规则派生，不新增数据库表和后台配置。
  - [x] SubTask 1.2: 明确首页必须同时出现 `题库 / 知识卡片 / 学习路径` 三类入口。
  - [x] SubTask 1.3: 明确详情页必须补齐 `前置知识 / 相关知识点 / 相关面试题 / 学习路径建议` 四类模块。

- [x] Task 2: 完成首页三类入口的服务端聚合与前台接线。
  - [x] SubTask 2.1: 新增 `knowledgeCardStudio.ts` 统一派生知识卡片与学习路径预览。
  - [x] SubTask 2.2: 在 `src/app/learning/page.tsx` 服务端并行获取题库、知识卡片、学习路径数据。
  - [x] SubTask 2.3: 在 `LearningCenterClient.tsx` 中完成首页三入口渲染、筛选和跳转。

- [x] Task 3: 完成详情页关联学习模块接线。
  - [x] SubTask 3.1: 在 `documentService.ts` 中为详情页桥接 `knowledgeRelations` 与相关题跳转路径。
  - [x] SubTask 3.2: 在 `QuestionDetailClient.tsx` 中新增关联学习面板。
  - [x] SubTask 3.3: 在线上实测文档中验证四类关联模块真实渲染。

- [x] Task 4: 保持宽屏阅读母版，并为新增模块补齐样式。
  - [x] SubTask 4.1: 首页新增知识卡片和学习路径卡片样式，不回退成旧列表页。
  - [x] SubTask 4.2: 详情页新增关联模块卡片样式，不挤压正文主阅读区。
  - [x] SubTask 4.3: 保留此前正文宽度 P0 收口结果，继续按大屏阅读思路呈现。

- [x] Task 5: 完成构建、部署和 ECS 真验。
  - [x] SubTask 5.1: 执行 `npm run build -- --webpack`，确认本轮代码可构建。
  - [x] SubTask 5.2: 执行 `./scripts/ops/deploy-local-build-to-ecs.sh --skip-backup`，完成 ECS 发版。
  - [x] SubTask 5.3: 用公网浏览器验证首页三入口与详情页四类关联模块。

- [x] Task 6: 回写专项文档与项目说明。
  - [x] SubTask 6.1: 在 spec 中记录今晚重规划后的 MVP 范围与执行结果。
  - [x] SubTask 6.2: 在 checklist 中补充本轮实际交付与验收项。
  - [x] SubTask 6.3: 在 `说明文档.md` 中记录实现、验证和部署结果。

# Task Dependencies
- [Task 2] depends on [Task 1]
- [Task 3] depends on [Task 1]
- [Task 4] depends on [Task 2], [Task 3]
- [Task 5] depends on [Task 2], [Task 3], [Task 4]
- [Task 6] depends on [Task 5]
