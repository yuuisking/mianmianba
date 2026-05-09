import fs from "fs";
import path from "path";

export type StudioStageKey =
  | "architect"
  | "questioner"
  | "answerer"
  | "reviewer"
  | "linker"
  | "publisher";

export type StudioStageStatus = "pending" | "running" | "completed" | "failed" | "skipped";
export type StudioRunStatus = "pending" | "running" | "completed" | "failed";

export type StudioSourceSnapshot = {
  title: string;
  url: string;
  category: string;
  qualityScore: number;
  selectionReason: string;
};

export type StudioStageRecord = {
  key: StudioStageKey;
  label: string;
  status: StudioStageStatus;
  updatedAt: string;
  detail: string;
};

export type StudioRunResult = {
  categoryCount: number;
  questionCount: number;
  published: boolean;
};

export type StudioRunRecord = {
  id: string;
  kbId: string;
  topic: string;
  mode: "manual";
  status: StudioRunStatus;
  createdAt: string;
  updatedAt: string;
  currentStageKey: StudioStageKey;
  totalQuestions: number;
  completedQuestions: number;
  warnings: string[];
  error: string | null;
  acceptedSources: StudioSourceSnapshot[];
  rejectedSources: StudioSourceSnapshot[];
  stages: StudioStageRecord[];
  result: StudioRunResult | null;
};

type StudioState = {
  runs: StudioRunRecord[];
};

const STORE_ROOT = path.join(process.cwd(), "data", "learning-center");
const STUDIO_STATE_PATH = path.join(STORE_ROOT, "studio-state.json");

/**
 * Returns the current timestamp in ISO-8601 format.
 * @returns {string} Timestamp string used by studio run records.
 */
function getNowIso(): string {
  return new Date().toISOString();
}

/**
 * Ensures the learning-center store exists before reading or writing studio state.
 * @returns {void} Creates the target directory when it is absent.
 */
function ensureStudioStore(): void {
  if (!fs.existsSync(STORE_ROOT)) {
    fs.mkdirSync(STORE_ROOT, { recursive: true });
  }
}

/**
 * Safely reads a JSON file from disk.
 * @template T
 * @param {string} filePath Absolute file path.
 * @returns {T | null} Parsed value or `null` when the file is missing or invalid.
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
 * Writes a JSON payload to disk using a stable pretty-printed format.
 * @param {string} filePath Absolute file path.
 * @param {unknown} value Serializable payload.
 * @returns {void} Persists the file in place.
 */
function writeJsonFile(filePath: string, value: unknown): void {
  ensureStudioStore();
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf-8");
}

/**
 * Builds the default ordered multi-agent stage list for one generation run.
 * @param {string} timestamp Timestamp used for initial stage records.
 * @returns {StudioStageRecord[]} Ordered stage records.
 */
function buildDefaultStages(timestamp: string): StudioStageRecord[] {
  return [
    { key: "architect", label: "架构师", status: "pending", updatedAt: timestamp, detail: "等待规划题库结构" },
    { key: "questioner", label: "出题员", status: "pending", updatedAt: timestamp, detail: "等待生成分类与题目" },
    { key: "answerer", label: "答案师", status: "pending", updatedAt: timestamp, detail: "等待生成结构化答案" },
    { key: "reviewer", label: "审核员", status: "pending", updatedAt: timestamp, detail: "等待质量审核" },
    { key: "linker", label: "关联员", status: "pending", updatedAt: timestamp, detail: "等待建立题目关联" },
    { key: "publisher", label: "发布器", status: "pending", updatedAt: timestamp, detail: "等待写入正式题库" },
  ];
}

/**
 * Builds an empty studio state payload.
 * @returns {StudioState} Empty studio state.
 */
function buildEmptyStudioState(): StudioState {
  return {
    runs: [],
  };
}

/**
 * Normalizes one accepted or rejected source snapshot.
 * @param {Partial<StudioSourceSnapshot> | undefined} value Raw source payload.
 * @returns {StudioSourceSnapshot} Sanitized source snapshot.
 */
function normalizeSourceSnapshot(value?: Partial<StudioSourceSnapshot>): StudioSourceSnapshot {
  return {
    title: typeof value?.title === "string" ? value.title : "",
    url: typeof value?.url === "string" ? value.url : "",
    category: typeof value?.category === "string" ? value.category : "community",
    qualityScore:
      typeof value?.qualityScore === "number" && Number.isFinite(value.qualityScore) ? value.qualityScore : 0,
    selectionReason: typeof value?.selectionReason === "string" ? value.selectionReason : "",
  };
}

/**
 * Normalizes one generation stage record.
 * @param {Partial<StudioStageRecord> | undefined} value Raw stage payload.
 * @returns {StudioStageRecord} Sanitized stage record.
 */
function normalizeStageRecord(value?: Partial<StudioStageRecord>): StudioStageRecord {
  return {
    key:
      value?.key === "questioner" ||
      value?.key === "answerer" ||
      value?.key === "reviewer" ||
      value?.key === "linker" ||
      value?.key === "publisher"
        ? value.key
        : "architect",
    label: typeof value?.label === "string" && value.label.trim() ? value.label : "阶段",
    status:
      value?.status === "running" ||
      value?.status === "completed" ||
      value?.status === "failed" ||
      value?.status === "skipped"
        ? value.status
        : "pending",
    updatedAt: typeof value?.updatedAt === "string" ? value.updatedAt : getNowIso(),
    detail: typeof value?.detail === "string" ? value.detail : "",
  };
}

/**
 * Normalizes one generation run record.
 * @param {Partial<StudioRunRecord> | undefined} value Raw run payload.
 * @returns {StudioRunRecord} Sanitized run record.
 */
function normalizeRunRecord(value?: Partial<StudioRunRecord>): StudioRunRecord {
  const now = getNowIso();
  return {
    id: typeof value?.id === "string" && value.id.trim() ? value.id : `run-${Date.now().toString(36)}`,
    kbId: typeof value?.kbId === "string" ? value.kbId : "",
    topic: typeof value?.topic === "string" ? value.topic : "",
    mode: "manual",
    status: value?.status === "running" || value?.status === "completed" || value?.status === "failed" ? value.status : "pending",
    createdAt: typeof value?.createdAt === "string" ? value.createdAt : now,
    updatedAt: typeof value?.updatedAt === "string" ? value.updatedAt : now,
    currentStageKey:
      value?.currentStageKey === "questioner" ||
      value?.currentStageKey === "answerer" ||
      value?.currentStageKey === "reviewer" ||
      value?.currentStageKey === "linker" ||
      value?.currentStageKey === "publisher"
        ? value.currentStageKey
        : "architect",
    totalQuestions:
      typeof value?.totalQuestions === "number" && Number.isFinite(value.totalQuestions) ? value.totalQuestions : 0,
    completedQuestions:
      typeof value?.completedQuestions === "number" && Number.isFinite(value.completedQuestions)
        ? value.completedQuestions
        : 0,
    warnings: Array.isArray(value?.warnings)
      ? value.warnings.filter((item): item is string => typeof item === "string")
      : [],
    error: typeof value?.error === "string" ? value.error : null,
    acceptedSources: Array.isArray(value?.acceptedSources)
      ? value.acceptedSources.map((item) => normalizeSourceSnapshot(item))
      : [],
    rejectedSources: Array.isArray(value?.rejectedSources)
      ? value.rejectedSources.map((item) => normalizeSourceSnapshot(item))
      : [],
    stages:
      Array.isArray(value?.stages) && value.stages.length > 0
        ? value.stages.map((item) => normalizeStageRecord(item))
        : buildDefaultStages(now),
    result:
      value?.result &&
      typeof value.result.categoryCount === "number" &&
      typeof value.result.questionCount === "number" &&
      typeof value.result.published === "boolean"
        ? {
            categoryCount: value.result.categoryCount,
            questionCount: value.result.questionCount,
            published: value.result.published,
          }
        : null,
  };
}

/**
 * Loads the current studio state from disk.
 * @returns {StudioState} Current normalized state.
 */
function readStudioState(): StudioState {
  ensureStudioStore();
  const parsed = readJsonFile<Partial<StudioState>>(STUDIO_STATE_PATH);
  return {
    runs: Array.isArray(parsed?.runs) ? parsed.runs.map((item) => normalizeRunRecord(item)) : [],
  };
}

/**
 * Persists the studio state back to disk.
 * @param {StudioState} state Studio state snapshot.
 * @returns {void} Stores the state file.
 */
function writeStudioState(state: StudioState): void {
  writeJsonFile(STUDIO_STATE_PATH, {
    runs: state.runs.map((item) => normalizeRunRecord(item)),
  });
}

export const learningStudio = {
  /**
   * Returns the current generation run list ordered from newest to oldest.
   * @param {string} [kbId] Optional bank identifier.
   * @returns {StudioRunRecord[]} Ordered run records.
   */
  getRuns(kbId?: string): StudioRunRecord[] {
    const state = readStudioState();
    const scoped = kbId ? state.runs.filter((item) => item.kbId === kbId) : state.runs;
    return [...scoped].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },

  /**
   * Creates one new manual generation run.
   * @param {{ kbId: string; topic: string; acceptedSources?: StudioSourceSnapshot[]; rejectedSources?: StudioSourceSnapshot[] }} input Run creation payload.
   * @returns {StudioRunRecord} Newly created run record.
   */
  createRun(input: {
    kbId: string;
    topic: string;
    acceptedSources?: StudioSourceSnapshot[];
    rejectedSources?: StudioSourceSnapshot[];
  }): StudioRunRecord {
    const state = readStudioState();
    const now = getNowIso();
    const run = normalizeRunRecord({
      id: `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      kbId: input.kbId,
      topic: input.topic,
      mode: "manual",
      status: "pending",
      createdAt: now,
      updatedAt: now,
      currentStageKey: "architect",
      totalQuestions: 0,
      completedQuestions: 0,
      warnings: [],
      error: null,
      acceptedSources: input.acceptedSources ?? [],
      rejectedSources: input.rejectedSources ?? [],
      stages: buildDefaultStages(now),
      result: null,
    });
    state.runs.unshift(run);
    writeStudioState(state);
    return run;
  },

  /**
   * Updates one generation run in place.
   * @param {string} runId Target run identifier.
   * @param {Partial<StudioRunRecord>} patch Partial run patch.
   * @returns {StudioRunRecord | null} Updated run record or `null` when absent.
   */
  updateRun(runId: string, patch: Partial<StudioRunRecord>): StudioRunRecord | null {
    const state = readStudioState();
    const run = state.runs.find((item) => item.id === runId);
    if (!run) {
      return null;
    }

    Object.assign(run, patch, { updatedAt: getNowIso() });
    writeStudioState(state);
    return run;
  },

  /**
   * Updates one stage inside a generation run.
   * @param {string} runId Target run identifier.
   * @param {StudioStageKey} stageKey Target stage identifier.
   * @param {{ status: StudioStageStatus; detail: string; totalQuestions?: number; completedQuestions?: number }} patch Stage patch payload.
   * @returns {StudioRunRecord | null} Updated run record or `null` when absent.
   */
  updateStage(
    runId: string,
    stageKey: StudioStageKey,
    patch: {
      status: StudioStageStatus;
      detail: string;
      totalQuestions?: number;
      completedQuestions?: number;
    }
  ): StudioRunRecord | null {
    const state = readStudioState();
    const run = state.runs.find((item) => item.id === runId);
    if (!run) {
      return null;
    }

    const now = getNowIso();
    run.currentStageKey = stageKey;
    if (typeof patch.totalQuestions === "number" && Number.isFinite(patch.totalQuestions)) {
      run.totalQuestions = patch.totalQuestions;
    }
    if (typeof patch.completedQuestions === "number" && Number.isFinite(patch.completedQuestions)) {
      run.completedQuestions = patch.completedQuestions;
    }
    run.updatedAt = now;
    run.status = patch.status === "failed" ? "failed" : patch.status === "completed" && stageKey === "publisher" ? "completed" : "running";

    run.stages = run.stages.map((stage) =>
      stage.key === stageKey
        ? {
            ...stage,
            status: patch.status,
            detail: patch.detail,
            updatedAt: now,
          }
        : stage
    );
    writeStudioState(state);
    return run;
  },

  /**
   * Marks one generation run as completed.
   * @param {string} runId Target run identifier.
   * @param {StudioRunResult} result Published result summary.
   * @param {string[]} [warnings] Optional warning list.
   * @returns {StudioRunRecord | null} Updated run record or `null` when absent.
   */
  completeRun(runId: string, result: StudioRunResult, warnings?: string[]): StudioRunRecord | null {
    return this.updateRun(runId, {
      status: "completed",
      currentStageKey: "publisher",
      result,
      warnings: warnings ?? [],
      error: null,
    });
  },

  /**
   * Marks one generation run as failed and stores the failure message.
   * @param {string} runId Target run identifier.
   * @param {string} message Error summary.
   * @returns {StudioRunRecord | null} Updated run record or `null` when absent.
   */
  failRun(runId: string, message: string): StudioRunRecord | null {
    return this.updateRun(runId, {
      status: "failed",
      error: message,
    });
  },

  /**
   * Deletes all generation runs bound to one bank.
   * @param {string} kbId Target bank identifier.
   * @returns {void} Removes matching run records.
   */
  deleteRunsForKb(kbId: string): void {
    const state = readStudioState();
    state.runs = state.runs.filter((item) => item.kbId !== kbId);
    writeStudioState(state);
  },

  /**
   * Resets the full studio run state to an empty list.
   * @returns {void} Clears all persisted generation runs.
   */
  resetAll(): void {
    writeStudioState(buildEmptyStudioState());
  },
};
