import { v4 as uuidv4 } from 'uuid';

// Required environment variables:
// VOLC_APP_ID
// VOLC_ACCESS_TOKEN
// VOLC_ASR_CLUSTER (default: volcengine_streaming_common)
// VOLC_TTS_CLUSTER (default: volcano_tts)

const VOLC_APP_ID = process.env.VOLC_APP_ID;
const VOLC_ACCESS_TOKEN = process.env.VOLC_ACCESS_TOKEN;
const VOLC_ASR_CLUSTER = process.env.VOLC_ASR_CLUSTER || 'volcengine_streaming_common';
const VOLC_TTS_CLUSTER = process.env.VOLC_TTS_CLUSTER || 'volcano_tts';

const ASR_URL = 'https://openspeech.bytedance.com/api/v2/asr';
const TTS_URL = 'https://openspeech.bytedance.com/api/v1/tts';

export interface ASRResult {
  text: string;
  confidence?: number;
}

// Exponential backoff retry wrapper
async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 3): Promise<Response> {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      const response = await fetch(url, options);
      
      // Retry on 429 Too Many Requests or 5xx Server Errors
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
    } catch (error: any) {
      // Network error or timeout
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
 * Call Volcengine ASR HTTP API
 * @param audioBuffer The audio buffer (e.g. from a webm or wav file)
 * @param format Audio format (e.g. 'webm', 'wav')
 * @returns Recognized text and confidence
 */
export async function recognizeSpeech(audioBuffer: Buffer, format: string = 'raw'): Promise<ASRResult> {
  if (!VOLC_APP_ID || !VOLC_ACCESS_TOKEN) {
    throw new Error('缺失环境变量：VOLC_APP_ID 或 VOLC_ACCESS_TOKEN');
  }

  const reqid = uuidv4();
  const base64Audio = audioBuffer.toString('base64');

  const body = {
    app: {
      appid: VOLC_APP_ID,
      token: VOLC_ACCESS_TOKEN,
      cluster: VOLC_ASR_CLUSTER,
    },
    user: {
      uid: 'user_default',
    },
    audio: {
      format: format,
      rate: 16000,
      language: 'zh-CN',
      bits: 16,
      channel: 1,
      codec: 'raw',
    },
    request: {
      reqid,
      sequence: 1,
      nbest: 1,
      result_type: 'full',
      workflow: 'audio_in,resample,partition,vad,fe,decode,itn,nlu_punctuate',
    },
    payload: base64Audio,
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

    const response = await fetchWithRetry(ASR_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer;${VOLC_ACCESS_TOKEN}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status === 429) {
        throw new Error('语音服务当前请求量过大，请稍后再试。');
      }
      if (response.status >= 500) {
        throw new Error('语音服务暂时不可用，请稍后再试。');
      }
      const errText = await response.text();
      console.error(`Volcengine ASR failed: ${response.status} ${response.statusText} - ${errText}`);
      const detail = (errText || '').slice(0, 200);
      throw new Error(`语音识别失败 (${response.status})${detail ? `：${detail}` : ''}`);
    }

    const data = await response.json();
    if (data.code !== 1000) {
      console.error(`Volcengine ASR API error: ${data.code} - ${data.message}`);
      throw new Error(`语音识别服务异常：${data.message || '未知错误'}`);
    }

    // Volcengine ASR returns result in 'result' array.
    const resultArr = data.result || [];
    const text = resultArr.length > 0 ? resultArr[0].text : '';
    const confidence = resultArr.length > 0 ? resultArr[0].confidence : undefined;

    return { text, confidence };
  } catch (error: any) {
    if (error.name === 'AbortError') {
      throw new Error('语音识别请求超时，请检查网络连接或稍后再试。');
    }
    // Only re-throw if it's already a user-friendly error string, else generic message
    if (error.message && !error.message.includes('fetch')) {
      throw error;
    }
    console.error('ASR Exception:', error);
    throw new Error('语音识别过程中发生网络或系统错误，请稍后再试。');
  }
}

export interface TTSOptions {
  voiceType?: string;
  speedRatio?: number;
  encoding?: string;
}

/**
 * Call Volcengine TTS HTTP API
 * @param text Text to synthesize
 * @param options TTS Options (voice type, speed, etc)
 * @returns Audio buffer (e.g. mp3)
 */
export async function synthesizeSpeech(text: string, options: TTSOptions = {}): Promise<Buffer> {
  if (!VOLC_APP_ID || !VOLC_ACCESS_TOKEN) {
    throw new Error('缺失环境变量：VOLC_APP_ID 或 VOLC_ACCESS_TOKEN');
  }

  const reqid = uuidv4();
  const {
    voiceType = 'BV001_streaming', // 默认音色，可自定义
    speedRatio = 1.0,
    encoding = 'mp3',
  } = options;

  const body = {
    app: {
      appid: VOLC_APP_ID,
      token: VOLC_ACCESS_TOKEN,
      cluster: VOLC_TTS_CLUSTER,
    },
    user: {
      uid: 'user_default',
    },
    audio: {
      voice_type: voiceType,
      encoding: encoding,
      speed_ratio: speedRatio,
      volume_ratio: 1.0,
      pitch_ratio: 1.0,
    },
    request: {
      reqid,
      text: text,
      operation: 'query',
    },
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

    const response = await fetchWithRetry(TTS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer;${VOLC_ACCESS_TOKEN}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status === 429) {
        throw new Error('语音服务当前请求量过大，请稍后再试。');
      }
      if (response.status >= 500) {
        throw new Error('语音服务暂时不可用，请稍后再试。');
      }
      const errText = await response.text();
      console.error(`Volcengine TTS failed: ${response.status} ${response.statusText} - ${errText}`);
      throw new Error('语音合成失败，请稍后再试。');
    }

    const data = await response.json();
    if (data.code !== 3000) {
      console.error(`Volcengine TTS API error: ${data.code} - ${data.message}`);
      throw new Error(`语音合成服务异常：${data.message || '未知错误'}`);
    }

    const audioBase64 = data.data;
    return Buffer.from(audioBase64, 'base64');
  } catch (error: any) {
    if (error.name === 'AbortError') {
      throw new Error('语音合成请求超时，请检查网络连接或稍后再试。');
    }
    if (error.message && !error.message.includes('fetch')) {
      throw error;
    }
    console.error('TTS Exception:', error);
    throw new Error('语音合成过程中发生网络或系统错误，请稍后再试。');
  }
}
