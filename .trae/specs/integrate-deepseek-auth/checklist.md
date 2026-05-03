# 验收清单 (Checklist)

- [x] 用户注册、登录、退出登录功能正常，不同用户间的数据做到严格隔离。
- [x] 支持解析 PDF 简历，且能够成功解析并提取 `/Users/didi/Downloads/杨宇-四年工作经验-高级Java研发工程师.pdf` 的内容。
- [x] `/api/parse` 真实调用 Deepseek API 返回结构化画像数据（无 Mock）。
- [x] `/api/chat` 面试对话真实调用 Deepseek API，采用流式输出（Streaming），首字响应迅速，避免了超时。
- [x] `/api/reports/generate` 真实调用 Deepseek API 生成结构化的多维度打分报告（无 Mock）。
- [x] 系统中不存在任何导致流程卡死的假数据，全链路在生产模式下性能体验流畅。