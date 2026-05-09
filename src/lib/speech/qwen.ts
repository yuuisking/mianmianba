const QWEN_TTS_BASE_URL =
  process.env.QWEN_TTS_BASE_URL || 'https://dashscope.aliyuncs.com/api/v1';
const QWEN_TTS_MODEL = process.env.QWEN_TTS_MODEL || 'qwen3-tts-flash';
const QWEN_TTS_VOICE = process.env.QWEN_TTS_VOICE || 'Cherry';
const QWEN_TTS_LANGUAGE_TYPE = process.env.QWEN_TTS_LANGUAGE_TYPE || 'Chinese';
const QWEN_TTS_ENABLE_STREAM = process.env.QWEN_TTS_ENABLE_STREAM === 'true';
const QWEN_TTS_USE_INSTRUCT = process.env.QWEN_TTS_USE_INSTRUCT === 'true';
const QWEN_TTS_INSTRUCTIONS = process.env.QWEN_TTS_INSTRUCTIONS || '';
const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY;

const QWEN_TTS_GENERATION_PATH = '/services/aigc/multimodal-generation/generation';
const LEGACY_VOLC_VOICE_PATTERN = /^(zh|en)_[a-z0-9_]+$/i;

export type QwenTtsOutputEncoding = 'wav';

/**
 * 统一定义 TTS 调用选项，保持与现有前端 `/api/speech/tts` 请求体兼容。
 */
export interface TTSOptions {
  voiceType?: string;
  speedRatio?: number;
  pitchRatio?: number;
  volumeRatio?: number;
  encoding?: string;
}

interface QwenGenerationAudioOutput {
  url?: string | null;
  data?: string | null;
}

interface QwenGenerationResponse {
  output?: {
    audio?: QwenGenerationAudioOutput | null;
    finish_reason?: string | null;
  } | null;
  code?: string;
  message?: string;
}

/**
 * 当前项目的浏览器播放链路以完整容器音频为前提，Qwen 非流式接口可稳定返回 WAV。
 * @param encoding 前端传入的目标编码。
 * @returns 当前项目实际支持的输出编码。
 */
export function resolveQwenOutputEncoding(encoding?: string): QwenTtsOutputEncoding {
  const normalized = encoding?.trim().toLowerCase();
  if (normalized === 'wav' || !normalized) {
    return 'wav';
  }

  return 'wav';
}

/**
 * 对前端传入的音色做最小兼容处理，避免旧火山音色值直接打到 Qwen 导致失败。
 * @param voiceType 前端传入的音色标识。
 * @returns 当前可直接用于 Qwen 的音色值。
 */
function resolveVoiceType(voiceType?: string): string {
  const normalized = voiceType?.trim();

  if (!normalized) {
    return QWEN_TTS_VOICE;
  }

  if (LEGACY_VOLC_VOICE_PATTERN.test(normalized) || normalized.includes('bigtts')) {
    return QWEN_TTS_VOICE;
  }

  return normalized;
}

/**
 * 判断当前音频缓冲区是否为 WAV 容器，供当前完整 Buffer 播放链路做兼容保护。
 * @param audioBuffer 待检查的音频字节内容。
 * @returns 若为 WAV 容器则返回 `true`。
 */
function isWaveBuffer(audioBuffer: Buffer): boolean {
  return (
    audioBuffer.length >= 12 &&
    audioBuffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    audioBuffer.subarray(8, 12).toString('ascii') === 'WAVE'
  );
}

/**
 * 使用指数退避包装 `fetch`，降低外部 TTS 服务偶发失败对房间链路的冲击。
 * @param url 请求地址。
 * @param options `fetch` 请求参数。
 * @param maxRetries 最大重试次数。
 * @returns 最终响应对象。
 */
async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 3): Promise<Response> {
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      const response = await fetch(url, options);

      if (response.status === 429 || response.status >= 500) {
        if (attempt === maxRetries - 1) {
          return response;
        }
        const delay = Math.pow(2, attempt) * 1000 + Math.random() * 500;
        await new Promise((resolve) => setTimeout(resolve, delay));
        attempt++;
        continue;
      }

      return response;
    } catch (error: unknown) {
      if (attempt === maxRetries - 1) {
        throw error;
      }

      const delay = Math.pow(2, attempt) * 1000 + Math.random() * 500;
      await new Promise((resolve) => setTimeout(resolve, delay));
      attempt++;
    }
  }

  throw new Error('Maximum retries reached');
}

/**
 * 判断当前模型是否支持 `instructions`，避免将不支持的字段发给普通 Flash 模型。
 * @param model 当前使用的模型名称。
 * @returns 若支持指令控制则返回 `true`。
 */
function supportsInstructions(model: string): boolean {
  return model.includes('instruct');
}

/**
 * 根据前端传入的倍率参数生成一条轻量语音指令，仅在 instruct 模型启用时使用。
 * @param options 前端透传的 TTS 选项。
 * @returns 可用于阿里 instruct 模型的指令文本；若无需指令则返回空字符串。
 */
function buildInstructions(options: TTSOptions): string {
  const instructions: string[] = [];
  const speedRatio = options.speedRatio ?? 1;
  const pitchRatio = options.pitchRatio ?? 1;
  const volumeRatio = options.volumeRatio ?? 1;

  if (speedRatio > 1.04) {
    instructions.push('语速稍快一些，但不要急促。');
  } else if (speedRatio < 0.96) {
    instructions.push('语速稍慢一些，但保持自然对话感。');
  }

  if (pitchRatio > 1.03) {
    instructions.push('语调略高一点，但不要夸张。');
  } else if (pitchRatio < 0.97) {
    instructions.push('语调略稳一些，减少上扬。');
  }

  if (volumeRatio > 1.03) {
    instructions.push('音量略高一些，但保持自然。');
  } else if (volumeRatio < 0.97) {
    instructions.push('音量略低一些，避免压迫感。');
  }

  return instructions.join('');
}

/**
 * 组装阿里百炼 TTS 请求体，保持与当前项目现有请求参数兼容。
 * @param text 待合成文本。
 * @param options 透传的 TTS 选项。
 * @returns 可直接发送给百炼模型的请求体。
 */
function buildQwenPayload(text: string, options: TTSOptions): Record<string, unknown> {
  const model = QWEN_TTS_MODEL;
  const payload: Record<string, unknown> = {
    model,
    input: {
      text,
      voice: resolveVoiceType(options.voiceType),
      language_type: QWEN_TTS_LANGUAGE_TYPE
    }
  };

  if (QWEN_TTS_USE_INSTRUCT && supportsInstructions(model)) {
    const mergedInstructions = [QWEN_TTS_INSTRUCTIONS, buildInstructions(options)]
      .map((item) => item.trim())
      .filter(Boolean)
      .join(' ');

    if (mergedInstructions) {
      payload.input = {
        ...(payload.input as Record<string, unknown>),
        instructions: mergedInstructions,
        optimize_instructions: true
      };
    }
  }

  return payload;
}

/**
 * 提取百炼非流式响应中的音频下载地址。
 * @param payload 百炼模型返回的 JSON。
 * @returns 音频下载地址。
 */
function extractAudioUrl(payload: QwenGenerationResponse): string {
  const audioUrl = payload.output?.audio?.url;

  if (typeof audioUrl === 'string' && audioUrl.trim()) {
    return audioUrl;
  }

  throw new Error(payload.message || 'Qwen TTS 未返回音频地址，请检查模型或音色配置。');
}

/**
 * 下载百炼返回的临时音频 URL，并转为最终 `Buffer`。
 * @param url 百炼返回的临时下载地址。
 * @returns 完整音频二进制内容。
 */
async function fetchAudioFromUrl(url: string): Promise<Buffer> {
  const response = await fetchWithRetry(url, {
    method: 'GET',
    headers: {
      Accept: '*/*'
    }
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Qwen TTS 音频下载失败 (${response.status})：${errText || response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const audioBuffer = Buffer.from(arrayBuffer);
  if (!isWaveBuffer(audioBuffer)) {
    throw new Error('Qwen TTS 当前未返回可直接播放的 WAV 音频，请检查模型或音色配置。');
  }

  return audioBuffer;
}

/**
 * 解析百炼 SSE 流式返回的 Base64 音频片段，并拼接为完整音频。
 * @param response 百炼 SSE 响应对象。
 * @returns 拼接后的完整音频数据。
 */
async function collectSseAudio(response: Response): Promise<Buffer> {
  if (!response.body) {
    throw new Error('Qwen TTS SSE 响应体为空。');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const audioChunks: Buffer[] = [];
  let pending = '';

  while (true) {
    const { done, value } = await reader.read();
    pending += decoder.decode(value || new Uint8Array(), { stream: !done });

    const events = pending.split('\n\n');
    pending = events.pop() || '';

    for (const eventBlock of events) {
      const dataLines = eventBlock
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim())
        .filter(Boolean);

      for (const dataLine of dataLines) {
        if (dataLine === '[DONE]') {
          continue;
        }

        let payload: QwenGenerationResponse;
        try {
          payload = JSON.parse(dataLine) as QwenGenerationResponse;
        } catch {
          continue;
        }

        if (payload.code) {
          throw new Error(payload.message || `Qwen TTS 返回错误：${payload.code}`);
        }

        const chunkBase64 = payload.output?.audio?.data;
        if (typeof chunkBase64 === 'string' && chunkBase64.length > 0) {
          audioChunks.push(Buffer.from(chunkBase64, 'base64'));
        }
      }
    }

    if (done) {
      break;
    }
  }

  if (audioChunks.length === 0) {
    throw new Error('Qwen TTS 流式响应未返回音频片段。');
  }

  const audioBuffer = Buffer.concat(audioChunks);
  if (!isWaveBuffer(audioBuffer)) {
    throw new Error(
      '当前项目的完整 Buffer 播放链路仅验证过 Qwen 非流式 WAV 输出，请关闭 QWEN_TTS_ENABLE_STREAM。'
    );
  }

  return audioBuffer;
}

/**
 * 调用阿里百炼的非流式 TTS 接口，通过返回的音频 URL 下载完整音频。
 * @param payload 已组装好的请求体。
 * @param signal 超时与取消控制信号。
 * @returns 完整音频二进制。
 */
async function synthesizeViaUrl(
  payload: Record<string, unknown>,
  signal: AbortSignal
): Promise<Buffer> {
  const response = await fetchWithRetry(`${QWEN_TTS_BASE_URL}${QWEN_TTS_GENERATION_PATH}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${DASHSCOPE_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload),
    signal
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Qwen TTS 请求失败 (${response.status})：${errText || response.statusText}`);
  }

  const result = (await response.json()) as QwenGenerationResponse;
  if (result.code) {
    throw new Error(result.message || `Qwen TTS 返回错误：${result.code}`);
  }

  return fetchAudioFromUrl(extractAudioUrl(result));
}

/**
 * 调用阿里百炼的 SSE 流式 TTS 接口，在服务端收齐音频片段后再返回完整音频。
 * @param payload 已组装好的请求体。
 * @param signal 超时与取消控制信号。
 * @returns 完整音频二进制。
 */
async function synthesizeViaSse(
  payload: Record<string, unknown>,
  signal: AbortSignal
): Promise<Buffer> {
  const response = await fetchWithRetry(`${QWEN_TTS_BASE_URL}${QWEN_TTS_GENERATION_PATH}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${DASHSCOPE_API_KEY}`,
      'Content-Type': 'application/json',
      'X-DashScope-SSE': 'enable'
    },
    body: JSON.stringify(payload),
    signal
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Qwen TTS 流式请求失败 (${response.status})：${errText || response.statusText}`);
  }

  return collectSseAudio(response);
}

/**
 * 调用阿里百炼 Qwen3-TTS 生成完整音频，供现有房间队列继续按完整 Buffer 播放。
 * @param text 待合成文本。
 * @param options 语音合成选项。
 * @returns 完整音频二进制缓冲区。
 */
export async function synthesizeSpeech(text: string, options: TTSOptions = {}): Promise<Buffer> {
  if (!DASHSCOPE_API_KEY) {
    throw new Error('缺失环境变量：DASHSCOPE_API_KEY');
  }

  if (!text.trim()) {
    throw new Error('TTS 文本不能为空。');
  }

  resolveQwenOutputEncoding(options.encoding);

  const payload = buildQwenPayload(text, options);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000);

  try {
    if (QWEN_TTS_ENABLE_STREAM) {
      return await synthesizeViaSse(payload, controller.signal);
    }

    return await synthesizeViaUrl(payload, controller.signal);
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Qwen TTS 请求超时，请检查网络连接或稍后再试。');
    }

    if (error instanceof Error) {
      throw error;
    }

    throw new Error('Qwen TTS 请求失败，请稍后再试。');
  } finally {
    clearTimeout(timeoutId);
    controller.abort();
  }
}
