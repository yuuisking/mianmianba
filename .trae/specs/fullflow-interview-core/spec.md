# 全流程面试核心竞争力 Spec

## Why
当前全流程面试仍存在四个核心断层：默认只有文字形态、文本输出不是真流式、算法题没有接入真实流程、公司岗位面经采集没有真正驱动出题。同时，用户中途退出或下一轮缺席时，系统也没有按真实招聘流程执行淘汰。以上问题直接削弱了平台最关键的产品竞争力，必须按“真实公司招聘链路”重构，而不是继续在旧的单轮会话模型上打补丁。

## What Changes
- 将全流程面试默认定义为“语音 + 视频”的多轮真实招聘流程，文字模式只作为降级手段存在。
- 把文字输出从“完整生成后拆句发送”的伪流式改成真实流式输出，并与语音播报、实时字幕共用同一条回答链路。
- 新增“公司 + 岗位 + 轮次”维度的真实面经采集与结构化洞察入库，并要求后续每轮提问显式消费这些洞察。
- 将一面、二面、三面、HR 面拆成独立 Agent 团，并引入审核员 Agent 与全局流程编排 Agent。
- 在候选人前序轮次表现达标时，于终面前插入限时算法题，纳入本轮评分和最终淘汰结论。
- 引入“中途退出淘汰 / 超时未到场淘汰 / 本轮未通过淘汰”状态机，并补齐邮件 + 站内信通知。
- 为每一轮面试输出可复盘反馈，且下一轮 Agent 必须读取前一轮反馈与风险标签。

## Impact
- Affected specs: `iterate-launch-interview-flow`、`rebuild-realtime-interview-room`、`develop-voice-interview`、`develop-video-interview`、`strengthen-interview-prompt-intelligence`
- Affected code:
  - `src/app/setup/page.tsx`
  - `src/app/profile/page.tsx`
  - `src/app/interview/page.tsx`
  - `src/app/api/chat/route.ts`
  - `src/app/api/sessions/route.ts`
  - `src/app/api/sessions/[id]/route.ts`
  - `src/app/api/v2/interview-experience-tasks/route.ts`
  - `src/lib/interview/prompt.ts`
  - `src/lib/interview-v2/planService.ts`
  - `src/lib/interview-v2/stateMachine.ts`
  - `src/lib/interview-v2/agents.ts`
  - `prisma/schema.prisma`

## ADDED Requirements
### Requirement: 全流程默认采用语音视频面试
系统 SHALL 在全流程面试中默认使用语音 + 视频房间形态，提供更接近真实面试的互动体验。

#### Scenario: 默认进入语音视频房间
- **WHEN** 用户从全流程列表进入某一轮正式面试
- **THEN** 系统默认按语音 + 视频模式初始化房间、设备权限和面试状态区
- **AND THEN** 若摄像头或麦克风不可用，系统允许降级到语音或文字，但必须明确提示当前降级原因

#### Scenario: 房间内保留实时字幕
- **WHEN** AI 面试官发言
- **THEN** 房间同时提供实时字幕与语音播报
- **AND THEN** 字幕与音频内容保持同源，不允许出现文字与播报内容不一致

### Requirement: 文字回答必须是真流式
系统 SHALL 以真实流式输出替代当前“完整生成后拆句发送”的伪流式输出。

#### Scenario: 模型 token 级输出
- **WHEN** AI 开始生成回答
- **THEN** 前端在生成过程中持续收到增量文本
- **AND THEN** 状态区明确显示“检索中 / 思考中 / 回答中 / 播报中”

#### Scenario: 流式异常降级
- **WHEN** 上游模型或网络无法提供流式返回
- **THEN** 系统记录本次降级原因
- **AND THEN** 前端给出清晰提示，不得伪装成正常流式

### Requirement: 面经采集必须真实驱动出题
系统 SHALL 基于公司、岗位和轮次维度采集真实面经，并把结构化洞察写入数据库，供后续出题 Agent 直接消费。

#### Scenario: 发起采集任务
- **WHEN** 用户在全流程配置页点击 `采集最新面经`
- **THEN** 系统创建真实采集任务，展示进度、步骤、来源数量和完成摘要
- **AND THEN** 任务完成后将洞察写入 `InterviewExperienceCollectionTask / InterviewExperienceInsight` 及后续计划摘要

#### Scenario: 面试官消费面经洞察
- **WHEN** 某一轮 Agent 团准备提问
- **THEN** 至少读取与当前公司、岗位、轮次匹配的最新洞察
- **AND THEN** 问题必须包含具体业务语境、考察重点或追问方向，不允许退化为“综合面试”类泛化模板题

### Requirement: 多轮面试使用独立 Agent 团
系统 SHALL 为一面、二面、三面、HR 面分别配置独立 Agent 团，不允许混用同一套面试官人格和提问策略。

#### Scenario: 独立轮次 Agent 团
- **WHEN** 用户进入不同轮次
- **THEN** 系统装载对应轮次的 Agent 团配置，包括主面试官、追问面试官、记录员、审核员
- **AND THEN** 每一轮 Agent 团的提问重点、语气、容错和淘汰门槛与该轮真实职责一致

#### Scenario: 全局编排 Agent 贯穿始终
- **WHEN** 某一轮结束
- **THEN** 全局编排 Agent 汇总本轮表现、风险标签、待验证点和是否晋级结论
- **AND THEN** 下一轮开始前，系统将这些结论注入下一轮 Agent 团输入

#### Scenario: 三评审多数票裁决
- **WHEN** 某一轮正式结束
- **THEN** 系统必须拉起 3 个独立评审 Agent，从不同视角分别投票 `PASS / FAIL`
- **AND THEN** 票数过半才代表本轮通过
- **AND THEN** 裁决 Agent 只能汇总多数票结果，不能推翻多数票
- **AND THEN** 每位评审 Agent 与裁决 Agent 都要输出可写入复盘中心的结构化建议

### Requirement: 算法题按表现触发并参与评分
系统 SHALL 在前序轮次表现达标时，于终面前触发限时算法题，并将结果并入最终评分。

#### Scenario: 触发算法题
- **GIVEN** 候选人在前序轮次达到设定阈值
- **WHEN** 系统进入指定技术轮次尾声
- **THEN** 系统弹出算法题模块，包含题目说明、倒计时、代码编辑器和提交按钮

#### Scenario: 算法题参与最终裁决
- **WHEN** 候选人提交算法题或倒计时结束
- **THEN** 系统记录 `CodingSession / CodingSubmission`
- **AND THEN** 算法题得分会影响本轮审核员 Agent 的通过结论与全局最终结论

### Requirement: 中途退出与缺席必须淘汰
系统 SHALL 将中途退出、关闭页面、刷新页面、超时未参加下一轮等行为视为真实招聘中的淘汰事件。

#### Scenario: 中途退出当前轮次
- **WHEN** 候选人在面试进行中主动离开、关闭页面或刷新页面
- **THEN** 当前轮次状态更新为 `ELIMINATED_EXITED`
- **AND THEN** 当前计划不可继续本轮，也不得再次进入同一轮次

#### Scenario: 下一轮缺席
- **GIVEN** 系统已安排下一轮时间
- **WHEN** 候选人超过预定时间 10 分钟仍未参加
- **THEN** 当前计划状态更新为 `ELIMINATED_NO_SHOW`
- **AND THEN** 系统发送缺席结果通知，并终止后续轮次

### Requirement: 通知必须覆盖邀约、提醒和淘汰
系统 SHALL 通过邮件 + 站内信通知候选人参与下一轮，并同步结果状态。

#### Scenario: 发出下一轮邀约
- **WHEN** 审核员 Agent 判定候选人通过本轮
- **THEN** 系统自动生成下一轮面试邀约，包含轮次、时间、模式和注意事项
- **AND THEN** 同时发送邮件与站内信

#### Scenario: 发送淘汰通知
- **WHEN** 候选人被判定淘汰、缺席或中途退出
- **THEN** 系统向候选人发送结果通知
- **AND THEN** 复盘中心保留本轮反馈与淘汰原因

### Requirement: 每轮输出可复盘反馈
系统 SHALL 在每一轮结束后生成结构化反馈，供候选人复盘和下一轮 Agent 消费。

#### Scenario: 轮次复盘
- **WHEN** 某一轮结束
- **THEN** 系统输出本轮亮点、风险、关键证据、淘汰风险、建议行动
- **AND THEN** 候选人可以在流程中查看历史轮次反馈，不必等全部流程结束

## MODIFIED Requirements
### Requirement: 全流程计划创建
系统 SHALL 将全流程计划定义为“公司级真实招聘流程编排”，而不是简单的多阶段文字问答。

### Requirement: 全流程列表页
系统 SHALL 在列表页展示当前轮次、是否通过、下一轮时间、缺席风险和最终结果状态，为正式招聘流程管理提供可视化入口。

### Requirement: Prompt 构建
系统 SHALL 在全流程模式下优先消费公司岗位面经洞察、上一轮反馈和当前轮次职责，而不是仅消费通用 `topic/desc` 标签。

## REMOVED Requirements
### Requirement: 全流程默认使用纯文字面试
**Reason**: 该模式与真实面试差距过大，且无法支撑产品核心竞争力。
**Migration**: 将纯文字模式降为兜底能力，仅在媒体不可用时使用。

### Requirement: 旧会话完成即 `completed`
**Reason**: 该状态模型无法区分正常结束、主动退出、缺席淘汰和审核淘汰。
**Migration**: 增加面向招聘流程的细粒度状态机，并要求前后端统一写入。
