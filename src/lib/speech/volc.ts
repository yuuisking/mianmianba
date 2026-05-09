import { gunzipSync, gzipSync } from 'node:zlib';
import { v4 as uuidv4 } from 'uuid';

// Required environment variables:
// VOLC_APP_ID
// VOLC_ACCESS_TOKEN
// VOLC_ASR_CLUSTER (default: volcengine_streaming_common)
//
// Optional environment variables for upgraded ASR:
// VOLC_API_KEY
// VOLC_ASR_RESOURCE_ID
// VOLC_ASR_WS_MODE (legacy | bigmodel)
// VOLC_ASR_MODEL_NAME (default: bigmodel)
// VOLC_ASR_ENABLE_NONSTREAM (default: false)
// VOLC_ASR_END_WINDOW_SIZE (default: 800)
// VOLC_ASR_FORCE_TO_SPEECH_TIME (default: 1000)

const VOLC_APP_ID = process.env.VOLC_APP_ID;
const VOLC_ACCESS_TOKEN = process.env.VOLC_ACCESS_TOKEN;
const VOLC_ASR_CLUSTER = process.env.VOLC_ASR_CLUSTER || 'volcengine_streaming_common';
const VOLC_API_KEY = process.env.VOLC_API_KEY;
const VOLC_ASR_RESOURCE_ID = process.env.VOLC_ASR_RESOURCE_ID;
const VOLC_ASR_WS_MODE = process.env.VOLC_ASR_WS_MODE;
const VOLC_ASR_MODEL_NAME = process.env.VOLC_ASR_MODEL_NAME || 'bigmodel';
const VOLC_ASR_ENABLE_NONSTREAM = process.env.VOLC_ASR_ENABLE_NONSTREAM === 'true';
const VOLC_ASR_END_WINDOW_SIZE = Number.parseInt(process.env.VOLC_ASR_END_WINDOW_SIZE || '800', 10);
const VOLC_ASR_FORCE_TO_SPEECH_TIME = Number.parseInt(
  process.env.VOLC_ASR_FORCE_TO_SPEECH_TIME || '1000',
  10
);

const LEGACY_ASR_WS_URL = 'wss://openspeech.bytedance.com/api/v2/asr';
const BIGMODEL_ASR_WS_URL = 'wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async';

type VolcAsrTransportMode = 'legacy' | 'bigmodel';

type VolcWsMessageType = 0x1 | 0x2 | 0x9 | 0xf;

type UndiciModule = typeof import('undici');

let undiciModulePromise: Promise<UndiciModule> | null = null;

type SocketOpenLike = {
  addEventListener(type: 'open' | 'error', listener: () => void): void;
  removeEventListener(type: 'open' | 'error', listener: () => void): void;
};

interface ParsedVolcWsMessage {
  messageType: VolcWsMessageType;
  flags: number;
  serialization: number;
  compression: number;
  payload: Buffer;
  errorCode?: number;
  errorMessage?: string;
}

/**
 * 懒加载 undici，避免 Next 在构建期预执行路由模块时提前初始化 WebSocket 兼容层。
 * @returns `undici` 模块。
 */
async function loadUndici(): Promise<UndiciModule> {
  undiciModulePromise ??= import('undici');
  return undiciModulePromise;
}

export interface ASRResult {
  text: string;
  confidence?: number;
}

/**
 * 解析当前应使用的火山 ASR 传输模式。
 * @returns `legacy` 或 `bigmodel`。
 */
function resolveAsrTransportMode(): VolcAsrTransportMode {
  if (VOLC_ASR_WS_MODE === 'legacy') {
    return 'legacy';
  }

  if (
    (VOLC_ASR_WS_MODE === 'bigmodel' || VOLC_ASR_RESOURCE_ID) &&
    (VOLC_API_KEY || (VOLC_APP_ID && VOLC_ACCESS_TOKEN))
  ) {
    return 'bigmodel';
  }

  return 'legacy';
}

/**
 * 将传入格式归一为 legacy ASR WebSocket 支持的格式值。
 * @param format 原始音频格式。
 * @returns 归一后的格式。
 */
function normalizeLegacyAsrFormat(format: string): string {
  const normalized = format.trim().toLowerCase();

  if (normalized === 'pcm') {
    return 'raw';
  }

  return normalized || 'raw';
}

/**
 * 将传入格式归一为大模型 ASR WebSocket 支持的格式值。
 * @param format 原始音频格式。
 * @returns 归一后的格式。
 */
function normalizeBigmodelAsrFormat(format: string): string {
  const normalized = format.trim().toLowerCase();

  if (normalized === 'raw') {
    return 'pcm';
  }

  return normalized || 'pcm';
}

/**
 * 基于当前模式构造火山 ASR WebSocket 的建连参数。
 * @param mode ASR 传输模式。
 * @param requestId 当前请求 ID。
 * @returns WebSocket 地址与请求头。
 */
function buildAsrSocketConfig(
  mode: VolcAsrTransportMode,
  requestId: string
): { url: string; headers: Record<string, string> } {
  if (mode === 'bigmodel') {
    if (!VOLC_ASR_RESOURCE_ID) {
      throw new Error('缺失环境变量：VOLC_ASR_RESOURCE_ID');
    }

    const headers: Record<string, string> = {
      'X-Api-Resource-Id': VOLC_ASR_RESOURCE_ID,
      'X-Api-Request-Id': requestId,
      'X-Api-Sequence': '-1',
      'X-Api-Connect-Id': uuidv4()
    };

    if (VOLC_API_KEY) {
      headers['X-Api-Key'] = VOLC_API_KEY;
    } else {
      if (!VOLC_APP_ID || !VOLC_ACCESS_TOKEN) {
        throw new Error('缺失环境变量：VOLC_APP_ID 或 VOLC_ACCESS_TOKEN');
      }
      headers['X-Api-App-Key'] = VOLC_APP_ID;
      headers['X-Api-Access-Key'] = VOLC_ACCESS_TOKEN;
    }

    return {
      url: BIGMODEL_ASR_WS_URL,
      headers
    };
  }

  if (!VOLC_ACCESS_TOKEN) {
    throw new Error('缺失环境变量：VOLC_ACCESS_TOKEN');
  }

  return {
    url: LEGACY_ASR_WS_URL,
    headers: {
      Authorization: `Bearer; ${VOLC_ACCESS_TOKEN}`
    }
  };
}

/**
 * 构造火山二进制 WebSocket 帧。
 * @param messageType 消息类型。
 * @param flags 消息附加标记。
 * @param serialization 序列化方式。
 * @param compression 压缩方式。
 * @param payload 负载内容。
 * @returns 可直接发送的二进制帧。
 */
function buildVolcWsFrame(
  messageType: VolcWsMessageType,
  flags: number,
  serialization: number,
  compression: number,
  payload: Buffer
): Buffer {
  const header = Buffer.from([
    (0x1 << 4) | 0x1,
    ((messageType & 0x0f) << 4) | (flags & 0x0f),
    ((serialization & 0x0f) << 4) | (compression & 0x0f),
    0x00
  ]);
  const sizeBuffer = Buffer.alloc(4);
  sizeBuffer.writeUInt32BE(payload.length, 0);

  return Buffer.concat([header, sizeBuffer, payload]);
}

/**
 * 解析火山 WebSocket 返回的二进制消息。
 * @param input 原始消息数据。
 * @returns 解析后的消息结构。
 */
function parseVolcWsMessage(input: ArrayBuffer | Uint8Array | Buffer): ParsedVolcWsMessage {
  const message = Buffer.isBuffer(input)
    ? input
    : input instanceof Uint8Array
      ? Buffer.from(input)
      : Buffer.from(input);

  if (message.length < 8) {
    throw new Error('火山 ASR 返回了无效消息体。');
  }

  const headerSize = (message[0] & 0x0f) * 4;
  const messageType = ((message[1] >> 4) & 0x0f) as VolcWsMessageType;
  const flags = message[1] & 0x0f;
  const serialization = (message[2] >> 4) & 0x0f;
  const compression = message[2] & 0x0f;

  if (messageType === 0x0f) {
    const errorCode = message.readUInt32BE(headerSize);
    const errorMessageSize = message.readUInt32BE(headerSize + 4);
    const errorMessage = message
      .subarray(headerSize + 8, headerSize + 8 + errorMessageSize)
      .toString('utf8');

    return {
      messageType,
      flags,
      serialization,
      compression,
      payload: Buffer.alloc(0),
      errorCode,
      errorMessage
    };
  }

  const payloadSize = message.readUInt32BE(headerSize);
  const payload = message.subarray(headerSize + 4, headerSize + 4 + payloadSize);

  return {
    messageType,
    flags,
    serialization,
    compression,
    payload
  };
}

/**
 * 按火山协议中的压缩方式对负载解压。
 * @param payload 原始负载。
 * @param compression 压缩类型。
 * @returns 解压后的负载。
 */
function decompressVolcPayload(payload: Buffer, compression: number): Buffer {
  if (compression === 0x1) {
    return gunzipSync(payload);
  }

  return payload;
}

/**
 * 将火山返回的负载解析为 JSON 对象。
 * @param payload 原始负载。
 * @param compression 压缩类型。
 * @returns 解析后的 JSON 数据。
 */
function parseVolcJsonPayload(payload: Buffer, compression: number): Record<string, unknown> {
  const content = decompressVolcPayload(payload, compression).toString('utf8');
  return JSON.parse(content) as Record<string, unknown>;
}

/**
 * 从火山响应中提取统一结构的识别结果。
 * @param payload 火山返回的 JSON 数据。
 * @returns 识别文本与可选置信度。
 */
function extractAsrResult(payload: Record<string, unknown>): ASRResult {
  if (typeof payload.text === 'string' && payload.text.trim()) {
    return {
      text: payload.text.trim()
    };
  }

  const resultList = Array.isArray(payload.result)
    ? (payload.result as Array<Record<string, unknown>>)
    : [];
  const first = resultList[0];

  if (first && typeof first.text === 'string') {
    return {
      text: first.text.trim(),
      confidence: typeof first.confidence === 'number' ? first.confidence : undefined
    };
  }

  return { text: '' };
}

/**
 * 判断火山当前响应是否已经是可结束本轮请求的最终结果。
 * @param payload 火山返回的 JSON 数据。
 * @returns 若可结束则返回 `true`。
 */
function isFinalAsrPayload(payload: Record<string, unknown>): boolean {
  if (typeof payload.sequence === 'number' && payload.sequence < 0) {
    return true;
  }

  const resultList = Array.isArray(payload.result)
    ? (payload.result as Array<Record<string, unknown>>)
    : [];
  const utterances = Array.isArray(resultList[0]?.utterances)
    ? (resultList[0]?.utterances as Array<Record<string, unknown>>)
    : [];

  return utterances.some((utterance) => utterance.definite === true);
}

/**
 * 等待 WebSocket 完成握手，确保后续发送音频前连接已就绪。
 * @param socket 已创建的 WebSocket 客户端。
 * @returns 握手完成后返回。
 */
function waitForSocketOpen(socket: SocketOpenLike): Promise<void> {
  return new Promise((resolve, reject) => {
    const handleOpen = () => {
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error('火山 ASR WebSocket 建连失败。'));
    };
    const cleanup = () => {
      socket.removeEventListener('open', handleOpen);
      socket.removeEventListener('error', handleError);
    };

    socket.addEventListener('open', handleOpen);
    socket.addEventListener('error', handleError);
  });
}

/**
 * 基于火山官方 WebSocket 协议执行一次完整单轮识别。
 * @param audioBuffer 待识别音频。
 * @param format 音频格式。
 * @param mode 当前使用的 ASR 传输模式。
 * @returns 统一结构的识别结果。
 */
async function recognizeSpeechViaWebSocket(
  audioBuffer: Buffer,
  format: string,
  mode: VolcAsrTransportMode
): Promise<ASRResult> {
  const { WebSocket } = await loadUndici();
  const requestId = uuidv4();
  const { url, headers } = buildAsrSocketConfig(mode, requestId);
  const socket = new WebSocket(url, {
    headers
  });

  socket.binaryType = 'arraybuffer';

  const resultPromise = new Promise<ASRResult>((resolve, reject) => {
    let settled = false;
    let latestResult: ASRResult = { text: '' };
    const timeoutId = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      socket.close();
      reject(new Error('语音识别请求超时，请检查火山配置或稍后再试。'));
    }, 20000);

    const finish = (handler: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeoutId);
      handler();
    };

    socket.addEventListener('message', (event) => {
      try {
        const parsedMessage = parseVolcWsMessage(event.data as ArrayBuffer);

        if (parsedMessage.messageType === 0x0f) {
          finish(() => {
            socket.close();
            reject(
              new Error(
                `火山 ASR 返回错误 (${parsedMessage.errorCode || 'unknown'})：${parsedMessage.errorMessage || '未知错误'}`
              )
            );
          });
          return;
        }

        if (parsedMessage.messageType !== 0x9) {
          return;
        }

        const payload = parseVolcJsonPayload(parsedMessage.payload, parsedMessage.compression);
        const responseCode = typeof payload.code === 'number' ? payload.code : 1000;
        if (responseCode !== 1000) {
          finish(() => {
            socket.close();
            reject(new Error(`火山 ASR 服务异常：${String(payload.message || '未知错误')}`));
          });
          return;
        }

        latestResult = extractAsrResult(payload);
        if (isFinalAsrPayload(payload)) {
          finish(() => {
            socket.close();
            resolve(latestResult);
          });
        }
      } catch (error: unknown) {
        finish(() => {
          socket.close();
          reject(error instanceof Error ? error : new Error('火山 ASR 响应解析失败'));
        });
      }
    });

    socket.addEventListener('close', () => {
      if (!settled && latestResult.text.trim()) {
        finish(() => resolve(latestResult));
      }
    });

    socket.addEventListener('error', () => {
      if (!settled) {
        finish(() => reject(new Error('火山 ASR WebSocket 通信失败，请检查凭证或网络。')));
      }
    });
  });

  await waitForSocketOpen(socket);

  if (mode === 'bigmodel') {
    const requestPayload = {
      user: {
        uid: 'user_default'
      },
      audio: {
        format: normalizeBigmodelAsrFormat(format),
        codec: 'raw',
        rate: 16000,
        bits: 16,
        channel: 1
      },
      request: {
        model_name: VOLC_ASR_MODEL_NAME,
        enable_itn: true,
        enable_punc: true,
        show_utterances: true,
        result_type: 'single',
        enable_nonstream: VOLC_ASR_ENABLE_NONSTREAM,
        end_window_size: VOLC_ASR_END_WINDOW_SIZE,
        force_to_speech_time: VOLC_ASR_FORCE_TO_SPEECH_TIME
      }
    };
    const compressedPayload = gzipSync(Buffer.from(JSON.stringify(requestPayload), 'utf8'));
    socket.send(buildVolcWsFrame(0x1, 0x0, 0x1, 0x1, compressedPayload));
  } else {
    if (!VOLC_APP_ID || !VOLC_ACCESS_TOKEN) {
      socket.close();
      throw new Error('缺失环境变量：VOLC_APP_ID 或 VOLC_ACCESS_TOKEN');
    }

    const legacyFormat = normalizeLegacyAsrFormat(format);
    const requestPayload = {
      app: {
        appid: VOLC_APP_ID,
        token: VOLC_ACCESS_TOKEN,
        cluster: VOLC_ASR_CLUSTER
      },
      user: {
        uid: 'user_default'
      },
      audio: {
        format: legacyFormat,
        rate: 16000,
        language: 'zh-CN',
        bits: 16,
        channel: 1,
        ...(legacyFormat === 'raw' ? { codec: 'raw' } : {})
      },
      request: {
        reqid: requestId,
        sequence: 1,
        nbest: 1,
        show_utterances: true,
        result_type: 'single',
        workflow: 'audio_in,resample,partition,vad,fe,decode,itn,nlu_punctuate'
      }
    };
    const compressedPayload = gzipSync(Buffer.from(JSON.stringify(requestPayload), 'utf8'));
    socket.send(buildVolcWsFrame(0x1, 0x0, 0x1, 0x1, compressedPayload));
  }

  socket.send(buildVolcWsFrame(0x2, 0x2, 0x0, 0x1, gzipSync(audioBuffer)));

  return resultPromise;
}

/**
 * 调用火山语音识别服务，并优先切到官方 WebSocket 协议。
 * @param audioBuffer 待识别音频。
 * @param format 音频格式。
 * @returns 识别后的文本与可选置信度。
 */
export async function recognizeSpeech(audioBuffer: Buffer, format: string = 'raw'): Promise<ASRResult> {
  try {
    return await recognizeSpeechViaWebSocket(audioBuffer, format, resolveAsrTransportMode());
  } catch (error: unknown) {
    if (error instanceof Error && error.message) {
      throw error;
    }

    console.error('ASR Exception:', error);
    throw new Error('语音识别过程中发生网络或系统错误，请稍后再试。');
  }
}
