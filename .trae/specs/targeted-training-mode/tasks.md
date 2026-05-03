# Tasks

- [x] Task 1: 路由参数跳转改造
  - [x] SubTask 1.1: 在 `src/app/report/page.tsx` 中，找到 `下一步训练计划` 卡片内的“去行动”按钮。
  - [x] SubTask 1.2: 将 `onClick={() => router.push("/setup")}` 修改为：`onClick={() => router.push(\`/interview?mode=targeted&topic=\${encodeURIComponent(step.title)}&desc=\${encodeURIComponent(step.desc)}\`)}`。

- [x] Task 2: 面试房间 UI 适配
  - [x] SubTask 2.1: 在 `src/app/interview/page.tsx` 中，解析 URL 参数获取 `mode`, `topic`, `desc`。
  - [x] SubTask 2.2: 在渲染左上角标题栏时，判断如果 `mode === "targeted"`，则将标题“项目深挖轮”替换为 `专项训练 (${topic || '未知'})`。
  - [x] SubTask 2.3: 在发送给 `/api/chat` 的请求 body 中，把 `topic` 和 `desc` 追加进 Payload 里，以便后端读取。

- [x] Task 3: 专项训练专属 AI Prompt 隔离
  - [x] SubTask 3.1: 在 `src/app/api/chat/route.ts` 中，接收 `mode`, `topic`, `desc` 参数。
  - [x] SubTask 3.2: 重构 `systemPrompt` 逻辑：如果 `mode === "targeted"`，不再使用“你是专业的面试官”的常规开场，而是构建专属提示词，例如：`"你是一个高级面试辅导官。候选人目前正在进行专项训练，主题是【${topic}】，其薄弱点/训练目标为：【${desc}】。你的任务是直接针对这个知识点进行深度、专业的追问，每次只问一个核心问题，帮助其巩固和提高。不需要要求候选人做自我介绍，直奔主题。"`。

# Task Dependencies
- [Task 1] 独立执行
- [Task 2] depends on [Task 1]
- [Task 3] depends on [Task 2]