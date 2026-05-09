# Tasks

- [x] Task 1: 梳理当前实时语音链路与火山能力边界
  - [x] SubTask 1.1: 盘点当前 `src/app/interview/page.tsx` 中音频采集、VAD、打断、字幕与 TTS 播放逻辑。
  - [x] SubTask 1.2: 盘点 `src/app/api/speech/asr/route.ts`、`src/app/api/speech/tts/route.ts`、`src/lib/speech/volc.ts` 当前调用方式和限制。
  - [x] SubTask 1.3: 明确哪些问题属于代码问题，哪些问题依赖域名、HTTPS、权限和火山配置。
  - [x] SubTask 1.4: 明确“豆包一比一还原”的对齐基准清单，包括首字节奏、接话感、打断表现、字幕推进和状态反馈。
  - [x] SubTask 1.5: 明确“面试官大脑固定为 `DeepSeek v4`、火山只负责语音层”的架构约束。

- [x] Task 2: 设计豆包式实时语音状态机与会话协议
  - [x] SubTask 2.1: 定义用户说话、用户停顿、ASR partial、ASR final、AI 思考、AI 播报、AI 被打断等状态与切换条件。
  - [x] SubTask 2.2: 定义浏览器端、服务端、模型与火山语音能力之间的实时消息结构。
  - [x] SubTask 2.3: 明确打断后保留哪些上下文、丢弃哪些队列和未播报内容。
  - [x] SubTask 2.4: 明确 `DeepSeek v4 -> 文本增量 -> 火山语音层 -> 客户端播放/字幕` 的技术方案和解耦边界。

- [ ] Task 3: 升级用户语音输入链路为更接近真流式
  - [ ] SubTask 3.1: 将当前本地整段分块上传识别方案改造为持续增量传输或更细粒度分段识别。
  - [x] SubTask 3.2: 输出 partial 用户字幕与 final 用户字幕，减少“说完才出字”的等待感。
  - [ ] SubTask 3.3: 优化 VAD 灵敏度、停顿阈值与最短有效发言长度，降低误触发和漏识别。
  - [x] SubTask 3.4: 让用户输入阶段的识别反馈和状态切换尽量贴近豆包语音通话的即时感。

- [ ] Task 4: 升级 `DeepSeek v4` 生成与豆包式播报链路
  - [x] SubTask 4.1: 让 `DeepSeek v4` 回复按意群或句子级分段进入 TTS，而不是等整段答案完全生成。
  - [x] SubTask 4.2: 优化客户端播放队列，确保播报、字幕与状态同步推进。
  - [x] SubTask 4.3: 选择并固化火山主音色、语速、停顿与播报长度策略，收口“低 AI 味”表达。
  - [ ] SubTask 4.4: 让 AI 接话感、起句节奏、停顿方式和连续播报体验尽量贴近豆包，而不是播音腔。

- [ ] Task 5: 实现可实时打断能力
  - [x] SubTask 5.1: 用户开口时立即停止当前 TTS 播放和后续音频队列。
  - [x] SubTask 5.2: 用户开口时中断或截断当前 AI 回复生成，避免“声音停了但后台还在继续生成”。
  - [x] SubTask 5.3: 打断后重新拼接上下文，让下一轮追问承接已说出的内容。
  - [ ] SubTask 5.4: 让打断体感尽量对齐豆包，包括停播速度、状态切换和字幕冻结节奏。

- [ ] Task 6: 升级实时字幕体验
  - [ ] SubTask 6.1: 为面试官和用户分别定义 partial / final 字幕渲染策略。
  - [ ] SubTask 6.2: 保持两侧字幕窗大小、位置和视觉语言一致，同时尊重既定浅色/深色样式口径。
  - [ ] SubTask 6.3: 处理打断、静音、识别失败、播报失败时的字幕冻结与回退逻辑。
  - [ ] SubTask 6.4: 让字幕推进速度、增量刷新感和打断后的停止表现尽量贴近豆包。

- [ ] Task 7: 明确前置依赖与验收方案
  - [ ] SubTask 7.1: 整理域名、HTTPS、火山配置、耳机测试环境和浏览器权限要求。
  - [ ] SubTask 7.2: 定义首字延迟、打断响应时间、识别准确率、播报稳定性等验收指标。
  - [ ] SubTask 7.3: 在 HTTPS 条件具备后完成真实设备联调与回归验证。
  - [ ] SubTask 7.4: 补充“是否达到豆包一比一体感”和“是否始终由 `DeepSeek v4` 驱动内容生成”的专项验收项。

# Task Dependencies
- Task 2 depends on Task 1
- Task 3 depends on Task 1, Task 2
- Task 4 depends on Task 1, Task 2
- Task 5 depends on Task 2, Task 3, Task 4
- Task 6 depends on Task 3, Task 4, Task 5
- Task 7 depends on Task 2, Task 3, Task 4, Task 5, Task 6
