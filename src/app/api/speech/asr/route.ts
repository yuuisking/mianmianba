import { NextRequest, NextResponse } from 'next/server';
import { recognizeSpeech } from '@/lib/speech/volc';

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') || '';
    let buffer: Buffer;
    let format = 'raw';

    if (contentType.includes('application/json')) {
      const json = await req.json();
      const audioBase64 = (json?.audioBase64 || json?.payload || '') as string;
      format = (json?.format || 'raw') as string;
      if (!audioBase64) {
        return NextResponse.json({ error: 'Empty audio payload' }, { status: 400 });
      }
      buffer = Buffer.from(audioBase64, 'base64');
    } else {
      const arrayBuffer = await req.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
      if (buffer.length === 0) {
        return NextResponse.json({ error: 'Empty audio payload' }, { status: 400 });
      }
    }

    const result = await recognizeSpeech(buffer, format);

    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('ASR Error:', error);
    const message = error instanceof Error ? error.message : '语音识别处理失败';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
