-- 为面试会话补齐房间身份列，修复生产环境 /api/sessions 创建失败。
ALTER TABLE "InterviewSession"
  ADD COLUMN IF NOT EXISTS "planId" TEXT,
  ADD COLUMN IF NOT EXISTS "stageId" TEXT,
  ADD COLUMN IF NOT EXISTS "roundId" TEXT,
  ADD COLUMN IF NOT EXISTS "sourceLaunchId" TEXT,
  ADD COLUMN IF NOT EXISTS "roomKey" TEXT;

CREATE INDEX IF NOT EXISTS "InterviewSession_userId_roomKey_idx"
  ON "InterviewSession"("userId", "roomKey");

CREATE INDEX IF NOT EXISTS "InterviewSession_userId_planId_stageId_roundId_mode_idx"
  ON "InterviewSession"("userId", "planId", "stageId", "roundId", "mode");
