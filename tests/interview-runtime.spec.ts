import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_CODING_LANGUAGE,
  selectCodingProblemBySeed,
  SUPPORTED_CODING_LANGUAGES,
} from "@/lib/coding/problemBank";
import {
  buildInterviewRoomKey,
  readStoredInterviewProfile,
  writeStoredInterviewProfile,
} from "@/lib/interview/config";
import { buildInterviewOpening } from "@/lib/interview/prompt";
import { evaluateInterviewTurnPolicy } from "@/lib/interview/turnPolicy";
import type { InterviewMessage, InterviewProfileState } from "@/lib/interview/config";

const storageState = new Map<string, string>();

const memoryStorage = {
  getItem(key: string): string | null {
    return storageState.has(key) ? storageState.get(key) || null : null;
  },
  setItem(key: string, value: string): void {
    storageState.set(key, value);
  },
  removeItem(key: string): void {
    storageState.delete(key);
  },
  clear(): void {
    storageState.clear();
  },
};

Object.defineProperty(globalThis, "window", {
  value: globalThis,
  configurable: true,
});
Object.defineProperty(globalThis, "sessionStorage", {
  value: memoryStorage,
  configurable: true,
});

test.beforeEach(() => {
  storageState.clear();
});

/**
 * 构造测试用消息，避免每个用例重复拼装相同结构。
 * @param role 消息角色。
 * @param content 消息正文。
 * @returns 统一结构的测试消息。
 */
function createMessage(
  role: InterviewMessage["role"],
  content: string
): InterviewMessage {
  return {
    role,
    content: [content],
    time: "10:00",
    tag: "",
  };
}

/**
 * 构造全流程文字面试画像，供开场题回归验证复用。
 * @returns 最小可用的面试画像。
 */
function createFullFlowProfile(): InterviewProfileState {
  return {
    launchFlowMode: "full_flow",
    companyName: "字节跳动",
    role: "测试开发工程师",
    targetRoleName: "测试开发工程师",
    focus: "综合面试",
    mode: "text",
    currentStageType: "FIRST_ROUND",
    currentStageLabel: "一面",
    projects: [
      {
        name: "广告投放平台预算中心",
        points: "负责预算扣减链路的一致性控制与异常兜底",
      },
    ],
  };
}

/**
 * 验证房间键会稳定收敛到 `plan/stage/round/mode` 维度，杜绝新房间串旧历史。
 */
test("buildInterviewRoomKey uses plan identity first", () => {
  const roomKey = buildInterviewRoomKey({
    planId: "plan_1",
    stageId: "stage_1",
    roundId: "round_1",
    launchId: "launch_1",
    mode: "text",
  });

  assert.equal(roomKey, "plan:plan_1:stage_1:round_1:text");
});

/**
 * 验证非计划房间会退回 launch 分桶，并把旧语音模式统一归一为 realtime。
 */
test("buildInterviewRoomKey normalizes launch fallback mode", () => {
  const roomKey = buildInterviewRoomKey({
    launchId: "launch_2",
    mode: "voice",
  });

  assert.equal(roomKey, "launch:launch_2:realtime");
});

/**
 * 验证旧房间写入的画像不会再通过全局键污染新房间。
 */
test("stored profile is isolated by room key without global fallback", () => {
  const oldRoomKey = buildInterviewRoomKey({
    planId: "plan_old",
    stageId: "stage_old",
    roundId: "round_old",
    mode: "text",
  });
  const nextRoomKey = buildInterviewRoomKey({
    planId: "plan_new",
    stageId: "stage_new",
    roundId: "round_new",
    mode: "text",
  });

  writeStoredInterviewProfile(
    {
      launchId: "launch_old",
      companyName: "旧公司",
      role: "后端开发工程师",
      targetRoleName: "后端开发工程师",
      mode: "text",
      interviewPlanId: "plan_old",
      interviewStageId: "stage_old",
      interviewRoundId: "round_old",
    },
    oldRoomKey
  );

  assert.equal(readStoredInterviewProfile(nextRoomKey), null);
  assert.equal(readStoredInterviewProfile(), null);
});

/**
 * 验证连续低信息量回答会触发主动结束，而不是无限切题继续问。
 */
test("evaluateInterviewTurnPolicy ends interview after repeated negative answers", () => {
  const result = evaluateInterviewTurnPolicy({
    codingRequired: false,
    hasCodingSession: false,
    messages: [
      createMessage("ai", "请你介绍下刚才那个项目。"),
      createMessage("user", "跳过本题"),
      createMessage("ai", "那我换个角度问。"),
      createMessage("user", "我不知道"),
      createMessage("ai", "再给你一次机会。"),
      createMessage("user", "这个我回答不上来"),
    ],
  });

  assert.equal(result.action, "end_interview");
  assert.equal(result.negativeSignalCount, 3);
});

/**
 * 验证回答质量足够高且当前轮次要求算法题时，会显式转入算法题环节。
 */
test("evaluateInterviewTurnPolicy offers coding when signals are strong", () => {
  const result = evaluateInterviewTurnPolicy({
    codingRequired: true,
    hasCodingSession: false,
    currentRoundStatus: "IN_PROGRESS",
    messages: [
      createMessage("user", "我负责这个模块的方案设计、实现和上线，还做过稳定性优化与复盘，重点排查过延迟和监控告警问题。"),
      createMessage("user", "这条链路我亲自做过压测、监控埋点和指标复盘，也在两个方案之间做过权衡，最后选了更稳的实现。"),
    ],
  });

  assert.equal(result.action, "offer_coding");
  assert.equal(result.positiveSignalCount, 2);
});

/**
 * 验证全流程开场语不再泄漏 Markdown 符号，且首题会锚定真实项目而不是泛标签。
 */
test("buildInterviewOpening keeps natural greeting and anchors to project", () => {
  const opening = buildInterviewOpening("text", createFullFlowProfile());
  const combined = opening.join("\n");

  assert.equal(
    opening[0],
    "同学您好，欢迎参加【字节跳动】的【一面】面试，我是你本次的面试官，请问你准备好了吗，准备好了请先做一个自我介绍。"
  );
  assert.doesNotMatch(combined, /\*\*/);
  assert.match(combined, /自我介绍/);
});

/**
 * 验证题库选择对同一轮次是稳定的，并且默认语言与支持语言符合当前设计。
 */
test("coding problem selection stays stable and supports all target languages", () => {
  const first = selectCodingProblemBySeed("round-demo-1");
  const second = selectCodingProblemBySeed("round-demo-1");

  assert.equal(first.id, second.id);
  assert.equal(DEFAULT_CODING_LANGUAGE, "java");
  assert.deepEqual(SUPPORTED_CODING_LANGUAGES, [
    "java",
    "cpp",
    "javascript",
    "python",
    "go",
  ]);
});
