# 学习中心重构：面试题库系统 Spec

## Why

当前学习中心以"语雀式长文档"为核心，内容质量差、AI生成痕迹重、用户学习路径不清晰。参考面试鸭（mianshiya.com）的成功模式，我们需要将学习中心重构为**以"题目"为核心的面试题库系统**，让用户能够：
1. **学知识** — 浏览题目+参考答案，系统学习某个技术领域
2. **练面试** — 刷题模式，模拟真实面试答题场景
3. **补短板** — 通过面试报告关联到薄弱知识点，精准补强

同时，后台需要一套**AI驱动的内容采集与生成流水线**，让管理员能轻松生成高质量题库，而不是手工编写。

## What Changes

- **BREAKING**: 废弃现有学习中心全部数据模型（文档树、长文章、AI总结等），重建为"题库"模型
- **BREAKING**: 废弃现有语雀式三栏阅读工作区，重建为面试鸭式题库浏览+刷题界面
- **新增**: 题目数据模型（题干、难度、标签、参考答案、代码示例、关联题）
- **新增**: 知识库-分类-题目 三级结构，替代现有的 知识库-目录树-文档
- **新增**: 学习模式（看题学答案）+ 刷题模式（答题-看答案-AI点评）双模式
- **新增**: AI内容采集引擎 — 自动检索GitHub高star、官方文档等来源，生成题目
- **新增**: 刷题进度追踪（已刷/正确/薄弱/收藏）
- **保留并升级**: 学习计划（基于薄弱点推荐题目分类）
- **保留并升级**: 学练联动（从题目直接进入模拟面试）
- **保留并升级**: 文档助手（在题目详情页可深度追问）
- **严格保留**: 面面吧智能助手部分完全不动，包括其所有组件、API、路由和逻辑

## Impact

- Affected specs: learning-center-system, learning-center-cms, rebuild-learning-center-knowledge-factory, systematic-knowledge-engine
- Affected code:
  - `src/app/learning/*` — 前台学习中心全部重构
  - `src/app/admin/learning/*` — 后台知识工厂改为题库工厂
  - `src/app/api/learning/*` — API全部重建
  - `src/app/api/admin/learning/*` — 后台API全部重建
  - `prisma/schema.prisma` — 新增Question等模型
  - `src/lib/ai/*` — 新增题目生成AI流水线（注意：不修改现有智能助手相关代码）

## ADDED Requirements

### Requirement: Question Data Model

The system SHALL provide a structured Question model stored in PostgreSQL.

#### Scenario: Question structure
- **GIVEN** a question in the system
- **THEN** it MUST have:
  - `id`: unique identifier
  - `kbId`: belongs to which knowledge base
  - `categoryId`: belongs to which category
  - `title`: question stem (the interview question)
  - `difficulty`: "easy" | "medium" | "hard"
  - `tags`: array of tags (e.g., ["Java", "HashMap", "集合"])
  - `answer`: structured answer object:
    - `keyPoints`: array of core points (must-know items)
    - `detailedExplanation`: full explanation text
    - `codeExample`: optional code snippet
    - `diagram`: optional mermaid diagram
  - `relatedQuestionIds`: array of related question IDs
  - `interviewFrequency`: how often this appears in interviews ("high" | "medium" | "low")
  - `sourceUrl`: where this question comes from
  - `status`: "draft" | "published" | "archived"
  - `createdAt`, `updatedAt`, `publishedAt`

### Requirement: Knowledge Base - Category - Question Hierarchy

The system SHALL organize content as: Knowledge Base -> Category -> Question.

#### Scenario: Browsing structure
- **WHEN** user visits `/learning`
- **THEN** they see knowledge base cards (e.g., "Java后端", "前端开发", "MySQL")
- **WHEN** user clicks a knowledge base
- **THEN** they see category list (e.g., "Java基础", "Java集合", "JVM", "并发编程")
- **WHEN** user clicks a category
- **THEN** they see question list with difficulty and tags
- **WHEN** user clicks a question
- **THEN** they see question detail with answer

### Requirement: Learning Mode (Study Mode)

The system SHALL provide a "learning mode" where users read questions and answers systematically.

#### Scenario: Learning flow
- **WHEN** user enters a category
- **THEN** they see all questions in that category
- **WHEN** user clicks a question
- **THEN** they see the question stem first, with a "查看答案" button
- **WHEN** user clicks "查看答案"
- **THEN** the structured answer unfolds (key points -> detailed explanation -> code example)
- **AND** they can click "下一题" or "去训练" (jump to practice)

### Requirement: Practice Mode (刷题模式)

The system SHALL provide a "practice mode" similar to LeetCode.

#### Scenario: Practice flow
- **WHEN** user selects "刷题模式" in a category
- **THEN** the system presents one question at a time
- **WHEN** user reads the question
- **THEN** they can either:
  - Type their own answer and submit for AI evaluation
  - Click "直接看答案" to see the reference answer
- **WHEN** user submits their answer
- **THEN** AI evaluates: correctness, completeness, key points covered
- **AND** shows the reference answer for comparison
- **THEN** user can mark: "掌握了" / "还需要练" / "收藏"
- **THEN** next question appears

#### Scenario: Practice settings
- **WHEN** user starts practice mode
- **THEN** they can choose:
  - Question order: "顺序" | "随机" | "按难度"
  - Difficulty filter: all | easy | medium | hard
  - Practice scope: current category | current knowledge base | weak points only

### Requirement: Progress Tracking

The system SHALL track user progress per question.

#### Scenario: Progress data
- **GIVEN** a user and a question
- **THEN** the system tracks:
  - `viewed`: boolean
  - `attempted`: boolean
  - `correct`: boolean (self-reported or AI-evaluated)
  - `mastered`: boolean (user marked as mastered)
  - `bookmarked`: boolean
  - `attemptCount`: number
  - `lastAttemptAt`: timestamp

#### Scenario: Progress dashboard
- **WHEN** user views their profile or learning center
- **THEN** they see:
  - Total questions viewed / total published
  - Mastery rate per category
  - Weak categories (low mastery rate)
  - Bookmarked questions
  - Streak (consecutive days of practice)

### Requirement: AI Content Collection Engine

The system SHALL have an AI engine that automatically collects and generates high-quality questions from multiple sources.

#### Scenario: Source types
- **GIVEN** the content collection engine
- **THEN** it MUST support these source types:
  1. **GitHub repositories** — high-star interview repos (e.g., JavaGuide, CS-Notes)
  2. **Official documentation** — official docs from Java, Spring, MySQL, etc.
  3. **Community articles** — high-quality blog posts, technical articles
  4. **Manual input** — admin pastes content directly
  5. **Existing question banks** — imported from purchased materials (admin responsibility for copyright)

#### Scenario: AI generation pipeline
- **WHEN** admin inputs a source (URL or text)
- **THEN** the AI engine:
  1. Fetches/parses the source content
  2. Extracts potential interview questions using LLM
  3. For each extracted question, generates:
     - Structured answer (key points + detailed explanation)
     - Difficulty assessment
     - Tags
     - Code example (if applicable)
     - Related topic suggestions
  4. Saves as draft questions in the database
  5. Admin reviews and publishes

#### Scenario: Batch generation
- **WHEN** admin inputs a topic (e.g., "Java HashMap")
- **THEN** the AI engine:
  1. Searches multiple sources for this topic
  2. Generates a batch of questions (5-20 questions)
  3. Organizes them into appropriate categories
  4. Saves all as drafts for admin review

### Requirement: Admin Review Workflow

The system SHALL provide a streamlined admin review workflow.

#### Scenario: Review queue
- **WHEN** admin visits `/admin/learning`
- **THEN** they see:
  - Draft questions pending review
  - Recently published questions
  - Knowledge base overview stats

#### Scenario: Review process
- **WHEN** admin reviews a draft question
- **THEN** they can:
  - Edit any field (title, answer, difficulty, tags)
  - Approve and publish
  - Reject (with reason)
  - Merge with existing similar question

### Requirement: Learning Plan Integration

The system SHALL integrate learning plans with the question bank.

#### Scenario: Plan generation
- **WHEN** user inputs a goal (e.g., "准备Java后端面试")
- **THEN** the system generates a learning plan with:
  - Ordered list of categories to study
  - For each category: recommended question count and key questions
  - Estimated time
  - Progress tracking

#### Scenario: Weak point recommendation
- **WHEN** user completes a mock interview
- **THEN** the system analyzes weak points
- **AND** recommends specific categories/questions to study

## MODIFIED Requirements

### Requirement: Learning Center Navigation

The main navigation "学习中心" SHALL redirect to the new question bank entry page.

### Requirement: Document Assistant

The document assistant (AI chat) SHALL be available on question detail pages, with context including:
- Current question and answer
- Related questions
- Category knowledge

**IMPORTANT**: This is a NEW document assistant for the question bank context, separate from the existing "面面吧智能助手" which SHALL NOT be modified.

## REMOVED Requirements

### Requirement: Long-form Document Reading
**Reason**: Replaced by question-centric learning model. Users learn through questions and answers, not long articles.
**Migration**: Existing document data will be archived. Any valuable content will be manually migrated to question format if needed.

### Requirement: AI Document Summary
**Reason**: Questions have structured answers, no need for AI summary of long documents.
**Migration**: Remove summary feature. Replace with "key points" in question answer structure.

### Requirement: Taxonomy-First Tree Structure
**Reason**: Replaced by Knowledge Base -> Category -> Question flat hierarchy.
**Migration**: Tree structure removed. Categories are flat under knowledge base.
