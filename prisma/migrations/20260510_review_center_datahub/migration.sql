-- 复盘中心数据分析中台：快照、问题、证据、动作与执行结果实体。

CREATE TYPE "ReviewConfidenceLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');
CREATE TYPE "ReviewIssueStatus" AS ENUM ('OBSERVING', 'ACTIVE', 'RESOLVED');
CREATE TYPE "ReviewSampleValidity" AS ENUM ('VALID', 'INVALID');
CREATE TYPE "ReviewActionPriority" AS ENUM ('TODAY', 'THIS_WEEK', 'KEEP');
CREATE TYPE "ReviewActionExecutionStatus" AS ENUM ('STARTED', 'COMPLETED', 'ABORTED', 'FAILED');

CREATE TABLE "ReviewSnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "timeRange" TEXT NOT NULL,
    "interviewType" TEXT,
    "role" TEXT,
    "company" TEXT,
    "dimension" TEXT,
    "sampleStatus" TEXT,
    "snapshotFingerprint" TEXT NOT NULL,
    "headline" TEXT,
    "trendSummary" TEXT,
    "confidenceLevel" "ReviewConfidenceLevel" NOT NULL DEFAULT 'LOW',
    "confidenceScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "validSampleCount" INTEGER NOT NULL DEFAULT 0,
    "invalidSampleCount" INTEGER NOT NULL DEFAULT 0,
    "sampleCoverage" DOUBLE PRECISION,
    "timeCoverage" DOUBLE PRECISION,
    "dimensionCoverage" DOUBLE PRECISION,
    "filters" JSONB,
    "headlineCard" JSONB,
    "todayActionCard" JSONB,
    "confidenceCard" JSONB,
    "sampleSummaryCard" JSONB,
    "metrics" JSONB,
    "progressOverview" JSONB,
    "comparisonGroups" JSONB,
    "agentTrace" JSONB,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ReviewSnapshot_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ReviewSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "ReviewIssue" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "issueKey" TEXT,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "frequency" INTEGER NOT NULL DEFAULT 1,
    "stability" DOUBLE PRECISION,
    "impactScore" DOUBLE PRECISION,
    "summary" TEXT NOT NULL,
    "rootCause" TEXT,
    "latestSeenAt" TIMESTAMP(3),
    "status" "ReviewIssueStatus" NOT NULL DEFAULT 'ACTIVE',
    "relatedDimensionKeys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "recommendedActionIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "rootCauseTree" JSONB,
    "impactAnalysis" JSONB,
    "evidenceSummary" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ReviewIssue_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ReviewIssue_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "ReviewSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "ReviewEvidence" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "issueId" TEXT,
    "sessionId" TEXT,
    "sessionType" TEXT,
    "sessionCreatedAt" TIMESTAMP(3),
    "sampleValidity" "ReviewSampleValidity" NOT NULL DEFAULT 'VALID',
    "role" TEXT,
    "company" TEXT,
    "questionId" TEXT,
    "questionTitle" TEXT,
    "messageId" TEXT,
    "excerpt" TEXT NOT NULL,
    "reason" TEXT,
    "dimension" TEXT,
    "confidence" DOUBLE PRECISION,
    "severity" TEXT,
    "evidenceContext" JSONB,
    "rewriteSuggestion" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ReviewEvidence_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ReviewEvidence_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "ReviewSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ReviewEvidence_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "ReviewIssue"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "ReviewAction" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "issueId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "whyThisAction" TEXT,
    "actionType" TEXT NOT NULL,
    "recommendedMode" TEXT,
    "recommendedQuestionTypes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "recommendedDifficulty" TEXT,
    "targetPath" TEXT,
    "targetPayload" JSONB,
    "successMetric" TEXT,
    "expectedOutcome" TEXT,
    "estimatedEffort" TEXT,
    "priority" "ReviewActionPriority" NOT NULL DEFAULT 'TODAY',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ReviewAction_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ReviewAction_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "ReviewSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ReviewAction_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "ReviewIssue"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "ReviewActionExecution" (
    "id" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "resultStatus" "ReviewActionExecutionStatus" NOT NULL DEFAULT 'STARTED',
    "improvementScore" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ReviewActionExecution_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ReviewActionExecution_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "ReviewAction"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ReviewActionExecution_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ReviewSnapshot_userId_generatedAt_idx" ON "ReviewSnapshot"("userId", "generatedAt");
CREATE INDEX "ReviewSnapshot_snapshotFingerprint_idx" ON "ReviewSnapshot"("snapshotFingerprint");
CREATE INDEX "ReviewIssue_snapshotId_severity_idx" ON "ReviewIssue"("snapshotId", "severity");
CREATE INDEX "ReviewIssue_issueKey_idx" ON "ReviewIssue"("issueKey");
CREATE INDEX "ReviewEvidence_snapshotId_idx" ON "ReviewEvidence"("snapshotId");
CREATE INDEX "ReviewEvidence_issueId_idx" ON "ReviewEvidence"("issueId");
CREATE INDEX "ReviewEvidence_sessionId_idx" ON "ReviewEvidence"("sessionId");
CREATE INDEX "ReviewAction_snapshotId_priority_idx" ON "ReviewAction"("snapshotId", "priority");
CREATE INDEX "ReviewAction_issueId_idx" ON "ReviewAction"("issueId");
CREATE INDEX "ReviewActionExecution_actionId_startedAt_idx" ON "ReviewActionExecution"("actionId", "startedAt");
CREATE INDEX "ReviewActionExecution_userId_startedAt_idx" ON "ReviewActionExecution"("userId", "startedAt");
