# Tasks

- [x] Task 1: 导航栏分流入口
  - [x] SubTask 1.1: 在 `src/components/layout/Header.tsx` 的导航菜单中，新增“专项训练”项。导航栏应包含：“控制台”、“发起面试”、“专项训练”、“复盘中心”。

- [x] Task 2: 独立发起页面 UI (`/practice`)
  - [x] SubTask 2.1: 创建 `src/app/practice/page.tsx`。使用 `brand-guidelines`（Anthropic 风格：大圆角 16px、暖橙色按钮、干净背景、Poppins/Lora 字体），设计一个居中卡片表单。
  - [x] SubTask 2.2: 表单字段包括：
    - `role` (输入框，必填，如：前端开发、Java 工程师)
    - `topic` (输入框，必填，如：Vue3 响应式、JVM 内存结构)
    - `desc` (文本域，选填，如：请多问我一些底层源码实现的问题)

- [x] Task 3: 路由与数据对接
  - [x] SubTask 3.1: 在 `/practice` 中点击“开始专项训练”时，将用户输入的 `role`、`topic` 和 `desc` 进行 URI Encode。
  - [x] SubTask 3.2: 并且通过 `sessionStorage.setItem("parsedProfileData", JSON.stringify({ role }))` 的方式暂存角色信息（以便 `/interview` 和 AI Prompt 都能正确读取到 `role`，即“你是一个高级${role}面试辅导官”）。
  - [x] SubTask 3.3: 执行 `router.push(\`/interview?mode=targeted&topic=\${encodeURIComponent(topic)}&desc=\${encodeURIComponent(desc)}\`)`。

# Task Dependencies
- [Task 1] 独立执行
- [Task 2] 独立执行
- [Task 3] depends on [Task 2]