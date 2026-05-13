/**
 * 统一读取高风险面试能力开关，便于上线时分批控制。
 */
function readBooleanFlag(name: string, defaultValue: boolean): boolean {
  const rawValue = process.env[name];
  if (!rawValue) {
    return defaultValue;
  }

  return ["1", "true", "yes", "on"].includes(rawValue.trim().toLowerCase());
}

/**
 * 面试运行时特性开关。
 */
export const interviewFeatureFlags = {
  enableAgentEndJudge: readBooleanFlag("ENABLE_AGENT_END_JUDGE", true),
  enableMonacoCodingPanel: readBooleanFlag("ENABLE_MONACO_CODING_PANEL", true),
  enableRealCodingJudge: readBooleanFlag("ENABLE_REAL_CODING_JUDGE", true),
};
