import { InterviewStageType } from "@prisma/client";
import * as cheerio from "cheerio";
import type { getDeepseekClient } from "@/lib/ai/deepseek";

type PublicSourceSite = {
  label: string;
  hostnameKeywords: string[];
  querySuffixes: string[];
};

type PublicSearchCandidate = {
  url: string;
  title: string;
  snippet: string;
  sourceSite: string;
  query: string;
  provider: "duckduckgo" | "bing_rss" | "so360";
};

type PublicDocument = {
  url: string;
  title: string;
  sourceSite: string;
  text: string;
  snippet: string;
};

type ExtractedExperienceEntry = {
  stageType: InterviewStageType;
  title: string;
  summary: string;
  tags: string[];
  evidenceQuote: string;
  confidence: number;
};

type ReviewedExperienceEntry = ExtractedExperienceEntry & {
  sourceUrl: string;
  sourceSite: string;
  sourceTitle: string;
  qualityScore: number;
  reviewVerdict: "accepted" | "weak_accept";
  qualityReasons: string[];
  compliancePassed: boolean;
  complianceReasons: string[];
  dedupeKey: string;
};

type ExperienceQualityVerdict = "accepted" | "weak_accept" | "rejected";

export type PublicExperienceInsight = {
  stageType: InterviewStageType;
  title: string;
  summary: string;
  tags: string[];
  sourceLabel: string;
  freshnessLabel: string;
  evidenceUrl: string;
  sortOrder: number;
};

export type PublicExperienceCollectionResult = {
  insights: PublicExperienceInsight[];
  resultSummary: {
    companyName: string;
    roleName: string;
    departmentName: string | null;
    searchQueries: string[];
    searchResultCount: number;
    crawledSourceCount: number;
    parsedDocumentCount: number;
    extractedEntryCount: number;
    acceptedEntryCount: number;
    weakAcceptedEntryCount: number;
    rejectedEntryCount: number;
    dedupedEntryCount: number;
    acceptedSources: Array<{
      url: string;
      title: string;
      sourceSite: string;
      qualityScore: number;
      stageType: InterviewStageType;
    }>;
    rejectedReasons: Array<{
      url: string;
      title: string;
      sourceSite: string;
      reasons: string[];
    }>;
  };
};

const PUBLIC_SOURCE_SITES: PublicSourceSite[] = [
  {
    label: "牛客",
    hostnameKeywords: ["nowcoder.com"],
    querySuffixes: ["site:nowcoder.com 面经", "site:nowcoder.com 一面 二面 HR 面经"],
  },
  {
    label: "LeetCode",
    hostnameKeywords: ["leetcode.com", "leetcode.cn"],
    querySuffixes: ["site:leetcode.cn 面经", "site:leetcode.com interview experience"],
  },
  {
    label: "CSDN",
    hostnameKeywords: ["csdn.net"],
    querySuffixes: ["site:csdn.net 面经", "site:csdn.net 面试题 面经"],
  },
  {
    label: "知乎",
    hostnameKeywords: ["zhihu.com"],
    querySuffixes: ["site:zhihu.com 面经", "site:zhihu.com 后端 面试"],
  },
  {
    label: "掘金",
    hostnameKeywords: ["juejin.cn"],
    querySuffixes: ["site:juejin.cn 面经", "site:juejin.cn 后端 面试"],
  },
  {
    label: "腾讯云社区",
    hostnameKeywords: ["cloud.tencent.com"],
    querySuffixes: ["site:cloud.tencent.com 面经", "site:cloud.tencent.com 腾讯 后端 面试"],
  },
  {
    label: "公开博客",
    hostnameKeywords: ["github.io", "vercel.app", "netlify.app"],
    querySuffixes: ["面经", "后端 面试"],
  },
];

const DOCUMENT_FETCH_LIMIT = 18;
const SEARCH_RESULT_LIMIT_PER_QUERY = 8;
const EXTRACTED_ENTRY_LIMIT = 12;

const ROLE_ALIAS_MAP: Array<{ pattern: RegExp; aliases: string[] }> = [
  {
    pattern: /(后台开发工程师|后台开发|后端开发工程师|后端开发)/i,
    aliases: ["后台开发工程师", "后台开发", "后端开发工程师", "后端开发", "服务端开发"],
  },
  {
    pattern: /java/i,
    aliases: ["Java后端", "Java 后端", "Java开发", "Java服务端"],
  },
];

const STAGE_KEYWORD_QUERIES = [
  "一面",
  "二面",
  "三面",
  "HR 面",
  "校招",
  "实习",
  "暑期实习",
];

/**
 * 将任意文本裁剪为稳定字符串，避免脏值污染采集链路。
 * @param {string | null | undefined} value 原始文本。
 * @returns {string} 清洗后的字符串。
 */
function normalizeText(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * 将目标岗位扩展成一组用于公开检索的同义词，提升“后台开发/后端开发/Java后端”等场景的召回率。
 * @param {string} roleName 原始岗位名。
 * @returns {string[]} 去重后的岗位同义词数组。
 */
function buildRoleAliases(roleName: string): string[] {
  const normalizedRoleName = normalizeText(roleName);
  const aliasSet = new Set<string>([normalizedRoleName]);

  for (const item of ROLE_ALIAS_MAP) {
    if (item.pattern.test(normalizedRoleName)) {
      item.aliases.forEach((alias) => aliasSet.add(alias));
    }
  }

  if (normalizedRoleName.includes("后台")) {
    aliasSet.add(normalizedRoleName.replaceAll("后台", "后端"));
  }
  if (normalizedRoleName.includes("后端")) {
    aliasSet.add(normalizedRoleName.replaceAll("后端", "后台"));
  }

  return Array.from(aliasSet).filter(Boolean);
}

/**
 * 使用简单哈希构造稳定指纹，供采集结果去重。
 * @param {string} value 输入文本。
 * @returns {string} 稳定哈希值。
 */
function hashText(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16);
}

/**
 * 将文本压缩为适合模型消费的单段内容，避免超长正文拖垮采集任务。
 * @param {string} value 原始正文。
 * @returns {string} 裁剪后的正文。
 */
function compactDocumentText(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 6000);
}

/**
 * 将轮次标签收口为系统内部标准枚举。
 * @param {string} value 模型或网页中提取出的轮次标签。
 * @returns {InterviewStageType} 标准轮次类型。
 */
function normalizeStageType(value: string): InterviewStageType {
  const normalized = normalizeText(value).toUpperCase();
  if (normalized.includes("FIRST") || normalized.includes("一面")) {
    return InterviewStageType.FIRST_ROUND;
  }
  if (normalized.includes("SECOND") || normalized.includes("二面")) {
    return InterviewStageType.SECOND_ROUND;
  }
  if (normalized.includes("THIRD") || normalized.includes("三面")) {
    return InterviewStageType.THIRD_ROUND;
  }
  if (normalized.includes("HR")) {
    return InterviewStageType.HR_ROUND;
  }
  return InterviewStageType.FIRST_ROUND;
}

/**
 * 生成公开网页检索查询，供今夜的真实面经采集底座使用。
 * @param {string} companyName 目标公司。
 * @param {string} roleName 目标岗位。
 * @param {string | null | undefined} departmentName 目标部门。
 * @returns {string[]} 查询语句数组。
 */
function buildSearchQueries(
  companyName: string,
  roleName: string,
  departmentName?: string | null
): string[] {
  const companyAlias = normalizeText(companyName);
  const roleAliases = buildRoleAliases(roleName);
  const normalizedDepartmentName = normalizeText(departmentName);
  const querySet = new Set<string>();

  for (const roleAlias of roleAliases) {
    const base = `${companyAlias} ${roleAlias}`.trim();
    querySet.add(`${base} 面经`);
    querySet.add(`${base} 面试`);
    querySet.add(`${companyAlias} ${roleAlias} 牛客`);
    querySet.add(`${companyAlias} ${roleAlias} 知乎`);
    querySet.add(`${companyAlias} ${roleAlias} 掘金`);
    if (normalizedDepartmentName) {
      const departmentBase = `${companyAlias} ${normalizedDepartmentName} ${roleAlias}`.trim();
      querySet.add(`${departmentBase} 面经`);
      querySet.add(`${departmentBase} 面试`);
      querySet.add(`${departmentBase} 牛客`);
      querySet.add(`${departmentBase} 知乎`);
    }
    for (const stageKeyword of STAGE_KEYWORD_QUERIES) {
      querySet.add(`${base} ${stageKeyword} 面经`);
      querySet.add(`${base} ${stageKeyword} 面试`);
      if (normalizedDepartmentName) {
        querySet.add(`${companyAlias} ${normalizedDepartmentName} ${roleAlias} ${stageKeyword} 面经`);
      }
    }
    for (const site of PUBLIC_SOURCE_SITES) {
      site.querySuffixes.forEach((suffix) => querySet.add(`${base} ${suffix}`.trim()));
      if (normalizedDepartmentName) {
        site.querySuffixes.forEach((suffix) =>
          querySet.add(`${companyAlias} ${normalizedDepartmentName} ${roleAlias} ${suffix}`.trim())
        );
      }
    }
  }

  return Array.from(querySet);
}

/**
 * 基于 DuckDuckGo HTML 搜索页构造公开搜索链接，避免额外引入付费搜索 API。
 * @param {string} query 搜索查询。
 * @returns {string} 搜索页地址。
 */
function buildSearchUrl(query: string): string {
  return `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
}

/**
 * 基于 Bing RSS 搜索接口构造公开搜索链接，作为 DuckDuckGo 被风控时的兜底来源。
 * @param {string} query 搜索查询。
 * @returns {string} RSS 搜索地址。
 */
function buildBingRssSearchUrl(query: string): string {
  return `https://cn.bing.com/search?format=rss&q=${encodeURIComponent(query)}`;
}

/**
 * 构造 360 搜索网页检索地址，作为中文公开网页面经召回的主兜底来源。
 * @param {string} query 搜索查询。
 * @returns {string} 360 搜索地址。
 */
function buildSo360SearchUrl(query: string): string {
  return `https://www.so.com/s?q=${encodeURIComponent(query)}`;
}

/**
 * 统一构造带超时控制的抓取请求。
 * @param {string} url 目标地址。
 * @returns {Promise<Response>} 抓取响应。
 */
async function fetchWithTimeout(url: string): Promise<Response> {
  return fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
}

/**
 * 将 DuckDuckGo 搜索结果中的跳转链接还原成原始页面链接。
 * @param {string} href 搜索结果中的原始 href。
 * @returns {string} 可直接抓取的原始链接。
 */
function resolveSearchResultUrl(href: string): string {
  const normalizedHref = normalizeText(href);
  if (!normalizedHref) {
    return "";
  }
  if (normalizedHref.startsWith("http://") || normalizedHref.startsWith("https://")) {
    return normalizedHref;
  }
  if (normalizedHref.startsWith("//")) {
    return `https:${normalizedHref}`;
  }
  try {
    const url = new URL(`https://duckduckgo.com${normalizedHref}`);
    const redirected = url.searchParams.get("uddg");
    return redirected ? decodeURIComponent(redirected) : "";
  } catch {
    return "";
  }
}

/**
 * 判断候选链接是否属于允许采集的公开站点。
 * @param {string} url 候选链接。
 * @returns {string | null} 命中时返回站点标签。
 */
function resolvePublicSourceSite(url: string): string | null {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    const matchedSite = PUBLIC_SOURCE_SITES.find((site) =>
      site.hostnameKeywords.some((keyword) => hostname.includes(keyword))
    );
    return matchedSite?.label || hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * 对搜索结果做本地相关度打分，优先抓真正像“腾讯后端面经”的页面。
 * @param {PublicSearchCandidate} candidate 候选搜索结果。
 * @param {string} companyName 目标公司。
 * @param {string[]} roleAliases 目标岗位同义词。
 * @returns {number} 相关度分数。
 */
function scoreSearchCandidate(
  candidate: PublicSearchCandidate,
  companyName: string,
  roleAliases: string[]
): number {
  const haystack = `${candidate.title} ${candidate.snippet}`.toLowerCase();
  let score = 0;

  if (haystack.includes(companyName.toLowerCase())) {
    score += 4;
  }
  if (roleAliases.some((alias) => haystack.includes(alias.toLowerCase()))) {
    score += 5;
  }
  if (haystack.includes("面经")) {
    score += 4;
  }
  if (haystack.includes("面试")) {
    score += 2;
  }
  if (
    ["一面", "二面", "三面", "hr", "校招", "实习", "后端", "后台", "java", "redis", "mysql"].some(
      (keyword) => haystack.includes(keyword.toLowerCase())
    )
  ) {
    score += 3;
  }
  if (candidate.sourceSite === "牛客" || candidate.sourceSite === "知乎") {
    score += 2;
  }
  if (
    haystack.includes("广告") ||
    haystack.includes("培训") ||
    haystack.includes("课程") ||
    haystack.includes("题库")
  ) {
    score -= 3;
  }

  return score;
}

/**
 * 从 DuckDuckGo HTML 搜索页中提取可抓取的公开面经来源。
 * @param {string} html 搜索结果页 HTML。
 * @param {string} query 当前查询。
 * @returns {PublicSearchCandidate[]} 候选来源列表。
 */
function parseSearchCandidates(html: string, query: string): PublicSearchCandidate[] {
  const $ = cheerio.load(html);
  const candidates: PublicSearchCandidate[] = [];
  $(".result").each((_, element) => {
    const anchor = $(element).find(".result__title a.result__a").first();
    const title = normalizeText(anchor.text());
    const rawHref = normalizeText(anchor.attr("href"));
    const snippet = normalizeText($(element).find(".result__snippet").text());
    const url = resolveSearchResultUrl(rawHref);
    const sourceSite = resolvePublicSourceSite(url);
    if (!url || !title || !sourceSite) {
      return;
    }
    candidates.push({
      url,
      title,
      snippet,
      sourceSite,
      query,
      provider: "duckduckgo",
    });
  });

  return candidates.slice(0, SEARCH_RESULT_LIMIT_PER_QUERY);
}

/**
 * 从 Bing RSS 中提取公开搜索候选，作为 DuckDuckGo 风控场景下的兜底检索来源。
 * @param {string} xml RSS XML 正文。
 * @param {string} query 当前查询。
 * @returns {PublicSearchCandidate[]} 候选来源列表。
 */
function parseBingRssCandidates(xml: string, query: string): PublicSearchCandidate[] {
  const $ = cheerio.load(xml, { xmlMode: true });
  const candidates: PublicSearchCandidate[] = [];

  $("item").each((_, element) => {
    const url = normalizeText($(element).find("link").first().text());
    const title = normalizeText($(element).find("title").first().text());
    const snippet = normalizeText($(element).find("description").first().text());
    const sourceSite = resolvePublicSourceSite(url);
    if (!url || !title || !sourceSite) {
      return;
    }
    candidates.push({
      url,
      title,
      snippet,
      sourceSite,
      query,
      provider: "bing_rss",
    });
  });

  return candidates.slice(0, SEARCH_RESULT_LIMIT_PER_QUERY);
}

/**
 * 从 360 搜索结果页中提取真实候选链接。
 * @param {string} html 搜索结果页 HTML。
 * @param {string} query 当前查询。
 * @returns {PublicSearchCandidate[]} 候选来源列表。
 */
function parseSo360Candidates(html: string, query: string): PublicSearchCandidate[] {
  const $ = cheerio.load(html);
  const candidates: PublicSearchCandidate[] = [];

  $('a[href^="https://www.so.com/link?m="]').each((_, element) => {
    const url = normalizeText($(element).attr("href"));
    const title = normalizeText($(element).text()).replace(/\s+/g, " ");
    const isDomainOnlyTitle = /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(title);
    if (!url || !title || title.length < 8 || isDomainOnlyTitle) {
      return;
    }
    const snippet =
      normalizeText($(element).closest("li,div").text()).replace(/\s+/g, " ").slice(0, 240) ||
      title;
    candidates.push({
      url,
      title,
      snippet,
      sourceSite: "360搜索",
      query,
      provider: "so360",
    });
  });

  return candidates.slice(0, SEARCH_RESULT_LIMIT_PER_QUERY);
}

/**
 * 判断 DuckDuckGo 是否返回了机器人挑战页，避免把风控页面误判为空搜索结果。
 * @param {Response} response 搜索响应。
 * @param {string} html 搜索页内容。
 * @returns {boolean} 命中挑战页时返回 `true`。
 */
function isDuckDuckGoAnomalyResponse(response: Response, html: string): boolean {
  return (
    response.status === 202 ||
    html.includes("anomaly.js") ||
    html.includes("botnet") ||
    html.includes("Our systems have detected unusual traffic")
  );
}

/**
 * 针对单条查询执行多搜索源检索，优先 DuckDuckGo，失败时自动回退 Bing RSS。
 * @param {string} query 当前查询语句。
 * @returns {Promise<PublicSearchCandidate[]>} 当前查询召回的候选来源。
 */
async function searchCandidatesForSingleQuery(query: string): Promise<PublicSearchCandidate[]> {
  try {
    const response = await fetchWithTimeout(buildSearchUrl(query));
    if (response.ok) {
      const html = await response.text();
      if (!isDuckDuckGoAnomalyResponse(response, html)) {
        const duckCandidates = parseSearchCandidates(html, query);
        if (duckCandidates.length > 0) {
          return duckCandidates;
        }
      }
    }
  } catch {
    // ignore and fallback to bing rss
  }

  try {
    const response = await fetchWithTimeout(buildSo360SearchUrl(query));
    if (response.ok) {
      const html = await response.text();
      const so360Candidates = parseSo360Candidates(html, query);
      if (so360Candidates.length > 0) {
        return so360Candidates;
      }
    }
  } catch {
    // ignore and fallback to bing rss
  }

  try {
    const response = await fetchWithTimeout(buildBingRssSearchUrl(query));
    if (!response.ok) {
      return [];
    }
    const xml = await response.text();
    return parseBingRssCandidates(xml, query);
  } catch {
    return [];
  }
}

/**
 * 搜索公开网页来源，供面经采集任务后续抓取正文。
 * @param {string} companyName 目标公司。
 * @param {string} roleName 目标岗位。
 * @param {string | null | undefined} departmentName 目标部门。
 * @returns {Promise<{ queries: string[]; candidates: PublicSearchCandidate[] }>} 查询与来源集合。
 */
async function searchPublicExperienceSources(
  companyName: string,
  roleName: string,
  departmentName?: string | null
): Promise<{
  queries: string[];
  candidates: PublicSearchCandidate[];
  searchResultCount: number;
}> {
  const queries = buildSearchQueries(companyName, roleName, departmentName);
  const roleAliases = buildRoleAliases(roleName);
  const candidateMap = new Map<string, PublicSearchCandidate>();
  let searchResultCount = 0;

  for (const query of queries) {
    try {
      const parsedCandidates = await searchCandidatesForSingleQuery(query);
      searchResultCount += parsedCandidates.length;
      for (const candidate of parsedCandidates) {
        if (!candidateMap.has(candidate.url)) {
          candidateMap.set(candidate.url, candidate);
        }
      }
    } catch {
      continue;
    }
  }

  return {
    queries,
    searchResultCount,
    candidates: Array.from(candidateMap.values())
      .sort(
        (left, right) =>
          scoreSearchCandidate(right, companyName, roleAliases) -
          scoreSearchCandidate(left, companyName, roleAliases)
      )
      .slice(0, DOCUMENT_FETCH_LIMIT),
  };
}

/**
 * 从正文页中抽取可读文本，供后续结构化提炼与审核使用。
 * @param {string} html 页面 HTML。
 * @returns {string} 清洗后的正文。
 */
function extractReadableText(html: string): string {
  const $ = cheerio.load(html);
  $("script,style,noscript,svg,footer,nav").remove();
  const preferredSelectors = [
    "article",
    ".article-content",
    ".post-content",
    ".content",
    ".blog-content-box",
    "main",
    "body",
  ];
  for (const selector of preferredSelectors) {
    const text = compactDocumentText($(selector).first().text());
    if (text.length >= 200) {
      return text;
    }
  }
  return compactDocumentText($.root().text());
}

/**
 * 解析搜索引擎跳转页中的真实落地链接，避免把 360 中转页误当作最终正文来源。
 * @param {string} html 页面 HTML。
 * @param {string} fallbackUrl 候选原始 URL。
 * @returns {string} 真实落地页地址或原始地址。
 */
function resolveDocumentTargetUrl(html: string, fallbackUrl: string): string {
  const scriptMatch = html.match(/window\.location\.replace\("([^"]+)"\)/i);
  if (scriptMatch?.[1]) {
    return normalizeText(scriptMatch[1]);
  }

  const metaRefreshMatch = html.match(/URL='([^']+)'/i);
  if (metaRefreshMatch?.[1]) {
    return normalizeText(metaRefreshMatch[1]);
  }

  return fallbackUrl;
}

/**
 * 抓取并清洗公开来源正文。
 * @param {PublicSearchCandidate[]} candidates 搜索候选来源。
 * @returns {Promise<PublicDocument[]>} 可继续结构化处理的正文集合。
 */
async function fetchPublicDocuments(candidates: PublicSearchCandidate[]): Promise<PublicDocument[]> {
  const documents = await Promise.all(
    candidates.map(async (candidate) => {
      try {
        const initialResponse = await fetchWithTimeout(candidate.url);
        if (!initialResponse.ok) {
          return null;
        }
        const initialHtml = await initialResponse.text();
        const resolvedUrl = resolveDocumentTargetUrl(initialHtml, candidate.url);
        const response =
          resolvedUrl !== candidate.url ? await fetchWithTimeout(resolvedUrl) : initialResponse;
        const html = resolvedUrl !== candidate.url ? await response.text() : initialHtml;
        if (!response.ok) {
          return null;
        }
        const $ = cheerio.load(html);
        const pageTitle = normalizeText($("title").first().text()) || candidate.title;
        const text = extractReadableText(html);
        if (text.length < 200) {
          return null;
        }
        const finalUrl = normalizeText(response.url || resolvedUrl || candidate.url) || candidate.url;
        const finalSourceSite = resolvePublicSourceSite(finalUrl) || candidate.sourceSite;
        return {
          url: finalUrl,
          title: pageTitle,
          sourceSite: finalSourceSite,
          text,
          snippet: candidate.snippet,
        } satisfies PublicDocument;
      } catch {
        return null;
      }
    })
  );

  return documents.filter((item): item is PublicDocument => Boolean(item));
}

/**
 * 从标题、摘要与正文中启发式识别适合入库的真实问题主题，作为模型抽取失败时的本地兜底。
 * @param {PublicDocument} document 公开网页正文。
 * @param {string} companyName 目标公司。
 * @param {string} roleName 目标岗位。
 * @returns {ExtractedExperienceEntry[]} 候选条目。
 */
function fallbackExtractEntriesFromDocument(
  document: PublicDocument,
  companyName: string,
  roleName: string
): ExtractedExperienceEntry[] {
  const haystack = `${document.title} ${document.snippet} ${document.text}`.toLowerCase();
  const stageType = normalizeStageType(
    haystack.includes("hr") || haystack.includes("hr面")
      ? "HR"
      : haystack.includes("三面")
        ? "三面"
        : haystack.includes("二面")
          ? "二面"
          : "一面"
  );
  const candidateTopics: Array<{ keywords: string[]; title: string; summary: string; tags: string[] }> = [
    {
      keywords: ["项目", "负责", "模块"],
      title: `${companyName} ${roleName} 项目真实性追问`,
      summary: "会围绕你真实负责过的项目链路、模块职责和技术判断继续深挖，验证是否真的做过。",
      tags: ["项目深挖", "真实性", "经历拆解"],
    },
    {
      keywords: ["redis", "缓存"],
      title: `${companyName} ${roleName} Redis 与缓存一致性追问`,
      summary: "会继续追问缓存穿透、缓存一致性、回源、双写与高并发下的取舍。",
      tags: ["Redis", "缓存", "一致性"],
    },
    {
      keywords: ["mysql", "索引", "事务"],
      title: `${companyName} ${roleName} MySQL 与事务追问`,
      summary: "会围绕索引命中、事务隔离级别、SQL 优化与线上性能瓶颈继续追问。",
      tags: ["MySQL", "事务", "索引"],
    },
    {
      keywords: ["并发", "线程", "锁"],
      title: `${companyName} ${roleName} 并发与线程模型追问`,
      summary: "会继续追问线程池、锁竞争、并发控制与线上故障排查方式。",
      tags: ["并发", "线程池", "锁"],
    },
    {
      keywords: ["系统设计", "高可用", "降级", "容量"],
      title: `${companyName} ${roleName} 系统设计与高可用追问`,
      summary: "二面及更高轮次常会围绕容量估算、高可用、降级、容灾和系统取舍继续深挖。",
      tags: ["系统设计", "高可用", "容量"],
    },
    {
      keywords: ["动机", "稳定性", "协作", "离职"],
      title: `${companyName} ${roleName} 动机与稳定性追问`,
      summary: "HR 面会进一步追问求职动机、协作方式、稳定性和职业选择判断。",
      tags: ["HR", "动机", "稳定性"],
    },
  ];

  const entries = candidateTopics
    .filter((topic) => topic.keywords.some((keyword) => haystack.includes(keyword)))
    .slice(0, 3)
    .map((topic) => ({
      stageType:
        topic.tags.includes("HR") ? InterviewStageType.HR_ROUND : stageType,
      title: topic.title,
      summary: topic.summary,
      tags: topic.tags,
      evidenceQuote: compactDocumentText(`${document.title} ${document.snippet}`).slice(0, 180),
      confidence: 6,
    }));

  if (entries.length > 0) {
    return entries;
  }

  if (haystack.includes("面经") || haystack.includes("面试")) {
    return [
      {
        stageType,
        title: `${companyName} ${roleName} 真实提问主题整理`,
        summary: "该公开来源明确包含真实面试问题与追问信息，可作为当前岗位后续拆题的弱证据来源。",
        tags: ["面经", "真实提问", "公开来源"],
        evidenceQuote: compactDocumentText(`${document.title} ${document.snippet}`).slice(0, 180),
        confidence: 5,
      },
    ];
  }

  return [];
}

/**
 * 让抽取 Agent 从公开网页正文中提炼候选面经条目。
 * @param {ReturnType<typeof getDeepseekClient>} openai DeepSeek 客户端。
 * @param {PublicDocument} document 抓取后的公开网页正文。
 * @param {string} companyName 目标公司。
 * @param {string} roleName 目标岗位。
 * @returns {Promise<ExtractedExperienceEntry[]>} 结构化候选条目。
 */
async function extractExperienceEntriesFromDocument(
  openai: ReturnType<typeof getDeepseekClient>,
  document: PublicDocument,
  companyName: string,
  roleName: string
): Promise<ExtractedExperienceEntry[]> {
  const prompt = `
你是面经抽取 Agent。请从公开网页正文里，只提取与【${companyName}】【${roleName}】直接相关、可用于真实面试提问的面经条目。

页面标题：${document.title}
来源站点：${document.sourceSite}
页面摘要：${document.snippet || "无"}
网页正文：
${document.text}

要求：
1. 只保留与 ${companyName} / ${roleName} 直接相关的真实提问主题，拒绝鸡汤、广告、培训导流、纯题解。
2. stageType 仅允许：FIRST_ROUND、SECOND_ROUND、THIRD_ROUND、HR_ROUND。
3. title 必须是给用户看的真实提问主题，不允许出现“AI 面试官会”“高频考察点”“历史追问风格”“策略”“prompt”等内部词。
4. summary 必须是用户可见的真实提问摘要，说明这一类题通常怎么问、验证什么，不要写系统策略。
5. evidenceQuote 只保留网页中最能支撑该条目的短证据。
6. 最多返回 3 条。

只返回 JSON：
{
  "entries": [
    {
      "stageType": "FIRST_ROUND",
      "title": "项目真实性与缓存一致性追问",
      "summary": "一面会围绕真实项目中的缓存一致性、回源、并发写入冲突继续深挖。",
      "tags": ["缓存", "并发", "项目深挖"],
      "evidenceQuote": "原文证据片段",
      "confidence": 8
    }
  ]
}
`.trim();

  try {
    const completion = await openai.chat.completions.create({
      model: "deepseek-chat",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "你是严格的面经抽取 Agent，只输出 JSON，不输出 markdown。",
        },
        { role: "user", content: prompt },
      ],
    });
    const content = completion.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(content) as {
      entries?: Array<{
        stageType?: string;
        title?: string;
        summary?: string;
        tags?: string[];
        evidenceQuote?: string;
        confidence?: number;
      }>;
    };
    return (parsed.entries || [])
      .map((entry) => ({
        stageType: normalizeStageType(entry.stageType || ""),
        title: normalizeText(entry.title),
        summary: normalizeText(entry.summary),
        tags: Array.isArray(entry.tags)
          ? entry.tags.map((item) => normalizeText(item)).filter(Boolean).slice(0, 6)
          : [],
        evidenceQuote: normalizeText(entry.evidenceQuote).slice(0, 180),
        confidence:
          typeof entry.confidence === "number"
            ? Math.max(0, Math.min(10, entry.confidence))
            : 0,
      }))
      .filter((entry) => entry.title && entry.summary);
  } catch {
    return [];
  }
}

/**
 * 让质量评审 Agent 判断候选条目是否足够具体、可追问、可直接给面试官消费。
 * @param {ReturnType<typeof getDeepseekClient>} openai DeepSeek 客户端。
 * @param {ExtractedExperienceEntry} entry 候选条目。
 * @param {PublicDocument} document 来源正文。
 * @returns {Promise<{ verdict: ExperienceQualityVerdict; score: number; reasons: string[] }>} 质量评审结果。
 */
async function reviewExperienceQuality(
  openai: ReturnType<typeof getDeepseekClient>,
  entry: ExtractedExperienceEntry,
  document: PublicDocument
): Promise<{ verdict: ExperienceQualityVerdict; score: number; reasons: string[] }> {
  const prompt = `
你是面经质量评审 Agent。请判断下面这条候选面经是否足够真实、具体、适合直接进入面试出题链。

来源标题：${document.title}
来源站点：${document.sourceSite}
候选条目：
- 轮次：${entry.stageType}
- 标题：${entry.title}
- 摘要：${entry.summary}
- 标签：${entry.tags.join(" / ") || "无"}
- 证据：${entry.evidenceQuote || "无"}

评审标准：
1. 必须具体，不允许空泛。
2. 必须适合被继续拆成多轮提问。
3. 必须能看出真实岗位语境。
4. 若只是泛泛题纲、营销文、纯经验口号，直接拒绝。
5. verdict 只能是 accepted / weak_accept / rejected。

判定口径：
- accepted：主题具体、岗位语境明确、可以直接进入出题链。
- weak_accept：来源看起来是真实面经，但主题偏泛、证据偏弱，允许保留作弱证据。
- rejected：明显泛化、营销、题库、与岗位无关，或几乎无法继续拆题。

只返回 JSON：
{
  "verdict": "accepted",
  "score": 8,
  "reasons": ["原因1", "原因2"]
}
`.trim();

  try {
    const completion = await openai.chat.completions.create({
      model: "deepseek-chat",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "你是严格的面经质量评审 Agent，只输出 JSON。",
        },
        { role: "user", content: prompt },
      ],
    });
    const content = completion.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(content) as {
      verdict?: ExperienceQualityVerdict;
      score?: number;
      reasons?: string[];
    };
    const normalizedVerdict =
      parsed.verdict === "accepted" ||
      parsed.verdict === "weak_accept" ||
      parsed.verdict === "rejected"
        ? parsed.verdict
        : typeof parsed.score === "number" && parsed.score >= 7
          ? "accepted"
          : typeof parsed.score === "number" && parsed.score >= 5
            ? "weak_accept"
            : "rejected";
    return {
      verdict: normalizedVerdict,
      score:
        typeof parsed.score === "number" ? Math.max(0, Math.min(10, parsed.score)) : 0,
      reasons: Array.isArray(parsed.reasons)
        ? parsed.reasons.map((item) => normalizeText(item)).filter(Boolean).slice(0, 4)
        : [],
    };
  } catch {
    return {
      verdict: "rejected",
      score: 0,
      reasons: ["质量评审失败，暂不入库。"],
    };
  }
}

/**
 * 让合规评审 Agent 判断条目是否适合作为公开网页采集结果进入产品数据链。
 * @param {ReturnType<typeof getDeepseekClient>} openai DeepSeek 客户端。
 * @param {ExtractedExperienceEntry} entry 候选条目。
 * @param {PublicDocument} document 来源正文。
 * @returns {Promise<{ passed: boolean; reasons: string[] }>} 合规评审结果。
 */
async function reviewExperienceCompliance(
  openai: ReturnType<typeof getDeepseekClient>,
  entry: ExtractedExperienceEntry,
  document: PublicDocument
): Promise<{ passed: boolean; reasons: string[] }> {
  const prompt = `
你是公开网页面经采集的合规评审 Agent。请判断下面条目是否适合作为公开网页摘要入库。

来源站点：${document.sourceSite}
来源标题：${document.title}
候选条目：
- 标题：${entry.title}
- 摘要：${entry.summary}
- 证据：${entry.evidenceQuote || "无"}

要求：
1. 不保留明显个人隐私信息。
2. 不保留导流广告、课程营销、付费引导。
3. 只保留公开讨论中可摘要成岗位题型洞察的内容。

只返回 JSON：
{
  "passed": true,
  "reasons": ["原因1", "原因2"]
}
`.trim();

  try {
    const completion = await openai.chat.completions.create({
      model: "deepseek-chat",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "你是严格的合规评审 Agent，只输出 JSON。",
        },
        { role: "user", content: prompt },
      ],
    });
    const content = completion.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(content) as {
      passed?: boolean;
      reasons?: string[];
    };
    return {
      passed: Boolean(parsed.passed),
      reasons: Array.isArray(parsed.reasons)
        ? parsed.reasons.map((item) => normalizeText(item)).filter(Boolean).slice(0, 4)
        : [],
    };
  } catch {
    return {
      passed: false,
      reasons: ["合规评审失败，暂不入库。"],
    };
  }
}

/**
 * 为候选条目构造本地去重指纹，避免同一来源或近似条目重复入库。
 * @param {ExtractedExperienceEntry} entry 候选条目。
 * @returns {string} 去重指纹。
 */
function buildDedupeKey(entry: ExtractedExperienceEntry): string {
  return hashText(
    [
      entry.stageType,
      entry.title.replace(/\s+/g, ""),
      entry.summary.replace(/\s+/g, "").slice(0, 80),
    ].join("__").toLowerCase()
  );
}

/**
 * 对所有候选条目执行本地去重，只保留质量更高的一份。
 * @param {ReviewedExperienceEntry[]} entries 审核通过的候选条目。
 * @returns {ReviewedExperienceEntry[]} 去重后的条目。
 */
function dedupeReviewedEntries(entries: ReviewedExperienceEntry[]): ReviewedExperienceEntry[] {
  const entryMap = new Map<string, ReviewedExperienceEntry>();
  for (const entry of entries) {
    const existing = entryMap.get(entry.dedupeKey);
    if (!existing || entry.qualityScore > existing.qualityScore) {
      entryMap.set(entry.dedupeKey, entry);
    }
  }
  return Array.from(entryMap.values()).slice(0, EXTRACTED_ENTRY_LIMIT);
}

/**
 * 将审核通过的候选条目映射为前端和提问链可消费的结构化洞察。
 * @param {ReviewedExperienceEntry[]} entries 审核通过且完成去重的条目。
 * @returns {PublicExperienceInsight[]} 最终面经洞察。
 */
function mapEntriesToInsights(entries: ReviewedExperienceEntry[]): PublicExperienceInsight[] {
  const freshnessLabel = `最新采集：${new Date().toLocaleString("zh-CN")}`;
  return entries.map((entry, index) => ({
    stageType: entry.stageType,
    title: entry.title,
    summary: entry.summary,
    tags: entry.tags,
    sourceLabel: `${entry.sourceSite} · 公开网页面经`,
    freshnessLabel,
    evidenceUrl: entry.sourceUrl,
    sortOrder: index + 1,
  }));
}

/**
 * 运行公开网页面经采集底座：检索、抓取、结构化提炼、质量审核、合规审核与去重。
 * @param input 当前采集任务所需上下文。
 * @returns {Promise<PublicExperienceCollectionResult>} 可直接入库并回填页面的结果。
 */
export async function collectInterviewExperiencesFromPublicWeb(input: {
  openai: ReturnType<typeof getDeepseekClient>;
  companyName: string;
  roleName: string;
  departmentName?: string | null;
}): Promise<PublicExperienceCollectionResult> {
  const { queries, candidates, searchResultCount } = await searchPublicExperienceSources(
    input.companyName,
    input.roleName,
    input.departmentName
  );
  const documents = await fetchPublicDocuments(candidates);
  const acceptedEntries: ReviewedExperienceEntry[] = [];
  const rejectedReasons: PublicExperienceCollectionResult["resultSummary"]["rejectedReasons"] = [];
  let extractedEntryCount = 0;
  let acceptedEntryCount = 0;
  let weakAcceptedEntryCount = 0;
  let rejectedEntryCount = 0;

  for (const document of documents) {
    const modelExtractedEntries = await extractExperienceEntriesFromDocument(
      input.openai,
      document,
      input.companyName,
      input.roleName
    );
    const extractedEntries =
      modelExtractedEntries.length > 0
        ? modelExtractedEntries
        : fallbackExtractEntriesFromDocument(document, input.companyName, input.roleName);
    extractedEntryCount += extractedEntries.length;
    for (const entry of extractedEntries) {
      const [qualityReview, complianceReview] = await Promise.all([
        reviewExperienceQuality(input.openai, entry, document),
        reviewExperienceCompliance(input.openai, entry, document),
      ]);
      if (qualityReview.verdict === "rejected" || !complianceReview.passed) {
        rejectedEntryCount += 1;
        rejectedReasons.push({
          url: document.url,
          title: document.title,
          sourceSite: document.sourceSite,
          reasons: [...qualityReview.reasons, ...complianceReview.reasons].filter(Boolean),
        });
        continue;
      }
      if (qualityReview.verdict === "accepted") {
        acceptedEntryCount += 1;
      } else {
        weakAcceptedEntryCount += 1;
      }
      acceptedEntries.push({
        ...entry,
        sourceUrl: document.url,
        sourceSite: document.sourceSite,
        sourceTitle: document.title,
        qualityScore: qualityReview.score,
        reviewVerdict: qualityReview.verdict,
        qualityReasons: qualityReview.reasons,
        compliancePassed: complianceReview.passed,
        complianceReasons: complianceReview.reasons,
        dedupeKey: buildDedupeKey(entry),
      });
    }
  }

  const dedupedEntries = dedupeReviewedEntries(acceptedEntries);
  const insights = mapEntriesToInsights(dedupedEntries);

  return {
    insights,
    resultSummary: {
      companyName: input.companyName,
      roleName: input.roleName,
      departmentName: normalizeText(input.departmentName) || null,
      searchQueries: queries,
      searchResultCount,
      crawledSourceCount: documents.length,
      parsedDocumentCount: documents.length,
      extractedEntryCount,
      acceptedEntryCount,
      weakAcceptedEntryCount,
      rejectedEntryCount,
      dedupedEntryCount: dedupedEntries.length,
      acceptedSources: dedupedEntries.map((entry) => ({
        url: entry.sourceUrl,
        title: entry.sourceTitle,
        sourceSite: entry.sourceSite,
        qualityScore: entry.qualityScore,
        stageType: entry.stageType,
      })),
      rejectedReasons,
    },
  };
}
