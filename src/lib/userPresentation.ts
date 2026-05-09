/**
 * 计算用户在头像中的显示文案，优先使用昵称与姓名首字，再回退邮箱前缀。
 * @param value 候选展示名。
 * @param email 用户邮箱。
 * @returns 适合展示在头像中的 1-2 位字符。
 */
export function getUserInitials(value?: string | null, email?: string | null): string {
  const source = value?.trim() || email?.trim() || "U";

  if (source.includes("@")) {
    return source.slice(0, 1).toUpperCase();
  }

  const text = source.replace(/\s+/g, "");
  if (text.length <= 2) {
    return text.toUpperCase();
  }

  return text.slice(0, 2).toUpperCase();
}

/**
 * 将角色枚举转换为便于前台展示的中文标签。
 * @param role 用户角色值。
 * @returns 中文角色名称。
 */
export function getRoleLabel(role?: string | null): string {
  if (role === "ADMIN") {
    return "管理员";
  }

  return "普通用户";
}

export const VIP_TYPE_OPTIONS = [
  { value: "none", label: "免费用户" },
  { value: "monthly", label: "月度VIP" },
  { value: "quarterly", label: "季度VIP" },
  { value: "yearly", label: "年度VIP" },
  { value: "lifetime", label: "终身VIP" }
] as const;

export type VipTypeValue = (typeof VIP_TYPE_OPTIONS)[number]["value"];

type MembershipTier = {
  value: VipTypeValue;
  label: string;
  summary: string;
  benefits: string[];
};

type MembershipPresentation = {
  requestedLabel: string;
  effectiveLabel: string;
  summary: string;
  benefits: string[];
  expiresText: string;
  downgradeText: string;
  isActive: boolean;
  isExpired: boolean;
};

const membershipTierMap: Record<VipTypeValue, MembershipTier> = {
  none: {
    value: "none",
    label: "免费用户",
    summary: "适合先体验产品主流程，查看基础资料并按需升级。",
    benefits: [
      "可进入基础模拟面试、专项训练与学习浏览入口",
      "可查看并维护个人资料、账号状态与历史登录信息",
      "后续升级会员后，账号资料与历史记录继续保留"
    ]
  },
  monthly: {
    value: "monthly",
    label: "月度VIP",
    summary: "适合短期冲刺，集中使用完整训练、复盘与会员展示能力。",
    benefits: [
      "完整体验模拟面试、专项训练、学习中心与复盘中心",
      "前台展示 VIP 身份标签，便于区分当前会员状态",
      "适合 1 个月内集中准备面试、校招或转岗冲刺"
    ]
  },
  quarterly: {
    value: "quarterly",
    label: "季度VIP",
    summary: "适合系统提升，在一个阶段内连续追踪训练与复盘表现。",
    benefits: [
      "连续 3 个月使用完整训练、学习与复盘能力",
      "更适合阶段性查漏补缺和多轮模拟练习",
      "兼顾短期结果和系统提升节奏，续期压力更低"
    ]
  },
  yearly: {
    value: "yearly",
    label: "年度VIP",
    summary: "适合长期求职周期，稳定保留完整会员体验。",
    benefits: [
      "全年稳定使用完整训练、学习与复盘能力",
      "适合长期求职、转岗准备或多阶段成长规划",
      "减少频繁续期带来的打断，便于持续跟踪进展"
    ]
  },
  lifetime: {
    value: "lifetime",
    label: "终身VIP",
    summary: "适合作为长期职业能力工具使用，无需关注续期时间。",
    benefits: [
      "长期保留完整训练、学习与复盘能力",
      "无需担心会员到期，权益可持续使用",
      "适合将平台作为长期职业成长与练习阵地"
    ]
  }
};

/**
 * 将账号状态枚举转换为用户可理解的中文标签。
 * @param status 账号状态值。
 * @returns 中文状态名称。
 */
export function getStatusLabel(status?: string | null): string {
  if (status === "DISABLED") {
    return "已停用";
  }

  return "正常";
}

/**
 * 将会员类型转换为统一的中文名称，避免前后台出现英文或风格不一致的标签。
 * @param vipType 会员类型原始值。
 * @returns 统一后的中文会员名称。
 */
function normalizeVipType(vipType?: string | null): VipTypeValue {
  const normalizedType = vipType?.trim().toLowerCase();

  if (!normalizedType || normalizedType === "none") {
    return "none";
  }

  if (normalizedType === "monthly") {
    return "monthly";
  }

  if (normalizedType === "quarterly") {
    return "quarterly";
  }

  if (normalizedType === "yearly") {
    return "yearly";
  }

  if (normalizedType === "lifetime") {
    return "lifetime";
  }

  return "none";
}

/**
 * 获取会员档位的统一配置，供前后台展示复用。
 * @param vipType 原始会员类型。
 * @returns 会员档位配置。
 */
export function getVipTier(vipType?: string | null): MembershipTier {
  return membershipTierMap[normalizeVipType(vipType)];
}

/**
 * 生成会员状态文案，并在到期时附带失效信息。
 * @param vipType 会员类型。
 * @param vipExpiresAt 会员到期时间。
 * @returns 前台可直接展示的会员标签。
 */
export function getVipLabel(
  vipType?: string | null,
  vipExpiresAt?: string | null
): string {
  const label = getVipTier(vipType).label;

  if (label === "免费用户") {
    return label;
  }

  if (!vipExpiresAt) {
    return label;
  }

  const expiresAt = new Date(vipExpiresAt);
  if (Number.isNaN(expiresAt.getTime())) {
    return label;
  }

  if (expiresAt.getTime() < Date.now()) {
    return `${label} 已过期`;
  }

  return label;
}

/**
 * 获取当前实际生效的会员标签，供前后台统一展示当前口径使用。
 * @param vipType 会员类型。
 * @param vipExpiresAt 到期时间。
 * @returns 当前真正生效的会员标签；会员过期时回落为免费用户。
 */
export function getEffectiveVipLabel(
  vipType?: string | null,
  vipExpiresAt?: string | null
): string {
  return getMembershipPresentation(vipType, vipExpiresAt).effectiveLabel;
}

/**
 * 判断会员当前是否仍处于有效期内。
 * @param vipType 会员类型。
 * @param vipExpiresAt 到期时间。
 * @returns 有效会员返回 `true`，否则返回 `false`。
 */
export function isVipActive(
  vipType?: string | null,
  vipExpiresAt?: string | null
): boolean {
  if (normalizeVipType(vipType) === "none") {
    return false;
  }

  if (!vipExpiresAt) {
    return true;
  }

  const expiresAt = new Date(vipExpiresAt);
  return !Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() >= Date.now();
}

/**
 * 生成顶部头像区使用的尊享会员文案，仅对有效 VIP 用户生效。
 * @param vipType 会员类型。
 * @param vipExpiresAt 到期时间。
 * @returns 有效 VIP 返回尊享文案，否则返回 `null`。
 */
export function getVipHonorLabel(
  vipType?: string | null,
  vipExpiresAt?: string | null
): string | null {
  if (!isVipActive(vipType, vipExpiresAt)) {
    return null;
  }

  return "尊贵的VIP用户";
}

/**
 * 生成统一的会员权益展示数据，确保前台与后台使用同一套规则。
 * @param vipType 会员类型。
 * @param vipExpiresAt 到期时间。
 * @returns 当前会员的标签、权益摘要和到期降级说明。
 */
export function getMembershipPresentation(
  vipType?: string | null,
  vipExpiresAt?: string | null
): MembershipPresentation {
  const requestedTier = getVipTier(vipType);
  const active = isVipActive(vipType, vipExpiresAt);
  const expired = requestedTier.value !== "none" && !active;
  const effectiveTier = active ? requestedTier : membershipTierMap.none;

  if (requestedTier.value === "none") {
    return {
      requestedLabel: requestedTier.label,
      effectiveLabel: effectiveTier.label,
      summary: effectiveTier.summary,
      benefits: effectiveTier.benefits,
      expiresText: "当前为免费用户，可先体验基础流程并按需升级会员。",
      downgradeText: "升级后若会员到期，系统会自动回落为免费用户权益，历史资料会继续保留。",
      isActive: false,
      isExpired: false
    };
  }

  if (requestedTier.value === "lifetime") {
    return {
      requestedLabel: requestedTier.label,
      effectiveLabel: requestedTier.label,
      summary: requestedTier.summary,
      benefits: requestedTier.benefits,
      expiresText: "终身会员长期有效，无需设置到期时间。",
      downgradeText: "终身会员默认长期有效；若后续手动降级，系统再按新的会员档位展示权益。",
      isActive: true,
      isExpired: false
    };
  }

  const expiresDateText = formatDateTime(vipExpiresAt);

  if (expired) {
    return {
      requestedLabel: requestedTier.label,
      effectiveLabel: effectiveTier.label,
      summary: effectiveTier.summary,
      benefits: effectiveTier.benefits,
      expiresText: `${requestedTier.label} 已于 ${expiresDateText} 到期，当前按免费用户权益展示。`,
      downgradeText: "会员到期后会自动降级为免费用户权益，但资料与历史记录不会被清空。",
      isActive: false,
      isExpired: true
    };
  }

  return {
    requestedLabel: requestedTier.label,
    effectiveLabel: requestedTier.label,
    summary: requestedTier.summary,
    benefits: requestedTier.benefits,
    expiresText: vipExpiresAt
      ? `当前权益有效期至 ${expiresDateText}。`
      : "当前未设置到期时间，系统按持续有效会员展示。",
    downgradeText: "会员到期后会自动降级为免费用户权益，但资料与历史记录不会被清空。",
    isActive: true,
    isExpired: false
  };
}

/**
 * 将日期时间转换为中文前台友好的展示格式。
 * @param value ISO 日期字符串。
 * @returns 格式化后的时间，若不可解析则返回占位文案。
 */
export function formatDateTime(value?: string | null): string {
  if (!value) {
    return "未记录";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "未记录";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}
