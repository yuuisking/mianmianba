import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import {
  learningDb,
  type DraftRecord,
  type DraftSummary,
  type KbInfo,
  type LearningDatabase,
  type TreeData,
} from "@/lib/db/learningDb";

export type DraftWorkflowStatus =
  | "pending_review"
  | "reviewing"
  | "ready_to_publish"
  | "published";

export type PipelineStepState = "pending" | "running" | "completed" | "failed";

export type PipelineStepStatus = {
  key: string;
  label: string;
  status: PipelineStepState;
  updatedAt: string;
  detail?: string;
};

export type SourceType =
  | "manual_text"
  | "manual_url"
  | "github_directory"
  | "github_markdown"
  | "web_page"
  | "yuque";

export type SourceMode = "manual" | "batch" | "scheduled";

export type SourceStatus = "queued" | "ingesting" | "drafted" | "published" | "failed";
export type SourceCategory = "official" | "community" | "github";
export type SourceQualityGate = "accepted" | "rejected";
export type SourceBoundaryVerdict = "in_scope" | "out_of_scope";

export type SourceRecord = {
  id: string;
  kbId: string;
  type: SourceType;
  mode: SourceMode;
  status: SourceStatus;
  title: string;
  url: string;
  subject: string;
  whitelist: boolean;
  dedupeKey: string;
  excerpt: string;
  draftId: string | null;
  topicId: string | null;
  createdAt: string;
  updatedAt: string;
  lastIngestedAt: string | null;
  error: string | null;
  category: SourceCategory;
  authorityScore: number;
  freshnessScore: number;
  qualityScore: number;
  qualityGate: SourceQualityGate;
  boundaryVerdict: SourceBoundaryVerdict;
  selectionReason: string;
};

export type ScheduleRecord = {
  id: string;
  kbId: string;
  name: string;
  cron: string;
  sourceType: SourceType;
  target: string;
  whitelist: boolean;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  lastRunAt: string | null;
  nextRunAt: string | null;
};

export type PublishRecord = {
  id: string;
  kbId: string;
  draftId: string;
  topicId: string;
  title: string;
  sourceIds: string[];
  publishedAt: string;
  summary: string;
};

type LearningFactoryState = {
  sources: SourceRecord[];
  schedules: ScheduleRecord[];
  publishRecords: PublishRecord[];
};

export type KnowledgeFactoryOverview = KbInfo & {
  draftCount: number;
  readyDraftCount: number;
  reviewingDraftCount: number;
  sourceCount: number;
  scheduledSourceCount: number;
  publishedCount: number;
  latestPublishAt: string | null;
  latestPublishTitle: string | null;
};

export type KnowledgeFactorySnapshot = {
  stats: {
    kbCount: number;
    draftCount: number;
    readyDraftCount: number;
    sourceCount: number;
    scheduledSourceCount: number;
    publishedCount: number;
  };
  kbs: KnowledgeFactoryOverview[];
  tree: TreeData | null;
  drafts: DraftRecord[];
  sources: SourceRecord[];
  schedules: ScheduleRecord[];
  publishRecords: PublishRecord[];
};

export type RegisterSourceInput = {
  kbId: string;
  type: SourceType;
  mode: SourceMode;
  title?: string;
  url?: string;
  subject?: string;
  whitelist?: boolean;
  excerpt?: string;
  category?: SourceCategory;
  authorityScore?: number;
  freshnessScore?: number;
  qualityScore?: number;
  qualityGate?: SourceQualityGate;
  boundaryVerdict?: SourceBoundaryVerdict;
  selectionReason?: string;
};

export type DraftWorkflowUpdate = {
  summary: DraftSummary;
  status?: DraftWorkflowStatus;
  reviewNotes?: string[];
  diffSummary?: string[];
};

export type ScheduleInput = {
  scheduleId?: string;
  kbId: string;
  name: string;
  cron: string;
  sourceType: SourceType;
  target: string;
  whitelist?: boolean;
  enabled?: boolean;
  nextRunAt?: string | null;
};

const STORE_ROOT = path.join(process.cwd(), "data", "learning-center");
const ADMIN_STATE_PATH = path.join(STORE_ROOT, "admin-state.json");

/**
 * Returns the current timestamp in ISO-8601 format.
 * @returns {string} Timestamp string used across the knowledge factory state.
 */
function getNowIso(): string {
  return new Date().toISOString();
}

/**
 * Ensures the learning-center store exists before reading or writing sidecar state.
 * @returns {void} Creates the parent directory when needed.
 */
function ensureFactoryStore(): void {
  if (!fs.existsSync(STORE_ROOT)) {
    fs.mkdirSync(STORE_ROOT, { recursive: true });
  }
}

/**
 * Reads and parses a JSON sidecar file.
 * @template T
 * @param {string} filePath Absolute target file path.
 * @returns {T | null} Parsed payload, or `null` when the file is absent or invalid.
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
 * Persists JSON to the sidecar state file using a stable pretty format.
 * @param {string} filePath Absolute target file path.
 * @param {unknown} value Serializable payload to write.
 * @returns {void} Writes the file atomically inside the current process.
 */
function writeJsonFile(filePath: string, value: unknown): void {
  ensureFactoryStore();
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf-8");
}

/**
 * Normalizes a pipeline step item persisted on drafts.
 * @param {Partial<PipelineStepStatus> | undefined} value Raw pipeline step payload.
 * @returns {PipelineStepStatus} Sanitized pipeline step.
 */
function normalizePipelineStep(value?: Partial<PipelineStepStatus>): PipelineStepStatus {
  return {
    key: typeof value?.key === "string" && value.key.trim() ? value.key : "step",
    label: typeof value?.label === "string" && value.label.trim() ? value.label : "步骤",
    status:
      value?.status === "running" ||
      value?.status === "completed" ||
      value?.status === "failed"
        ? value.status
        : "pending",
    updatedAt: typeof value?.updatedAt === "string" ? value.updatedAt : getNowIso(),
    detail: typeof value?.detail === "string" ? value.detail : undefined,
  };
}

/**
 * Builds the default multi-AI pipeline state for one draft.
 * @param {DraftWorkflowStatus} status Current draft workflow status.
 * @param {string} updatedAt Timestamp used for the synthesized pipeline items.
 * @returns {PipelineStepStatus[]} Ordered pipeline state for UI display.
 */
function buildDraftPipeline(status: DraftWorkflowStatus, updatedAt: string): PipelineStepStatus[] {
  const reviewStatus: PipelineStepState =
    status === "reviewing"
      ? "running"
      : status === "ready_to_publish" || status === "published"
        ? "completed"
        : "pending";
  const publishStatus: PipelineStepState = status === "published" ? "completed" : "pending";

  return [
    { key: "source_capture", label: "来源采集", status: "completed", updatedAt },
    { key: "route_classify", label: "目录路由", status: "completed", updatedAt },
    { key: "summary_generate", label: "多 AI 汇总", status: "completed", updatedAt },
    { key: "draft_review", label: "草稿审核", status: reviewStatus, updatedAt },
    { key: "publish_sync", label: "发布同步", status: publishStatus, updatedAt },
  ];
}

/**
 * Normalizes one source record from the sidecar state file.
 * @param {Partial<SourceRecord> | undefined} value Raw source record payload.
 * @returns {SourceRecord} Sanitized source record.
 */
function normalizeSourceRecord(value?: Partial<SourceRecord>): SourceRecord {
  const now = getNowIso();
  return {
    id: typeof value?.id === "string" && value.id.trim() ? value.id : `source-${Date.now().toString(36)}`,
    kbId: typeof value?.kbId === "string" ? value.kbId : "",
    type:
      value?.type === "manual_url" ||
      value?.type === "github_directory" ||
      value?.type === "github_markdown" ||
      value?.type === "web_page" ||
      value?.type === "yuque"
        ? value.type
        : "manual_text",
    mode: value?.mode === "batch" || value?.mode === "scheduled" ? value.mode : "manual",
    status:
      value?.status === "ingesting" ||
      value?.status === "drafted" ||
      value?.status === "published" ||
      value?.status === "failed"
        ? value.status
        : "queued",
    title: typeof value?.title === "string" ? value.title : "",
    url: typeof value?.url === "string" ? value.url : "",
    subject: typeof value?.subject === "string" ? value.subject : "",
    whitelist: Boolean(value?.whitelist),
    dedupeKey: typeof value?.dedupeKey === "string" ? value.dedupeKey : "",
    excerpt: typeof value?.excerpt === "string" ? value.excerpt : "",
    draftId: typeof value?.draftId === "string" ? value.draftId : null,
    topicId: typeof value?.topicId === "string" ? value.topicId : null,
    createdAt: typeof value?.createdAt === "string" ? value.createdAt : now,
    updatedAt: typeof value?.updatedAt === "string" ? value.updatedAt : now,
    lastIngestedAt: typeof value?.lastIngestedAt === "string" ? value.lastIngestedAt : null,
    error: typeof value?.error === "string" ? value.error : null,
    category:
      value?.category === "official" || value?.category === "github" ? value.category : "community",
    authorityScore:
      typeof value?.authorityScore === "number" && Number.isFinite(value.authorityScore)
        ? value.authorityScore
        : 0,
    freshnessScore:
      typeof value?.freshnessScore === "number" && Number.isFinite(value.freshnessScore)
        ? value.freshnessScore
        : 0,
    qualityScore:
      typeof value?.qualityScore === "number" && Number.isFinite(value.qualityScore)
        ? value.qualityScore
        : 0,
    qualityGate: value?.qualityGate === "rejected" ? "rejected" : "accepted",
    boundaryVerdict: value?.boundaryVerdict === "out_of_scope" ? "out_of_scope" : "in_scope",
    selectionReason: typeof value?.selectionReason === "string" ? value.selectionReason : "",
  };
}

/**
 * Normalizes one schedule record from the sidecar state file.
 * @param {Partial<ScheduleRecord> | undefined} value Raw schedule payload.
 * @returns {ScheduleRecord} Sanitized schedule record.
 */
function normalizeScheduleRecord(value?: Partial<ScheduleRecord>): ScheduleRecord {
  const now = getNowIso();
  return {
    id: typeof value?.id === "string" && value.id.trim() ? value.id : `schedule-${Date.now().toString(36)}`,
    kbId: typeof value?.kbId === "string" ? value.kbId : "",
    name: typeof value?.name === "string" ? value.name : "",
    cron: typeof value?.cron === "string" ? value.cron : "0 9 * * *",
    sourceType:
      value?.sourceType === "manual_url" ||
      value?.sourceType === "github_directory" ||
      value?.sourceType === "github_markdown" ||
      value?.sourceType === "web_page" ||
      value?.sourceType === "yuque"
        ? value.sourceType
        : "manual_text",
    target: typeof value?.target === "string" ? value.target : "",
    whitelist: Boolean(value?.whitelist),
    enabled: value?.enabled !== false,
    createdAt: typeof value?.createdAt === "string" ? value.createdAt : now,
    updatedAt: typeof value?.updatedAt === "string" ? value.updatedAt : now,
    lastRunAt: typeof value?.lastRunAt === "string" ? value.lastRunAt : null,
    nextRunAt: typeof value?.nextRunAt === "string" ? value.nextRunAt : null,
  };
}

/**
 * Normalizes one publish record from the sidecar state file.
 * @param {Partial<PublishRecord> | undefined} value Raw publish payload.
 * @returns {PublishRecord} Sanitized publish record.
 */
function normalizePublishRecord(value?: Partial<PublishRecord>): PublishRecord {
  const now = getNowIso();
  return {
    id: typeof value?.id === "string" && value.id.trim() ? value.id : `publish-${Date.now().toString(36)}`,
    kbId: typeof value?.kbId === "string" ? value.kbId : "",
    draftId: typeof value?.draftId === "string" ? value.draftId : "",
    topicId: typeof value?.topicId === "string" ? value.topicId : "",
    title: typeof value?.title === "string" ? value.title : "",
    sourceIds: Array.isArray(value?.sourceIds)
      ? value.sourceIds.filter((item): item is string => typeof item === "string")
      : [],
    publishedAt: typeof value?.publishedAt === "string" ? value.publishedAt : now,
    summary: typeof value?.summary === "string" ? value.summary : "",
  };
}

/**
 * Normalizes the full knowledge factory sidecar state.
 * @param {Partial<LearningFactoryState> | null} value Raw state payload.
 * @returns {LearningFactoryState} Sanitized knowledge factory state.
 */
function normalizeFactoryState(value: Partial<LearningFactoryState> | null): LearningFactoryState {
  return {
    sources: Array.isArray(value?.sources) ? value.sources.map((item) => normalizeSourceRecord(item)) : [],
    schedules: Array.isArray(value?.schedules)
      ? value.schedules.map((item) => normalizeScheduleRecord(item))
      : [],
    publishRecords: Array.isArray(value?.publishRecords)
      ? value.publishRecords.map((item) => normalizePublishRecord(item))
      : [],
  };
}

/**
 * Loads the persisted knowledge factory sidecar state.
 * @returns {LearningFactoryState} Current admin sidecar state.
 */
function readFactoryState(): LearningFactoryState {
  ensureFactoryStore();
  const parsed = readJsonFile<Partial<LearningFactoryState>>(ADMIN_STATE_PATH);
  return normalizeFactoryState(parsed);
}

/**
 * Writes the knowledge factory sidecar state back to disk.
 * @param {LearningFactoryState} state Factory state snapshot to persist.
 * @returns {void} Saves the sidecar file.
 */
function writeFactoryState(state: LearningFactoryState): void {
  writeJsonFile(ADMIN_STATE_PATH, normalizeFactoryState(state));
}

/**
 * Builds a stable dedupe key for one source input.
 * @param {RegisterSourceInput} input Source creation payload.
 * @returns {string} SHA-1 digest used for source de-duplication.
 */
function buildSourceDedupeKey(input: RegisterSourceInput): string {
  const seed = [
    input.kbId.trim(),
    input.type,
    (input.url || "").trim(),
    (input.title || "").trim(),
    (input.subject || "").trim(),
    (input.excerpt || "").trim().slice(0, 400),
  ].join("::");
  return createHash("sha1").update(seed).digest("hex");
}

/**
 * Builds a stable topic slug from the draft title.
 * @param {string} topic Draft topic title.
 * @returns {string} URL-safe topic identifier.
 */
function makeTopicId(topic: string): string {
  const encoded = encodeURIComponent(topic.trim()).toLowerCase();
  const safe = encoded
    .replace(/%/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return safe || Date.now().toString(36);
}

/**
 * Derives a short publish summary string from a draft payload.
 * @param {DraftRecord} draft Draft record about to be published.
 * @returns {string} Human-readable publish summary for audit history.
 */
function buildPublishSummary(draft: DraftRecord): string {
  const sectionCount = draft.summary.content.sections?.length ?? 0;
  const factCount = draft.summary.content.quickFacts?.length ?? 0;
  return `发布 ${sectionCount} 个小节，附带 ${factCount} 条核心摘要。`;
}

/**
 * Sorts drafts from newest to oldest for admin review screens.
 * @param {DraftRecord[]} drafts Draft list to sort.
 * @returns {DraftRecord[]} Sorted draft list.
 */
function sortDrafts(drafts: DraftRecord[]): DraftRecord[] {
  return [...drafts].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/**
 * Sorts source records from newest to oldest for the collection workbench.
 * @param {SourceRecord[]} sources Source list to sort.
 * @returns {SourceRecord[]} Sorted source list.
 */
function sortSources(sources: SourceRecord[]): SourceRecord[] {
  return [...sources].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/**
 * Sorts schedules from newest to oldest for the scheduler panel.
 * @param {ScheduleRecord[]} schedules Schedule list to sort.
 * @returns {ScheduleRecord[]} Sorted schedule list.
 */
function sortSchedules(schedules: ScheduleRecord[]): ScheduleRecord[] {
  return [...schedules].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/**
 * Sorts publish records from newest to oldest for the release history panel.
 * @param {PublishRecord[]} publishRecords Publish list to sort.
 * @returns {PublishRecord[]} Sorted publish history.
 */
function sortPublishRecords(publishRecords: PublishRecord[]): PublishRecord[] {
  return [...publishRecords].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

/**
 * Builds one KB-level overview row for the admin dashboard.
 * @param {KbInfo} kb Current knowledge-base metadata.
 * @param {LearningDatabase} data Aggregated learning-center data.
 * @param {LearningFactoryState} state Knowledge factory sidecar state.
 * @returns {KnowledgeFactoryOverview} Enriched KB dashboard row.
 */
function buildKbOverview(
  kb: KbInfo,
  data: LearningDatabase,
  state: LearningFactoryState
): KnowledgeFactoryOverview {
  const drafts = Object.values(data.drafts[kb.id] ?? {});
  const sources = state.sources.filter((item) => item.kbId === kb.id);
  const schedules = state.schedules.filter((item) => item.kbId === kb.id && item.enabled);
  const publishRecords = state.publishRecords.filter((item) => item.kbId === kb.id);
  const latestPublish = sortPublishRecords(publishRecords)[0] ?? null;

  return {
    ...kb,
    draftCount: drafts.length,
    readyDraftCount: drafts.filter((item) => item.status === "ready_to_publish").length,
    reviewingDraftCount: drafts.filter((item) => item.status === "reviewing").length,
    sourceCount: sources.length,
    scheduledSourceCount: schedules.length,
    publishedCount: publishRecords.length,
    latestPublishAt: latestPublish?.publishedAt ?? null,
    latestPublishTitle: latestPublish?.title ?? null,
  };
}

export const learningFactory = {
  /**
   * Returns the normalized sidecar state for low-level consumers.
   * @returns {LearningFactoryState} Current knowledge factory sidecar state.
   */
  _readState(): LearningFactoryState {
    return readFactoryState();
  },

  /**
   * Persists the normalized sidecar state for low-level consumers.
   * @param {LearningFactoryState} state Factory state snapshot to store.
   * @returns {void} Saves the current knowledge factory sidecar state.
   */
  _writeState(state: LearningFactoryState): void {
    writeFactoryState(state);
  },

  /**
   * Builds the current admin-facing snapshot for one KB or the whole knowledge factory.
   * @param {string} [kbId] Optional KB identifier to scope the snapshot.
   * @returns {KnowledgeFactorySnapshot} Aggregated factory snapshot for pages and APIs.
   */
  getSnapshot(kbId?: string): KnowledgeFactorySnapshot {
    const data = learningDb.getLearningData();
    const state = readFactoryState();
    const kbs = [...data.kbs]
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name))
      .map((item) => buildKbOverview(item, data, state));
    const scopedKbId = kbId?.trim() || "";
    const drafts = scopedKbId
      ? sortDrafts(Object.values(data.drafts[scopedKbId] ?? {}))
      : sortDrafts(Object.values(data.drafts).flatMap((item) => Object.values(item)));
    const sources = sortSources(
      scopedKbId ? state.sources.filter((item) => item.kbId === scopedKbId) : state.sources
    );
    const schedules = sortSchedules(
      scopedKbId ? state.schedules.filter((item) => item.kbId === scopedKbId) : state.schedules
    );
    const publishRecords = sortPublishRecords(
      scopedKbId ? state.publishRecords.filter((item) => item.kbId === scopedKbId) : state.publishRecords
    );

    return {
      stats: {
        kbCount: kbs.length,
        draftCount: drafts.length,
        readyDraftCount: drafts.filter((item) => item.status === "ready_to_publish").length,
        sourceCount: sources.length,
        scheduledSourceCount: schedules.filter((item) => item.enabled).length,
        publishedCount: publishRecords.length,
      },
      kbs,
      tree: scopedKbId ? data.trees[scopedKbId] ?? null : null,
      drafts,
      sources,
      schedules,
      publishRecords,
    };
  },

  /**
   * Creates or reuses a source record while enforcing lightweight dedupe and source tracing.
   * @param {RegisterSourceInput} input Source creation payload.
   * @returns {{ source: SourceRecord; reused: boolean }} Source record and dedupe result.
   */
  registerSource(input: RegisterSourceInput): { source: SourceRecord; reused: boolean } {
    const state = readFactoryState();
    const dedupeKey = buildSourceDedupeKey(input);
    const existing = state.sources.find(
      (item) => item.kbId === input.kbId && item.dedupeKey === dedupeKey && item.status !== "failed"
    );

    if (existing) {
      existing.updatedAt = getNowIso();
      writeFactoryState(state);
      return { source: existing, reused: true };
    }

    const now = getNowIso();
    const source = normalizeSourceRecord({
      id: `source-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      kbId: input.kbId,
      type: input.type,
      mode: input.mode,
      status: "queued",
      title: input.title || input.url || "未命名来源",
      url: input.url || "",
      subject: input.subject || "",
      whitelist: input.whitelist !== false,
      dedupeKey,
      excerpt: (input.excerpt || "").slice(0, 800),
      draftId: null,
      topicId: null,
      createdAt: now,
      updatedAt: now,
      lastIngestedAt: null,
      error: null,
      category: input.category ?? "community",
      authorityScore: input.authorityScore ?? 0,
      freshnessScore: input.freshnessScore ?? 0,
      qualityScore: input.qualityScore ?? 0,
      qualityGate: input.qualityGate ?? "accepted",
      boundaryVerdict: input.boundaryVerdict ?? "in_scope",
      selectionReason: input.selectionReason ?? "",
    });
    state.sources.unshift(source);
    writeFactoryState(state);
    return { source, reused: false };
  },

  /**
   * Updates one source record after ingestion, failure, or publication.
   * @param {string} sourceId Source identifier.
   * @param {Partial<SourceRecord>} patch Fields to update.
   * @returns {SourceRecord | null} Updated source record, or `null` when absent.
   */
  updateSource(sourceId: string, patch: Partial<SourceRecord>): SourceRecord | null {
    const state = readFactoryState();
    const source = state.sources.find((item) => item.id === sourceId);
    if (!source) {
      return null;
    }

    Object.assign(source, patch, { updatedAt: getNowIso() });
    writeFactoryState(state);
    return source;
  },

  /**
   * Creates a draft and links the related source records into the review workflow.
   * @param {{ kbId: string; subject: string; summary: DraftSummary; sourceIds?: string[]; status?: DraftWorkflowStatus; diffSummary?: string[] }} input Draft creation payload.
   * @returns {DraftRecord} Newly created draft record.
   */
  createDraft(input: {
    kbId: string;
    subject: string;
    summary: DraftSummary;
    sourceIds?: string[];
    status?: DraftWorkflowStatus;
    diffSummary?: string[];
  }): DraftRecord {
    const now = getNowIso();
    const status = input.status ?? "pending_review";
    const draftId = learningDb.createDraft(input.kbId, input.subject, input.summary, {
      sourceIds: input.sourceIds ?? [],
      status,
      pipeline: buildDraftPipeline(status, now),
      reviewNotes: [],
      diffSummary: input.diffSummary ?? [],
      publishTopicId: null,
      publishedAt: null,
    });
    const draft = learningDb.getDraft(input.kbId, draftId);

    if (!draft) {
      throw new Error("草稿创建失败");
    }

    for (const sourceId of input.sourceIds ?? []) {
      this.updateSource(sourceId, {
        status: "drafted",
        draftId,
        subject: input.subject,
        lastIngestedAt: now,
        error: null,
      });
    }

    return draft;
  },

  /**
   * Updates draft review metadata and recomputes the pipeline state shown to admins.
   * @param {string} kbId Knowledge-base identifier.
   * @param {string} draftId Draft identifier.
   * @param {DraftWorkflowUpdate} input Updated review payload.
   * @returns {DraftRecord | null} Updated draft record, or `null` when absent.
   */
  updateDraft(kbId: string, draftId: string, input: DraftWorkflowUpdate): DraftRecord | null {
    const now = getNowIso();
    const status = input.status ?? "reviewing";
    return learningDb.updateDraft(kbId, draftId, input.summary, {
      status,
      pipeline: buildDraftPipeline(status, now).map((item) =>
        item.key === "draft_review" && status === "reviewing"
          ? { ...item, detail: "管理员正在二次整理结构与表述。" }
          : item
      ),
      reviewNotes: input.reviewNotes ?? [],
      diffSummary: input.diffSummary ?? [],
    });
  },

  /**
   * Creates or updates one scheduled collection rule for the current KB.
   * @param {ScheduleInput} input Schedule payload from the admin UI.
   * @returns {ScheduleRecord} Newly stored or updated schedule record.
   */
  createOrUpdateSchedule(input: ScheduleInput): ScheduleRecord {
    const state = readFactoryState();
    const now = getNowIso();
    const existing = input.scheduleId
      ? state.schedules.find((item) => item.id === input.scheduleId)
      : undefined;

    if (existing) {
      existing.name = input.name;
      existing.cron = input.cron;
      existing.sourceType = input.sourceType;
      existing.target = input.target;
      existing.whitelist = input.whitelist !== false;
      existing.enabled = input.enabled !== false;
      existing.updatedAt = now;
      existing.nextRunAt = input.nextRunAt ?? existing.nextRunAt;
      writeFactoryState(state);
      return existing;
    }

    const schedule = normalizeScheduleRecord({
      id: `schedule-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      kbId: input.kbId,
      name: input.name,
      cron: input.cron,
      sourceType: input.sourceType,
      target: input.target,
      whitelist: input.whitelist !== false,
      enabled: input.enabled !== false,
      createdAt: now,
      updatedAt: now,
      nextRunAt: input.nextRunAt ?? null,
    });
    state.schedules.unshift(schedule);
    writeFactoryState(state);
    return schedule;
  },

  /**
   * Deletes one scheduled collection rule from the knowledge factory sidecar state.
   * @param {string} scheduleId Schedule identifier to remove.
   * @returns {boolean} `true` when the schedule existed and was removed.
   */
  deleteSchedule(scheduleId: string): boolean {
    const state = readFactoryState();
    const before = state.schedules.length;
    state.schedules = state.schedules.filter((item) => item.id !== scheduleId);
    if (state.schedules.length === before) {
      return false;
    }
    writeFactoryState(state);
    return true;
  },

  /**
   * Publishes one reviewed draft, writes release history, and updates related source traces.
   * @param {string} kbId Knowledge-base identifier.
   * @param {string} draftId Draft identifier.
   * @returns {{ topicId: string; publishRecord: PublishRecord } | null} Publish result, or `null` when the draft does not exist.
   */
  publishDraft(
    kbId: string,
    draftId: string
  ): { topicId: string; publishRecord: PublishRecord } | null {
    const draft = learningDb.getDraft(kbId, draftId);
    if (!draft) {
      return null;
    }

    const topicTitle = draft.summary.topic.trim() || "未命名主题";
    const topicId = makeTopicId(topicTitle);
    learningDb.addContent(kbId, draft.subject || "默认分类", topicId, {
      title: topicTitle,
      breadcrumb: [kbId, draft.subject || "默认分类", topicTitle],
      quickFacts: draft.summary.content.quickFacts || [],
      sections: draft.summary.content.sections || [],
    });
    learningDb.deleteDraft(kbId, draftId);

    const state = readFactoryState();
    const publishRecord = normalizePublishRecord({
      id: `publish-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      kbId,
      draftId,
      topicId,
      title: topicTitle,
      sourceIds: draft.sourceIds ?? [],
      publishedAt: getNowIso(),
      summary: buildPublishSummary(draft),
    });
    state.publishRecords.unshift(publishRecord);

    for (const source of state.sources) {
      if ((draft.sourceIds ?? []).includes(source.id)) {
        source.status = "published";
        source.topicId = topicId;
        source.updatedAt = publishRecord.publishedAt;
      }
    }

    writeFactoryState(state);
    return { topicId, publishRecord };
  },

  /**
   * Removes source, schedule, and publish traces bound to a deleted knowledge base.
   * @param {string} kbId Knowledge-base identifier.
   * @returns {void} Cleans sidecar traces after KB deletion.
   */
  deleteKbArtifacts(kbId: string): void {
    const state = readFactoryState();
    state.sources = state.sources.filter((item) => item.kbId !== kbId);
    state.schedules = state.schedules.filter((item) => item.kbId !== kbId);
    state.publishRecords = state.publishRecords.filter((item) => item.kbId !== kbId);
    writeFactoryState(state);
  },

  /**
   * Returns the related source records for one draft in display order.
   * @param {DraftRecord} draft Draft whose source records should be loaded.
   * @returns {SourceRecord[]} Linked source records for the review page.
   */
  getDraftSources(draft: DraftRecord): SourceRecord[] {
    const state = readFactoryState();
    return sortSources(state.sources.filter((item) => (draft.sourceIds ?? []).includes(item.id)));
  },

  /**
   * Ensures every draft in the admin snapshot has a pipeline before it reaches the UI.
   * @param {DraftRecord[]} drafts Draft list to normalize.
   * @returns {DraftRecord[]} Drafts with non-empty workflow metadata.
   */
  withDraftWorkflow(drafts: DraftRecord[]): DraftRecord[] {
    return drafts.map((draft) => {
      const status = (draft.status as DraftWorkflowStatus | undefined) ?? "pending_review";
      return {
        ...draft,
        sourceIds: draft.sourceIds ?? [],
        reviewNotes: draft.reviewNotes ?? [],
        diffSummary: draft.diffSummary ?? [],
        pipeline:
          draft.pipeline && draft.pipeline.length > 0
            ? draft.pipeline.map((item) =>
                normalizePipelineStep(item as Partial<PipelineStepStatus>)
              )
            : buildDraftPipeline(status, draft.updatedAt),
      };
    });
  },
};
