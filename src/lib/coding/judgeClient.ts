import { interviewFeatureFlags } from "@/lib/config/featureFlags";
import type {
  CodingLanguage,
  CodingProblemDefinition,
  CodingRunResult,
} from "@/lib/coding/judgeTypes";

type JudgeExecutionRequest = {
  language: CodingLanguage;
  code: string;
  problem: CodingProblemDefinition;
  mode: "run" | "submit";
};

const DEFAULT_JUDGE_BASE_URL = "http://127.0.0.1:3088";

/**
 * 读取当前 judge runner 地址，默认走同机本地端口。
 * @returns judge runner 基础地址。
 */
function getJudgeRunnerBaseUrl(): string {
  return process.env.JUDGE_RUNNER_BASE_URL?.trim() || DEFAULT_JUDGE_BASE_URL;
}

/**
 * 调用独立 judge runner 执行真实编译 / 运行 / 判题。
 * @param input 当前执行请求。
 * @returns 结构化判题结果。
 */
export async function runCodingJudge(
  input: JudgeExecutionRequest
): Promise<CodingRunResult> {
  if (!interviewFeatureFlags.enableRealCodingJudge) {
    throw new Error("真实判题服务当前已关闭。");
  }

  const response = await fetch(`${getJudgeRunnerBaseUrl()}/execute`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => ({}))) as {
    data?: CodingRunResult;
    error?: string;
  };

  if (!response.ok || !payload.data) {
    throw new Error(payload.error || "真实判题服务调用失败。");
  }

  return payload.data;
}
