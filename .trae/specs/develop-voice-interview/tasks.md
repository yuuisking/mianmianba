# Tasks

- [x] Task 1: 语音能力选型落地（火山/豆包）
  - [x] SubTask 1.1: 调研火山 ASR/TTS 的可用形态（HTTP/WS、支持的音频格式、鉴权方式、是否支持流式返回）。
  - [x] SubTask 1.2: 定义服务端调用封装层 `src/lib/speech/volc.*`（仅服务端使用），并列出必须的环境变量清单（不写入仓库）。
  - [x] SubTask 1.3: 落实火山引擎的鉴权机制（AK/SK 签名或 Token 生成），确保鉴权过程的健壮性（如 Token 缓存与过期自动刷新机制）。

- [x] Task 2: 新增服务端 API（ASR + TTS 代理）
  - [x] SubTask 2.1: 新增 `/api/speech/asr`：接收浏览器录音（Blob/ArrayBuffer），返回转写文本与置信度（如供应商提供）。
  - [x] SubTask 2.2: 新增 `/api/speech/tts`：接收文本片段，返回可播放的音频（建议 `audio/mpeg` 或 `audio/wav`）。
  - [x] SubTask 2.3: 统一错误处理与超时策略：针对供应商接口超时、5xx 错误实现重试机制（指数退避）；针对 429 限流提供降级策略；供应商不可用时返回可读中文错误（不泄露内部信息）。

- [x] Task 3: 语音面试 UI（极简 + 状态明确）
  - [x] SubTask 3.1: 在 `src/app/interview/page.tsx` 中新增 `mode=voice` 的专用渲染分支（不影响 `text/targeted`）。
  - [x] SubTask 3.2: UI 仅包含：连接/权限状态、AI 字幕区、用户说话按钮（按住说话/松开结束）、停止 AI 按钮（用于打断）。
  - [x] SubTask 3.3: 麦克风权限被拒绝时展示清晰指引，并提供降级入口（允许改用文字输入继续面试）。
  - [x] SubTask 3.4: 处理浏览器 Audio 自动播放限制（Autoplay Policy）：确保在用户首次交互（点击按钮）时初始化并解锁 `AudioContext`。

- [x] Task 4: 用户语音输入（录音 → ASR → 作为用户消息提交）
  - [x] SubTask 4.1: 使用 `MediaRecorder` 录音（Chrome），松开后将音频提交给 `/api/speech/asr`。
  - [x] SubTask 4.2: 将 ASR 文本写入对话消息列表，并复用现有 `/api/chat` 流式回复机制。
  - [x] SubTask 4.3: 处理边界：ASR 为空、过短、噪声，给予提示并不发起 LLM 请求。
  - [x] SubTask 4.4: ASR 容错与降级：若 ASR 连续失败或网络延迟过高，UI 应提示用户并提供“切换至文字输入”的快捷入口。

- [x] Task 5: AI 语音输出（字幕实时 + 分段 TTS 播放队列）
  - [x] SubTask 5.1: 将 LLM 流式输出按句子/标点分段（例如遇到 `。！？` 或长度阈值）作为 TTS 单元。
  - [x] SubTask 5.2: 对每个 TTS 单元调用 `/api/speech/tts` 获取音频，进入播放队列；前一段播放结束自动播下一段。
  - [x] SubTask 5.3: 字幕与语音一致：字幕来自 LLM 原始流；语音从同一内容分段合成，避免“听到的和看到的不一致”。
  - [x] SubTask 5.4: TTS 容错与优雅降级：若某段 TTS 请求失败或超时，应跳过播放或提供提示，但**绝不阻塞**字幕的继续渲染和面试流程的进行。

- [x] Task 6: 打断 (Barge-in) 与性能保障
  - [x] SubTask 6.1: 用户开始录音时立即停止当前音频、清空播放队列，并取消在途 TTS 请求（AbortController）。
  - [x] SubTask 6.2: 若 AI 仍在生成中，取消/中止当次 AI 流式请求（AbortController），并将当前 AI 消息标记为“已被打断”（仅 UI 状态，不写入注释）。
  - [x] SubTask 6.3: 限制渲染频率：字幕更新使用节流/批量更新，避免 token 过密导致卡顿。

- [x] Task 7: 验证与回归
  - [x] SubTask 7.1: 手工验证用例：正常对话、连续多轮、ASR 失败、TTS 失败、权限拒绝、打断、删除会话与复盘中心不受影响。
  - [x] SubTask 7.2: 在 README 或开发文档已有位置补充“语音面试本地运行所需环境变量”（如项目已有文档路径；若无，则仅在 spec 中列清单，不新增文档）。

# Task Dependencies
- Task 2 depends on Task 1
- Task 4 depends on Task 2 & Task 3
- Task 5 depends on Task 2 & Task 3
- Task 6 depends on Task 4 & Task 5
- Task 7 depends on Task 6

