# Tasks

- [x] Task 1: 梳理实时面试当前房间与媒体链路问题
  - [x] SubTask 1.1: 盘点 `src/app/interview/page.tsx` 中实时面试房间当前布局、状态流转与设备控制逻辑。
  - [x] SubTask 1.2: 盘点麦克风、摄像头、TTS 播报当前失败点，明确是权限、状态机、浏览器策略还是接口调用问题。
  - [x] SubTask 1.3: 明确本次只改实时面试链路，不回退文字面试、专项训练和其他历史功能。

- [x] Task 2: 重建实时面试房间布局为双人会议室
  - [x] SubTask 2.1: 设计双人房间主舞台，明确面试官区与用户区的视觉结构。
  - [x] SubTask 2.2: 设计顶部状态区与底部控制栏，仅保留麦克风、摄像头、结束面试等核心控制。
  - [x] SubTask 2.3: 重新安排字幕与侧栏位置，避免页面继续拥挤。

- [x] Task 3: 修复麦克风与摄像头能力
  - [x] SubTask 3.1: 修复麦克风权限申请与启用逻辑，确保授权后能进入发言/识别链路。
  - [x] SubTask 3.2: 修复摄像头启用、关闭与本地预览逻辑，确保状态切换稳定。
  - [x] SubTask 3.3: 补齐设备失败场景的中文错误提示与恢复指引。

- [x] Task 4: 修复 AI 语音播放与实时字幕
  - [x] SubTask 4.1: 修复实时面试中 AI 音频播放链路，确保用户能够真实听到 AI 声音。
  - [x] SubTask 4.2: 明确处理浏览器自动播放限制，在首次用户交互后解锁音频上下文。
  - [x] SubTask 4.3: 将 AI 发言改造成会议字幕式流式展示，和播报状态保持一致。

- [x] Task 5: 重构实时状态表达
  - [x] SubTask 5.1: 区分连接中、检索中、思考中、播报中、用户发言中等状态。
  - [x] SubTask 5.2: 保证状态切换与真实链路一致，不出现“还在思考却已经整段出答案”或“已播报但无声音”的错位。

- [ ] Task 6: 完成验证与回归
  - [ ] SubTask 6.1: 手工验证实时面试的双人房间、麦克风、摄像头、AI 播报、实时字幕、结束面试。
  - [x] SubTask 6.2: 回归验证文字面试、专项训练、报告与会话记录未被本轮改坏。
  - [x] SubTask 6.3: 完成本地构建检查与线上部署验证。

# Task Dependencies
- Task 2 depends on Task 1
- Task 3 depends on Task 1
- Task 4 depends on Task 1
- Task 5 depends on Task 2, Task 3, Task 4
- Task 6 depends on Task 2, Task 3, Task 4, Task 5
