import { NextRequest, NextResponse } from 'next/server';
import { synthesizeSpeech } from '@/lib/speech/volc';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { text, voiceType, speedRatio, encoding = 'mp3' } = body;

    if (!text) {
      return NextResponse.json(
        { error: 'Missing text for TTS' },
        { status: 400 }
      );
    }

    const audioBuffer = await synthesizeSpeech(text, {
      voiceType,
      speedRatio,
      encoding,
    });

    const contentType = encoding === 'wav' ? 'audio/wav' : 'audio/mpeg';

    return new NextResponse(audioBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (error: any) {
    console.error('TTS Error:', error);
    return NextResponse.json(
      { error: error.message || '语音合成处理失败' },
      { status: 500 }
    );
  }
}
