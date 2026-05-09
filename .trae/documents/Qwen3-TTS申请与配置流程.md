# Qwen3-TTS 申请与配置流程

本文面向当前 `resumer` 项目的最新语音方案，目标是让你按阿里百炼最新版控制台路径完成 `Qwen3-TTS` 申请、配置与本地验收。

当前项目语音边界如下：

- `TTS`：阿里百炼 `Qwen3-TTS`
- `ASR`：火山 `WebSocket ASR`
- 大脑：`DeepSeek v4 / deepseek-chat`

也就是说，你当前在阿里侧只需要把 `TTS` 相关申请与配置补齐，不需要同时迁移 `ASR`。

## 一、先说结论

你最终需要提供给项目的核心信息只有三项：

- `DASHSCOPE_API_KEY`
- `QWEN_TTS_MODEL`
- `QWEN_TTS_VOICE`

本项目当前建议首版固定使用：

```bash
QWEN_TTS_MODEL=qwen3-tts-flash
QWEN_TTS_VOICE=Cherry
```

其中：

- `qwen3-tts-flash` 适合当前“只替换 TTS、先稳住成本和兼容性”的目标
- `Cherry` 是阿里官方文档示例中直接可用的系统音色，适合作为首版兜底音色

## 二、申请前你需要知道什么

### 1. 地域必须选对

阿里官方当前说明里，`Qwen3-TTS` 中国内地部署使用 **北京地域 API Key**。

因此本项目当前固定要求：

- 百炼控制台地域：**华北2（北京）**
- API Key：**北京地域创建**

如果你后续改成新加坡部署，那么要重新创建新加坡地域 API Key，不能混用。

### 2. 不需要为不同模型单独建不同 Key

阿里官方当前说明里，同一业务空间下的 API Key 权限由业务空间决定，不需要因为调用不同模型就分别建一把 key。

这意味着：

- 你不需要为 `qwen3-tts-flash`
- `qwen3-tts-instruct-flash`
- `qwen3-tts-flash-realtime`

分别单独建 API Key。

### 3. 当前项目为什么先不用 Realtime

虽然阿里也提供：

- `qwen3-tts-flash-realtime`
- `qwen3-tts-instruct-flash-realtime`

但当前项目前端播放链路仍是：

- 服务端返回完整音频 `Buffer`
- 浏览器再统一解码播放

所以这次先不强行切到 Realtime，而是先把非实时 `qwen3-tts-flash` 收口稳定。

## 三、具体申请步骤

### 第 1 步：打开阿里百炼控制台

- 控制台入口：[https://bailian.console.aliyun.com/](https://bailian.console.aliyun.com/)

进入后，先确认页面右上角地域切换为：

- **华北2（北京）**

### 第 2 步：进入 API Key 页面

- 官方文档：[https://help.aliyun.com/zh/model-studio/get-api-key](https://help.aliyun.com/zh/model-studio/get-api-key)
- API Key 页面直达入口：[https://bailian.console.aliyun.com/?tab=model#/api-key](https://bailian.console.aliyun.com/?tab=model#/api-key)

建议：

1. 使用主账号，或具备 `管理员` / `API-Key` 页面权限的子账号
2. 归属业务空间先选默认业务空间
3. 权限先选“全部”，避免前期因为权限配置过细影响调试

### 第 3 步：创建 API Key

创建成功后，立即复制并保存完整 key。

项目中对应环境变量为：

```bash
DASHSCOPE_API_KEY=你的北京地域APIKey
```

注意：

- 关闭弹窗后通常无法再次看到完整 key
- 不要把完整 key 发到公开群、代码仓库或日志里
- 如果你怀疑泄露，直接删除并重建

### 第 4 步：确认模型

当前项目首版建议模型：

```bash
QWEN_TTS_MODEL=qwen3-tts-flash
```

如果后续你觉得声音表现力不够，再考虑升级为：

```bash
QWEN_TTS_MODEL=qwen3-tts-instruct-flash
```

当前不建议首版直接切：

```bash
qwen3-tts-flash-realtime
qwen3-tts-instruct-flash-realtime
```

原因不是它们不好，而是当前项目的前端播放模型还没有切到真正的流式音频消费。

### 第 5 步：确认音色

阿里官方文档示例中直接使用了系统音色：

- `Cherry`

因此当前项目建议你先用：

```bash
QWEN_TTS_VOICE=Cherry
```

后续如果你试听后不满意，再从官方系统音色中换一个更稳、更自然的中文音色即可。

### 第 6 步：填写项目环境变量

当前项目主方案需要这些变量：

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

- `QWEN_TTS_ENABLE_STREAM=false` 是当前首版推荐值
- 当前项目服务端已统一按更稳的完整 `WAV` 输出链路收口
- 如果你后续切到 instruct 模型，再把 `QWEN_TTS_USE_INSTRUCT=true`

### 第 7 步：保留火山 ASR 变量

本次只替换 `TTS`，所以火山 `ASR` 继续保留：

```bash
VOLC_API_KEY=
VOLC_ASR_RESOURCE_ID=
VOLC_ASR_WS_MODE=bigmodel
VOLC_ASR_MODEL_NAME=bigmodel
VOLC_ASR_ENABLE_NONSTREAM=true
VOLC_ASR_END_WINDOW_SIZE=800
VOLC_ASR_FORCE_TO_SPEECH_TIME=1000
```

如果你本地还保留了以下变量，也可以继续留着做兼容回退：

```bash
VOLC_APP_ID=
VOLC_ACCESS_TOKEN=
VOLC_ASR_CLUSTER=volcengine_streaming_common
```

## 四、本地怎么验收

### 1. 启动项目

```bash
npm run dev
```

### 2. 跑统一语音自检

```bash
npm run test:speech
```

预期结果：

- `TTS(Qwen)` 通过
- `ASR(Volc)` 通过

如果你的服务不是跑在 `3000` 端口，比如跑在 `3001`，则用：

```bash
SPEECH_SMOKE_TEST_PORT=3001 npm run test:speech
```

### 3. 做一次页面级人工验证

进入实时面试房间后，至少验证这 5 点：

1. AI 回答时能正常播报
2. 字幕仍然正常推进
3. 打断当前播报时能及时停下
4. 打断后继续对话不丢上下文
5. 页面没有出现持续静音或解码失败

## 五、常见问题

### 1. 返回 `缺失环境变量：DASHSCOPE_API_KEY`

说明当前运行中的 Next.js 进程没有读到阿里 key。

优先排查：

- `.env.local` 是否已填写
- 是否重启了 `npm run dev`
- 当前访问的端口是否真的是新环境启动的实例

### 2. 返回 `InvalidApiKey`

说明当前 key 无效，常见原因有：

- key 复制不完整
- 用错地域的 key
- key 已删除或失效
- 运行环境里仍旧加载的是旧 key

### 3. 为什么当前不推荐你先开 Realtime

因为当前项目前端不是直接消费阿里的流式音频事件，而是依赖服务端收齐完整音频后播放。

先把：

- 成本
- 音色
- 稳定性
- 路由兼容

这四件事稳住，再升级 Realtime，整体风险更低。

## 六、你申请好后发我什么

你申请完成后，把下面这些信息发给我即可：

- `DASHSCOPE_API_KEY`
- 你最终决定的 `QWEN_TTS_MODEL`
- 你最终决定的 `QWEN_TTS_VOICE`
- 你当前用于火山识别的 `VOLC_API_KEY`
- 你当前用于火山识别的 `VOLC_ASR_RESOURCE_ID`

这样我就可以直接完成最终的运行态验收和房间级回归，不需要你再补一轮方案讨论。
