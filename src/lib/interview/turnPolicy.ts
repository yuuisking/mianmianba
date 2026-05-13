import type { InterviewMessage } from "@/lib/interview/config";

export type InterviewTurnAction = "continue" | "end_interview" | "offer_coding";

export type InterviewTurnPolicyResult = {
  action: InterviewTurnAction;
  reason: string;
  negativeSignalCount: number;
  positiveSignalCount: number;
};

const NEGATIVE_SIGNAL_PATTERNS = [
  /跳过/,
  /不知道/,
  /不太清楚/,
  /回答不上来/,
  /没做过/,
  /不想答/,
  /不了解/,
  /不会/,
];

const POSITIVE_SIGNAL_PATTERNS = [
  /负责/,
  /设计/,
  /实现/,
  /优化/,
  /排查/,
  /上线/,
  /指标/,
  /吞吐/,
  /稳定性/,
  /延迟/,
  /方案/,
  /权衡/,
  /复盘/,
  /监控/,
];

/**
 * 提取消息里的纯文本内容，避免后续策略判断依赖 UI 结构。
 * @param message 当前消息。
 * @returns 归一化后的消息文本。
 */
function flattenMessage(message: InterviewMessage): string {
  return Array.isArray(message.content) ? message.content.join("\n").trim() : "";
}

/**
 * 判断一条候选人回答是否属于明显消极或低信息量输入。
 * @param text 候选人回答文本。
 * @returns 是否命中消极信号。
 */
export function isNegativeInterviewAnswer(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) {
    return true;
  }

  if (normalized.length <= 8) {
    return true;
  }

  return NEGATIVE_SIGNAL_PATTERNS.some((pattern) => pattern.test(normalized));
}

/**
 * 判断一条候选人回答是否包含足够多的积极、可继续深挖的信息。
 * @param text 候选人回答文本。
 * @returns 是否命中积极信号。
 */
export function isPositiveInterviewAnswer(text: string): boolean {
  const normalized = text.trim();
  if (normalized.length < 40) {
    return false;
  }

  const hitCount = POSITIVE_SIGNAL_PATTERNS.filter((pattern) =>
    pattern.test(normalized)
  ).length;
  return hitCount >= 2 && !isNegativeInterviewAnswer(normalized);
}

/**
 * 统计最近连续的候选人消极回答次数，用于触发主动结束。
 * @param messages 当前对话消息。
 * @returns 连续消极回答数量。
 */
export function countTrailingNegativeSignals(
  messages: InterviewMessage[]
): number {
  let count = 0;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== "user") {
      continue;
    }

    if (isNegativeInterviewAnswer(flattenMessage(message))) {
      count += 1;
      continue;
    }

    break;
  }

  return count;
}

/**
 * 统计最近几轮里高信息量回答的数量，用于决定是否转入算法题。
 * @param messages 当前对话消息。
 * @returns 最近窗口内的积极回答数量。
 */
export function countRecentPositiveSignals(
  messages: InterviewMessage[]
): number {
  return messages
    .filter((message) => message.role === "user")
    .slice(-3)
    .map((message) => flattenMessage(message))
    .filter((text) => isPositiveInterviewAnswer(text)).length;
}

/**
 * 基于最近的候选人回答和当前轮次配置，决定是否继续追问、主动结束或转入算法题。
 * @param input 当前对话与轮次上下文。
 * @returns 当前轮次应执行的策略动作。
 */
export function evaluateInterviewTurnPolicy(input: {
  messages: InterviewMessage[];
  codingRequired: boolean;
  hasCodingSession: boolean;
  currentRoundStatus?: string | null;
}): InterviewTurnPolicyResult {
  const negativeSignalCount = countTrailingNegativeSignals(input.messages);
  const positiveSignalCount = countRecentPositiveSignals(input.messages);

  if (negativeSignalCount >= 3) {
    return {
      action: "end_interview",
      reason: "候选人连续低信息量回答，触发主动结束阈值",
      negativeSignalCount,
      positiveSignalCount,
    };
  }

  if (
    input.codingRequired &&
    !input.hasCodingSession &&
    input.currentRoundStatus !== "CODING" &&
    positiveSignalCount >= 2
  ) {
    return {
      action: "offer_coding",
      reason: "候选人已给出足够多的高信息量回答，可以转入算法题",
      negativeSignalCount,
      positiveSignalCount,
    };
  }

  return {
    action: "continue",
    reason: "继续当前轮次问答",
    negativeSignalCount,
    positiveSignalCount,
  };
}
