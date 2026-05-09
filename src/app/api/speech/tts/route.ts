import { NextRequest, NextResponse } from 'next/server';
import { resolveQwenOutputEncoding, synthesizeSpeech } from '@/lib/speech/qwen';

/**
 * 统一提取异常消息，避免直接依赖不安全的 `any` 类型。
 * @param error 任意异常对象。
 * @returns 可返回给前端的错误消息。
 */
function resolveErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '语音合成处理失败';
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      text,
      voiceType,
      speedRatio,
      pitchRatio,
      volumeRatio,
      encoding = 'wav'
    } = body;

    if (!text) {
      return NextResponse.json(
        { error: 'Missing text for TTS' },
        { status: 400 }
      );
    }

    const normalizedEncoding = resolveQwenOutputEncoding(encoding);
    const audioBuffer = await synthesizeSpeech(text, {
      voiceType,
      speedRatio,
      pitchRatio,
      volumeRatio,
      encoding: normalizedEncoding,
    });

    const contentType = normalizedEncoding === 'wav' ? 'audio/wav' : 'application/octet-stream';

    return new NextResponse(audioBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (error: unknown) {
    console.error('TTS Error:', error);
    return NextResponse.json(
      { error: resolveErrorMessage(error) },
      { status: 500 }
    );
  }
}
