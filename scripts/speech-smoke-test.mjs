import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request } from 'node:http';

const execFileAsync = promisify(execFile);
const SMOKE_TEST_PORT = Number.parseInt(process.env.SPEECH_SMOKE_TEST_PORT || '3000', 10);

/**
 * 以 Promise 方式发起本地 HTTP POST 请求，便于串联 Qwen TTS 与火山 ASR 的混合验证。
 * @param {string} path 接口路径。
 * @param {Record<string, unknown>} payload JSON 请求体。
 * @returns {Promise<{statusCode:number, body:Buffer, headers:Record<string, string | string[] | undefined>}>} 响应状态、内容与响应头。
 */
function postJson(path, payload) {
  return new Promise((resolve, reject) => {
    const body = Buffer.from(JSON.stringify(payload), 'utf8');
    const req = request(
      {
        hostname: '127.0.0.1',
        port: SMOKE_TEST_PORT,
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': body.length
        }
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode || 0,
            body: Buffer.concat(chunks),
            headers: res.headers
          });
        });
      }
    );

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * 通过 macOS `say` 生成中文测试语音，再转为 16k/16bit/mono PCM，供本地 ASR 接口验证使用。
 * @param {string} text 待播报文本。
 * @returns {Promise<Buffer>} PCM 原始字节内容。
 */
async function buildPcmSample(text) {
  const workdir = await mkdtemp(join(tmpdir(), 'speech-stack-'));
  const aiffPath = join(workdir, 'sample.aiff');
  const wavPath = join(workdir, 'sample.wav');

  try {
    await execFileAsync('say', ['-v', 'Tingting', '-o', aiffPath, text]);
    await execFileAsync('afconvert', ['-f', 'WAVE', '-d', 'LEI16@16000', '-c', '1', aiffPath, wavPath]);

    const wavBuffer = await readFile(wavPath);
    return wavBuffer.subarray(44);
  } finally {
    await rm(workdir, { recursive: true, force: true });
  }
}

/**
 * 验证本地 TTS 接口是否可以成功合成 Qwen 音频。
 * @returns {Promise<void>} 校验通过时返回。
 */
async function verifyTts() {
  const response = await postJson('/api/speech/tts', {
    text: '你好，这是一条 Qwen TTS 本地自检音频。',
    encoding: 'wav'
  });

  if (response.statusCode !== 200) {
    throw new Error(`TTS 自检失败，HTTP ${response.statusCode}，响应：${response.body.toString('utf8')}`);
  }

  const outputPath = join(tmpdir(), 'speech-stack-smoke-test.wav');
  await writeFile(outputPath, response.body);
  console.log(`[TTS(Qwen)] 通过，已生成测试音频：${outputPath}，字节数：${response.body.length}`);
}

/**
 * 验证本地 ASR 接口是否可以识别一段标准中文测试音频。
 * @returns {Promise<void>} 校验通过时返回。
 */
async function verifyAsr() {
  const sampleText = '你好，我正在测试火山语音识别，请把这句话识别出来。';
  const pcmBuffer = await buildPcmSample(sampleText);
  const response = await postJson('/api/speech/asr', {
    audioBase64: pcmBuffer.toString('base64'),
    format: 'raw'
  });

  const decoded = response.body.toString('utf8');
  if (response.statusCode !== 200) {
    throw new Error(`ASR 自检失败，HTTP ${response.statusCode}，响应：${decoded}`);
  }

  const payload = JSON.parse(decoded);
  console.log(`[ASR(Volc)] 通过，识别结果：${payload.text || ''}`);
}

/**
 * 串行执行本地语音栈自检，确认当前为 Qwen TTS + Volc ASR 的混合链路。
 * @returns {Promise<void>} 全部通过后返回。
 */
async function main() {
  await verifyTts();
  await verifyAsr();
  console.log('语音栈本地自检全部通过。');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
