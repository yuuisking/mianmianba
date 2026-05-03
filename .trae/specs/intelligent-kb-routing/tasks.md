# Tasks
- [x] Task 1: 拆分意图路由模块（Intent Router）。
  - [x] SubTask 1.1: 在 `src/app/api/chat/route.ts` 中实现一个快速的 LLM 调用，通过提供历史对话和最新用户输入，判断是否需要查询知识库（返回 `true` 或 `false`，可借助 JSON mode）。
- [x] Task 2: 集成知识库检索逻辑。
  - [x] SubTask 2.1: 当 Router 返回需要查询时，主动调用 `searchKnowledgeBase(userLatestMessage)` 获取外部知识库的 Context 文本。
- [x] Task 3: 重构主 AI 生成逻辑，移除旧版 Function Calling（工具调用）。
  - [x] SubTask 3.1: 将获取到的 Context 拼接成系统提示词，注入给主 AI，要求主 AI 在回答时“仅基于给定的知识库内容回答，如果不包含该知识点，请保持面试官人设反问候选人的理解”。
  - [x] SubTask 3.2: 清理主 AI 的 `tools` 配置，让主 AI 专注于纯文本的生成（并支持 Streaming 流式输出）。
- [x] Task 4: 优化 AI 面试官的人设和提示词（Prompt）。
  - [x] SubTask 4.1: 修改兜底提示词，防止由于 `systemPrompt` 中的特定占位符（如 `skill`、`desc`）被当作专业术语胡乱解释的情况发生。
  - [x] SubTask 4.2: 明确声明：当遇到自己知识盲区或没有检索到内容时，绝对不要试图“构建学习框架”或像客服一样解释，而是说：“你在提到的这个领域具体是如何实践的？”
- [x] Task 5: 优化前端交互体验（“面试官思考中” UI）。
  - [x] SubTask 5.1: 在 `src/app/interview/page.tsx` 中增加一个状态变量（例如 `isThinking`）。
  - [x] SubTask 5.2: 当用户发送消息且还未接收到流式数据的第一个 Token 时，在对话框底部展示“面试官思考中...”的加载动画或占位 UI。
  - [x] SubTask 5.3: 当接收到首个 Token 且 AI 回复框出现时，隐藏该“思考中”状态。

# Task Dependencies
- [Task 2] depends on [Task 1]
- [Task 3] depends on [Task 2]
- [Task 4] depends on [Task 3]
- [Task 5] can run independently from Backend tasks