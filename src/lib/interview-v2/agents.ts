import type { InterviewAgentRoleV2, InterviewStageTypeV2 } from "@/lib/interview-v2/domain";

export type InterviewAgentBlueprint = {
  role: InterviewAgentRoleV2;
  name: string;
  objective: string;
  responsibilities: string[];
  inputs: string[];
  outputs: string[];
};

export type InterviewStageAgentTeamProfile = {
  stageType: InterviewStageTypeV2;
  squadLabel: string;
  leadInterviewerTitle: string;
  followUpStyle: string;
  evidenceFocus: string[];
  eliminationBar: string;
  warmNoticeTone: "celebration" | "encouragement" | "neutral";
};

const interviewAgentBlueprints: InterviewAgentBlueprint[] = [
  {
    role: "PLANNER",
    name: "面试计划 Agent",
    objective: "围绕岗位、JD、简历和目标公司生成本场或全流程面试策略。",
    responsibilities: ["拆轮次", "定节奏", "定考察维度", "规划是否插入代码题"],
    inputs: ["目标公司", "目标岗位", "JD", "简历", "用户历史弱项"],
    outputs: ["面试计划", "轮次配置", "提问策略", "题量与时长建议"],
  },
  {
    role: "RESUME_ANALYST",
    name: "简历分析 Agent",
    objective: "提取项目、技术栈、亮点、风险点和可深挖素材。",
    responsibilities: ["抽项目", "抽技术点", "抽风险点", "判断表达缺口"],
    inputs: ["简历原文", "用户补充信息"],
    outputs: ["项目清单", "亮点摘要", "风险提醒", "简历优化建议"],
  },
  {
    role: "JD_ANALYST",
    name: "JD 分析 Agent",
    objective: "识别岗位 must-have、加分项和公司偏好，约束后续提问边界。",
    responsibilities: ["抽能力要求", "抽关键词", "抽招聘阶段重点"],
    inputs: ["JD 原文", "目标公司", "目标岗位"],
    outputs: ["岗位要求画像", "重点能力图谱", "面试侧重点"],
  },
  {
    role: "INTERVIEWER",
    name: "主面试官 Agent",
    objective: "负责主问题、追问、打断和节奏控制。",
    responsibilities: ["主提问", "追问", "打断", "切题", "控制氛围"],
    inputs: ["面试计划", "轮次配置", "用户回答", "上下文状态"],
    outputs: ["题目", "追问", "打断语句", "阶段结论"],
  },
  {
    role: "EVIDENCE",
    name: "证据 Agent",
    objective: "给每个问题和追问提供上下文依据，避免无来源瞎问。",
    responsibilities: ["引用简历", "引用 JD", "引用历史弱项", "引用岗位知识点"],
    inputs: ["简历结构化结果", "JD 结构化结果", "历史报告", "薄弱点记录"],
    outputs: ["提问依据", "追问依据", "风险标签"],
  },
  {
    role: "SCORER",
    name: "评分 Agent",
    objective: "从技术、表达、系统设计、代码、稳定性等多个维度打分。",
    responsibilities: ["题目级评分", "轮次级评分", "能力维度归因"],
    inputs: ["问题记录", "回答记录", "代码提交记录", "评分 rubric"],
    outputs: ["评分卡", "维度分", "失分原因"],
  },
  {
    role: "SUMMARY",
    name: "总结 Agent",
    objective: "把本轮亮点、短板和核心结论总结成用户看得懂的话。",
    responsibilities: ["提炼亮点", "归纳问题", "总结结论"],
    inputs: ["评分卡", "回答过程", "轮次结果"],
    outputs: ["总结摘要", "亮点列表", "短板列表"],
  },
  {
    role: "REPORT",
    name: "报告 Agent",
    objective: "生成结构化复盘报告和行动任务包。",
    responsibilities: ["写报告", "整理行动项", "生成雷达图数据"],
    inputs: ["评分卡", "总结结果", "薄弱点记录"],
    outputs: ["复盘报告", "行动任务包", "推荐补强计划"],
  },
  {
    role: "COACH",
    name: "教练 Agent",
    objective: "把面试问题回流成专项训练、复训和首页推荐。",
    responsibilities: ["回流专项训练", "回流继续训练", "回流首页薄弱点"],
    inputs: ["复盘报告", "薄弱点记录", "用户成长快照"],
    outputs: ["专项训练建议", "复训建议", "首页推荐项"],
  },
  {
    role: "CODE_INTERVIEWER",
    name: "代码面试 Agent",
    objective: "负责代码题发题、提示、过程点评和代码能力评价。",
    responsibilities: ["发代码题", "给提示", "看运行结果", "点评代码过程"],
    inputs: ["轮次计划", "代码题库", "代码运行记录", "提交记录"],
    outputs: ["代码题", "提示", "过程点评", "代码能力结论"],
  },
];

const interviewStageAgentTeamProfiles: Record<
  InterviewStageTypeV2,
  InterviewStageAgentTeamProfile
> = {
  STAGE_INTERVIEW: {
    stageType: "STAGE_INTERVIEW",
    squadLabel: "阶段面试专属 Agent 团",
    leadInterviewerTitle: "综合深挖面试官",
    followUpStyle: "围绕项目、技术原理和表达结构连续深挖",
    evidenceFocus: ["项目经历", "技术深度", "表达结构"],
    eliminationBar: "若连续两轮无法给出真实细节或关键取舍，将直接判定不通过。",
    warmNoticeTone: "encouragement",
  },
  FIRST_ROUND: {
    stageType: "FIRST_ROUND",
    squadLabel: "一面技术筛选 Agent 团",
    leadInterviewerTitle: "基础技术与项目筛查面试官",
    followUpStyle: "优先确认真实做过什么、基础是否扎实、表达是否清楚",
    evidenceFocus: ["简历项目", "基础能力", "问题拆解"],
    eliminationBar: "若基础能力、项目真实性或表达清晰度明显不达标，本轮直接淘汰。",
    warmNoticeTone: "neutral",
  },
  SECOND_ROUND: {
    stageType: "SECOND_ROUND",
    squadLabel: "二面深挖 Agent 团",
    leadInterviewerTitle: "系统设计与取舍深挖面试官",
    followUpStyle: "重点追问容量、边界、故障处理和方案取舍，不接受泛化答案",
    evidenceFocus: ["系统设计", "稳定性", "容量与故障处理"],
    eliminationBar: "若只能给出组件堆砌式答案，无法说明关键取舍和风险，本轮淘汰。",
    warmNoticeTone: "neutral",
  },
  THIRD_ROUND: {
    stageType: "THIRD_ROUND",
    squadLabel: "三面综合判断 Agent 团",
    leadInterviewerTitle: "业务判断与协同面试官",
    followUpStyle: "强调跨团队协同、复杂决策、业务权衡和 leader 级判断",
    evidenceFocus: ["业务理解", "跨团队协同", "复杂决策"],
    eliminationBar: "若缺乏复杂项目判断或无法体现 owner 意识，本轮淘汰。",
    warmNoticeTone: "neutral",
  },
  HR_ROUND: {
    stageType: "HR_ROUND",
    squadLabel: "HR 面专属 Agent 团",
    leadInterviewerTitle: "动机与稳定性面试官",
    followUpStyle: "重点确认动机、稳定性、沟通边界和职业诉求",
    evidenceFocus: ["求职动机", "稳定性", "沟通方式"],
    eliminationBar: "若目标摇摆、沟通失衡或职业动机风险过大，本轮淘汰。",
    warmNoticeTone: "encouragement",
  },
  OFFER_REVIEW: {
    stageType: "OFFER_REVIEW",
    squadLabel: "Offer 结论 Agent 团",
    leadInterviewerTitle: "最终裁决面试官",
    followUpStyle: "只汇总前序轮次证据，不再新增随意问题",
    evidenceFocus: ["多轮表现", "风险闭环", "最终决策"],
    eliminationBar: "只有前序轮次证据稳定通过，才会进入 Offer 结论。",
    warmNoticeTone: "celebration",
  },
  CUSTOM: {
    stageType: "CUSTOM",
    squadLabel: "自定义轮次 Agent 团",
    leadInterviewerTitle: "自定义面试官",
    followUpStyle: "围绕当前轮次目标进行结构化追问",
    evidenceFocus: ["当前轮次目标"],
    eliminationBar: "若当前轮次目标无法验证通过，则不进入下一步。",
    warmNoticeTone: "neutral",
  },
};

/**
 * 返回 v2.0 面试官评审团的角色蓝图清单，供页面、服务层和后台管理复用。
 * @returns {InterviewAgentBlueprint[]} 多 Agent 角色定义。
 */
export function listInterviewAgentBlueprints(): InterviewAgentBlueprint[] {
  return interviewAgentBlueprints;
}

/**
 * 根据角色读取单个 Agent 的蓝图。
 * @param {InterviewAgentRoleV2} role 目标角色。
 * @returns {InterviewAgentBlueprint | undefined} 找到时返回对应蓝图。
 */
export function getInterviewAgentBlueprint(
  role: InterviewAgentRoleV2
): InterviewAgentBlueprint | undefined {
  return interviewAgentBlueprints.find((item) => item.role === role);
}

/**
 * 根据轮次类型返回专属 Agent 团策略。
 * @param stageType 当前轮次类型。
 * @returns 专属 Agent 团配置。
 */
export function getInterviewStageAgentTeamProfile(
  stageType: InterviewStageTypeV2
): InterviewStageAgentTeamProfile {
  return interviewStageAgentTeamProfiles[stageType] || interviewStageAgentTeamProfiles.CUSTOM;
}
