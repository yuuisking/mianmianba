import type {
  CodingSessionStatusV2,
  InterviewPlanStatusV2,
  InterviewRoundStatusV2,
  InterviewStageStatusV2,
  InterviewStageTypeV2,
} from "@/lib/interview-v2/domain";

const interviewPlanTransitionMap: Record<InterviewPlanStatusV2, InterviewPlanStatusV2[]> = {
  DRAFT: ["PROFILE_READY", "ARCHIVED"],
  PROFILE_READY: ["PLANNED", "ARCHIVED"],
  PLANNED: ["IN_PROGRESS", "ARCHIVED"],
  IN_PROGRESS: ["COMPLETED", "ARCHIVED"],
  COMPLETED: ["ARCHIVED"],
  ARCHIVED: [],
};

const interviewStageTransitionMap: Record<InterviewStageStatusV2, InterviewStageStatusV2[]> = {
  PENDING: ["READY", "BLOCKED", "SKIPPED"],
  READY: ["ACTIVE", "SKIPPED", "BLOCKED"],
  ACTIVE: ["COMPLETED", "BLOCKED", "SKIPPED"],
  COMPLETED: [],
  SKIPPED: [],
  BLOCKED: ["READY", "SKIPPED"],
};

const interviewRoundTransitionMap: Record<InterviewRoundStatusV2, InterviewRoundStatusV2[]> = {
  PENDING: ["ASKING", "ABORTED"],
  ASKING: ["USER_ANSWERING", "FOLLOW_UP", "CODING", "SCORING", "ABORTED"],
  USER_ANSWERING: ["FOLLOW_UP", "CODING", "SCORING", "ABORTED"],
  FOLLOW_UP: ["USER_ANSWERING", "CODING", "SCORING", "ABORTED"],
  CODING: ["SCORING", "ABORTED"],
  SCORING: ["DONE", "ABORTED"],
  DONE: [],
  ABORTED: [],
};

const codingSessionTransitionMap: Record<CodingSessionStatusV2, CodingSessionStatusV2[]> = {
  READY: ["EDITING", "CLOSED"],
  EDITING: ["RUNNING", "SUBMITTED", "CLOSED"],
  RUNNING: ["EDITING", "SUBMITTED", "CLOSED"],
  SUBMITTED: ["REVIEWED", "EDITING", "CLOSED"],
  REVIEWED: ["EDITING", "CLOSED"],
  CLOSED: [],
};

/**
 * 判断面试计划是否允许从当前状态迁移到下一个状态。
 * @param {InterviewPlanStatusV2} from 当前计划状态。
 * @param {InterviewPlanStatusV2} to 目标计划状态。
 * @returns {boolean} 允许迁移返回 `true`。
 */
export function canTransitionInterviewPlanStatus(
  from: InterviewPlanStatusV2,
  to: InterviewPlanStatusV2
): boolean {
  return interviewPlanTransitionMap[from].includes(to);
}

/**
 * 判断轮次状态是否允许迁移。
 * @param {InterviewStageStatusV2} from 当前轮次状态。
 * @param {InterviewStageStatusV2} to 目标轮次状态。
 * @returns {boolean} 允许迁移返回 `true`。
 */
export function canTransitionInterviewStageStatus(
  from: InterviewStageStatusV2,
  to: InterviewStageStatusV2
): boolean {
  return interviewStageTransitionMap[from].includes(to);
}

/**
 * 判断单轮面试执行状态是否允许迁移。
 * @param {InterviewRoundStatusV2} from 当前执行状态。
 * @param {InterviewRoundStatusV2} to 目标执行状态。
 * @returns {boolean} 允许迁移返回 `true`。
 */
export function canTransitionInterviewRoundStatus(
  from: InterviewRoundStatusV2,
  to: InterviewRoundStatusV2
): boolean {
  return interviewRoundTransitionMap[from].includes(to);
}

/**
 * 判断代码面试状态是否允许迁移。
 * @param {CodingSessionStatusV2} from 当前代码状态。
 * @param {CodingSessionStatusV2} to 目标代码状态。
 * @returns {boolean} 允许迁移返回 `true`。
 */
export function canTransitionCodingSessionStatus(
  from: CodingSessionStatusV2,
  to: CodingSessionStatusV2
): boolean {
  return codingSessionTransitionMap[from].includes(to);
}

/**
 * 根据轮次类型判断是否默认要求代码环节。
 * @param {InterviewStageTypeV2} stageType 当前轮次类型。
 * @returns {boolean} 默认带代码题时返回 `true`。
 */
export function stageTypeRequiresCoding(stageType: InterviewStageTypeV2): boolean {
  return stageType === "FIRST_ROUND" || stageType === "SECOND_ROUND" || stageType === "STAGE_INTERVIEW";
}

/**
 * 根据轮次类型输出更贴近中文产品语义的默认标题。
 * @param {InterviewStageTypeV2} stageType 当前轮次类型。
 * @returns {string} 轮次默认展示标题。
 */
export function getInterviewStageDefaultLabel(stageType: InterviewStageTypeV2): string {
  switch (stageType) {
    case "FIRST_ROUND":
      return "一面";
    case "SECOND_ROUND":
      return "二面";
    case "THIRD_ROUND":
      return "三面";
    case "HR_ROUND":
      return "HR 面";
    case "OFFER_REVIEW":
      return "Offer 结论";
    case "STAGE_INTERVIEW":
      return "阶段面试";
    default:
      return "自定义轮次";
  }
}
