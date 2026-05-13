# Tasks

- [ ] Task 1: 重构全流程运行时主链路
  - [ ] SubTask 1.1: 盘点并确定全流程正式运行时统一落到 `InterviewPlan / InterviewPlanStage / InterviewRound`，避免继续依赖旧 `Session` 完成多轮招聘流程。
  - [ ] SubTask 1.2: 为全流程房间补统一入口，明确每一轮使用的模式、状态、上下文读取和结果回写。
  - [ ] SubTask 1.3: 梳理与旧 `/interview` 页面、旧 `/api/sessions/*` 的兼容或迁移方案。

- [ ] Task 2: 实现全流程语音 + 视频面试房间
  - [ ] SubTask 2.1: 在全流程轮次内默认拉起语音 + 视频房间，打通麦克风、摄像头、实时字幕与 AI 播报。
  - [ ] SubTask 2.2: 为媒体失败场景设计降级路径，支持降级到语音或文字，但必须显式提示。
  - [ ] SubTask 2.3: 校验全流程房间与当前实时面试房间的差异，复用可复用能力，避免重复实现。

- [ ] Task 3: 将文字回复改造成真流式
  - [ ] SubTask 3.1: 改造 `src/app/api/chat/route.ts`，接入上游模型的真实流式返回，不再先拿全文再拆句。
  - [ ] SubTask 3.2: 统一状态事件协议，让前端能稳定展示检索中、思考中、回答中、播报中。
  - [ ] SubTask 3.3: 回归语音、视频、文字三种模式的流式一致性。

- [ ] Task 4: 接通真实面经采集 -> 出题链路
  - [ ] SubTask 4.1: 扩展采集任务结构，明确公司、岗位、轮次、来源、时效性和证据标签。
  - [x] SubTask 4.2: 改造 prompt 构建与 Agent 输入，显式消费 `experienceInsights` 与上一轮反馈。
  - [x] SubTask 4.4: 将提问链拆为 Planner / Evidence / Composer / Guard 多 Agent，和评审多 Agent 解耦。
  - [x] SubTask 4.5: 将公开网页面经采集接入 setup 页面任务链，完成抓取、抽取、质量审核、合规审核与去重入库。
  - [ ] SubTask 4.3: 为“腾讯 Java 后端”这类场景补真实回归样本，确认不再出现泛化题。

- [ ] Task 5: 构建多轮独立 Agent 团
  - [x] SubTask 5.1: 定义一面、二面、三面、HR 面的 Agent 团职责、输入、输出和评分口径。
  - [ ] SubTask 5.2: 新增审核员 Agent，负责本轮通过/淘汰裁决和下一轮建议。
  - [x] SubTask 5.3: 新增全局编排 Agent，负责汇总历史轮次反馈并注入下一轮上下文。
  - [x] SubTask 5.4: 为每一轮接入 3 个独立评审 Agent，多数票过半才通过本轮。
  - [x] SubTask 5.5: 将评审团投票结果、裁决摘要和改进建议结构化写入复盘中心。

- [ ] Task 6: 接入算法题与限时评分
  - [ ] SubTask 6.1: 设计前序表现阈值，决定何时触发算法题。
  - [ ] SubTask 6.2: 在指定轮次尾声插入 `CodingSession`，支持倒计时、提交与自动收卷。
  - [ ] SubTask 6.3: 将算法题结果并入审核员 Agent 的评分与晋级结论。

- [ ] Task 7: 建立淘汰、缺席与通知状态机
  - [ ] SubTask 7.1: 为计划、轮次、会话补充 `ELIMINATED_EXITED / ELIMINATED_NO_SHOW / ELIMINATED_REVIEW` 等状态。
  - [x] SubTask 7.2: 在中途退出、页面关闭、刷新、超时未参加时稳定写入状态并阻止继续当前轮次。
  - [ ] SubTask 7.3: 接入邮件 + 站内信，覆盖邀约、提醒、缺席和淘汰通知。

- [ ] Task 8: 打通逐轮反馈与复盘中心
  - [ ] SubTask 8.1: 每轮面试结束后输出结构化反馈并落库。
  - [ ] SubTask 8.2: 在候选人侧展示各轮次反馈、亮点、风险、建议行动。
  - [ ] SubTask 8.3: 让复盘中心按轮次聚合全流程成长轨迹。

- [ ] Task 9: 完成验证与上线准备
  - [ ] SubTask 9.1: 补关键自动化测试和状态机回归用例。
  - [ ] SubTask 9.2: 本地完成构建、数据库迁移、诊断检查与手工联调。
  - [ ] SubTask 9.3: 部署 ECS，并按公司岗位、算法题触发、退出淘汰、下一轮通知逐项真验。

# Task Dependencies
- Task 2 depends on Task 1
- Task 3 depends on Task 1
- Task 4 depends on Task 1
- Task 5 depends on Task 4
- Task 6 depends on Task 5
- Task 7 depends on Task 1
- Task 8 depends on Task 5, Task 7
- Task 9 depends on Task 2, Task 3, Task 4, Task 5, Task 6, Task 7, Task 8
