# 语音面试 (Voice Interview) Spec

## Why
当前“语音面试/视频面试”入口存在但未能真正可用。我们希望先从“语音面试”开始，以尽可能简单的界面提供低延迟、可打断、带实时字幕的语音交互，并保证 AI 声音自然不机械。

## What Changes
- 新增“语音面试”完整闭环：用户说话 → 识别成文本 → 发送给 LLM → AI 文字流式输出（字幕）→ AI 语音播报（TTS）
- “错题本/专项突破”跳转到专项训练时不受影响（语音面试是独立模式）
- 支持“随时打断 AI”能力：用户开始说话时停止 AI 播放并取消后续播报队列
- 语音能力提供商第一期选用：豆包/火山（Volcengine）ASR + TTS（服务端代理，客户端不暴露密钥）
- 第一期开端范围：仅桌面 Chrome（降低兼容成本与权限问题）
- 界面风格：尽量简单、克制，不花哨；只保留必要状态与按钮（符合 brand-guidelines 的留白与信息层级，但不堆装饰）

## Impact
- Affected specs: 面试发起（setup/profile → interview）、面试对话（interview）、模型调用（chat）、复盘中心（review，仅消费文本报告不变）
- Affected code:
  - `src/app/interview/page.tsx`：新增 voice 模式 UI 与交互
  - `src/app/api/chat/route.ts`：不改协议，复用；但需要支持更频繁的短消息（ASR 片段）
  - `src/app/api/speech/*`：新增语音相关 API（ASR/TTS）
  - `src/lib/speech/*`：封装火山语音 SDK/HTTP 调用（若代码库尚无 SDK，则使用 HTTP 方式）
  - `.env*`：新增火山相关配置项（不提交密钥）

## ADDED Requirements
### Requirement: 语音面试模式
系统 SHALL 在 `/interview?mode=voice` 提供语音面试体验。

#### Scenario: 语音面试正常进行
- **WHEN** 用户进入 `/interview?mode=voice`
- **THEN** 页面展示极简语音面试 UI（状态区 + 字幕区 + 控制区）
- **AND THEN** 用户点击/按住“说话”按钮开始录音，松开结束
- **AND THEN** 系统将用户语音转写为文本，并作为用户消息提交给 LLM
- **AND THEN** AI 响应以文字流式形式展示为实时字幕
- **AND THEN** AI 响应同步以自然语音播报（TTS），且与字幕内容一致（允许按句子分段播报）

### Requirement: AI 实时字幕
系统 SHALL 在 AI 输出过程中实时更新字幕文本，而不是等待完整回复结束。

#### Scenario: 流式字幕
- **WHEN** LLM 开始返回流式 token
- **THEN** 字幕区域持续追加文本，并保持自动滚动到最新行

### Requirement: 打断 (Barge-in)
系统 SHALL 允许用户随时打断 AI 播放。

#### Scenario: 用户打断 AI
- **GIVEN** AI 正在播报语音
- **WHEN** 用户按住“说话”开始输入
- **THEN** 立刻停止当前 AI 音频播放、清空待播报队列
- **AND THEN** 如果当前 AI 仍在生成文本，客户端应中止当次请求（Abort）或将后续音频合成请求取消

### Requirement: 低延迟与不卡顿
系统 SHALL 通过“分段 TTS + 播放队列”的方式降低首段语音延迟，并避免页面频繁重渲导致卡顿。

#### Scenario: 首段语音快速开始
- **WHEN** AI 开始输出字幕
- **THEN** 系统应尽快（在字幕出现后短时间内）开始第一段语音播放
- **AND THEN** 后续语音分段以队列方式衔接播放，避免明显停顿

### Requirement: 安全与密钥隔离
系统 SHALL 将火山语音的访问密钥仅保存在服务端环境变量中，并通过服务端 API 代理调用。

#### Scenario: 客户端不可见密钥
- **WHEN** 用户在浏览器侧查看 Network/Source
- **THEN** 不应出现火山 AccessKey/SecretKey/Token 等敏感信息

## MODIFIED Requirements
### Requirement: 面试模式入口可用
现有“语音/视频/文字”模式选择应保持不报错；语音模式选择后能进入可用语音面试界面。

## REMOVED Requirements
无

