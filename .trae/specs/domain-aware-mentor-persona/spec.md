# Domain-Aware Mentor Persona Spec

## Why
在测试中发现，当用户询问如 "mcp" 和 "skill" 这样的短名词时，AI 给出了芯片设计（EDA）领域的解释（Model-Compiler-Platform 和 Cadence 公司的 SKILL 编程语言）。这说明 Deepseek 模型**并没有胡编乱造**，而是因为这些缩写在现实中确实有其他专业含义。
这是**我们跟模型的交互有问题（提示词缺失领域上下文）**。由于我们没有告诉 AI 当前的行业背景（比如人工智能、LLM、大模型、或者具体的面试岗位），AI 在其庞大的预训练知识库中，随机选中了一个最符合这俩缩写组合的冷门行业（EDA芯片设计）。为了让面试官“聪明、稳定、无所不能”，我们需要给 AI 和 Router 注入**强领域上下文（Domain Context）**，并且要求它在遇到多义词时，优先基于当前面试岗位或 AI/软件工程领域进行解释，甚至主动向用户确认领域。

## What Changes
- **注入领域上下文（Inject Domain Context）**：
  - 在 Router 意图识别的提示词中，明确告知当前所处的行业/岗位上下文（结合 `profile.role` 或 `topic`，默认兜底为“人工智能与软件开发领域”）。
  - 在主 AI 面试官的 `systemPrompt` 中，强化“基于当前面试岗位和行业背景（特别是 AI / LLM 领域，如 Model Context Protocol）”来理解专业术语。
- **多义词消歧义规则（Disambiguation Rule）**：
  - 明确要求 AI：当遇到可能存在歧义的缩写（如 MCP、SKILL、RAG 等）时，**必须优先**按照当前面试的行业领域（特别是 AI/大模型领域）进行解释。
  - 如果知识库未覆盖且该缩写跨行业含义差异极大，AI 应当在解答时带上行业前提（例如：“在 AI 与大模型领域，MCP 通常指 Model Context Protocol，而 Skill 通常指 AI 的技能/插件……”）。

## Impact
- Affected code: `src/app/api/chat/route.ts` 中的 `routerPrompt` 和 `systemPrompt`。
- 彻底解决 AI 因为缩写歧义而跨频道、跨行业解释概念的“误人子弟”问题，提升专业度。

## ADDED Requirements
### Requirement: Domain Context Awareness
The AI and Router SHALL strictly interpret acronyms and technical terms within the context of the user's specific interview role or the general Artificial Intelligence / Software Engineering domain, unless explicitly told otherwise.

#### Scenario: Success case
- **WHEN** user asks "mcp 和 SKILL"
- **THEN** the AI explains MCP as Model Context Protocol (in LLM context) and SKILL as an AI capability/tool, instead of EDA software concepts.

## MODIFIED Requirements
### Requirement: Hybrid Interviewer & Mentor Persona
The AI's mentor mode SHALL prioritize the target industry's definitions and actively clarify the domain if an acronym is highly ambiguous.