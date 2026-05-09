import fs from "fs";
import path from "path";

export type QuickFact = {
  k: string;
  v: string;
};

export type ContentSection = {
  id: string;
  h2: string;
  paragraphs?: string[];
  bullets?: string[];
  callout?: string;
  type?: "text" | "diagram" | "code" | "mistake" | "comparison" | "quiz";
  highlight?: string;
  diagramCode?: string;
  diagramType?: "ascii-tree" | "structure" | "image" | "mermaid";
  fallbackDescription?: string;
  codeExample?: {
    title: string;
    language: string;
    code: string;
    explanation?: string;
    output?: string;
    outputExplanation?: string;
  };
  mistake?: {
    mistake: string;
    whyWrong?: string;
    correct?: string;
  };
  comparison?: {
    title?: string;
    headers: string[];
    rows: string[][];
  };
  quiz?: SelfTest;
};

export type SelfTest = {
  level?: string;
  question: string;
  hint?: string;
  answer?: string;
  gradingCriteria?: Array<{
    criterion: string;
    points: number;
    description: string;
  }>;
};

export type SourceItem = {
  title: string;
  url: string;
  type?: string;
  trustLevel?: "S" | "A" | "B" | "C";
};

export type Article = {
  conclusion: string;
  keyTakeaways: string[];
  learningGoals: string[];
  plainSummary?: string;
  plainRetell?: string;
  strongSummary?: string;
  sections: ContentSection[];
};

export type InterviewContent = {
  question?: string;
  questionVariants?: string[];
  answer30s?: string;
  answer2min?: string;
  advancedAnswer?: string;
  essentialPoints?: Array<{ point: string; why?: string }>;
  bonusPoints?: Array<{ point: string; why?: string }>;
  advancedPoints?: Array<{ point: string; why?: string }>;
  deductPoints?: Array<{ point: string; why?: string }>;
  followUps?: Array<{ question: string; difficulty?: "easy" | "medium" | "hard"; keyAnswer?: string }>;
};

export type TopicContent = {
  title: string;
  breadcrumb: string[];
  quickFacts: QuickFact[];
  sections: ContentSection[];
  examPoint?: string;
  summary?: string;
  scenario?: string;
  article?: Article;
  selfTests?: SelfTest[];
  sources?: SourceItem[];
  interviewContent?: InterviewContent;
};

export type DraftSummary = {
  topic: string;
  content: {
    quickFacts?: QuickFact[];
    sections?: ContentSection[];
  };
};

export type DraftRecord = {
  id: string;
  kbId: string;
  subject: string;
  summary: DraftSummary;
  createdAt: string;
  updatedAt: string;
  sourceIds?: string[];
  status?: string;
  pipeline?: Array<{
    key: string;
    label: string;
    status: string;
    updatedAt: string;
    detail?: string;
  }>;
  reviewNotes?: string[];
  diffSummary?: string[];
  publishTopicId?: string | null;
  publishedAt?: string | null;
};

export type TreeNode = {
  id: string;
  title: string;
  children?: TreeNode[];
};

export type TreeGroup = {
  id: string;
  title: string;
  children: TreeNode[];
};

export type TreeData = {
  id: string;
  title: string;
  groups: TreeGroup[];
};

export type KbInfo = {
  id: string;
  name: string;
  subtitle: string;
  tags: string[];
  updatedAt: string;
  stats: { topics: number; paths: number };
  description?: string;
  visibility?: "public" | "private";
  sortOrder?: number;
  cover?: string;
  defaultTopicId?: string | null;
};

export type LearningDatabase = {
  kbs: KbInfo[];
  trees: Record<string, TreeData>;
  contents: Record<string, Record<string, TopicContent>>;
  drafts: Record<string, Record<string, DraftRecord>>;
};

type LearningIndex = {
  schemaVersion: number;
  migratedFromLegacyJsonAt: string | null;
  kbs: KbInfo[];
  trees: Record<string, TreeData>;
  topicFiles: Record<string, Record<string, string>>;
  draftFiles: Record<string, Record<string, string>>;
};

type StoredTopicRecord = {
  kbId: string;
  topicId: string;
  subjectId: string;
  updatedAt: string;
  content: TopicContent;
};

const LEGACY_DB_PATH = path.join(process.cwd(), "data", "learning-center.json");
const STORE_ROOT = path.join(process.cwd(), "data", "learning-center");
const INDEX_PATH = path.join(STORE_ROOT, "index.json");
const KBS_ROOT = path.join(STORE_ROOT, "kbs");
const DRAFTS_ROOT = path.join(STORE_ROOT, "drafts");
const STORE_SCHEMA_VERSION = 1;

/**
 * Returns today's date string for KB-level timestamps.
 * @returns {string} ISO date in `YYYY-MM-DD` format.
 */
function getTodayDate(): string {
  return new Date().toISOString().split("T")[0];
}

/**
 * Creates the target directory when it does not exist yet.
 * @param {string} dirPath Directory path to ensure.
 * @returns {void} Creates the directory tree in place.
 */
function ensureDirectory(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Deletes a file if it exists.
 * @param {string} filePath Absolute file path to remove.
 * @returns {void} Removes the file without throwing on absence.
 */
function removeFileIfExists(filePath: string): void {
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    fs.rmSync(filePath);
  }
}

/**
 * Deletes a directory tree if it exists.
 * @param {string} dirPath Absolute directory path to remove.
 * @returns {void} Removes the directory recursively without throwing on absence.
 */
function removeDirectoryIfExists(dirPath: string): void {
  if (fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

/**
 * Converts an arbitrary identifier into a filesystem-safe path segment.
 * @param {string} value Raw identifier value.
 * @param {string} fallback Fallback segment when the input is empty.
 * @returns {string} URL-encoded segment safe for local file paths.
 */
function toPathSegment(value: string, fallback: string): string {
  const trimmed = value.trim();
  return trimmed ? encodeURIComponent(trimmed) : fallback;
}

/**
 * Builds the stable KB directory path inside the file-first content store.
 * @param {string} kbId Knowledge base identifier.
 * @returns {string} Absolute KB directory path.
 */
function getKbDirectoryPath(kbId: string): string {
  return path.join(KBS_ROOT, toPathSegment(kbId, "kb"));
}

/**
 * Builds the stable topics directory path for one KB.
 * @param {string} kbId Knowledge base identifier.
 * @returns {string} Absolute topics directory path.
 */
function getKbTopicsDirectoryPath(kbId: string): string {
  return path.join(getKbDirectoryPath(kbId), "topics");
}

/**
 * Builds the metadata file path for one KB.
 * @param {string} kbId Knowledge base identifier.
 * @returns {string} Absolute KB metadata file path.
 */
function getKbMetaPath(kbId: string): string {
  return path.join(getKbDirectoryPath(kbId), "meta.json");
}

/**
 * Builds the taxonomy file path for one KB.
 * @param {string} kbId Knowledge base identifier.
 * @returns {string} Absolute KB tree file path.
 */
function getKbTreePath(kbId: string): string {
  return path.join(getKbDirectoryPath(kbId), "tree.json");
}

/**
 * Builds the published content file path for one topic.
 * @param {string} kbId Knowledge base identifier.
 * @param {string} topicId Topic identifier.
 * @returns {string} Absolute topic content file path.
 */
function getTopicFilePath(kbId: string, topicId: string): string {
  return path.join(
    getKbTopicsDirectoryPath(kbId),
    `${toPathSegment(topicId, "topic")}.json`
  );
}

/**
 * Builds the draft directory path for one KB.
 * @param {string} kbId Knowledge base identifier.
 * @returns {string} Absolute draft directory path.
 */
function getDraftDirectoryPath(kbId: string): string {
  return path.join(DRAFTS_ROOT, toPathSegment(kbId, "kb"));
}

/**
 * Builds the draft file path for one draft record.
 * @param {string} kbId Knowledge base identifier.
 * @param {string} draftId Draft identifier.
 * @returns {string} Absolute draft file path.
 */
function getDraftFilePath(kbId: string, draftId: string): string {
  return path.join(
    getDraftDirectoryPath(kbId),
    `${toPathSegment(draftId, "draft")}.json`
  );
}

/**
 * Reads and parses JSON from disk.
 * @template T
 * @param {string} filePath Absolute file path to read.
 * @returns {T | null} Parsed JSON value, or `null` when the file is missing or invalid.
 */
function readJsonFile<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
  } catch (error) {
    console.error(`Failed to parse JSON file: ${filePath}`, error);
    return null;
  }
}

/**
 * Writes JSON data to disk using a stable pretty-printed format.
 * @param {string} filePath Absolute target file path.
 * @param {unknown} value Serializable payload to persist.
 * @returns {void} Writes the file atomically within the current process.
 */
function writeJsonFile(filePath: string, value: unknown): void {
  ensureDirectory(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf-8");
}

/**
 * Creates an empty in-memory database shape.
 * @returns {LearningDatabase} Empty normalized learning database payload.
 */
function buildEmptyDatabase(): LearningDatabase {
  return {
    kbs: [],
    trees: {},
    contents: {},
    drafts: {},
  };
}

/**
 * Creates an empty file-store index payload.
 * @returns {LearningIndex} Empty normalized compatibility index.
 */
function buildEmptyIndex(): LearningIndex {
  return {
    schemaVersion: STORE_SCHEMA_VERSION,
    migratedFromLegacyJsonAt: null,
    kbs: [],
    trees: {},
    topicFiles: {},
    draftFiles: {},
  };
}

/**
 * Normalizes one quick fact item.
 * @param {Partial<QuickFact> | undefined} value Candidate quick fact value.
 * @returns {QuickFact} Sanitized quick fact object.
 */
function normalizeQuickFact(value?: Partial<QuickFact>): QuickFact {
  return {
    k: typeof value?.k === "string" ? value.k : "",
    v: typeof value?.v === "string" ? value.v : "",
  };
}

/**
 * Normalizes one content section.
 * @param {Partial<ContentSection> | undefined} value Candidate section value.
 * @returns {ContentSection} Sanitized section object.
 */
function normalizeContentSection(value?: Partial<ContentSection>): ContentSection {
  return {
    id: typeof value?.id === "string" && value.id.trim() ? value.id : "section",
    h2: typeof value?.h2 === "string" ? value.h2 : "",
    paragraphs: Array.isArray(value?.paragraphs)
      ? value.paragraphs.filter((item): item is string => typeof item === "string")
      : [],
    bullets: Array.isArray(value?.bullets)
      ? value.bullets.filter((item): item is string => typeof item === "string")
      : [],
    callout: typeof value?.callout === "string" ? value.callout : undefined,
    type:
      value?.type === "diagram" ||
      value?.type === "code" ||
      value?.type === "mistake" ||
      value?.type === "comparison" ||
      value?.type === "quiz" ||
      value?.type === "text"
        ? value.type
        : undefined,
    highlight: typeof value?.highlight === "string" ? value.highlight : undefined,
    diagramCode: typeof value?.diagramCode === "string" ? value.diagramCode : undefined,
    diagramType:
      value?.diagramType === "ascii-tree" ||
      value?.diagramType === "structure" ||
      value?.diagramType === "image" ||
      value?.diagramType === "mermaid"
        ? value.diagramType
        : undefined,
    fallbackDescription: typeof value?.fallbackDescription === "string" ? value.fallbackDescription : undefined,
    codeExample:
      value?.codeExample &&
      typeof value.codeExample.title === "string" &&
      typeof value.codeExample.language === "string" &&
      typeof value.codeExample.code === "string"
        ? {
            title: value.codeExample.title,
            language: value.codeExample.language,
            code: value.codeExample.code,
            explanation:
              typeof value.codeExample.explanation === "string" ? value.codeExample.explanation : undefined,
            output: typeof value.codeExample.output === "string" ? value.codeExample.output : undefined,
            outputExplanation:
              typeof value.codeExample.outputExplanation === "string"
                ? value.codeExample.outputExplanation
                : undefined,
          }
        : undefined,
    mistake:
      value?.mistake && typeof value.mistake.mistake === "string"
        ? {
            mistake: value.mistake.mistake,
            whyWrong: typeof value.mistake.whyWrong === "string" ? value.mistake.whyWrong : undefined,
            correct: typeof value.mistake.correct === "string" ? value.mistake.correct : undefined,
          }
        : undefined,
    comparison:
      value?.comparison &&
      Array.isArray(value.comparison.headers) &&
      Array.isArray(value.comparison.rows)
        ? {
            title: typeof value.comparison.title === "string" ? value.comparison.title : undefined,
            headers: value.comparison.headers.filter((item): item is string => typeof item === "string"),
            rows: value.comparison.rows
              .filter((row): row is string[] => Array.isArray(row))
              .map((row) => row.filter((item): item is string => typeof item === "string")),
          }
        : undefined,
    quiz:
      value?.quiz && typeof value.quiz.question === "string"
        ? normalizeSelfTest(value.quiz)
        : undefined,
  };
}

/**
 * Normalizes one self-test record used by the rich learning article.
 * @param {Partial<SelfTest> | undefined} value Candidate self-test.
 * @returns {SelfTest} Sanitized self-test payload.
 */
function normalizeSelfTest(value?: Partial<SelfTest>): SelfTest {
  return {
    level: typeof value?.level === "string" ? value.level : undefined,
    question: typeof value?.question === "string" ? value.question : "",
    hint: typeof value?.hint === "string" ? value.hint : undefined,
    answer: typeof value?.answer === "string" ? value.answer : undefined,
    gradingCriteria: Array.isArray(value?.gradingCriteria)
      ? value.gradingCriteria
          .filter(
            (item): item is NonNullable<SelfTest["gradingCriteria"]>[number] =>
              typeof item?.criterion === "string" &&
              typeof item?.points === "number" &&
              Number.isFinite(item.points) &&
              typeof item?.description === "string"
          )
          .map((item) => ({
            criterion: item.criterion,
            points: item.points,
            description: item.description,
          }))
      : [],
  };
}

/**
 * Normalizes one source record for rich learning documents.
 * @param {Partial<SourceItem> | undefined} value Candidate source item.
 * @returns {SourceItem | null} Sanitized source or null when title/url are missing.
 */
function normalizeSourceItem(value?: Partial<SourceItem>): SourceItem | null {
  if (typeof value?.title !== "string" || typeof value.url !== "string") {
    return null;
  }

  return {
    title: value.title,
    url: value.url,
    type: typeof value.type === "string" ? value.type : undefined,
    trustLevel:
      value.trustLevel === "S" || value.trustLevel === "A" || value.trustLevel === "B" || value.trustLevel === "C"
        ? value.trustLevel
        : undefined,
  };
}

/**
 * Normalizes the rich article payload while preserving legacy section compatibility.
 * @param {Partial<Article> | undefined} value Candidate article.
 * @returns {Article | undefined} Sanitized article or undefined when incomplete.
 */
function normalizeArticle(value?: Partial<Article>): Article | undefined {
  if (!value || typeof value.conclusion !== "string") {
    return undefined;
  }

  return {
    conclusion: value.conclusion,
    keyTakeaways: Array.isArray(value.keyTakeaways)
      ? value.keyTakeaways.filter((item): item is string => typeof item === "string")
      : [],
    learningGoals: Array.isArray(value.learningGoals)
      ? value.learningGoals.filter((item): item is string => typeof item === "string")
      : [],
    plainSummary: typeof value.plainSummary === "string" ? value.plainSummary : undefined,
    plainRetell: typeof value.plainRetell === "string" ? value.plainRetell : undefined,
    strongSummary: typeof value.strongSummary === "string" ? value.strongSummary : undefined,
    sections: Array.isArray(value.sections)
      ? value.sections.map((item) => normalizeContentSection(item))
      : [],
  };
}

/**
 * Normalizes rich interview content attached to a learning topic.
 * @param {Partial<InterviewContent> | undefined} value Candidate interview content.
 * @returns {InterviewContent | undefined} Sanitized interview content or undefined when empty.
 */
function normalizeInterviewContent(value?: Partial<InterviewContent>): InterviewContent | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const normalizePoints = (points: InterviewContent["essentialPoints"]) =>
    Array.isArray(points)
      ? points
          .filter((item): item is { point: string; why?: string } => typeof item?.point === "string")
          .map((item) => ({
            point: item.point,
            why: typeof item.why === "string" ? item.why : undefined,
          }))
      : [];

  const normalized: InterviewContent = {
    question: typeof value.question === "string" ? value.question : undefined,
    questionVariants: Array.isArray(value.questionVariants)
      ? value.questionVariants.filter((item): item is string => typeof item === "string")
      : [],
    answer30s: typeof value.answer30s === "string" ? value.answer30s : undefined,
    answer2min: typeof value.answer2min === "string" ? value.answer2min : undefined,
    advancedAnswer: typeof value.advancedAnswer === "string" ? value.advancedAnswer : undefined,
    essentialPoints: normalizePoints(value.essentialPoints),
    bonusPoints: normalizePoints(value.bonusPoints),
    advancedPoints: normalizePoints(value.advancedPoints),
    deductPoints: normalizePoints(value.deductPoints),
    followUps: Array.isArray(value.followUps)
      ? value.followUps
          .filter((item): item is NonNullable<InterviewContent["followUps"]>[number] => typeof item?.question === "string")
          .map((item) => ({
            question: item.question,
            difficulty:
              item.difficulty === "easy" || item.difficulty === "medium" || item.difficulty === "hard"
                ? item.difficulty
                : undefined,
            keyAnswer: typeof item.keyAnswer === "string" ? item.keyAnswer : undefined,
          }))
      : [],
  };

  return Object.values(normalized).some((item) => (Array.isArray(item) ? item.length > 0 : Boolean(item)))
    ? normalized
    : undefined;
}

/**
 * Normalizes one topic content record.
 * @param {Partial<TopicContent> | undefined} value Candidate content value.
 * @param {string} fallbackTitle Fallback title when the payload is incomplete.
 * @returns {TopicContent} Sanitized topic content.
 */
function normalizeTopicContent(
  value: Partial<TopicContent> | undefined,
  fallbackTitle: string
): TopicContent {
  const sources = Array.isArray(value?.sources)
    ? value.sources
        .map((item) => normalizeSourceItem(item))
        .filter((item): item is SourceItem => item !== null)
    : [];

  return {
    title: typeof value?.title === "string" && value.title.trim() ? value.title : fallbackTitle,
    breadcrumb: Array.isArray(value?.breadcrumb)
      ? value.breadcrumb.filter((item): item is string => typeof item === "string")
      : [],
    quickFacts: Array.isArray(value?.quickFacts)
      ? value.quickFacts.map((item) => normalizeQuickFact(item))
      : [],
    sections: Array.isArray(value?.sections)
      ? value.sections.map((item) => normalizeContentSection(item))
      : [],
    examPoint: typeof value?.examPoint === "string" ? value.examPoint : undefined,
    summary: typeof value?.summary === "string" ? value.summary : undefined,
    scenario: typeof value?.scenario === "string" ? value.scenario : undefined,
    article: normalizeArticle(value?.article),
    selfTests: Array.isArray(value?.selfTests)
      ? value.selfTests.map((item) => normalizeSelfTest(item))
      : [],
    sources,
    interviewContent: normalizeInterviewContent(value?.interviewContent),
  };
}

/**
 * Normalizes draft summary payload.
 * @param {Partial<DraftSummary> | undefined} value Candidate draft summary.
 * @returns {DraftSummary} Sanitized draft summary payload.
 */
function normalizeDraftSummary(value?: Partial<DraftSummary>): DraftSummary {
  return {
    topic: typeof value?.topic === "string" ? value.topic : "",
    content: {
      quickFacts: Array.isArray(value?.content?.quickFacts)
        ? value.content.quickFacts.map((item) => normalizeQuickFact(item))
        : [],
      sections: Array.isArray(value?.content?.sections)
        ? value.content.sections.map((item) => normalizeContentSection(item))
        : [],
    },
  };
}

/**
 * Normalizes one draft record.
 * @param {Partial<DraftRecord> | undefined} value Candidate draft record.
 * @param {string} fallbackKbId Fallback KB identifier.
 * @param {string} fallbackDraftId Fallback draft identifier.
 * @returns {DraftRecord} Sanitized draft record.
 */
function normalizeDraftRecord(
  value: Partial<DraftRecord> | undefined,
  fallbackKbId: string,
  fallbackDraftId: string
): DraftRecord {
  const now = new Date().toISOString();
  return {
    id: typeof value?.id === "string" && value.id.trim() ? value.id : fallbackDraftId,
    kbId: typeof value?.kbId === "string" && value.kbId.trim() ? value.kbId : fallbackKbId,
    subject: typeof value?.subject === "string" && value.subject.trim() ? value.subject : "默认分类",
    summary: normalizeDraftSummary(value?.summary),
    createdAt: typeof value?.createdAt === "string" ? value.createdAt : now,
    updatedAt: typeof value?.updatedAt === "string" ? value.updatedAt : now,
    sourceIds: Array.isArray(value?.sourceIds)
      ? value.sourceIds.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : [],
    status: typeof value?.status === "string" && value.status.trim() ? value.status : "pending_review",
    pipeline: Array.isArray(value?.pipeline)
      ? value.pipeline
          .filter(
            (item): item is NonNullable<DraftRecord["pipeline"]>[number] =>
              typeof item?.key === "string" &&
              typeof item?.label === "string" &&
              typeof item?.status === "string" &&
              typeof item?.updatedAt === "string"
          )
          .map((item) => ({
            key: item.key,
            label: item.label,
            status: item.status,
            updatedAt: item.updatedAt,
            detail: typeof item.detail === "string" ? item.detail : undefined,
          }))
      : [],
    reviewNotes: Array.isArray(value?.reviewNotes)
      ? value.reviewNotes.filter((item): item is string => typeof item === "string")
      : [],
    diffSummary: Array.isArray(value?.diffSummary)
      ? value.diffSummary.filter((item): item is string => typeof item === "string")
      : [],
    publishTopicId:
      typeof value?.publishTopicId === "string"
        ? value.publishTopicId
        : value?.publishTopicId === null
          ? null
          : null,
    publishedAt:
      typeof value?.publishedAt === "string"
        ? value.publishedAt
        : value?.publishedAt === null
          ? null
          : null,
  };
}

/**
 * Normalizes one tree node recursively.
 * @param {Partial<TreeNode> | undefined} value Candidate tree node.
 * @returns {TreeNode} Sanitized tree node.
 */
function normalizeTreeNode(value?: Partial<TreeNode>): TreeNode {
  return {
    id: typeof value?.id === "string" && value.id.trim() ? value.id : "node",
    title: typeof value?.title === "string" ? value.title : "",
    children: Array.isArray(value?.children)
      ? value.children.map((item) => normalizeTreeNode(item))
      : [],
  };
}

/**
 * Normalizes one tree group record.
 * @param {Partial<TreeGroup> | undefined} value Candidate tree group.
 * @returns {TreeGroup} Sanitized tree group.
 */
function normalizeTreeGroup(value?: Partial<TreeGroup>): TreeGroup {
  return {
    id: typeof value?.id === "string" && value.id.trim() ? value.id : "group",
    title: typeof value?.title === "string" ? value.title : "",
    children: Array.isArray(value?.children)
      ? value.children.map((item) => normalizeTreeNode(item))
      : [],
  };
}

/**
 * Normalizes one KB tree payload.
 * @param {Partial<TreeData> | undefined} value Candidate tree payload.
 * @param {string} fallbackId Fallback KB identifier.
 * @param {string} fallbackTitle Fallback KB title.
 * @returns {TreeData} Sanitized KB tree.
 */
function normalizeTreeData(
  value: Partial<TreeData> | undefined,
  fallbackId: string,
  fallbackTitle: string
): TreeData {
  return {
    id: typeof value?.id === "string" && value.id.trim() ? value.id : fallbackId,
    title: typeof value?.title === "string" && value.title.trim() ? value.title : fallbackTitle,
    groups: Array.isArray(value?.groups)
      ? value.groups.map((item) => normalizeTreeGroup(item))
      : [],
  };
}

/**
 * Normalizes one KB info payload.
 * @param {Partial<KbInfo> | undefined} value Candidate KB info.
 * @returns {KbInfo} Sanitized KB info object.
 */
function normalizeKbInfo(value?: Partial<KbInfo>): KbInfo {
  return {
    id: typeof value?.id === "string" && value.id.trim() ? value.id : "kb",
    name: typeof value?.name === "string" && value.name.trim() ? value.name : "kb",
    subtitle: typeof value?.subtitle === "string" ? value.subtitle : "",
    tags: Array.isArray(value?.tags)
      ? value.tags.filter((item): item is string => typeof item === "string")
      : [],
    updatedAt: typeof value?.updatedAt === "string" ? value.updatedAt : getTodayDate(),
    stats: {
      topics:
        typeof value?.stats?.topics === "number" && Number.isFinite(value.stats.topics)
          ? value.stats.topics
          : 0,
      paths:
        typeof value?.stats?.paths === "number" && Number.isFinite(value.stats.paths)
          ? value.stats.paths
          : 0,
    },
    description: typeof value?.description === "string" ? value.description : "",
    visibility: value?.visibility === "private" ? "private" : "public",
    sortOrder:
      typeof value?.sortOrder === "number" && Number.isFinite(value.sortOrder)
        ? value.sortOrder
        : 0,
    cover: typeof value?.cover === "string" ? value.cover : "",
    defaultTopicId:
      typeof value?.defaultTopicId === "string"
        ? value.defaultTopicId
        : value?.defaultTopicId === null
          ? null
          : null,
  };
}

/**
 * Finds the owning subject for a topic based on the current KB tree.
 * @param {TreeData | undefined} tree Current KB tree data.
 * @param {string} topicId Topic identifier to resolve.
 * @returns {string} Matching subject identifier, or a safe default.
 */
function findSubjectIdForTopic(tree: TreeData | undefined, topicId: string): string {
  for (const group of tree?.groups ?? []) {
    if (group.children.some((child) => child.id === topicId)) {
      return group.id;
    }
  }

  return tree?.groups[0]?.id ?? "默认分类";
}

/**
 * Rebuilds a fully normalized database shape from partial inputs.
 * @param {Partial<LearningDatabase>} parsed Candidate database payload.
 * @returns {LearningDatabase} Fully normalized in-memory database.
 */
function normalizeDatabase(parsed: Partial<LearningDatabase>): LearningDatabase {
  const base = buildEmptyDatabase();
  const kbOrder: string[] = [];
  const seenKbIds = new Set<string>();

  /**
   * Adds a KB id to the stable iteration order once.
   * @param {string} kbId Knowledge base identifier.
   * @returns {void} Tracks the KB id for later normalization.
   */
  const trackKbId = (kbId: string): void => {
    if (!kbId || seenKbIds.has(kbId)) {
      return;
    }
    seenKbIds.add(kbId);
    kbOrder.push(kbId);
  };

  const kbSource = Array.isArray(parsed.kbs) ? parsed.kbs : [];
  for (const kbItem of kbSource) {
    const kb = normalizeKbInfo(kbItem);
    trackKbId(kb.id);
  }

  for (const kbId of Object.keys(parsed.trees ?? {})) {
    trackKbId(kbId);
  }

  for (const kbId of Object.keys(parsed.contents ?? {})) {
    trackKbId(kbId);
  }

  for (const kbId of Object.keys(parsed.drafts ?? {})) {
    trackKbId(kbId);
  }

  for (const kbId of kbOrder) {
    const rawKb = kbSource.find((item) => item?.id === kbId);
    const kb = normalizeKbInfo(rawKb ?? { id: kbId, name: kbId });
    const fallbackName = kb.name || kbId;
    const tree = normalizeTreeData((parsed.trees ?? {})[kbId], kbId, fallbackName);
    const rawContents = (parsed.contents ?? {})[kbId];
    const rawDrafts = (parsed.drafts ?? {})[kbId];

    base.contents[kbId] = {};
    if (rawContents && typeof rawContents === "object") {
      for (const [topicId, content] of Object.entries(rawContents)) {
        base.contents[kbId][topicId] = normalizeTopicContent(content, topicId);
      }
    }

    base.drafts[kbId] = {};
    if (rawDrafts && typeof rawDrafts === "object") {
      for (const [draftId, draft] of Object.entries(rawDrafts)) {
        base.drafts[kbId][draftId] = normalizeDraftRecord(draft, kbId, draftId);
      }
    }

    tree.title = kb.name || tree.title || kbId;
    kb.name = kb.name || tree.title || kbId;
    kb.stats = {
      topics: Object.keys(base.contents[kbId]).length,
      paths: tree.groups.length,
    };

    base.kbs.push(kb);
    base.trees[kbId] = tree;
  }

  return base;
}

/**
 * Normalizes the persisted compatibility index.
 * @param {Partial<LearningIndex> | null} value Candidate index payload.
 * @returns {LearningIndex} Sanitized compatibility index.
 */
function normalizeIndex(value: Partial<LearningIndex> | null): LearningIndex {
  const index = buildEmptyIndex();
  if (!value) {
    return index;
  }

  index.schemaVersion =
    typeof value.schemaVersion === "number" && Number.isFinite(value.schemaVersion)
      ? value.schemaVersion
      : STORE_SCHEMA_VERSION;
  index.migratedFromLegacyJsonAt =
    typeof value.migratedFromLegacyJsonAt === "string" ? value.migratedFromLegacyJsonAt : null;
  index.kbs = Array.isArray(value.kbs) ? value.kbs.map((item) => normalizeKbInfo(item)) : [];

  for (const kb of index.kbs) {
    index.trees[kb.id] = normalizeTreeData((value.trees ?? {})[kb.id], kb.id, kb.name);
  }

  for (const [kbId, fileMap] of Object.entries(value.topicFiles ?? {})) {
    index.topicFiles[kbId] = {};
    if (fileMap && typeof fileMap === "object") {
      for (const [topicId, relativePath] of Object.entries(fileMap)) {
        if (typeof relativePath === "string") {
          index.topicFiles[kbId][topicId] = relativePath;
        }
      }
    }
  }

  for (const [kbId, fileMap] of Object.entries(value.draftFiles ?? {})) {
    index.draftFiles[kbId] = {};
    if (fileMap && typeof fileMap === "object") {
      for (const [draftId, relativePath] of Object.entries(fileMap)) {
        if (typeof relativePath === "string") {
          index.draftFiles[kbId][draftId] = relativePath;
        }
      }
    }
  }

  return index;
}

/**
 * Loads the file-store index from disk.
 * @returns {LearningIndex | null} Normalized index payload, or `null` when absent.
 */
function loadIndex(): LearningIndex | null {
  const parsed = readJsonFile<Partial<LearningIndex>>(INDEX_PATH);
  return parsed ? normalizeIndex(parsed) : null;
}

/**
 * Loads and normalizes the legacy monolithic JSON file.
 * @returns {LearningDatabase | null} Legacy learning payload, or `null` when absent.
 */
function loadLegacyDatabase(): LearningDatabase | null {
  const parsed = readJsonFile<Partial<LearningDatabase>>(LEGACY_DB_PATH);
  return parsed ? normalizeDatabase(parsed) : null;
}

/**
 * Ensures the content store scaffolding exists before reading or writing.
 * @returns {void} Creates the root content-store folders when needed.
 */
function ensureStoreScaffold(): void {
  ensureDirectory(path.dirname(LEGACY_DB_PATH));
  ensureDirectory(STORE_ROOT);
  ensureDirectory(KBS_ROOT);
  ensureDirectory(DRAFTS_ROOT);
}

/**
 * Persists the normalized database into the file-first content store and its compatibility index.
 * @param {LearningDatabase} data Database snapshot to persist.
 * @param {{ migratedFromLegacyJsonAt?: string | null }} [options] Optional migration metadata.
 * @returns {void} Writes KB files, topic files, draft files, and index files to disk.
 */
function persistStore(
  data: LearningDatabase,
  options?: { migratedFromLegacyJsonAt?: string | null }
): void {
  ensureStoreScaffold();

  const normalized = normalizeDatabase(data);
  const previousIndex = loadIndex() ?? buildEmptyIndex();
  const nextIndex = buildEmptyIndex();
  nextIndex.migratedFromLegacyJsonAt =
    options?.migratedFromLegacyJsonAt ?? previousIndex.migratedFromLegacyJsonAt;

  const nextKbIds = new Set<string>();

  for (const kb of normalized.kbs) {
    nextKbIds.add(kb.id);
    nextIndex.kbs.push(kb);
    nextIndex.trees[kb.id] = normalized.trees[kb.id];
    nextIndex.topicFiles[kb.id] = {};
    nextIndex.draftFiles[kb.id] = {};

    writeJsonFile(getKbMetaPath(kb.id), kb);
    writeJsonFile(getKbTreePath(kb.id), normalized.trees[kb.id]);

    for (const [topicId, content] of Object.entries(normalized.contents[kb.id] ?? {})) {
      const subjectId = findSubjectIdForTopic(normalized.trees[kb.id], topicId);
      const filePath = getTopicFilePath(kb.id, topicId);
      const storedTopic: StoredTopicRecord = {
        kbId: kb.id,
        topicId,
        subjectId,
        updatedAt: kb.updatedAt,
        content,
      };

      writeJsonFile(filePath, storedTopic);
      nextIndex.topicFiles[kb.id][topicId] = path.relative(STORE_ROOT, filePath);
    }

    const drafts = normalized.drafts[kb.id] ?? {};
    if (Object.keys(drafts).length > 0) {
      ensureDirectory(getDraftDirectoryPath(kb.id));
    }

    for (const [draftId, draft] of Object.entries(drafts)) {
      const filePath = getDraftFilePath(kb.id, draftId);
      writeJsonFile(filePath, draft);
      nextIndex.draftFiles[kb.id][draftId] = path.relative(STORE_ROOT, filePath);
    }
  }

  for (const previousKb of previousIndex.kbs) {
    if (!nextKbIds.has(previousKb.id)) {
      removeDirectoryIfExists(getKbDirectoryPath(previousKb.id));
      removeDirectoryIfExists(getDraftDirectoryPath(previousKb.id));
    }
  }

  for (const [kbId, fileMap] of Object.entries(previousIndex.topicFiles)) {
    const nextFileMap = nextIndex.topicFiles[kbId] ?? {};
    for (const [topicId, relativePath] of Object.entries(fileMap)) {
      if (!(topicId in nextFileMap)) {
        removeFileIfExists(path.join(STORE_ROOT, relativePath));
      }
    }
  }

  for (const [kbId, fileMap] of Object.entries(previousIndex.draftFiles)) {
    const nextFileMap = nextIndex.draftFiles[kbId] ?? {};
    for (const [draftId, relativePath] of Object.entries(fileMap)) {
      if (!(draftId in nextFileMap)) {
        removeFileIfExists(path.join(STORE_ROOT, relativePath));
      }
    }

    if (Object.keys(nextFileMap).length === 0) {
      removeDirectoryIfExists(getDraftDirectoryPath(kbId));
    }
  }

  writeJsonFile(INDEX_PATH, nextIndex);
}

/**
 * Initializes the file-first store and imports legacy JSON once when needed.
 * @returns {void} Ensures the new store is ready for subsequent reads and writes.
 */
function initializeStore(): void {
  ensureStoreScaffold();
  if (fs.existsSync(INDEX_PATH)) {
    return;
  }

  const legacyData = loadLegacyDatabase();
  if (legacyData) {
    persistStore(legacyData, { migratedFromLegacyJsonAt: new Date().toISOString() });
    return;
  }

  writeJsonFile(INDEX_PATH, buildEmptyIndex());
}

/**
 * Reads the file-first store and rehydrates the legacy-compatible in-memory shape.
 * @returns {LearningDatabase} Aggregated learning payload for current API consumers.
 */
function readStoreData(): LearningDatabase {
  initializeStore();
  const index = loadIndex() ?? buildEmptyIndex();
  const data: LearningDatabase = {
    kbs: index.kbs,
    trees: index.trees,
    contents: {},
    drafts: {},
  };

  for (const kb of index.kbs) {
    data.contents[kb.id] = {};
    data.drafts[kb.id] = {};

    for (const [topicId, relativePath] of Object.entries(index.topicFiles[kb.id] ?? {})) {
      const stored = readJsonFile<StoredTopicRecord>(path.join(STORE_ROOT, relativePath));
      if (!stored) {
        continue;
      }

      data.contents[kb.id][topicId] = normalizeTopicContent(stored.content, topicId);
    }

    for (const [draftId, relativePath] of Object.entries(index.draftFiles[kb.id] ?? {})) {
      const stored = readJsonFile<Partial<DraftRecord>>(path.join(STORE_ROOT, relativePath));
      if (!stored) {
        continue;
      }

      data.drafts[kb.id][draftId] = normalizeDraftRecord(stored, kb.id, draftId);
    }
  }

  return normalizeDatabase(data);
}

let cachedLearningData: LearningDatabase | null = null;

/**
 * 返回当前进程内缓存的学习中心聚合数据，首次读取时才从磁盘重建。
 * @returns {LearningDatabase} 适合当前请求直接复用的学习中心数据快照。
 */
function getCachedStoreData(): LearningDatabase {
  if (cachedLearningData) {
    return cachedLearningData;
  }

  cachedLearningData = readStoreData();
  return cachedLearningData;
}

/**
 * 失效当前进程内的学习中心聚合缓存，确保下次读取能拿到最新磁盘数据。
 * @returns {void} 清空内存缓存。
 */
function invalidateLearningDataCache(): void {
  cachedLearningData = null;
}

export const learningDb = {
  /**
   * Ensures the file-first content store exists and runs legacy JSON migration once.
   * @returns {void} Initializes the learning store in place.
   */
  _init() {
    initializeStore();
  },

  /**
   * Reads the current learning database from the file-first content store.
   * @returns {LearningDatabase} Legacy-compatible aggregate payload for routes and pages.
   */
  _read(): LearningDatabase {
    return getCachedStoreData();
  },

  /**
   * Persists the in-memory learning database back into the file-first content store.
   * @param {LearningDatabase} data Database snapshot to write.
   * @returns {void} Updates KB metadata, taxonomy, published content, drafts, and index files.
   */
  _write(data: LearningDatabase) {
    invalidateLearningDataCache();
    persistStore(data);
    cachedLearningData = normalizeDatabase(data);
  },

  /**
   * Returns the current learning-center data in the existing API response shape.
   * @returns {LearningDatabase} Aggregated learning-center data for current consumers.
   */
  getLearningData() {
    return this._read();
  },

  /**
   * Creates or updates a knowledge base record while keeping the current API contract unchanged.
   * @param {KbInfo} kb Incoming knowledge-base metadata.
   * @returns {void} Stores the KB metadata and ensures a matching tree/content container exists.
   */
  createKb(kb: KbInfo) {
    const data = this._read();
    const normalizedKb = normalizeKbInfo(kb);
    const existing = data.kbs.find((item) => item.id === normalizedKb.id);

    if (!existing) {
      data.kbs.push(normalizedKb);
      data.trees[normalizedKb.id] = normalizeTreeData(undefined, normalizedKb.id, normalizedKb.name);
      data.contents[normalizedKb.id] = data.contents[normalizedKb.id] ?? {};
      data.drafts[normalizedKb.id] = data.drafts[normalizedKb.id] ?? {};
      this._write(data);
      return;
    }

    existing.name = normalizedKb.name || existing.name;
    existing.subtitle = normalizedKb.subtitle;
    existing.tags = normalizedKb.tags;
    existing.updatedAt = normalizedKb.updatedAt || existing.updatedAt;
    existing.description = normalizedKb.description;
    existing.visibility = normalizedKb.visibility;
    existing.sortOrder = normalizedKb.sortOrder;
    existing.cover = normalizedKb.cover;
    existing.defaultTopicId = normalizedKb.defaultTopicId;

    data.trees[normalizedKb.id] = normalizeTreeData(
      data.trees[normalizedKb.id],
      normalizedKb.id,
      existing.name
    );
    data.trees[normalizedKb.id].title = existing.name;
    data.contents[normalizedKb.id] = data.contents[normalizedKb.id] ?? {};
    data.drafts[normalizedKb.id] = data.drafts[normalizedKb.id] ?? {};
    this._write(data);
  },

  /**
   * Ensures a subject group exists inside a knowledge base.
   * @param {string} kbId Knowledge-base identifier.
   * @param {string} subjectId Subject identifier.
   * @param {string} [subjectTitle] Optional display title for the subject.
   * @returns {void} Creates or updates the subject group.
   */
  ensureSubject(kbId: string, subjectId: string, subjectTitle?: string) {
    const data = this._read();
    const today = getTodayDate();

    let kb = data.kbs.find((item) => item.id === kbId);
    if (!kb) {
      kb = normalizeKbInfo({
        id: kbId,
        name: kbId,
        updatedAt: today,
      });
      data.kbs.push(kb);
    }

    data.trees[kbId] = normalizeTreeData(data.trees[kbId], kbId, kb.name);
    data.contents[kbId] = data.contents[kbId] ?? {};
    data.drafts[kbId] = data.drafts[kbId] ?? {};

    let group = data.trees[kbId].groups.find((item) => item.id === subjectId);
    if (!group) {
      group = { id: subjectId, title: subjectTitle || subjectId, children: [] };
      data.trees[kbId].groups.push(group);
      kb.updatedAt = today;
    } else if (subjectTitle && group.title !== subjectTitle) {
      group.title = subjectTitle;
      kb.updatedAt = today;
    }

    this._write(data);
  },

  /**
   * Adds a subject to a knowledge base as a named alias of `ensureSubject`.
   * @param {string} kbId Knowledge-base identifier.
   * @param {string} subjectId Subject identifier.
   * @param {string} subjectTitle Subject display title.
   * @returns {void} Creates or updates the target subject group.
   */
  addSubject(kbId: string, subjectId: string, subjectTitle: string) {
    this.ensureSubject(kbId, subjectId, subjectTitle);
  },

  /**
   * Adds an empty topic shell so the admin can fill it later.
   * @param {string} kbId Knowledge-base identifier.
   * @param {string} subjectId Subject identifier.
   * @param {string} topicId Topic identifier.
   * @param {string} topicTitle Topic title.
   * @returns {void} Creates a topic entry with empty content sections when absent.
   */
  addEmptyTopic(kbId: string, subjectId: string, topicId: string, topicTitle: string) {
    const data = this._read();
    const today = getTodayDate();

    let kb = data.kbs.find((item) => item.id === kbId);
    if (!kb) {
      kb = normalizeKbInfo({
        id: kbId,
        name: kbId,
        updatedAt: today,
      });
      data.kbs.push(kb);
    }

    data.trees[kbId] = normalizeTreeData(data.trees[kbId], kbId, kb.name);
    data.contents[kbId] = data.contents[kbId] ?? {};
    data.drafts[kbId] = data.drafts[kbId] ?? {};

    let group = data.trees[kbId].groups.find((item) => item.id === subjectId);
    if (!group) {
      group = { id: subjectId, title: subjectId, children: [] };
      data.trees[kbId].groups.push(group);
    }

    const existingChild = group.children.find((item) => item.id === topicId);
    if (!existingChild) {
      group.children.push({ id: topicId, title: topicTitle, children: [] });
    } else {
      existingChild.title = topicTitle;
    }

    if (!data.contents[kbId][topicId]) {
      data.contents[kbId][topicId] = {
        title: topicTitle,
        breadcrumb: [kb.name, group.title, topicTitle],
        quickFacts: [],
        sections: [],
      };
      kb.updatedAt = today;
    }

    this._write(data);
  },

  /**
   * Replaces the taxonomy tree for one knowledge base and backfills empty topic shells.
   * @param {string} kbId Knowledge-base identifier.
   * @param {TreeData} treeData New taxonomy payload.
   * @returns {void} Stores the taxonomy and ensures all referenced topics exist.
   */
  saveTaxonomy(kbId: string, treeData: TreeData) {
    const data = this._read();
    const today = getTodayDate();

    let kb = data.kbs.find((item) => item.id === kbId);
    if (!kb) {
      kb = normalizeKbInfo({
        id: kbId,
        name: kbId,
        updatedAt: today,
      });
      data.kbs.push(kb);
    }

    data.trees[kbId] = normalizeTreeData(treeData, kbId, kb.name);
    data.trees[kbId].title = kb.name;
    data.contents[kbId] = data.contents[kbId] ?? {};
    data.drafts[kbId] = data.drafts[kbId] ?? {};

    for (const group of data.trees[kbId].groups) {
      for (const child of group.children) {
        if (!data.contents[kbId][child.id]) {
          data.contents[kbId][child.id] = {
            title: child.title,
            breadcrumb: [kb.name, group.title, child.title],
            quickFacts: [],
            sections: [],
          };
        }
      }
    }

    kb.updatedAt = today;
    this._write(data);
  },

  /**
   * Stores published topic content inside the file-first content store.
   * @param {string} kbId Knowledge-base identifier.
   * @param {string} subject Subject identifier.
   * @param {string} topicId Topic identifier.
   * @param {TopicContent} content Published topic content payload.
   * @returns {void} Creates or updates the topic and its tree placement.
   */
  addContent(kbId: string, subject: string, topicId: string, content: TopicContent) {
    const data = this._read();
    const today = getTodayDate();

    let kb = data.kbs.find((item) => item.id === kbId);
    if (!kb) {
      kb = normalizeKbInfo({
        id: kbId,
        name: kbId,
        updatedAt: today,
      });
      data.kbs.push(kb);
    }

    data.trees[kbId] = normalizeTreeData(data.trees[kbId], kbId, kb.name);
    data.contents[kbId] = data.contents[kbId] ?? {};
    data.drafts[kbId] = data.drafts[kbId] ?? {};

    let group = data.trees[kbId].groups.find((item) => item.id === subject);
    if (!group) {
      group = { id: subject, title: subject, children: [] };
      data.trees[kbId].groups.push(group);
    }

    const existingChild = group.children.find((item) => item.id === topicId);
    if (!existingChild) {
      group.children.push({ id: topicId, title: content.title, children: [] });
    } else {
      existingChild.title = content.title;
    }

    data.contents[kbId][topicId] = normalizeTopicContent(content, topicId);
    if (data.contents[kbId][topicId].breadcrumb.length === 0) {
      data.contents[kbId][topicId].breadcrumb = [kb.name, group.title, data.contents[kbId][topicId].title];
    }

    kb.updatedAt = today;
    this._write(data);
  },

  /**
   * Creates a draft record for unpublished generated content.
   * @param {string} kbId Knowledge-base identifier.
   * @param {string} subject Subject identifier.
   * @param {DraftSummary} summary Draft summary payload.
   * @returns {string} Newly generated draft identifier.
   */
  createDraft(
    kbId: string,
    subject: string,
    summary: DraftSummary,
    options?: Partial<
      Pick<
        DraftRecord,
        "sourceIds" | "status" | "pipeline" | "reviewNotes" | "diffSummary" | "publishTopicId" | "publishedAt"
      >
    >
  ) {
    const data = this._read();
    const today = getTodayDate();

    let kb = data.kbs.find((item) => item.id === kbId);
    if (!kb) {
      kb = normalizeKbInfo({
        id: kbId,
        name: kbId,
        updatedAt: today,
      });
      data.kbs.push(kb);
    }

    data.trees[kbId] = normalizeTreeData(data.trees[kbId], kbId, kb.name);
    data.contents[kbId] = data.contents[kbId] ?? {};
    data.drafts[kbId] = data.drafts[kbId] ?? {};

    const now = new Date().toISOString();
    const draftId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const draft = normalizeDraftRecord(
      {
        id: draftId,
        kbId,
        subject,
        summary,
        createdAt: now,
        updatedAt: now,
        sourceIds: options?.sourceIds ?? [],
        status: options?.status ?? "pending_review",
        pipeline: options?.pipeline ?? [],
        reviewNotes: options?.reviewNotes ?? [],
        diffSummary: options?.diffSummary ?? [],
        publishTopicId: options?.publishTopicId ?? null,
        publishedAt: options?.publishedAt ?? null,
      },
      kbId,
      draftId
    );

    data.drafts[kbId][draftId] = draft;
    this._write(data);
    return draftId;
  },

  /**
   * Reads one draft record from the compatibility view.
   * @param {string} kbId Knowledge-base identifier.
   * @param {string} draftId Draft identifier.
   * @returns {DraftRecord | null} Matching draft record, or `null` when absent.
   */
  getDraft(kbId: string, draftId: string) {
    const data = this._read();
    return data.drafts?.[kbId]?.[draftId] ?? null;
  },

  /**
   * Updates one draft record in place.
   * @param {string} kbId Knowledge-base identifier.
   * @param {string} draftId Draft identifier.
   * @param {DraftSummary} summary Updated draft summary.
   * @returns {DraftRecord | null} Updated draft record, or `null` when absent.
   */
  updateDraft(
    kbId: string,
    draftId: string,
    summary: DraftSummary,
    options?: Partial<
      Pick<
        DraftRecord,
        "sourceIds" | "status" | "pipeline" | "reviewNotes" | "diffSummary" | "publishTopicId" | "publishedAt"
      >
    >
  ) {
    const data = this._read();
    const draft = data.drafts?.[kbId]?.[draftId];
    if (!draft) {
      return null;
    }

    draft.summary = normalizeDraftSummary(summary);
    draft.updatedAt = new Date().toISOString();
    if (options?.sourceIds) {
      draft.sourceIds = options.sourceIds.filter((item) => typeof item === "string" && item.trim().length > 0);
    }
    if (typeof options?.status === "string" && options.status.trim()) {
      draft.status = options.status;
    }
    if (Array.isArray(options?.pipeline)) {
      draft.pipeline = options.pipeline;
    }
    if (Array.isArray(options?.reviewNotes)) {
      draft.reviewNotes = options.reviewNotes.filter((item) => typeof item === "string");
    }
    if (Array.isArray(options?.diffSummary)) {
      draft.diffSummary = options.diffSummary.filter((item) => typeof item === "string");
    }
    if (typeof options?.publishTopicId === "string" || options?.publishTopicId === null) {
      draft.publishTopicId = options.publishTopicId;
    }
    if (typeof options?.publishedAt === "string" || options?.publishedAt === null) {
      draft.publishedAt = options.publishedAt;
    }
    data.drafts[kbId][draftId] = draft;
    this._write(data);
    return draft;
  },

  /**
   * Deletes one draft record from the file-first draft store.
   * @param {string} kbId Knowledge-base identifier.
   * @param {string} draftId Draft identifier.
   * @returns {boolean} `true` when the draft existed and was removed.
   */
  deleteDraft(kbId: string, draftId: string) {
    const data = this._read();
    if (!data.drafts?.[kbId]?.[draftId]) {
      return false;
    }

    delete data.drafts[kbId][draftId];
    if (Object.keys(data.drafts[kbId]).length === 0) {
      delete data.drafts[kbId];
    }

    this._write(data);
    return true;
  },

  /**
   * Deletes one knowledge base together with all published topics and drafts.
   * @param {string} kbId Knowledge-base identifier.
   * @returns {boolean} `true` when the KB existed and was removed.
   */
  deleteKb(kbId: string) {
    const data = this._read();
    const index = data.kbs.findIndex((item) => item.id === kbId);
    if (index === -1) {
      return false;
    }

    data.kbs.splice(index, 1);
    delete data.trees[kbId];
    delete data.contents[kbId];
    delete data.drafts[kbId];
    this._write(data);
    return true;
  },

  /**
   * Resets the full learning-center file store to an empty state.
   * @returns {void} Clears all banks, topics, drafts, and compatibility index data.
   */
  resetAll() {
    persistStore(buildEmptyDatabase());
  },

  /**
   * Deletes one topic from both the taxonomy tree and the published content store.
   * @param {string} kbId Knowledge-base identifier.
   * @param {string} subjectId Subject identifier.
   * @param {string} topicId Topic identifier.
   * @returns {boolean} `true` when the topic existed and was removed.
   */
  deleteTopic(kbId: string, subjectId: string, topicId: string) {
    const data = this._read();
    const kb = data.kbs.find((item) => item.id === kbId);
    const tree = data.trees[kbId];
    if (!kb || !tree) {
      return false;
    }

    const group = tree.groups.find((item) => item.id === subjectId);
    if (!group) {
      return false;
    }

    const childIndex = group.children.findIndex((item) => item.id === topicId);
    if (childIndex === -1) {
      return false;
    }

    group.children.splice(childIndex, 1);
    if (group.children.length === 0) {
      tree.groups = tree.groups.filter((item) => item.id !== subjectId);
    }

    if (data.contents[kbId]?.[topicId]) {
      delete data.contents[kbId][topicId];
    }

    kb.updatedAt = getTodayDate();
    this._write(data);
    return true;
  },
};
