CREATE TYPE "InterviewExperienceCollectionStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

ALTER TABLE "user_interview_templates"
ADD COLUMN "flowMode" TEXT NOT NULL DEFAULT 'stage';

DROP INDEX IF EXISTS "user_interview_templates_userId_name_key";

CREATE INDEX "user_interview_templates_userId_flowMode_updatedAt_idx"
ON "user_interview_templates"("userId", "flowMode", "updatedAt");

CREATE UNIQUE INDEX "user_interview_templates_userId_name_flowMode_key"
ON "user_interview_templates"("userId", "name", "flowMode");

ALTER TABLE "InterviewPlanStage"
ADD COLUMN "scheduledAt" TIMESTAMP(3);

CREATE TABLE "InterviewExperienceCollectionTask" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "companyName" TEXT NOT NULL,
  "roleName" TEXT NOT NULL,
  "status" "InterviewExperienceCollectionStatus" NOT NULL DEFAULT 'PENDING',
  "progress" INTEGER NOT NULL DEFAULT 0,
  "currentStep" TEXT,
  "summary" TEXT,
  "resultSummary" JSONB,
  "errorMessage" TEXT,
  "latestSourceCount" INTEGER NOT NULL DEFAULT 0,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "InterviewExperienceCollectionTask_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InterviewExperienceInsight" (
  "id" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "stageType" "InterviewStageType" NOT NULL,
  "title" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "sourceLabel" TEXT,
  "freshnessLabel" TEXT,
  "evidenceUrl" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "InterviewExperienceInsight_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InterviewExperienceCollectionTask_userId_status_idx"
ON "InterviewExperienceCollectionTask"("userId", "status");

CREATE INDEX "InterviewExperienceCollectionTask_companyName_roleName_createdAt_idx"
ON "InterviewExperienceCollectionTask"("companyName", "roleName", "createdAt");

CREATE INDEX "InterviewExperienceInsight_taskId_sortOrder_idx"
ON "InterviewExperienceInsight"("taskId", "sortOrder");

ALTER TABLE "InterviewExperienceCollectionTask"
ADD CONSTRAINT "InterviewExperienceCollectionTask_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InterviewExperienceInsight"
ADD CONSTRAINT "InterviewExperienceInsight_taskId_fkey"
FOREIGN KEY ("taskId") REFERENCES "InterviewExperienceCollectionTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
