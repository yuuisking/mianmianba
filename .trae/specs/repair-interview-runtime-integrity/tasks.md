# Tasks

- [x] Task 1: 固化面试房间隔离键与冷启动规则
  - [x] SubTask 1.1: 盘点 `planId / stageId / roundId / mode` 在前端页面、消息接口、会话接口和本地快照中的读写路径
  - [x] SubTask 1.2: 设计并实现统一的房间隔离键，要求新的面试链接只恢复与当前键完全匹配的数据
  - [x] SubTask 1.3: 为旧缓存不匹配、新链接直达、刷新恢复三种场景补明确策略与回归样例
  - [x] SubTask 1.4: 梳理数据库正式消息与本地快照并存时的优先级、合并规则和冲突处理

- [x] Task 2: 修复题目证据锚定，禁止问到别人的项目
  - [x] SubTask 2.1: 梳理首题和追问消费的简历、画像、计划、轮次与历史消息来源，定位错误项目名进入链路的根因
  - [x] SubTask 2.2: 收紧首题与追问的证据过滤规则，确保只允许使用当前候选人的真实项目和能力点
  - [x] SubTask 2.3: 为“证据不足”设计安全降级，优先要求补充信息或转为澄清题，而不是错误深挖

- [x] Task 3: 修复开场文案与用户可见渲染
  - [x] SubTask 3.1: 重写开场语与首题承接文案，保证口径自然、通顺、像真人面试官
  - [x] SubTask 3.2: 统一用户可见文本渲染规则，消除 `**`、原始 Markdown 和格式错乱
  - [x] SubTask 3.3: 回归检查文字面试中的高亮、换行和强调展示

- [x] Task 4: 增加“消极回答主动结束”决策
  - [x] SubTask 4.1: 定义消极回答信号、累计窗口与主动结束阈值
  - [x] SubTask 4.2: 在提问链中加入“继续追问 / 切换验证点 / 主动结束”决策分支
  - [x] SubTask 4.3: 将主动结束原因、结束结果和报告消费字段打通

- [x] Task 5: 补齐“积极回答转算法题”分支
  - [x] SubTask 5.1: 明确算法题触发条件、适用轮次和弹窗交互
  - [x] SubTask 5.2: 设计并实现真正可用的算法题页面，至少包含题面、语言切换、编辑器、运行、提交、倒计时和结果反馈
  - [x] SubTask 5.3: 打通从面试追问到算法题会话的切换链路
  - [x] SubTask 5.4: 将算法题结果回写到当前轮次评估与报告上下文

- [x] Task 6: 收紧 Agent 团交付边界与 prompt 质量
  - [x] SubTask 6.1: 盘点 Agent 蓝图、编排种子与运行时真实执行链，明确哪些能力已交付、哪些仍是占位
  - [x] SubTask 6.2: 重写并收口主面试官、Planner、Composer、Guard 的 prompt 验收标准，补“自然度、错误项目拦截、内部词泄漏”校验维度
  - [x] SubTask 6.3: 清理对外文案和实现，避免把未真实运行的 Agent 角色包装成已完整上线能力

- [x] Task 7: 建立面试官行为自动化回归
  - [x] SubTask 7.1: 为会话隔离、首题锚定、Markdown 渲染、主动结束、算法题触发建立自动化测试样例
  - [x] SubTask 7.2: 把关键测试接入可重复执行的命令，避免继续只靠人工走查
  - [x] SubTask 7.3: 明确主链改动的最小回归门槛，未通过时禁止视为验收完成

- [x] Task 8: 完成回归验证与线上复测
  - [x] SubTask 8.1: 覆盖“新链接不串旧历史”“首题锚定当前简历”“开场无 Markdown 泄漏”“消极回答可主动结束”“积极回答可转算法题”五条主回归
  - [x] SubTask 8.2: 执行 lint、构建、必要的自动化或脚本校验
  - [x] SubTask 8.3: 发版 ECS 并做浏览器真验，记录问题与结果

# Task Dependencies
- Task 2 depends on Task 1
- Task 3 depends on Task 2
- Task 4 depends on Task 2
- Task 5 depends on Task 2
- Task 6 depends on Task 2, Task 3
- Task 7 depends on Task 1, Task 2, Task 3, Task 4, Task 5, Task 6
- Task 8 depends on Task 1, Task 2, Task 3, Task 4, Task 5, Task 6, Task 7
