# Tasks
- [x] Task 1: 优化主 AI 人设（Persona Prompt）。
  - [x] SubTask 1.1: 在 `src/app/api/chat/route.ts` 中，重构 `systemPrompt`，赋予 AI“专业开发面试官兼资深导师”的身份。
  - [x] SubTask 1.2: 删除旧版的死板限制规则：“你必须直接问：‘关于这个概念，你在提到的这个领域具体是如何实践的？’”。
  - [x] SubTask 1.3: 增加新的交互规则：当候选人提出一个概念（如“mcp skill”）、表示不会、或者向你求教时，你需要切换到导师模式，基于你的知识储备或知识库内容，给出专业、清晰的解答和指导，然后再引导回面试流程。
  - [x] SubTask 1.4: 强化要求：AI 必须聪明、全能，对于简短的词汇或模糊的问题，主动分享见解、提供科普或反问确认对方的疑问，而不是像个无情的提问机器。
- [x] Task 2: 验证优化效果。
  - [x] SubTask 2.1: 运行聊天，发送“mcp skill”或类似术语，观察 AI 是否能正常解答并扮演导师。

# Task Dependencies
- [Task 2] depends on [Task 1]