# Tasks
- [x] Task 1: 梳理当前面试官 prompt 与上下文链路
  - [x] SubTask 1.1: 盘点 `src/lib/interview/prompt.ts` 中系统 prompt、开场语、模式分支与专项训练逻辑的现状问题。
  - [x] SubTask 1.2: 盘点 `src/app/api/chat/route.ts` 中上下文注入、检索判断、消息组装与模式切换的现状问题。
  - [x] SubTask 1.3: 明确专项训练首题、后续追问、纠偏反馈、上下文保持四类能力的缺口。

- [x] Task 2: 重构专项训练与正式面试的 prompt 架构
  - [x] SubTask 2.1: 重新设计专项训练模式的系统 prompt，明确岗位感、主题感、训练目标感与能力层级约束。
  - [x] SubTask 2.2: 重新设计文字面试与实时面试模式的系统 prompt，避免三种模式共用泛化问法。
  - [x] SubTask 2.3: 为 prompt 增加“禁止空题、禁止泛题、禁止与岗位脱节”的强约束。

- [x] Task 3: 重做首题生成与追问策略
  - [x] SubTask 3.1: 重写 `buildInterviewOpening()` 或等价首题生成逻辑，去掉固定弱题模板。
  - [x] SubTask 3.2: 定义首题优先类型，如项目切入题、场景决策题、原理应用结合题、故障排查题、设计取舍题。
  - [x] SubTask 3.3: 定义后续追问规则，确保问题会基于上一轮回答持续递进，而不是重复泛问。

- [x] Task 4: 建立上下文工程与质量自检
  - [x] SubTask 4.1: 明确每一轮都必须持续携带的关键上下文字段。
  - [x] SubTask 4.2: 在最终发问前增加最小题目质量自检或重生成机制，拦截过泛、过空、与岗位不符的问题。
  - [x] SubTask 4.3: 收紧检索链路与题目生成链路的职责边界，避免“检索结果”替代“面试设计能力”。

- [x] Task 5: 验证典型专项训练与正式面试场景
  - [x] SubTask 5.1: 验证 `Java 后端开发` 等典型专项训练首题是否具备真实面试价值。
  - [x] SubTask 5.2: 验证多轮对话后模型仍能保持岗位、主题和目标不漂移。
  - [x] SubTask 5.3: 验证正式面试模式没有被专项训练的高聚焦策略误伤。
  - [x] SubTask 5.4: 运行必要的类型检查、构建或聚焦验证，确认改动稳定。
  - 说明：已先修正 ECS `/srv/resumer` 仍运行旧版 `prompt.ts` 的状态，再以线上账号 `yangyudei163@163.com` 在 ECS 运行态完成专项训练与正式面试验证；其中 `Java 后端开发 / JVM 内存模型与 GC 调优` 首题已落到真实排障题，多轮追问持续围绕 `promotion failed`、`Concurrent Mode Failure`、GC 日志与缓存键生命周期展开，正式文字面试则继续围绕订单履约、库存预占、消息表与补偿机制追问，未出现被专项训练口径误伤的情况；同时补跑本地 `node ./node_modules/typescript/bin/tsc --noEmit` 与 `npm run build`，并在 ECS 执行备份、同步、`npx prisma generate`、`npx prisma migrate deploy`、`npm run build`、`systemctl restart resumer` 与健康检查通过。

# Task Dependencies
- Task 2 depends on Task 1
- Task 3 depends on Task 2
- Task 4 depends on Task 2
- Task 5 depends on Task 3 and Task 4
