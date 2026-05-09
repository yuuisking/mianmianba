# 只替换 TTS 切换到 Qwen3-TTS 实施计划

## Summary

本计划只替换当前项目中的 `TTS` 供应商，将实时房间和文字链路里现有的火山 `TTS` 改为阿里百炼 `Qwen3-TTS`，同时 **保持以下部分完全不动**：

- `DeepSeek v4` / `deepseek-chat` 继续作为面试官大脑
- 当前火山 `ASR` 继续保留，不做供应商替换
- 当前前端实时房间状态机、字幕策略、打断逻辑、分段播报编排不做产品层重构

本计划目标是让执行者在不影响现有 `ASR + DeepSeek v4 + 房间交互` 的前提下，仅替换 `TTS` 底层实现与相关配置，降低语音合成成本，并保留“真流式、可打断、低延迟”的体验基础。

---

## Current State Analysis

### 当前链路结构

根据现有代码与文档，当前实时语音主链路是：

- `DeepSeek v4` 文本生成：`src/app/api/chat/route.ts`
- `ASR` 入口：`src/app/api/speech/asr/route.ts`
- `TTS` 入口：`src/app/api/speech/tts/route.ts`
- 语音底层封装：`src/lib/speech/volc.ts`
- 前端房间编排：`src/app/interview/page.tsx`

### 当前 TTS 真实现状

当前 `TTS` 已经不是旧版火山 `v1`，而是新版火山 `v3`：

- `src/lib/speech/volc.ts` 中 `synthesizeSpeech()` 当前走 `https://openspeech.bytedance.com/api/v3/tts/unidirectional`
- 鉴权依赖 `VOLC_API_KEY`
- 资源依赖 `VOLC_TTS_RESOURCE_ID`
- 默认音色依赖 `VOLC_TTS_VOICE_TYPE`

当前 `TTS` 返回结果在服务端收流并拼接为完整 `Buffer` 后，再通过 `/api/speech/tts` 返回给前端。也就是说，**前端没有直接感知火山协议细节**，只感知一个“给我二进制音频”的接口。

### 当前前端对 TTS 的依赖面

从 `src/app/interview/page.tsx` 的调用看，前端只依赖以下事实：

- 调用 `/api/speech/tts`
- 传入：
  - `text`
  - `voiceType`
  - `speedRatio`
  - `pitchRatio`
  - `volumeRatio`
  - `encoding`
- 返回完整音频二进制

因此，**最稳妥的替换方式不是重写前端，而是保持 `/api/speech/tts` 协议不变，仅替换其底层供应商实现。**

### 当前 ASR 与大模型现状

- `ASR` 仍在 `src/lib/speech/volc.ts` 中，由 `recognizeSpeech()` 负责
- `src/app/api/speech/asr/route.ts` 仅做代理，不应在本次任务中改供应商
- `DeepSeek v4` 仍在 `src/app/api/chat/route.ts` 中通过 `deepseek-chat` 调用

这与用户要求完全一致：**只替换 TTS，不动 ASR，不动 DeepSeek v4。**

### 当前辅助验证能力

仓库已有一个火山语音自检脚本：

- `scripts/volc-speech-smoke-test.mjs`

但该脚本当前同时验证：

- 火山 `TTS`
- 火山 `ASR`

如果切换到 `Qwen3-TTS`，该脚本和脚本命名都需要同步收口，否则会出现“代码已替换、验证脚本仍然写着火山”的认知错位。

### 当前仓库内没有阿里/Qwen 接入

通过全文检索，仓库中目前 **没有** 以下内容：

- `Qwen`
- `aliyun`
- `dashscope`
- `model-studio`

这意味着本次替换不是“切换配置”，而是一次 **新增第二家供应商接入并切换 TTS 调用目标** 的工作。

---

## Assumptions & Decisions

### 已锁定决策

1. **只替换 TTS，不替换 ASR**
2. **DeepSeek v4 不动**
3. **前端 `/api/speech/tts` 调用面保持不变**
4. **优先选择阿里官方流式/实时能力，而不是先走开源自托管**
5. **第一阶段不做双供应商动态路由，先以单一目标替换为主**

### 模型与接入决策

基于阿里官方文档，TTS 替换方案分两层：

- 低风险首版：使用 `Qwen3-TTS-Flash` 非实时/流式输出能力
- 目标态：使用 `Qwen3-TTS-Flash-Realtime` 或 `Qwen3-TTS-Instruct-Flash-Realtime`

本计划建议执行路径：

1. **服务端先接 `Qwen3-TTS-Flash` 或其流式 HTTP/SSE 形式**
   - 原因：当前前端接口只要求“返回完整音频 Buffer”
   - 这样可以最小改动快速完成替换
2. **若验收目标要求进一步逼近豆包实时接话感，再进入第二阶段切到 `Qwen3-TTS-Flash-Realtime`**
   - 原因：实时 WebSocket 版更适合与分段接话、持续输出、低延迟场景结合

本计划为了“只替换 TTS 且控制执行风险”，**默认执行目标为：先落地 `Qwen3-TTS-Flash` 服务端接入，保持前端接口不变；后续保留升级到 Realtime 的路径。**

### 地域与 API Key 决策

根据阿里官方文档：

- 中国内地调用需要使用 **北京地域 API Key**
- 国际调用需要使用 **新加坡地域 API Key**

本项目当前面向国内部署和测试环境，决策为：

- **默认使用北京地域 API Key**
- 环境变量中显式暴露地域/接入点，避免后续迁移时再拆代码

### 音频格式决策

阿里官方示例支持：

- 流式输出 Base64 音频片段
- 实时模式推荐 `PCM 24000Hz Mono 16bit`

当前前端已有音频播放编排，且项目内现有链路倾向直接处理音频二进制，决策为：

- 第一阶段优先返回 `mp3` 或 `pcm` 中最容易与现有前端兼容的一种
- 若前端对 `audio/mpeg` 依赖更稳定，则首版保留 `mp3`
- 若 Realtime 方案进入第二阶段，则切向 `pcm 24000Hz mono 16bit`

### 指令控制决策

Qwen 官方支持：

- `qwen3-tts-instruct-flash`
- `qwen3-tts-instruct-flash-realtime`

本计划默认首版 **不启用 instruct 版**，理由：

- 当前项目已经在 `prompt + 文本清洗 + 段间停顿 + 首句节奏` 上做了大量“低 AI 味”控制
- 首次替换供应商时应先降低不确定性，优先验证成本、延迟和兼容性

只有在替换后听感明显不足、需要进一步靠供应商侧补充风格控制时，才升级到 instruct 版。

---

## Proposed Changes

### 1. `src/lib/speech/volc.ts`

#### 要改什么

- 从该文件中抽离或移除 `TTS` 相关实现
- 保留 `ASR` 相关实现不动
- 避免一个 `volc.ts` 同时承载“火山 ASR + 阿里 TTS”的混乱职责

#### 为什么改

- 本次任务是“只替换 TTS，不动火山 ASR”
- 当前 `volc.ts` 同时承载 ASR/TTS，会让后续维护者误以为整条语音链路仍全在火山

#### 怎么改

- 保留 `recognizeSpeech()` 与相关火山 ASR WebSocket 工具函数在该文件
- 删除或迁出 `synthesizeSpeech()` 与其辅助函数
- 如有必要，将通用音频/工具函数保留在更中性的 util 中

#### 风险

- 如果迁移时误删了被 ASR 共用的工具函数，会破坏当前已打通的识别链路

---

### 2. 新增 `src/lib/speech/qwen.ts`

#### 要改什么

- 新增阿里 Qwen TTS 封装文件
- 统一提供 `synthesizeSpeech(text, options)` 或等价导出

#### 为什么改

- 需要将“火山 ASR”与“阿里 TTS”在代码层清晰分层
- 便于后续单独扩展：
  - `Qwen3-TTS-Flash`
  - `Qwen3-TTS-Flash-Realtime`
  - `Qwen3-TTS-Instruct-Flash`

#### 怎么改

- 在该文件中实现：
  - API Key 读取
  - 地域接入点选择
  - 模型名选择
  - 音色参数映射
  - 非流式/流式合成响应解析
- 第一阶段计划对接阿里官方 HTTP/SDK 兼容能力，服务端读取完整结果后统一返回 `Buffer`
- 保持导出形式与当前 `tts/route.ts` 容易对接

#### 关键接口决策

- API Key 环境变量：`DASHSCOPE_API_KEY`
- 默认接入点：北京地域
- 默认模型：`qwen3-tts-flash`
- 预留后续实时模型：
  - `qwen3-tts-flash-realtime`
  - `qwen3-tts-instruct-flash-realtime`

#### 风险

- 阿里返回格式可能与火山当前完整音频 `Buffer` 不同，需要服务端完成一次适配
- 如果首版直接选 Realtime WebSocket，复杂度会明显上升

---

### 3. `src/app/api/speech/tts/route.ts`

#### 要改什么

- 改为调用 `src/lib/speech/qwen.ts`
- 保持请求体和响应体对前端兼容

#### 为什么改

- 前端已经围绕该接口完成了队列、打断、分段播报、状态同步
- 改这个 route 的“底层实现”比改前端稳定得多

#### 怎么改

- 保留现有入参：
  - `text`
  - `voiceType`
  - `speedRatio`
  - `pitchRatio`
  - `volumeRatio`
  - `encoding`
- 在服务端把这些参数映射到阿里 Qwen TTS 的请求格式：
  - `voice`
  - `language_type`
  - `model`
  - 可能的 `instructions`
- 保持返回：
  - `200 + 音频二进制`
  - 错误时返回结构化 JSON

#### 风险

- 阿里的音色参数体系与火山不同，`voiceType` 将不再是同一套值
- 需要在路由中明确做“火山音色值已失效”的兼容/报错策略

---

### 4. `src/app/interview/page.tsx`

#### 要改什么

- 只调整 `voiceType` 默认值与前端注释/文案（如果当前前端有默认火山音色假设）
- 不改变当前 `fetchTtsAudio()`、`queueTts()`、打断状态机的整体逻辑

#### 为什么改

- 用户明确要求“只替换 TTS”
- 当前前端逻辑已经围绕完整音频返回构建，不应趁机重构产品行为

#### 怎么改

- 检查是否存在任何硬编码火山 2.0 音色 ID
- 若存在，替换为阿里 Qwen 目标音色 ID 或在服务端统一兜底
- 保持：
  - `queueTts`
  - `buildRealtimeTtsOptions`
  - `buildRealtimeTtsPauseAfterMs`
  - `sanitizeTtsTextForConversation`
  不变

#### 风险

- 如果前端仍把火山音色值传给阿里，会导致合成失败或回退到默认音色

---

### 5. `scripts/volc-speech-smoke-test.mjs`

#### 要改什么

- 重命名或拆分为更中性的语音链路自检脚本

#### 为什么改

- 当前脚本名称和文案都写死为 `volc`
- 替换 TTS 后，继续叫 `volc-speech-smoke-test` 会导致认知错误

#### 怎么改

- 推荐重命名为：
  - `scripts/speech-smoke-test.mjs`
- 逻辑拆为：
  - `verifyTts()` 走阿里 Qwen TTS
  - `verifyAsr()` 仍走火山 ASR
- 输出日志要明确：
  - `TTS(Qwen)` 通过
  - `ASR(Volc)` 通过

#### 风险

- 如果只改脚本内容不改脚本名，会让后续排障非常混乱

---

### 6. `package.json`

#### 要改什么

- 更新脚本命令命名
- 如接入阿里 SDK，新增依赖

#### 为什么改

- 当前只有 `test:volc-speech`
- 替换后应改为供应商无关或明确“双供应商混合”

#### 怎么改

- 将
  - `test:volc-speech`
  改为
  - `test:speech`
  或
  - `test:speech-stack`
- 如果使用阿里 DashScope SDK，需要新增对应依赖并锁定版本
- 如果最终走原生 HTTP / SSE / WebSocket，则只需补充少量解析依赖或复用现有原生能力

#### 风险

- SDK 方案会引入额外依赖与版本维护成本
- 纯 HTTP 方案则需要自己处理流式事件与音频拼接

---

### 7. `说明文档.md`

#### 要改什么

- 追加一条“只替换 TTS 为 Qwen3-TTS”的进度记录

#### 为什么改

- 仓库规则要求每次任务完成后即时更新文档
- 后续再打开项目时，必须先通过该文档恢复当前真实状态

#### 怎么改

- 明确记录：
  - 替换范围仅为 TTS
  - 火山 ASR 保留
  - DeepSeek v4 保留
  - 新增环境变量
  - 新的验收方式

---

### 8. `.trae/documents/火山新版控制台申请与配置流程.md`

#### 要改什么

- 不再作为当前主计划的申请文档
- 保留为历史文档，但需要补充说明其已不再是当前主方案

#### 为什么改

- 当前主方案将不再围绕“新版火山 TTS”
- 但火山 `ASR` 仍保留，因此该文档不能直接删除

#### 怎么改

- 在文档顶部加说明：当前仅火山 ASR 仍使用；TTS 主方案已转向 Qwen3-TTS

---

### 9. 新增 `.trae/documents/Qwen3-TTS申请与配置流程.md`

#### 要改什么

- 新增阿里百炼申请文档

#### 为什么改

- 用户明确要求“最后把申请步骤给到我”
- 申请步骤必须与新主方案一致，而不是继续指向火山 TTS

#### 怎么改

- 文档需覆盖：
  - 百炼控制台入口
  - API Key 获取
  - 北京地域选择
  - 模型选择
  - 音色选择
  - 本地环境变量配置
  - 本地验收命令

---

## Environment Variables

### 保持不变

以下变量继续保留，服务于火山 `ASR`：

```bash
VOLC_API_KEY=
VOLC_ASR_RESOURCE_ID=
VOLC_ASR_WS_MODE=bigmodel
VOLC_ASR_MODEL_NAME=bigmodel
VOLC_ASR_ENABLE_NONSTREAM=true
VOLC_ASR_END_WINDOW_SIZE=800
VOLC_ASR_FORCE_TO_SPEECH_TIME=1000
```

### 计划新增

以下变量用于 `Qwen3-TTS`：

```bash
DASHSCOPE_API_KEY=
QWEN_TTS_MODEL=qwen3-tts-flash
QWEN_TTS_VOICE=
QWEN_TTS_REGION=cn-beijing
QWEN_TTS_BASE_URL=https://dashscope.aliyuncs.com/api/v1
QWEN_TTS_REALTIME_URL=wss://dashscope.aliyuncs.com/api-ws/v1/realtime
QWEN_TTS_LANGUAGE_TYPE=Chinese
QWEN_TTS_ENABLE_STREAM=true
QWEN_TTS_USE_INSTRUCT=false
QWEN_TTS_INSTRUCTIONS=
```

### 计划废弃或降级为历史兼容

以下变量将不再作为主链路 TTS 前置：

```bash
VOLC_TTS_RESOURCE_ID
VOLC_TTS_VOICE_TYPE
VOLC_TTS_SPEED_RATIO
VOLC_TTS_PITCH_RATIO
VOLC_TTS_VOLUME_RATIO
```

处理策略：

- 第一阶段可短期保留，避免一次性改动过大
- 但文档中应明确标注为“历史火山 TTS 配置，不再是主方案”

---

## Risks

### 1. 声音气质与豆包不再完全同源

- 供应商从火山切换到阿里后，声音风格会变化
- “豆包一比一”中的**声音 timbre / 语流细节**将无法继续完全同源

缓解方式：

- 保留现有接话节奏、文本清洗、段间停顿和打断策略
- 先选偏自然、偏稳的 Qwen 音色

### 2. 首版如果用非实时模型，首包时延可能高于当前目标态

- `qwen3-tts-flash` 与 `qwen3-tts-flash-realtime` 的体感不同

缓解方式：

- 计划第一阶段先完成成本替换
- 第二阶段再评估是否切 `qwen3-tts-flash-realtime`

### 3. 音色参数体系完全不同

- 火山 `voiceType` 不能直接拿来给 Qwen 用

缓解方式：

- 服务端统一做参数映射和默认兜底
- 前端避免继续硬编码火山音色 ID

### 4. 流式输出与当前“完整 Buffer 播放”之间存在架构落差

- 阿里支持流式输出
- 但当前前端仍以“完整音频返回后播放”为主

缓解方式：

- 本次只替换供应商，不同时重构前端播放模型
- 明确把“前端真正边收边播”放入后续优化，而不是本次强塞

### 5. 自检脚本与文档容易产生供应商错位

- 目前所有验收文字都写成“火山语音”

缓解方式：

- 同步收口脚本命名、日志输出、文档标题和说明文档记录

---

## Verification Steps

### 本地静态验证

执行以下校验：

```bash
node ./node_modules/typescript/bin/tsc --noEmit
node ./node_modules/eslint/bin/eslint.js src/lib/speech/qwen.ts src/app/api/speech/tts/route.ts
npm run build
```

### 本地接口验收

#### 1. TTS 单接口验收

- 启动本地服务
- 调用 `/api/speech/tts`
- 验收点：
  - 返回 `200`
  - 返回有效音频二进制
  - 同一段中文文本可稳定合成
  - 错误时返回明确消息，不是无信息 `500`

#### 2. ASR 回归验收

- 调用 `/api/speech/asr`
- 验收点：
  - 识别仍通过
  - 说明只替换 TTS 没破坏火山 ASR

#### 3. 自检脚本验收

- 运行更新后的统一脚本
- 验收点：
  - `TTS(Qwen)` 通过
  - `ASR(Volc)` 通过

### 房间级功能验收

在 `src/app/interview/page.tsx` 对应的实时房间中验证：

1. AI 回复仍能正常分段播报
2. 用户打断时，当前音频可停止
3. 打断后下一轮还能承接上下文
4. AI 顶部状态、字幕状态与播放状态仍同步
5. 首句起手与第二句衔接没有因换供应商直接崩坏

### 主观听感验收

重点比对：

1. 首包时延是否明显恶化
2. 段间停顿是否还能接受
3. 问句结尾是否自然
4. 是否比当前火山方案更机械
5. 是否满足“对创业初期可接受的成本下降”

---

## Acceptance Criteria

执行完成后，以下条件同时满足才算通过：

1. `/api/speech/tts` 已由 Qwen3-TTS 驱动
2. `/api/speech/asr` 仍由火山驱动，且回归通过
3. `DeepSeek v4` 调用链路完全未变
4. 前端无需改交互协议即可继续播报
5. 本地脚本可一键同时验证：
   - `Qwen TTS`
   - `Volc ASR`
6. 文档中已明确新的申请步骤与环境变量

---

## Final Application Steps

以下是执行完成后应交付给用户的阿里申请步骤口径：

### 1. 注册并登录阿里云百炼

- 百炼控制台入口：[https://bailian.console.aliyun.com/](https://bailian.console.aliyun.com/)
- 获取 API Key 文档：[https://help.aliyun.com/zh/model-studio/get-api-key](https://help.aliyun.com/zh/model-studio/get-api-key)

### 2. 选择地域

- 国内方案统一使用 **北京地域**
- 对应 API Key 也必须是北京地域

### 3. 创建 API Key

- 在百炼控制台创建 API Key
- 保存为：

```bash
DASHSCOPE_API_KEY=...
```

### 4. 选择模型

首版默认：

```bash
QWEN_TTS_MODEL=qwen3-tts-flash
```

如后续需要更强表现力，可升级：

```bash
QWEN_TTS_MODEL=qwen3-tts-instruct-flash
```

如后续需要真正的流式文本输入/流式音频输出，可升级：

```bash
QWEN_TTS_MODEL=qwen3-tts-flash-realtime
```

或

```bash
QWEN_TTS_MODEL=qwen3-tts-instruct-flash-realtime
```

### 5. 选择音色

- 在阿里官方音色列表中选定系统音色
- 保存到：

```bash
QWEN_TTS_VOICE=...
```

### 6. 填写环境变量

执行完替换后，用户最终需要配置：

```bash
DASHSCOPE_API_KEY=
QWEN_TTS_MODEL=qwen3-tts-flash
QWEN_TTS_VOICE=
QWEN_TTS_REGION=cn-beijing
QWEN_TTS_BASE_URL=https://dashscope.aliyuncs.com/api/v1
QWEN_TTS_REALTIME_URL=wss://dashscope.aliyuncs.com/api-ws/v1/realtime
QWEN_TTS_LANGUAGE_TYPE=Chinese
QWEN_TTS_ENABLE_STREAM=true
QWEN_TTS_USE_INSTRUCT=false
QWEN_TTS_INSTRUCTIONS=
```

同时继续保留火山 ASR：

```bash
VOLC_API_KEY=
VOLC_ASR_RESOURCE_ID=volc.seedasr.sauc.duration
VOLC_ASR_WS_MODE=bigmodel
VOLC_ASR_MODEL_NAME=bigmodel
VOLC_ASR_ENABLE_NONSTREAM=true
VOLC_ASR_END_WINDOW_SIZE=800
VOLC_ASR_FORCE_TO_SPEECH_TIME=1000
```

### 7. 本地验收命令

```bash
npm run dev
npm run test:speech
```

以及人工进入实时房间做一次：

- 开口说话
- 看字幕
- 听 AI 播报
- 手动打断
- 再继续对话

如果这些全部通过，即可进入 HTTPS 域名联调阶段。
