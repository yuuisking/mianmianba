# Intelligent Knowledge Base Routing Spec

## Why
当前 AI 面试官在处理专业名词（如“SKILL”）时，依赖于单次大模型调用的 Function Calling（工具调用）机制来决定是否查询知识库。这种方式不稳定，容易导致大模型忽略工具调用，转而根据 System Prompt 中的占位符或自身预训练数据产生幻觉（Hallucination），严重破坏了“专业面试官”的人设，导致回复显得“胡说八道”。我们需要一个更聪明、更稳定、无所不能的架构。

## What Changes
- **引入独立意图路由（Intent Router）模型/步骤**：在主对话生成之前，增加一个前置的、轻量级的 LLM 调用，专门用于判断用户的最新发言是否需要“查询外部知识库”。
- **解耦检索与生成（Decouple Retrieval and Generation）**：
  - 如果 Router 判定需要查询，则后端主动调用火山方舟知识库检索 API 获取 Context。
  - 将检索到的 Context 显式地注入到主 AI 的 System Prompt 中。
  - 取消主 AI 侧的不稳定 Function Calling 依赖，让主 AI 专注于“基于给定 Context 和面试官人设进行回复”。
- **优化主 AI 提示词（Prompt Optimization）**：强化主 AI 在没有 Context 或 Context 不匹配时的处理逻辑，确保其专业性，遇到不懂的概念时以真实的面试官口吻进行澄清，而不是胡编乱造。
- **增加“思考中”的前端交互状态（Thinking State UI）**：由于增加了 Router 和可能的检索链路，首次响应的延迟（TTFT）会增加。为了提升用户体验，前端在等待响应期间需要展示类似“面试官思考中...”的提示，直到接收到大模型的第一个流式输出字符（First Token）。

## Impact
- Affected specs: 知识库问答能力、面试对话核心链路。
- Affected code: `src/app/api/chat/route.ts` 及其相关的 prompt 构建逻辑。

## ADDED Requirements
### Requirement: Intent Routing
The system SHALL evaluate the user's input before generating a response to determine if a knowledge base lookup is required.

### Requirement: Thinking State UI
The frontend SHALL display a "thinking" indicator (e.g., "面试官思考中...") immediately after the user sends a message, and SHALL remove it once the first chunk of the AI's response stream is received.

#### Scenario: Success case
- **WHEN** user asks "你们的 SKILL 是用在什么方向了啊" (a domain-specific term).
- **THEN** the UI shows "面试官思考中...". The Router identifies the need for external knowledge, triggers the KB search, retrieves the definition of SKILL, and injects it into the main AI prompt. The AI starts streaming its response, and the "thinking" indicator disappears.

## MODIFIED Requirements
### Requirement: AI Interviewer Persona
The AI SHALL strictly maintain its persona as an interviewer. If asked about a concept not in its pre-training data and not found in the KB, it SHALL respond professionally (e.g., "关于这个概念，能否请你结合你过往的经验具体阐述一下你的理解？") instead of hallucinating.

## REMOVED Requirements
### Requirement: Function Calling for KB Search in Main Chat
**Reason**: Function Calling in a single pass is unstable for maintaining complex personas while deciding whether to fetch data.
**Migration**: Moved to a deterministic Pipeline: Router -> (Optional KB Search) -> Context Injection -> Final Generation.
