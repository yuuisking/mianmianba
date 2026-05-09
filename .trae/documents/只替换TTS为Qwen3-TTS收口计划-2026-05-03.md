# 只替换 TTS 为 Qwen3-TTS 收口计划

## Summary

本计划只做一件事：把当前项目的 `TTS` 从火山切换到阿里百炼 `Qwen3-TTS`，并把整条链路的说明、配置、验证和申请步骤收口到当前真实现状。

明确不动的范围：

- 不替换 `ASR`，继续保留火山语音识别：`src/lib/speech/volc.ts`、`src/app/api/speech/asr/route.ts`
- 不替换面试官大脑，继续保留 `DeepSeek v4 / deepseek-chat`：`src/app/api/chat/route.ts`
- 不重构前端实时房间状态机、字幕编排、打断逻辑：`src/app/interview/page.tsx`

本计划的执行目标不是“再设计一个方案”，而是把仓库已经进入的中间态彻底收口为可交付状态：

- 代码口径：`Qwen TTS + Volc ASR + DeepSeek v4`
- 文档口径：不再把火山 `TTS` 作为当前主方案
- 配置口径：补齐阿里百炼环境变量，保留火山 `ASR` 变量
- 验收口径：先静态校验，再做 `TTS(Qwen)` 与 `ASR(Volc)` 混合链路验证
- 交付口径：给出阿里百炼最新申请步骤，并注明火山侧只保留 `ASR`

---

## Current State Analysis

### 1. 当前供应商边界

仓库当前实际代码已表现为：

- `src/lib/speech/qwen.ts`：新增阿里百炼 `Qwen3-TTS` 封装，已具备请求构造、重试、非流式 URL 下载、SSE 音频片段收集能力
- `src/app/api/speech/tts/route.ts`：已从 `@/lib/speech/qwen` 导入 `synthesizeSpeech`
- `src/lib/speech/volc.ts`：当前只保留火山 `ASR`，不再包含火山 `TTS`
- `src/app/api/speech/asr/route.ts`：仍调用 `@/lib/speech/volc`
- `src/app/api/chat/route.ts`：仍使用 `deepseek-chat`

因此从代码结构上看，“只替换 TTS” 已经走到中后段，不是从零开始。

### 2. 当前前端依赖面

`src/app/interview/page.tsx` 当前只依赖服务端 `TTS` 接口返回完整音频二进制：

- 通过 `/api/speech/tts` POST 文本和可选语音参数
- 获取 `arrayBuffer`
- 用 `AudioContext.decodeAudioData()` 解码后进入既有队列播放

这意味着本次收口应继续坚持“前端协议不变，服务端供应商替换”的策略，不能顺手把前端改成另一套播放模型。

### 3. 当前已知运行态问题

基于现状核对，当前最大的真实问题不是代码缺失，而是运行态没有收口：

- `.env.local` 当前只有旧火山变量：`VOLC_APP_ID`、`VOLC_ACCESS_TOKEN`、`VOLC_SECRET_KEY`、`VOLC_ASR_CLUSTER`、`VOLC_TTS_CLUSTER`
- 当前本地环境没有 `DASHSCOPE_API_KEY`
- 已有开发实例返回过 `缺失环境变量：DASHSCOPE_API_KEY`
- 用过的一枚阿里 key 返回 `InvalidApiKey`

结论：当前代码已切到 Qwen，但当前运行环境还没有切到有效的阿里百炼凭证。

### 4. 当前文档口径不一致

当前仓库内存在明显的文档错位：

- `说明文档.md` 仍保留“火山新版 TTS 已打通”的历史记录
- `.trae/documents/火山新版控制台申请与配置流程.md` 仍把火山 `TTS` 作为当前主申请口径
- 还没有 `.trae/documents/Qwen3-TTS申请与配置流程.md`

这会导致后续再次打开项目时误判当前主方案。

### 5. 当前验证脚本状态

验证脚本已基本完成切换：

- `scripts/speech-smoke-test.mjs` 已存在
- `package.json` 已提供 `npm run test:speech`

但当前还缺最后一步：在“有效的 `DASHSCOPE_API_KEY` + 正确加载到运行中的 dev 环境”下完成一次完整跑通。

### 6. 当前接口兼容风险点

从已存在代码看，当前还有几处需要在执行阶段重点核对：

- `src/app/api/speech/tts/route.ts` 默认 `encoding = 'wav'`
- `scripts/speech-smoke-test.mjs` 的 `verifyTts()` 发送的是 `encoding: 'mp3'`
- `src/lib/speech/qwen.ts` 目前接收 `encoding` 字段，但没有把它实际映射进阿里请求体
- `src/app/interview/page.tsx` 会把前端 `voiceType` 原样传给服务端

这说明当前最大的实现级风险不在“能不能请求到 Qwen”，而在“音频格式和音色参数是否与现有播放链路完全兼容”。

---

## Assumptions & Decisions

### 已锁定决策

1. 只替换 `TTS`
2. 不动火山 `ASR`
3. 不动 `DeepSeek v4`
4. 不改前端 `/api/speech/tts` 调用协议
5. 先保证当前“完整音频返回后播放”的模式稳定，再考虑未来实时化

### 供应商决策

- 当前主方案：阿里百炼 `Qwen3-TTS`
- 当前保留供应商：火山仅用于 `ASR`

### 模型决策

首版默认：

- `QWEN_TTS_MODEL=qwen3-tts-flash`

后续仅在听感不满足时再评估：

- `qwen3-tts-instruct-flash`
- `qwen3-tts-flash-realtime`
- `qwen3-tts-instruct-flash-realtime`

### 地域决策

- 默认按国内使用场景选择北京地域阿里百炼 API Key

### 音色决策

- 服务端设置一个稳定的默认音色
- 前端传入的 `voiceType` 先保持兼容入口不删
- 若前端当前仍传火山音色值，执行阶段优先做服务端兜底，不让路由直接因为旧值失败

### 编码决策

- 以“当前浏览器播放链路最稳定”为准
- 执行阶段重点验证 `mp3` 与 `wav` 的实际兼容性
- 若阿里接口不直接支持现有 `encoding` 语义，先在服务端统一固定输出一种已验证可播放的格式，再确保响应头与真实内容一致

---

## Proposed Changes

### 1. `src/lib/speech/qwen.ts`

#### 要做什么

- 保持该文件作为唯一 `Qwen TTS` 底层实现
- 核对并补齐请求体与返回体适配
- 明确 `encoding`、`voiceType`、默认音色、SSE 开关的最终行为

#### 为什么做

- 当前文件已经是核心实现，但还处于“可用中间态”
- 需要把“已接入”变成“已收口”

#### 如何做

- 检查阿里当前所用接口是否支持项目需要的音频格式
- 若 `encoding` 暂时无法一一映射，明确在代码和文档中定义当前受支持格式
- 为 `voiceType` 建立最小兼容策略：
  - 优先使用前端传值
  - 无效或为空时回退到 `QWEN_TTS_VOICE`
- 保持 `fetchWithRetry()`、`synthesizeViaUrl()`、`synthesizeViaSse()` 的职责清晰
- 保持所有函数级注释完整，符合仓库规范

#### 重点风险

- 阿里返回的是 URL 或 Base64 分片，不是现成可播的统一格式
- `encoding` 目前存在“路由暴露了，但底层未真正使用”的不一致

### 2. `src/app/api/speech/tts/route.ts`

#### 要做什么

- 保持当前统一入口不变
- 收口入参与响应头行为

#### 为什么做

- 这是前端唯一依赖的 TTS 接口
- 只要这里保持兼容，前端房间就不需要跟着重构

#### 如何做

- 保留现有入参：
  - `text`
  - `voiceType`
  - `speedRatio`
  - `pitchRatio`
  - `volumeRatio`
  - `encoding`
- 明确当前支持的输出格式
- 保证 `Content-Type` 与实际返回音频一致
- 保持错误时仍返回结构化 JSON，而不是空白 `500`

#### 重点风险

- 当前 `encoding` 默认值、脚本请求值和底层实现不完全一致
- 如果响应头写成 `audio/wav`，实际内容却不是 WAV，会影响浏览器解码稳定性

### 3. `src/lib/speech/volc.ts`

#### 要做什么

- 保持只承担火山 `ASR`
- 不再回流任何火山 `TTS` 历史逻辑

#### 为什么做

- 当前边界已经比较清晰，执行阶段需要防止回退

#### 如何做

- 只围绕 `recognizeSpeech()`、WebSocket 模式解析和 `VOLC_ASR_*` 环境变量做回归
- 不新增任何与 `TTS` 有关的逻辑

#### 重点风险

- 收口 TTS 时误动 ASR，会破坏当前已打通的火山识别链路

### 4. `src/app/interview/page.tsx`

#### 要做什么

- 只做最小兼容核对，不做行为重构

#### 为什么做

- 用户要求“只替换 TTS”
- 该文件已经承载复杂的实时房间状态机，风险很高

#### 如何做

- 检查是否存在硬编码火山音色值
- 若有，只做最小替换或让服务端兜底
- 保持 `fetchTtsAudio()`、队列播放、打断与字幕逻辑不变

#### 重点风险

- 前端如果持续传火山音色值给阿里，可能导致合成失败或声音异常

### 5. `scripts/speech-smoke-test.mjs`

#### 要做什么

- 把它作为当前唯一推荐的语音栈自检脚本

#### 为什么做

- 仓库当前实际架构是 `TTS(Qwen) + ASR(Volc)` 混合链路
- 验证脚本必须与现状一致

#### 如何做

- 保持：
  - `verifyTts()` 验证 `/api/speech/tts`
  - `verifyAsr()` 验证 `/api/speech/asr`
- 明确日志输出：
  - `TTS(Qwen)`
  - `ASR(Volc)`
- 用 `SPEECH_SMOKE_TEST_PORT` 适配已有 dev 端口

#### 重点风险

- 当前脚本通过不代表页面级就一定通过，因此脚本验证后仍需做房间人工回归

### 6. `package.json`

#### 要做什么

- 保持 `test:speech` 作为统一命令

#### 为什么做

- 供应商已经是混合栈，不能再沿用 `test:volc-speech` 这种旧命名

#### 如何做

- 不再恢复旧脚本名
- 所有文档和申请步骤统一引用 `npm run test:speech`

### 7. `说明文档.md`

#### 要做什么

- 追加一条“只替换 TTS 为 Qwen3-TTS”的真实进度记录

#### 为什么做

- 这是仓库级主文档
- 用户规则要求每次继续开发前先读这里，且任务完成后立即回填

#### 如何做

- 记录以下结论：
  - 火山 `ASR` 保留
  - `DeepSeek v4` 保留
  - `Qwen TTS` 已成为当前主方案
  - 当前运行态阻断是 `DASHSCOPE_API_KEY`
  - 新验收命令是 `npm run test:speech`

### 8. `.trae/documents/火山新版控制台申请与配置流程.md`

#### 要做什么

- 降级为历史文档

#### 为什么做

- 当前只保留火山 `ASR`
- 它不能再继续承担当前主申请指引

#### 如何做

- 在文档顶部注明：
  - 当前仅火山 `ASR` 继续使用
  - 火山 `TTS` 已不是当前主方案
  - 本文仅供保留 `ASR` 配置时参考

### 9. 新增 `.trae/documents/Qwen3-TTS申请与配置流程.md`

#### 要做什么

- 新增当前主方案的申请文档

#### 为什么做

- 用户明确要求最后给出申请步骤
- 申请文档必须与当前代码和计划一致

#### 如何做

- 覆盖以下内容：
  - 阿里百炼控制台入口
  - API Key 创建
  - 北京地域选择
  - 模型选择
  - 音色选择
  - 环境变量填写
  - 本地验证命令
  - 常见报错说明，例如 `InvalidApiKey`

---

## Environment Variables

### 一、继续保留的火山 ASR 变量

执行后，以下变量继续服务火山 `ASR`：

```bash
VOLC_API_KEY=
VOLC_ASR_RESOURCE_ID=
VOLC_ASR_WS_MODE=bigmodel
VOLC_ASR_MODEL_NAME=bigmodel
VOLC_ASR_ENABLE_NONSTREAM=true
VOLC_ASR_END_WINDOW_SIZE=800
VOLC_ASR_FORCE_TO_SPEECH_TIME=1000
```

兼容回退时可能仍会读到：

```bash
VOLC_APP_ID=
VOLC_ACCESS_TOKEN=
VOLC_ASR_CLUSTER=volcengine_streaming_common
```

说明：

- 这三项是历史兼容变量，不是本次 TTS 切换的重点
- 执行阶段不主动删除，但文档中要区分“主链路变量”和“兼容变量”

### 二、需要补齐的 Qwen TTS 变量

当前主方案需要以下变量：

```bash
DASHSCOPE_API_KEY=
QWEN_TTS_BASE_URL=https://dashscope.aliyuncs.com/api/v1
QWEN_TTS_MODEL=qwen3-tts-flash
QWEN_TTS_VOICE=Cherry
QWEN_TTS_LANGUAGE_TYPE=Chinese
QWEN_TTS_ENABLE_STREAM=false
QWEN_TTS_USE_INSTRUCT=false
QWEN_TTS_INSTRUCTIONS=
```

说明：

- `DASHSCOPE_API_KEY` 是当前最核心缺口
- `QWEN_TTS_ENABLE_STREAM` 是否设为 `true`，以执行阶段验证结果为准；当前计划优先保证稳定
- `QWEN_TTS_VOICE` 需在实际申请到音色后确定最终值，不应长期只依赖默认值

### 三、应降级为历史配置的火山 TTS 变量

以下变量不再是当前主方案的必填项：

```bash
VOLC_TTS_RESOURCE_ID
VOLC_TTS_VOICE_TYPE
VOLC_TTS_SPEED_RATIO
VOLC_TTS_PITCH_RATIO
VOLC_TTS_VOLUME_RATIO
VOLC_TTS_CLUSTER
```

处理原则：

- 不要求立刻从本地环境删除
- 但在文档中必须明确它们已不属于当前主路径

---

## Risks

### 1. 运行态凭证风险

- 当前最大的真实阻断项是没有可用的 `DASHSCOPE_API_KEY`
- 没有有效 key，所有 `Qwen TTS` 验收都只能停留在静态层

缓解方式：

- 先申请北京地域阿里百炼 API Key
- 将 key 注入真正运行中的 dev 环境后再做路由级验证

### 2. 音频格式风险

- 当前路由层默认 `wav`，脚本层传 `mp3`，底层实现未完全显式映射
- 如果格式、响应头和真实内容不一致，会直接影响浏览器播放

缓解方式：

- 执行阶段先确定一个稳定格式
- 再统一路由默认值、自检脚本和文档口径

### 3. 音色参数风险

- 当前前端仍保留 `voiceType` 透传
- 旧的火山音色值不能保证可被阿里直接接受

缓解方式：

- 服务端做默认音色兜底
- 如需映射，在执行阶段建立最小白名单或兜底回退

### 4. 听感与豆包不完全同源风险

- 换供应商后，音色 timbre 与语流风格会发生变化

缓解方式：

- 保持现有字幕、分段、停顿、打断、上下文承接逻辑不变
- 优先选更自然、更稳的 Qwen 音色

### 5. 文档误导风险

- 如果不更新 `说明文档.md` 和火山申请文档，下一次继续开发很容易走错方向

缓解方式：

- 把历史火山 `TTS` 文档显式标成非主方案
- 新建 Qwen 申请文档作为唯一当前口径

### 6. 假通过风险

- 脚本能过不等于房间级播放就完全没问题

缓解方式：

- 验收必须分为静态验证、接口验证、自检脚本验证、房间级人工验证四层

---

## Verification Steps

### 第一层：静态校验

执行以下命令，确认收口代码没有破坏类型和构建：

```bash
node ./node_modules/typescript/bin/tsc --noEmit
node ./node_modules/eslint/bin/eslint.js src/lib/speech/qwen.ts src/lib/speech/volc.ts src/app/api/speech/tts/route.ts src/app/api/speech/asr/route.ts scripts/speech-smoke-test.mjs
npm run build
```

验收标准：

- 全部通过
- 不新增本轮改动引入的 lint 或类型错误

### 第二层：TTS 路由验证

在注入有效 `DASHSCOPE_API_KEY` 的 dev 环境下调用：

- `/api/speech/tts`

重点检查：

- HTTP 状态为 `200`
- 返回的 `Content-Type` 与真实音频格式一致
- 能返回非空音频二进制
- 错误时能看到明确报错，而不是模糊 `500`

建议验证场景：

- 默认参数
- 指定 `voiceType`
- 指定 `encoding`
- 较短文本
- 较长文本

### 第三层：ASR 回归验证

调用：

- `/api/speech/asr`

重点检查：

- 仍返回 `200`
- 仍能识别中文样本
- 说明“只替换 TTS”没有破坏火山 `ASR`

### 第四层：统一脚本验证

执行：

```bash
npm run test:speech
```

预期输出必须包含：

- `TTS(Qwen)` 通过
- `ASR(Volc)` 通过

若 dev 服务不在 `3000`，则配合：

```bash
SPEECH_SMOKE_TEST_PORT=3001 npm run test:speech
```

### 第五层：房间级人工验证

进入 `src/app/interview/page.tsx` 对应的实时面试房间，至少验证一轮完整闭环：

1. 触发 AI 回答后，能正常播报
2. 播报时字幕继续推进
3. 用户打断后，当前播报能停止
4. 打断后再次发言，AI 还能承接上下文
5. 页面不因 TTS 切换出现播放报错或持续静音

### 第六层：失败场景验证

必须确认以下错误能被清晰识别：

- 未配置 `DASHSCOPE_API_KEY`
- `DASHSCOPE_API_KEY` 无效，返回 `InvalidApiKey`
- 音色值无效
- 音频格式不兼容

---

## Acceptance Criteria

满足以下条件才算本次“只替换 TTS”收口完成：

1. `src/app/api/speech/tts/route.ts` 继续保持前端协议不变，但实际由 `Qwen TTS` 驱动
2. `src/lib/speech/volc.ts` 继续只负责火山 `ASR`
3. `src/app/api/chat/route.ts` 保持 `DeepSeek v4` 不变
4. `npm run test:speech` 在有效环境下完整通过
5. 房间级人工验证可正常播报、打断、继续对话
6. `说明文档.md` 已回填当前真实状态
7. 火山申请文档已降级为历史说明
8. Qwen 申请文档已新增并可直接交付给用户

---

## Final Application Steps

以下是执行完成后要交付给用户的申请步骤口径。

### 一、阿里百炼申请步骤

1. 登录阿里百炼控制台  
   入口：`https://bailian.console.aliyun.com/`

2. 创建或确认北京地域 API Key  
   文档：`https://help.aliyun.com/zh/model-studio/get-api-key`

3. 选择当前首版模型  
   建议先用：`qwen3-tts-flash`

4. 选择一个稳定中文音色  
   将结果写入：`QWEN_TTS_VOICE`

5. 把环境变量配置到本地运行环境  
   至少包括：

```bash
DASHSCOPE_API_KEY=
QWEN_TTS_BASE_URL=https://dashscope.aliyuncs.com/api/v1
QWEN_TTS_MODEL=qwen3-tts-flash
QWEN_TTS_VOICE=
QWEN_TTS_LANGUAGE_TYPE=Chinese
QWEN_TTS_ENABLE_STREAM=false
QWEN_TTS_USE_INSTRUCT=false
QWEN_TTS_INSTRUCTIONS=
```

6. 启动本地服务并验收  

```bash
npm run dev
npm run test:speech
```

### 二、火山侧你还需要保留什么

火山侧当前只保留 `ASR` 所需参数，不再以火山 `TTS` 为主：

```bash
VOLC_API_KEY=
VOLC_ASR_RESOURCE_ID=
VOLC_ASR_WS_MODE=bigmodel
VOLC_ASR_MODEL_NAME=bigmodel
VOLC_ASR_ENABLE_NONSTREAM=true
VOLC_ASR_END_WINDOW_SIZE=800
VOLC_ASR_FORCE_TO_SPEECH_TIME=1000
```

### 三、申请后你发给执行者的信息

执行前，用户最终只需要补齐这些信息：

- `DASHSCOPE_API_KEY`
- 计划使用的 `QWEN_TTS_MODEL`
- 计划使用的 `QWEN_TTS_VOICE`
- 当前火山 `VOLC_API_KEY`
- 当前火山 `VOLC_ASR_RESOURCE_ID`

这样执行阶段就可以直接完成最终收口和运行态验收，不需要再回头改方案。
