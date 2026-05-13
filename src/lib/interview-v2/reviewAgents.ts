export type ReviewInsightAgentBlueprint = {
  key:
    | "orchestrator"
    | "signal"
    | "evidence"
    | "diagnosis"
    | "strategy"
    | "drill"
    | "progress"
    | "narrative";
  name: string;
  objective: string;
  inputs: string[];
  outputs: string[];
  notResponsibleFor: string[];
  fallbackStrategy: string;
};

const reviewInsightAgents: ReviewInsightAgentBlueprint[] = [
  {
    key: "orchestrator",
    name: "Orchestrator Agent",
    objective: "统一调度复盘请求，串联样本清洗、证据抽取、问题诊断、动作生成和改善验证。",
    inputs: ["用户 ID", "筛选条件", "原始上下文"],
    outputs: ["dashboard snapshot", "agentTrace", "结构化分析实体"],
    notResponsibleFor: ["直接生成问题证据", "直接编造用户结论"],
    fallbackStrategy: "任一子链路降级时，保留已验证信息并显式标注低置信度。",
  },
  {
    key: "signal",
    name: "信号采集 Agent",
    objective: "汇总面试记录、训练记录、评分和薄弱点，并严格区分有效样本与无效样本。",
    inputs: ["面试记录", "训练记录", "评分卡", "薄弱点记录", "学习进度"],
    outputs: ["有效样本池", "无效样本归档", "指标快照"],
    notResponsibleFor: ["给出强诊断结论", "决定训练动作"],
    fallbackStrategy: "样本不足时只输出弱信号，并把置信度降为 low。",
  },
  {
    key: "evidence",
    name: "Evidence Agent",
    objective: "从原始会话、评分卡和学习测验中抽取可回溯证据，证明系统不是瞎判断。",
    inputs: ["有效样本池", "消息记录", "评分结果", "问题标签"],
    outputs: ["证据列表", "证据覆盖率", "改写建议"],
    notResponsibleFor: ["决定问题优先级", "修改诊断结果"],
    fallbackStrategy: "证据不足的问题不进入高置信度问题池。",
  },
  {
    key: "diagnosis",
    name: "诊断归因 Agent",
    objective: "识别持续拖分的核心能力项，并把表象问题升级成根因树和影响分析。",
    inputs: ["有效样本池", "证据列表", "评分维度", "岗位上下文"],
    outputs: ["问题树", "影响分析", "观察问题池"],
    notResponsibleFor: ["直接跳转训练", "组织最终页面文案"],
    fallbackStrategy: "单次命中的问题进入观察池，不进入稳定问题池。",
  },
  {
    key: "strategy",
    name: "Strategy Agent",
    objective: "把诊断结果回流成可执行的训练建议、复训顺序和下一场面试策略。",
    inputs: ["问题树", "目标岗位", "公司上下文", "训练历史"],
    outputs: ["行动单", "优先级分层", "完成标准"],
    notResponsibleFor: ["生成训练页 payload", "直接评估效果"],
    fallbackStrategy: "无法形成强动作时至少输出观察建议和补样本建议。",
  },
  {
    key: "drill",
    name: "Drill Agent",
    objective: "把动作单转换为可直接进入训练链路的完整 payload，避免用户二次补信息。",
    inputs: ["行动单", "问题详情", "岗位上下文", "最近失败样本"],
    outputs: ["targetPath", "targetPayload", "evaluationCriteria"],
    notResponsibleFor: ["判断问题是否真实存在", "输出改善结论"],
    fallbackStrategy: "上下文不足时回退到最接近的问题场景，但必须补齐岗位和训练目标。",
  },
  {
    key: "progress",
    name: "Progress Agent",
    objective: "验证建议执行后是否真的产生改善，而不是只记录用户点击过按钮。",
    inputs: ["问题基线", "动作执行记录", "新样本池"],
    outputs: ["改善概览", "动作有效性", "反弹预警"],
    notResponsibleFor: ["生成证据摘录", "改写用户回答"],
    fallbackStrategy: "样本不足时明确返回无法判断，不给虚假改善结论。",
  },
  {
    key: "narrative",
    name: "洞察叙事 Agent",
    objective: "把数据结论组织成用户能快速看懂的复盘视图，但不改变事实和判断。",
    inputs: ["问题树", "行动单", "改善结果", "趋势原始数据"],
    outputs: ["headline", "趋势总结", "今日行动摘要"],
    notResponsibleFor: ["创造新事实", "修改证据内容"],
    fallbackStrategy: "子链路降级时，只组织已确认信息并显式提示低置信度。",
  },
];

/**
 * 返回复盘中心内部使用的数据洞察 Agent 蓝图。
 * @returns {ReviewInsightAgentBlueprint[]} 复盘洞察 Agent 定义。
 */
export function listReviewInsightAgents(): ReviewInsightAgentBlueprint[] {
  return reviewInsightAgents;
}

/**
 * 根据 key 读取单个复盘 Agent 蓝图。
 * @param {ReviewInsightAgentBlueprint["key"]} key Agent 唯一键。
 * @returns {ReviewInsightAgentBlueprint | undefined} 命中的 Agent 蓝图。
 */
export function getReviewInsightAgent(
  key: ReviewInsightAgentBlueprint["key"]
): ReviewInsightAgentBlueprint | undefined {
  return reviewInsightAgents.find((item) => item.key === key);
}
