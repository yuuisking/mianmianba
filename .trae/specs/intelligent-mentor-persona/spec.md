# Intelligent Mentor Persona Spec

## Why
目前系统对 AI 的提示词约束过于死板，强制规定了“遇到不懂的概念必须追问‘你是如何实践的’”，导致当候选人试图提问、求教或仅输入短词汇（如“mcp skill”）时，AI 的回复显得不够智能、缺乏人性化，无法胜任“导师+面试官”的双重身份。我们需要一个“聪明、稳定、无所不能”的 AI，能够在候选人不会时提供教学指导，而不是一味地机械提问。

## What Changes
- **重构 AI 人设提示词（Persona Prompt Refactoring）**：
  - 取消机械的硬编码回复规则（如强制追问特定话术）。
  - 赋予 AI “资深导师与专业面试官”的双重身份。
  - 明确处理逻辑：当候选人回答问题时，AI 进行专业点评与深挖；当候选人主动提问、求教或表达不懂时，AI 能够切换为导师模式，给出清晰、专业的解答，然后再引导回面试流程。
  - 对于短词汇或模糊概念，AI 应结合上下文主动解答、分享见解，或询问候选人是否需要科普，展现出真正的“智能”。
- **强化 Router 意图识别能力**：优化 Router 的 Prompt，不仅识别是否需要知识库，同时要能理解用户是在“回答”、“提问”还是“闲聊”。

## Impact
- Affected code: `src/app/api/chat/route.ts` 提示词逻辑。
- 增强了面试过程中的互动性、容错性和教育属性。

## ADDED Requirements
### Requirement: Hybrid Interviewer & Mentor Persona
The system SHALL act as both an interviewer and a mentor. 

#### Scenario: User asks a question or expresses confusion
- **WHEN** user inputs a short concept (e.g., "mcp skill") or explicitly asks for help (e.g., "我不懂这个").
- **THEN** the AI provides a clear, professional explanation of the concept (using KB if available, or its own knowledge) and gently guides the user back to the interview context, without exposing its internal state.

## MODIFIED Requirements
### Requirement: Fallback Handling
Removed the rigid rule forcing the AI to reply "关于这个概念，你在提到的这个领域具体是如何实践的？". The AI SHALL use its intelligence to determine the best conversational response based on the user's intent.