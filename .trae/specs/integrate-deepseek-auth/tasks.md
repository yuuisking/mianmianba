# Tasks

- [x] Task 1: 完善真实用户认证系统与数据隔离
  - [x] SubTask 1.1: 新增 `/api/auth/register` 接口，支持密码哈希（如使用 `bcryptjs`）注册新用户。
  - [x] SubTask 1.2: 改造 `[...nextauth]/route.ts`，实现基于真实数据库密码比对的 Credentials 登录。
  - [x] SubTask 1.3: 更新前端登录页，补充注册入口及退出登录按钮，并对接真实接口。
  - [x] SubTask 1.4: 改造所有业务路由 (`/api/sessions`, `/api/reviews` 等)，验证 `session.user.id`，实现数据隔离。

- [x] Task 2: 简历上传与 PDF 解析
  - [x] SubTask 2.1: 安装并配置 PDF 解析依赖（如 `pdf-parse` 或基于 `pdfjs-dist` 的前端解析方案）。
  - [x] SubTask 2.2: 改造前端 `setup/page.tsx`，支持上传 PDF 提取文本内容后发送给后端，或直接在后端解析。

- [x] Task 3: 接入 Deepseek API (解析与报告)
  - [x] SubTask 3.1: 安装 `openai` SDK 或 `@ai-sdk/openai`，配置 Deepseek 接口 (`https://api.deepseek.com/v1`) 和提供的 API Key。
  - [x] SubTask 3.2: 改造 `/api/parse`，编写 System Prompt 提取技能和项目追问点，要求输出 JSON，彻底替换 Mock。
  - [x] SubTask 3.3: 改造 `/api/reports/generate`，根据面试记录调用 Deepseek 生成结构化 JSON 报告，替换 Mock。

- [x] Task 4: 性能优化：基于流式输出的面试引擎
  - [x] SubTask 4.1: 改造 `/api/chat`，使用 Deepseek API 并开启流式输出 (`stream: true`)。
  - [x] SubTask 4.2: 改造 `src/app/interview/page.tsx`，适配流式读取，实时渲染 AI 消息内容。
  - [x] SubTask 4.3: 优化超时时间设置（确保服务端边缘计算或最大执行时间符合要求），防止 AI 出题/审题时出现超时错误。

- [x] Task 5: 真实数据全流程端到端测试
  - [x] SubTask 5.1: 注册新用户，验证数据是否隔离。
  - [x] SubTask 5.2: 上传指定的测试简历 `/Users/didi/Downloads/杨宇-四年工作经验-高级Java研发工程师.pdf` 进行解析测试。
  - [x] SubTask 5.3: 验证面试和报告生成的流式体感与性能，确认所有环节已彻底移除 Mock 数据。

# Task Dependencies
- [Task 1] 独立执行
- [Task 2] 独立执行
- [Task 3] depends on [Task 2]
- [Task 4] depends on [Task 3]
- [Task 5] depends on [Task 1], [Task 4]