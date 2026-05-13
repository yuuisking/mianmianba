-- 面面吧 v2.0：多 Agent 面试团、面试计划、轮次、代码记录与用户成长数据底座。

CREATE TYPE "InterviewPlanMode" AS ENUM ('STAGE', 'FULL_FLOW');
CREATE TYPE "InterviewPlanStatus" AS ENUM (
    'DRAFT',
    'PROFILE_READY',
    'PLANNED',
    'IN_PROGRESS',
    'COMPLETED',
    'ARCHIVED'
);
CREATE TYPE "InterviewStageType" AS ENUM (
    'STAGE_INTERVIEW',
    'FIRST_ROUND',
    'SECOND_ROUND',
    'THIRD_ROUND',
    'HR_ROUND',
    'OFFER_REVIEW',
    'CUSTOM'
);
CREATE TYPE "InterviewStageStatus" AS ENUM (
    'PENDING',
    'READY',
    'ACTIVE',
    'COMPLETED',
    'SKIPPED',
    'BLOCKED'
);
CREATE TYPE "InterviewRoundStatus" AS ENUM (
    'PENDING',
    'ASKING',
    'USER_ANSWERING',
    'FOLLOW_UP',
    'CODING',
    'SCORING',
    'DONE',
    'ABORTED'
);
CREATE TYPE "InterviewQuestionKind" AS ENUM (
    'OPEN_ENDED',
    'PROJECT_DEEP_DIVE',
    'SYSTEM_DESIGN',
    'BEHAVIORAL',
    'CODING',
    'HR',
    'ENGLISH',
    'CUSTOM'
);
CREATE TYPE "InterviewQuestionStatus" AS ENUM (
    'PENDING',
    'ASKING',
    'ANSWERED',
    'SCORED',
    'SKIPPED'
);
CREATE TYPE "CodingSessionStatus" AS ENUM (
    'READY',
    'EDITING',
    'RUNNING',
    'SUBMITTED',
    'REVIEWED',
    'CLOSED'
);
CREATE TYPE "AgentRunRole" AS ENUM (
    'PLANNER',
    'RESUME_ANALYST',
    'JD_ANALYST',
    'INTERVIEWER',
    'EVIDENCE',
    'SCORER',
    'SUMMARY',
    'REPORT',
    'COACH',
    'CODE_INTERVIEWER'
);
CREATE TYPE "AgentRunStatus" AS ENUM (
    'PENDING',
    'RUNNING',
    'COMPLETED',
    'FAILED',
    'SKIPPED'
);
CREATE TYPE "WeaknessRecordStatus" AS ENUM (
    'ACTIVE',
    'RESOLVED',
    'SUPPRESSED'
);
CREATE TYPE "ProgressSnapshotType" AS ENUM ('LATEST', 'DAILY', 'WEEKLY');

CREATE TABLE "UserGrowthProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "targetCompany" TEXT,
    "targetRole" TEXT,
    "targetLevel" TEXT,
    "targetTrack" TEXT,
    "targetOfferGoal" TEXT,
    "personaSummary" TEXT,
    "radarSnapshot" JSONB,
    "preferenceProfile" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UserGrowthProfile_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "UserGrowthProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "UserProgressSnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "snapshotType" "ProgressSnapshotType" NOT NULL DEFAULT 'LATEST',
    "snapshotDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trainingSessionsCount" INTEGER NOT NULL DEFAULT 0,
    "interviewSessionsCount" INTEGER NOT NULL DEFAULT 0,
    "completedInterviewCount" INTEGER NOT NULL DEFAULT 0,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "streakDays" INTEGER NOT NULL DEFAULT 0,
    "retrainingRate" DOUBLE PRECISION,
    "averageScore" DOUBLE PRECISION,
    "latestTrainingTitle" TEXT,
    "latestTrainingPath" TEXT,
    "latestWeaknesses" JSONB,
    "continueTraining" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UserProgressSnapshot_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "UserProgressSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "WeaknessDimension" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "defaultSeverity" DOUBLE PRECISION,
    "recommendedActions" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WeaknessDimension_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserWeaknessRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dimensionId" TEXT NOT NULL,
    "status" "WeaknessRecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "sourceType" TEXT,
    "sourceSessionId" TEXT,
    "sourceQuestionId" TEXT,
    "severityScore" DOUBLE PRECISION,
    "frequency" INTEGER NOT NULL DEFAULT 1,
    "latestScore" DOUBLE PRECISION,
    "recommendation" TEXT,
    "evidenceSummary" TEXT,
    "firstDetectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastDetectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UserWeaknessRecord_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "UserWeaknessRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserWeaknessRecord_dimensionId_fkey" FOREIGN KEY ("dimensionId") REFERENCES "WeaknessDimension"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "InterviewPlan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mode" "InterviewPlanMode" NOT NULL,
    "status" "InterviewPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "sourceLaunchId" TEXT,
    "companyName" TEXT,
    "roleName" TEXT,
    "targetLevel" TEXT,
    "language" TEXT,
    "intensity" TEXT,
    "jdText" TEXT,
    "resumeText" TEXT,
    "focusAreas" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "planningSummary" JSONB,
    "latestProfileInput" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InterviewPlan_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InterviewPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "InterviewPlanStage" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "stageType" "InterviewStageType" NOT NULL,
    "stageLabel" TEXT NOT NULL,
    "stageOrder" INTEGER NOT NULL,
    "status" "InterviewStageStatus" NOT NULL DEFAULT 'PENDING',
    "interviewerStyle" TEXT,
    "expectedDurationMinutes" INTEGER,
    "questionBudget" INTEGER,
    "codingRequired" BOOLEAN NOT NULL DEFAULT false,
    "strategySummary" TEXT,
    "stageConfig" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InterviewPlanStage_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InterviewPlanStage_planId_fkey" FOREIGN KEY ("planId") REFERENCES "InterviewPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "InterviewRound" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "InterviewRoundStatus" NOT NULL DEFAULT 'PENDING',
    "roundMode" TEXT,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "currentQuestionIndex" INTEGER NOT NULL DEFAULT 0,
    "totalQuestionCount" INTEGER NOT NULL DEFAULT 0,
    "roundSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InterviewRound_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InterviewRound_planId_fkey" FOREIGN KEY ("planId") REFERENCES "InterviewPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InterviewRound_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "InterviewPlanStage"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InterviewRound_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "InterviewQuestionRecord" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "stageId" TEXT,
    "questionOrder" INTEGER NOT NULL,
    "kind" "InterviewQuestionKind" NOT NULL,
    "status" "InterviewQuestionStatus" NOT NULL DEFAULT 'PENDING',
    "title" TEXT,
    "prompt" TEXT NOT NULL,
    "sourceType" TEXT,
    "sourceRef" TEXT,
    "askedByRole" "AgentRunRole",
    "rubric" JSONB,
    "questionMeta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InterviewQuestionRecord_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InterviewQuestionRecord_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "InterviewRound"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InterviewQuestionRecord_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "InterviewPlanStage"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "InterviewAnswerRecord" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "contentText" TEXT,
    "transcriptText" TEXT,
    "answerLanguage" TEXT,
    "durationSeconds" INTEGER,
    "hintUsedCount" INTEGER NOT NULL DEFAULT 0,
    "interruptionCount" INTEGER NOT NULL DEFAULT 0,
    "answerMeta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InterviewAnswerRecord_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InterviewAnswerRecord_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "InterviewRound"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InterviewAnswerRecord_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "InterviewQuestionRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "CodingSession" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "status" "CodingSessionStatus" NOT NULL DEFAULT 'READY',
    "starterCode" TEXT,
    "latestCode" TEXT,
    "runCount" INTEGER NOT NULL DEFAULT 0,
    "submitCount" INTEGER NOT NULL DEFAULT 0,
    "lastRunAt" TIMESTAMP(3),
    "lastSubmitAt" TIMESTAMP(3),
    "codingMeta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CodingSession_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CodingSession_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "InterviewRound"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CodingSession_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "InterviewQuestionRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CodingSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "CodingSubmission" (
    "id" TEXT NOT NULL,
    "codingSessionId" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "codeSnapshot" TEXT,
    "resultPayload" JSONB,
    "passedCount" INTEGER,
    "totalCount" INTEGER,
    "runtimeMs" INTEGER,
    "memoryKb" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CodingSubmission_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CodingSubmission_codingSessionId_fkey" FOREIGN KEY ("codingSessionId") REFERENCES "CodingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "InterviewScorecard" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "questionId" TEXT,
    "totalScore" DOUBLE PRECISION,
    "technicalScore" DOUBLE PRECISION,
    "communicationScore" DOUBLE PRECISION,
    "codingScore" DOUBLE PRECISION,
    "confidenceScore" DOUBLE PRECISION,
    "rubricBreakdown" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InterviewScorecard_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InterviewScorecard_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "InterviewRound"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InterviewScorecard_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "InterviewQuestionRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "InterviewInsightReport" (
    "id" TEXT NOT NULL,
    "planId" TEXT,
    "roundId" TEXT NOT NULL,
    "reportType" TEXT NOT NULL,
    "summary" TEXT,
    "highlights" JSONB,
    "risks" JSONB,
    "actionItems" JSONB,
    "radarSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InterviewInsightReport_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InterviewInsightReport_planId_fkey" FOREIGN KEY ("planId") REFERENCES "InterviewPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "InterviewInsightReport_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "InterviewRound"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "InterviewAgentRun" (
    "id" TEXT NOT NULL,
    "planId" TEXT,
    "stageId" TEXT,
    "roundId" TEXT,
    "agentRole" "AgentRunRole" NOT NULL,
    "status" "AgentRunStatus" NOT NULL DEFAULT 'PENDING',
    "modelName" TEXT,
    "input" JSONB,
    "output" JSONB,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InterviewAgentRun_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InterviewAgentRun_planId_fkey" FOREIGN KEY ("planId") REFERENCES "InterviewPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "InterviewAgentRun_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "InterviewPlanStage"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "InterviewAgentRun_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "InterviewRound"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "UserGrowthProfile_userId_key" ON "UserGrowthProfile"("userId");
CREATE INDEX "UserGrowthProfile_targetRole_idx" ON "UserGrowthProfile"("targetRole");
CREATE INDEX "UserProgressSnapshot_userId_snapshotType_snapshotDate_idx" ON "UserProgressSnapshot"("userId", "snapshotType", "snapshotDate");
CREATE UNIQUE INDEX "WeaknessDimension_slug_key" ON "WeaknessDimension"("slug");
CREATE INDEX "UserWeaknessRecord_userId_status_idx" ON "UserWeaknessRecord"("userId", "status");
CREATE INDEX "UserWeaknessRecord_dimensionId_idx" ON "UserWeaknessRecord"("dimensionId");
CREATE INDEX "InterviewPlan_userId_status_idx" ON "InterviewPlan"("userId", "status");
CREATE INDEX "InterviewPlan_mode_status_idx" ON "InterviewPlan"("mode", "status");
CREATE UNIQUE INDEX "InterviewPlanStage_planId_stageOrder_key" ON "InterviewPlanStage"("planId", "stageOrder");
CREATE INDEX "InterviewPlanStage_planId_status_idx" ON "InterviewPlanStage"("planId", "status");
CREATE INDEX "InterviewRound_planId_status_idx" ON "InterviewRound"("planId", "status");
CREATE INDEX "InterviewRound_stageId_status_idx" ON "InterviewRound"("stageId", "status");
CREATE INDEX "InterviewRound_userId_createdAt_idx" ON "InterviewRound"("userId", "createdAt");
CREATE UNIQUE INDEX "InterviewQuestionRecord_roundId_questionOrder_key" ON "InterviewQuestionRecord"("roundId", "questionOrder");
CREATE INDEX "InterviewQuestionRecord_stageId_idx" ON "InterviewQuestionRecord"("stageId");
CREATE INDEX "InterviewQuestionRecord_kind_status_idx" ON "InterviewQuestionRecord"("kind", "status");
CREATE INDEX "InterviewAnswerRecord_roundId_createdAt_idx" ON "InterviewAnswerRecord"("roundId", "createdAt");
CREATE INDEX "InterviewAnswerRecord_questionId_idx" ON "InterviewAnswerRecord"("questionId");
CREATE INDEX "CodingSession_roundId_status_idx" ON "CodingSession"("roundId", "status");
CREATE INDEX "CodingSession_userId_createdAt_idx" ON "CodingSession"("userId", "createdAt");
CREATE INDEX "CodingSubmission_codingSessionId_createdAt_idx" ON "CodingSubmission"("codingSessionId", "createdAt");
CREATE INDEX "InterviewScorecard_roundId_idx" ON "InterviewScorecard"("roundId");
CREATE INDEX "InterviewScorecard_questionId_idx" ON "InterviewScorecard"("questionId");
CREATE INDEX "InterviewInsightReport_planId_idx" ON "InterviewInsightReport"("planId");
CREATE INDEX "InterviewInsightReport_roundId_reportType_idx" ON "InterviewInsightReport"("roundId", "reportType");
CREATE INDEX "InterviewAgentRun_agentRole_status_idx" ON "InterviewAgentRun"("agentRole", "status");
CREATE INDEX "InterviewAgentRun_planId_idx" ON "InterviewAgentRun"("planId");
CREATE INDEX "InterviewAgentRun_stageId_idx" ON "InterviewAgentRun"("stageId");
CREATE INDEX "InterviewAgentRun_roundId_idx" ON "InterviewAgentRun"("roundId");
