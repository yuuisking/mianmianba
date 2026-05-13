import type { InterviewMode } from "@/lib/interview/config";
import type { InterviewStageTypeV2 } from "@/lib/interview-v2/domain";

export type CompanyExperienceTheme = {
  stageType: InterviewStageTypeV2;
  label: string;
  focus: string;
  tags: string[];
};

export type CompanyRolePlaybook = {
  roleName: string;
  levels: string[];
  recommendedIntensities: string[];
  experienceThemes: CompanyExperienceTheme[];
};

export type CompanyPlaybook = {
  companyName: string;
  aliases: string[];
  interviewStyle: string;
  supportedModes: InterviewMode[];
  rolePlaybooks: CompanyRolePlaybook[];
};

/**
 * 中大厂公司与岗位配置中心。
 * 这里统一给发起页、计划生成和后续面经映射使用，避免多处散落维护。
 * @returns {CompanyPlaybook[]} 公司配置列表。
 */
export function listCompanyPlaybooks(): CompanyPlaybook[] {
  return companyPlaybooks;
}

/**
 * 按公司名称或别名查找公司配置。
 * @param {string} companyName 用户输入的公司名。
 * @returns {CompanyPlaybook | null} 命中时返回公司配置。
 */
export function findCompanyPlaybook(companyName: string): CompanyPlaybook | null {
  const normalized = companyName.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  return (
    companyPlaybooks.find((item) => {
      if (item.companyName.toLowerCase().includes(normalized)) {
        return true;
      }

      return item.aliases.some((alias) => alias.toLowerCase().includes(normalized));
    }) ?? null
  );
}

/**
 * 读取公司可选岗位。
 * @param {string} companyName 目标公司。
 * @returns {string[]} 岗位名称列表。
 */
export function getCompanyRoleOptions(companyName: string): string[] {
  return findCompanyPlaybook(companyName)?.rolePlaybooks.map((item) => item.roleName) ?? [];
}

/**
 * 读取公司或岗位对应的职级列表。
 * @param {string} companyName 目标公司。
 * @param {string} roleName 目标岗位。
 * @returns {string[]} 职级列表。
 */
export function getCompanyLevelOptions(
  companyName: string,
  roleName?: string
): string[] {
  const playbook = findCompanyPlaybook(companyName);
  const normalizedRoleName = roleName?.trim() ?? "";
  if (!playbook) {
    return [];
  }

  if (!normalizedRoleName) {
    return Array.from(
      new Set(playbook.rolePlaybooks.flatMap((item) => item.levels))
    );
  }

  return (
    playbook.rolePlaybooks.find((item) => item.roleName === normalizedRoleName)?.levels ?? []
  );
}

/**
 * 读取岗位推荐强度。
 * @param {string} companyName 目标公司。
 * @param {string} roleName 目标岗位。
 * @returns {string[]} 推荐强度列表。
 */
export function getCompanyIntensityOptions(
  companyName: string,
  roleName?: string
): string[] {
  const playbook = findCompanyPlaybook(companyName);
  if (!playbook) {
    return [];
  }

  if (!roleName?.trim()) {
    return Array.from(
      new Set(playbook.rolePlaybooks.flatMap((item) => item.recommendedIntensities))
    );
  }

  return (
    playbook.rolePlaybooks.find((item) => item.roleName === roleName.trim())
      ?.recommendedIntensities ?? []
  );
}

/**
 * 读取公司岗位对应的面经主题配置。
 * @param {string} companyName 目标公司。
 * @param {string} roleName 目标岗位。
 * @returns {CompanyExperienceTheme[]} 面经主题列表。
 */
export function getCompanyExperienceThemes(
  companyName: string,
  roleName?: string
): CompanyExperienceTheme[] {
  const playbook = findCompanyPlaybook(companyName);
  const normalizedRoleName = roleName?.trim() ?? "";
  if (!playbook) {
    return [];
  }

  const matchedRole = playbook.rolePlaybooks.find(
    (item) => item.roleName === normalizedRoleName
  );

  if (matchedRole) {
    return matchedRole.experienceThemes;
  }

  return playbook.rolePlaybooks[0]?.experienceThemes ?? [];
}

const backendThemes: CompanyExperienceTheme[] = [
  {
    stageType: "FIRST_ROUND",
    label: "一面常见追问",
    focus: "项目深挖、Java/Go 基础、MySQL、Redis、并发",
    tags: ["项目深挖", "后端基础", "缓存", "数据库"],
  },
  {
    stageType: "SECOND_ROUND",
    label: "二面常见追问",
    focus: "系统设计、高可用、容量估算、故障兜底、消息队列",
    tags: ["系统设计", "高可用", "分布式", "容灾"],
  },
  {
    stageType: "HR_ROUND",
    label: "HR 面关注点",
    focus: "求职动机、稳定性、协作方式、职业规划",
    tags: ["职业规划", "协作", "动机"],
  },
];

const frontendThemes: CompanyExperienceTheme[] = [
  {
    stageType: "FIRST_ROUND",
    label: "一面常见追问",
    focus: "浏览器、网络、工程化、性能优化、组件设计",
    tags: ["浏览器", "工程化", "性能优化", "组件设计"],
  },
  {
    stageType: "SECOND_ROUND",
    label: "二面常见追问",
    focus: "复杂前端架构、跨端方案、稳定性、监控与埋点",
    tags: ["架构", "跨端", "监控", "稳定性"],
  },
  {
    stageType: "HR_ROUND",
    label: "HR 面关注点",
    focus: "协作习惯、项目推进、业务理解、成长规划",
    tags: ["协作", "业务理解", "成长"],
  },
];

const clientThemes: CompanyExperienceTheme[] = [
  {
    stageType: "FIRST_ROUND",
    label: "一面常见追问",
    focus: "平台基础、性能优化、线程模型、跨端通信",
    tags: ["性能优化", "线程模型", "客户端基础"],
  },
  {
    stageType: "SECOND_ROUND",
    label: "二面常见追问",
    focus: "复杂页面架构、稳定性、崩溃治理、包体积治理",
    tags: ["稳定性", "崩溃治理", "架构"],
  },
  {
    stageType: "HR_ROUND",
    label: "HR 面关注点",
    focus: "跨团队协作、业务推动、职业规划",
    tags: ["协作", "业务推动", "成长"],
  },
];

const algorithmThemes: CompanyExperienceTheme[] = [
  {
    stageType: "FIRST_ROUND",
    label: "一面常见追问",
    focus: "算法基础、数据结构、工程实现、复杂度分析",
    tags: ["算法", "数据结构", "复杂度"],
  },
  {
    stageType: "SECOND_ROUND",
    label: "二面常见追问",
    focus: "机器学习/推荐策略、特征工程、线上实验、评估指标",
    tags: ["推荐", "模型", "实验", "指标"],
  },
  {
    stageType: "HR_ROUND",
    label: "HR 面关注点",
    focus: "课题方向、业务兴趣、论文与落地结合",
    tags: ["业务兴趣", "课题方向", "成长"],
  },
];

const qaThemes: CompanyExperienceTheme[] = [
  {
    stageType: "FIRST_ROUND",
    label: "一面常见追问",
    focus: "测试设计、自动化框架、接口测试、定位能力",
    tags: ["自动化", "测试设计", "接口测试"],
  },
  {
    stageType: "SECOND_ROUND",
    label: "二面常见追问",
    focus: "质量体系、性能测试、稳定性治理、研发协同",
    tags: ["质量体系", "性能测试", "稳定性"],
  },
  {
    stageType: "HR_ROUND",
    label: "HR 面关注点",
    focus: "推进能力、沟通协作、成长方向",
    tags: ["推进能力", "沟通", "成长"],
  },
];

const dataThemes: CompanyExperienceTheme[] = [
  {
    stageType: "FIRST_ROUND",
    label: "一面常见追问",
    focus: "SQL、数仓分层、ETL、调度治理、指标口径",
    tags: ["SQL", "数仓", "ETL", "指标"],
  },
  {
    stageType: "SECOND_ROUND",
    label: "二面常见追问",
    focus: "数据稳定性、任务治理、成本优化、实时链路",
    tags: ["稳定性", "治理", "实时数仓"],
  },
  {
    stageType: "HR_ROUND",
    label: "HR 面关注点",
    focus: "业务协同、数据价值理解、长期发展",
    tags: ["业务协同", "数据价值", "成长"],
  },
];

const companyPlaybooks: CompanyPlaybook[] = [
  {
    companyName: "字节跳动",
    aliases: ["字节", "ByteDance"],
    interviewStyle: "高压深挖",
    supportedModes: ["text", "realtime"],
    rolePlaybooks: [
      {
        roleName: "后端开发工程师",
        levels: ["校招", "1-1", "1-2", "2-1"],
        recommendedIntensities: ["标准", "深挖", "压力"],
        experienceThemes: backendThemes,
      },
      {
        roleName: "前端开发工程师",
        levels: ["校招", "1-1", "1-2", "2-1"],
        recommendedIntensities: ["标准", "深挖", "压力"],
        experienceThemes: frontendThemes,
      },
      {
        roleName: "客户端开发工程师",
        levels: ["校招", "1-1", "1-2"],
        recommendedIntensities: ["标准", "深挖"],
        experienceThemes: clientThemes,
      },
      {
        roleName: "算法工程师",
        levels: ["校招", "1-1", "1-2"],
        recommendedIntensities: ["标准", "深挖"],
        experienceThemes: algorithmThemes,
      },
    ],
  },
  {
    companyName: "阿里巴巴",
    aliases: ["阿里", "Alibaba"],
    interviewStyle: "务实追问",
    supportedModes: ["text", "realtime"],
    rolePlaybooks: [
      {
        roleName: "Java 开发工程师",
        levels: ["P5", "P6", "P7"],
        recommendedIntensities: ["标准", "深挖", "压力"],
        experienceThemes: backendThemes,
      },
      {
        roleName: "前端开发工程师",
        levels: ["P5", "P6", "P7"],
        recommendedIntensities: ["标准", "深挖"],
        experienceThemes: frontendThemes,
      },
      {
        roleName: "测试开发工程师",
        levels: ["P5", "P6"],
        recommendedIntensities: ["标准", "深挖"],
        experienceThemes: qaThemes,
      },
      {
        roleName: "算法工程师",
        levels: ["P5", "P6", "P7"],
        recommendedIntensities: ["标准", "深挖"],
        experienceThemes: algorithmThemes,
      },
    ],
  },
  {
    companyName: "蚂蚁集团",
    aliases: ["蚂蚁", "Ant Group"],
    interviewStyle: "务实追问",
    supportedModes: ["text", "realtime"],
    rolePlaybooks: [
      {
        roleName: "后端开发工程师",
        levels: ["P5", "P6", "P7"],
        recommendedIntensities: ["标准", "深挖", "压力"],
        experienceThemes: backendThemes,
      },
      {
        roleName: "前端开发工程师",
        levels: ["P5", "P6"],
        recommendedIntensities: ["标准", "深挖"],
        experienceThemes: frontendThemes,
      },
    ],
  },
  {
    companyName: "腾讯",
    aliases: ["Tencent"],
    interviewStyle: "结构化追问",
    supportedModes: ["text", "realtime"],
    rolePlaybooks: [
      {
        roleName: "后台开发工程师",
        levels: ["T1", "T2", "T3"],
        recommendedIntensities: ["标准", "深挖", "压力"],
        experienceThemes: backendThemes,
      },
      {
        roleName: "前端开发工程师",
        levels: ["T1", "T2", "T3"],
        recommendedIntensities: ["标准", "深挖"],
        experienceThemes: frontendThemes,
      },
      {
        roleName: "客户端开发工程师",
        levels: ["T1", "T2"],
        recommendedIntensities: ["标准", "深挖"],
        experienceThemes: clientThemes,
      },
      {
        roleName: "测试开发工程师",
        levels: ["T1", "T2"],
        recommendedIntensities: ["标准", "深挖"],
        experienceThemes: qaThemes,
      },
    ],
  },
  {
    companyName: "美团",
    aliases: [],
    interviewStyle: "高压深挖",
    supportedModes: ["text", "realtime"],
    rolePlaybooks: [
      {
        roleName: "后端开发工程师",
        levels: ["校招", "L6", "L7", "L8"],
        recommendedIntensities: ["标准", "深挖", "压力"],
        experienceThemes: backendThemes,
      },
      {
        roleName: "前端开发工程师",
        levels: ["校招", "L6", "L7"],
        recommendedIntensities: ["标准", "深挖"],
        experienceThemes: frontendThemes,
      },
      {
        roleName: "数据开发工程师",
        levels: ["校招", "L6", "L7"],
        recommendedIntensities: ["标准", "深挖"],
        experienceThemes: dataThemes,
      },
    ],
  },
  {
    companyName: "小红书",
    aliases: ["RED"],
    interviewStyle: "高压深挖",
    supportedModes: ["text", "realtime"],
    rolePlaybooks: [
      {
        roleName: "后端开发工程师",
        levels: ["校招", "P4", "P5", "P6"],
        recommendedIntensities: ["标准", "深挖", "压力"],
        experienceThemes: backendThemes,
      },
      {
        roleName: "前端开发工程师",
        levels: ["校招", "P4", "P5"],
        recommendedIntensities: ["标准", "深挖"],
        experienceThemes: frontendThemes,
      },
    ],
  },
  {
    companyName: "快手",
    aliases: ["Kuaishou"],
    interviewStyle: "高压深挖",
    supportedModes: ["text", "realtime"],
    rolePlaybooks: [
      {
        roleName: "后端开发工程师",
        levels: ["K2A", "K2B", "K3A"],
        recommendedIntensities: ["标准", "深挖", "压力"],
        experienceThemes: backendThemes,
      },
      {
        roleName: "前端开发工程师",
        levels: ["K2A", "K2B"],
        recommendedIntensities: ["标准", "深挖"],
        experienceThemes: frontendThemes,
      },
    ],
  },
  {
    companyName: "百度",
    aliases: ["Baidu"],
    interviewStyle: "结构化追问",
    supportedModes: ["text", "realtime"],
    rolePlaybooks: [
      {
        roleName: "后端开发工程师",
        levels: ["T4", "T5", "T6"],
        recommendedIntensities: ["标准", "深挖"],
        experienceThemes: backendThemes,
      },
      {
        roleName: "前端开发工程师",
        levels: ["T4", "T5"],
        recommendedIntensities: ["标准", "深挖"],
        experienceThemes: frontendThemes,
      },
      {
        roleName: "算法工程师",
        levels: ["T4", "T5", "T6"],
        recommendedIntensities: ["标准", "深挖"],
        experienceThemes: algorithmThemes,
      },
    ],
  },
  {
    companyName: "京东",
    aliases: ["JD"],
    interviewStyle: "务实追问",
    supportedModes: ["text", "realtime"],
    rolePlaybooks: [
      {
        roleName: "后端开发工程师",
        levels: ["T2", "T3", "T4"],
        recommendedIntensities: ["标准", "深挖"],
        experienceThemes: backendThemes,
      },
      {
        roleName: "前端开发工程师",
        levels: ["T2", "T3"],
        recommendedIntensities: ["标准", "深挖"],
        experienceThemes: frontendThemes,
      },
    ],
  },
  {
    companyName: "滴滴",
    aliases: ["DiDi"],
    interviewStyle: "结构化追问",
    supportedModes: ["text", "realtime"],
    rolePlaybooks: [
      {
        roleName: "后端开发工程师",
        levels: ["D5", "D6", "D7"],
        recommendedIntensities: ["标准", "深挖"],
        experienceThemes: backendThemes,
      },
      {
        roleName: "客户端开发工程师",
        levels: ["D5", "D6"],
        recommendedIntensities: ["标准", "深挖"],
        experienceThemes: clientThemes,
      },
    ],
  },
  {
    companyName: "拼多多",
    aliases: ["PDD"],
    interviewStyle: "高压深挖",
    supportedModes: ["text", "realtime"],
    rolePlaybooks: [
      {
        roleName: "后端开发工程师",
        levels: ["校招", "P5", "P6"],
        recommendedIntensities: ["深挖", "压力"],
        experienceThemes: backendThemes,
      },
      {
        roleName: "前端开发工程师",
        levels: ["校招", "P5"],
        recommendedIntensities: ["深挖", "压力"],
        experienceThemes: frontendThemes,
      },
    ],
  },
  {
    companyName: "携程",
    aliases: ["Trip.com", "Ctrip"],
    interviewStyle: "务实追问",
    supportedModes: ["text", "realtime"],
    rolePlaybooks: [
      {
        roleName: "后端开发工程师",
        levels: ["P4", "P5", "P6"],
        recommendedIntensities: ["标准", "深挖"],
        experienceThemes: backendThemes,
      },
      {
        roleName: "测试开发工程师",
        levels: ["P4", "P5"],
        recommendedIntensities: ["标准", "深挖"],
        experienceThemes: qaThemes,
      },
    ],
  },
  {
    companyName: "网易",
    aliases: ["NetEase"],
    interviewStyle: "结构化追问",
    supportedModes: ["text", "realtime"],
    rolePlaybooks: [
      {
        roleName: "后端开发工程师",
        levels: ["P3", "P4", "P5"],
        recommendedIntensities: ["标准", "深挖"],
        experienceThemes: backendThemes,
      },
      {
        roleName: "前端开发工程师",
        levels: ["P3", "P4"],
        recommendedIntensities: ["标准", "深挖"],
        experienceThemes: frontendThemes,
      },
    ],
  },
  {
    companyName: "华为",
    aliases: ["Huawei"],
    interviewStyle: "结构化追问",
    supportedModes: ["text", "realtime"],
    rolePlaybooks: [
      {
        roleName: "软件开发工程师",
        levels: ["13级", "14级", "15级"],
        recommendedIntensities: ["标准", "深挖", "压力"],
        experienceThemes: backendThemes,
      },
      {
        roleName: "测试开发工程师",
        levels: ["13级", "14级"],
        recommendedIntensities: ["标准", "深挖"],
        experienceThemes: qaThemes,
      },
    ],
  },
  {
    companyName: "小米",
    aliases: ["Xiaomi"],
    interviewStyle: "务实追问",
    supportedModes: ["text", "realtime"],
    rolePlaybooks: [
      {
        roleName: "后端开发工程师",
        levels: ["13级", "14级", "15级"],
        recommendedIntensities: ["标准", "深挖"],
        experienceThemes: backendThemes,
      },
      {
        roleName: "客户端开发工程师",
        levels: ["13级", "14级"],
        recommendedIntensities: ["标准", "深挖"],
        experienceThemes: clientThemes,
      },
    ],
  },
  {
    companyName: "B站",
    aliases: ["哔哩哔哩", "Bilibili"],
    interviewStyle: "结构化追问",
    supportedModes: ["text", "realtime"],
    rolePlaybooks: [
      {
        roleName: "后端开发工程师",
        levels: ["P4", "P5", "P6"],
        recommendedIntensities: ["标准", "深挖"],
        experienceThemes: backendThemes,
      },
      {
        roleName: "前端开发工程师",
        levels: ["P4", "P5"],
        recommendedIntensities: ["标准", "深挖"],
        experienceThemes: frontendThemes,
      },
    ],
  },
  {
    companyName: "Shopee",
    aliases: [],
    interviewStyle: "英文+结构化追问",
    supportedModes: ["text", "realtime"],
    rolePlaybooks: [
      {
        roleName: "后端开发工程师",
        levels: ["P2", "P3", "P4"],
        recommendedIntensities: ["标准", "深挖"],
        experienceThemes: backendThemes,
      },
      {
        roleName: "前端开发工程师",
        levels: ["P2", "P3"],
        recommendedIntensities: ["标准", "深挖"],
        experienceThemes: frontendThemes,
      },
    ],
  },
  {
    companyName: "腾讯音乐",
    aliases: ["TME"],
    interviewStyle: "结构化追问",
    supportedModes: ["text", "realtime"],
    rolePlaybooks: [
      {
        roleName: "后端开发工程师",
        levels: ["T1", "T2", "T3"],
        recommendedIntensities: ["标准", "深挖"],
        experienceThemes: backendThemes,
      },
      {
        roleName: "数据开发工程师",
        levels: ["T1", "T2"],
        recommendedIntensities: ["标准", "深挖"],
        experienceThemes: dataThemes,
      },
    ],
  },
  {
    companyName: "得物",
    aliases: ["Poizon"],
    interviewStyle: "高压深挖",
    supportedModes: ["text", "realtime"],
    rolePlaybooks: [
      {
        roleName: "后端开发工程师",
        levels: ["P4", "P5", "P6"],
        recommendedIntensities: ["深挖", "压力"],
        experienceThemes: backendThemes,
      },
      {
        roleName: "前端开发工程师",
        levels: ["P4", "P5"],
        recommendedIntensities: ["深挖", "压力"],
        experienceThemes: frontendThemes,
      },
    ],
  },
  {
    companyName: "理想汽车",
    aliases: ["Li Auto"],
    interviewStyle: "务实追问",
    supportedModes: ["text", "realtime"],
    rolePlaybooks: [
      {
        roleName: "后端开发工程师",
        levels: ["P5", "P6", "P7"],
        recommendedIntensities: ["标准", "深挖"],
        experienceThemes: backendThemes,
      },
      {
        roleName: "客户端开发工程师",
        levels: ["P5", "P6"],
        recommendedIntensities: ["标准", "深挖"],
        experienceThemes: clientThemes,
      },
    ],
  },
  {
    companyName: "蔚来",
    aliases: ["NIO"],
    interviewStyle: "务实追问",
    supportedModes: ["text", "realtime"],
    rolePlaybooks: [
      {
        roleName: "后端开发工程师",
        levels: ["P5", "P6"],
        recommendedIntensities: ["标准", "深挖"],
        experienceThemes: backendThemes,
      },
      {
        roleName: "测试开发工程师",
        levels: ["P5", "P6"],
        recommendedIntensities: ["标准", "深挖"],
        experienceThemes: qaThemes,
      },
    ],
  },
  {
    companyName: "阿里云",
    aliases: ["Aliyun"],
    interviewStyle: "务实追问",
    supportedModes: ["text", "realtime"],
    rolePlaybooks: [
      {
        roleName: "云平台开发工程师",
        levels: ["P5", "P6", "P7"],
        recommendedIntensities: ["标准", "深挖", "压力"],
        experienceThemes: backendThemes,
      },
      {
        roleName: "SRE 工程师",
        levels: ["P5", "P6", "P7"],
        recommendedIntensities: ["标准", "深挖", "压力"],
        experienceThemes: backendThemes,
      },
    ],
  },
  {
    companyName: "OPPO",
    aliases: [],
    interviewStyle: "结构化追问",
    supportedModes: ["text", "realtime"],
    rolePlaybooks: [
      {
        roleName: "客户端开发工程师",
        levels: ["P4", "P5", "P6"],
        recommendedIntensities: ["标准", "深挖"],
        experienceThemes: clientThemes,
      },
      {
        roleName: "后端开发工程师",
        levels: ["P4", "P5", "P6"],
        recommendedIntensities: ["标准", "深挖"],
        experienceThemes: backendThemes,
      },
    ],
  },
  {
    companyName: "vivo",
    aliases: [],
    interviewStyle: "结构化追问",
    supportedModes: ["text", "realtime"],
    rolePlaybooks: [
      {
        roleName: "客户端开发工程师",
        levels: ["P4", "P5", "P6"],
        recommendedIntensities: ["标准", "深挖"],
        experienceThemes: clientThemes,
      },
      {
        roleName: "后端开发工程师",
        levels: ["P4", "P5", "P6"],
        recommendedIntensities: ["标准", "深挖"],
        experienceThemes: backendThemes,
      },
    ],
  },
  {
    companyName: "科大讯飞",
    aliases: ["iFlytek"],
    interviewStyle: "结构化追问",
    supportedModes: ["text", "realtime"],
    rolePlaybooks: [
      {
        roleName: "算法工程师",
        levels: ["P4", "P5", "P6"],
        recommendedIntensities: ["标准", "深挖"],
        experienceThemes: algorithmThemes,
      },
      {
        roleName: "后端开发工程师",
        levels: ["P4", "P5"],
        recommendedIntensities: ["标准", "深挖"],
        experienceThemes: backendThemes,
      },
    ],
  },
  {
    companyName: "荣耀",
    aliases: ["Honor"],
    interviewStyle: "结构化追问",
    supportedModes: ["text", "realtime"],
    rolePlaybooks: [
      {
        roleName: "软件开发工程师",
        levels: ["13级", "14级", "15级"],
        recommendedIntensities: ["标准", "深挖"],
        experienceThemes: backendThemes,
      },
      {
        roleName: "客户端开发工程师",
        levels: ["13级", "14级"],
        recommendedIntensities: ["标准", "深挖"],
        experienceThemes: clientThemes,
      },
    ],
  },
  {
    companyName: "亚马逊",
    aliases: ["Amazon"],
    interviewStyle: "温和引导",
    supportedModes: ["text", "realtime"],
    rolePlaybooks: [
      {
        roleName: "软件开发工程师",
        levels: ["SDE I", "SDE II", "Senior SDE"],
        recommendedIntensities: ["标准", "深挖", "压力"],
        experienceThemes: backendThemes,
      },
      {
        roleName: "前端开发工程师",
        levels: ["SDE I", "SDE II"],
        recommendedIntensities: ["标准", "深挖"],
        experienceThemes: frontendThemes,
      },
    ],
  },
];
