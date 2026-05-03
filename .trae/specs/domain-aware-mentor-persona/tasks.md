# Tasks
- [x] Task 1: 完善意图识别引擎（Router）的上下文（Domain Context）。
  - [x] SubTask 1.1: 在 `src/app/api/chat/route.ts` 中，为 `routerPrompt` 追加动态的岗位或行业上下文信息，比如“当前面试的岗位是【${profile?.role || '人工智能与软件开发'}】”。
  - [x] SubTask 1.2: 明确要求 Router：在判断“技术名词”时，请基于该岗位的领域上下文（尤其是 AI、LLM 等现代技术栈）去理解。
- [x] Task 2: 完善主 AI 面试官/导师的提示词防歧义规则。
  - [x] SubTask 2.1: 在 `systemPrompt` 中，强化 AI 的行业属性，告知它：“你现在的语境是【${topic || profile?.role || '人工智能与大模型软件开发'}】”。
  - [x] SubTask 2.2: 增加一条【术语消歧义】规则：遇到英文缩写（如 MCP、SKILL 等）时，必须优先使用与当前面试领域（特别是 AI Agent、LLM 开发、软件工程等）相关的释义。
  - [x] SubTask 2.3: 增加防错机制：如果某缩写在当前领域极为罕见，AI 应以导师口吻主动向候选人确认（“你提到的 MCP 是指 Model Context Protocol，还是其他领域的概念？”）。
- [x] Task 3: 运行验证。
  - [x] SubTask 3.1: 启动应用，发送“mcp 和 SKILL”进行提问，观察 AI 的回答是否聚焦于大模型和 AI 技能（Model Context Protocol 等）。

# Task Dependencies
- [Task 2] depends on [Task 1]
- [Task 3] depends on [Task 2]