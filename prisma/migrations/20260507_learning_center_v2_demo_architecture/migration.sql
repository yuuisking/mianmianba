-- Learning center v2: demo-style DB content factory.

CREATE TABLE "topic_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "topic_categories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "topic_banks" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "categoryId" TEXT NOT NULL,
    "targetRole" TEXT,
    "difficulty" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "coverUrl" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "documentCount" INTEGER NOT NULL DEFAULT 0,
    "questionCount" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "topic_banks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "chapters" (
    "id" TEXT NOT NULL,
    "topicBankId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "chapters_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "topicBankId" TEXT NOT NULL,
    "chapterId" TEXT,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "summary" TEXT,
    "difficulty" TEXT NOT NULL DEFAULT 'medium',
    "frequency" TEXT NOT NULL DEFAULT 'medium',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "currentVersionId" TEXT,
    "qualityScore" DOUBLE PRECISION,
    "originalityScore" DOUBLE PRECISION,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "favoriteCount" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "document_versions" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "learningContent" JSONB,
    "interviewContent" JSONB,
    "markdownContent" TEXT,
    "sourceSnapshot" JSONB,
    "qualityReportId" TEXT,
    "createdBy" TEXT,
    "createdByType" TEXT NOT NULL DEFAULT 'ai',
    "changeLog" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "document_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tags" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "document_tags" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "document_tags_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "favorites" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "favorites_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "learning_progress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "score" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "learning_progress_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "document_interview_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "totalScore" DOUBLE PRECISION,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "document_interview_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "user_answer_scores" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "userAnswer" TEXT NOT NULL,
    "standardAnswer" TEXT,
    "score" DOUBLE PRECISION,
    "hitPoints" JSONB,
    "missingPoints" JSONB,
    "factErrors" JSONB,
    "expressionFeedback" TEXT,
    "improvedAnswer" TEXT,
    "nextQuestion" TEXT,
    "criterionScores" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_answer_scores_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_tasks" (
    "id" TEXT NOT NULL,
    "taskType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "targetType" TEXT,
    "targetId" TEXT,
    "input" JSONB,
    "output" JSONB,
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "tokenUsage" JSONB,
    "costEstimate" DOUBLE PRECISION,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ai_tasks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_task_steps" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "agentName" TEXT NOT NULL,
    "stepOrder" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "input" JSONB,
    "output" JSONB,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    CONSTRAINT "ai_task_steps_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "quality_reports" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "versionId" TEXT,
    "totalScore" DOUBLE PRECISION,
    "factScore" DOUBLE PRECISION,
    "learningScore" DOUBLE PRECISION,
    "interviewScore" DOUBLE PRECISION,
    "originalityScore" DOUBLE PRECISION,
    "readabilityScore" DOUBLE PRECISION,
    "codeDiagramScore" DOUBLE PRECISION,
    "issues" JSONB,
    "suggestions" JSONB,
    "pass" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "quality_reports_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "review_tasks" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "reviewerId" TEXT,
    "reviewType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "review_tasks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "feedbacks" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "feedbacks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "source_materials" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "versionId" TEXT,
    "sourceUrl" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "trustLevel" TEXT NOT NULL,
    "facts" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "source_materials_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "prompt_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "content" TEXT NOT NULL,
    "variables" JSONB,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "prompt_templates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "topic_categories_slug_key" ON "topic_categories"("slug");
CREATE UNIQUE INDEX "topic_banks_slug_key" ON "topic_banks"("slug");
CREATE INDEX "topic_banks_categoryId_idx" ON "topic_banks"("categoryId");
CREATE INDEX "topic_banks_status_idx" ON "topic_banks"("status");
CREATE UNIQUE INDEX "chapters_topicBankId_slug_key" ON "chapters"("topicBankId", "slug");
CREATE INDEX "chapters_topicBankId_idx" ON "chapters"("topicBankId");
CREATE UNIQUE INDEX "documents_topicBankId_slug_key" ON "documents"("topicBankId", "slug");
CREATE INDEX "documents_topicBankId_idx" ON "documents"("topicBankId");
CREATE INDEX "documents_chapterId_idx" ON "documents"("chapterId");
CREATE INDEX "documents_status_idx" ON "documents"("status");
CREATE INDEX "document_versions_documentId_idx" ON "document_versions"("documentId");
CREATE UNIQUE INDEX "tags_name_key" ON "tags"("name");
CREATE UNIQUE INDEX "tags_slug_key" ON "tags"("slug");
CREATE UNIQUE INDEX "document_tags_documentId_tagId_key" ON "document_tags"("documentId", "tagId");
CREATE INDEX "document_tags_tagId_idx" ON "document_tags"("tagId");
CREATE UNIQUE INDEX "favorites_userId_documentId_key" ON "favorites"("userId", "documentId");
CREATE INDEX "favorites_userId_idx" ON "favorites"("userId");
CREATE UNIQUE INDEX "learning_progress_userId_documentId_key" ON "learning_progress"("userId", "documentId");
CREATE INDEX "learning_progress_userId_idx" ON "learning_progress"("userId");
CREATE INDEX "document_interview_sessions_userId_idx" ON "document_interview_sessions"("userId");
CREATE INDEX "document_interview_sessions_documentId_idx" ON "document_interview_sessions"("documentId");
CREATE INDEX "user_answer_scores_sessionId_idx" ON "user_answer_scores"("sessionId");
CREATE INDEX "user_answer_scores_documentId_idx" ON "user_answer_scores"("documentId");
CREATE INDEX "ai_tasks_status_idx" ON "ai_tasks"("status");
CREATE INDEX "ai_tasks_targetType_targetId_idx" ON "ai_tasks"("targetType", "targetId");
CREATE INDEX "ai_task_steps_taskId_idx" ON "ai_task_steps"("taskId");
CREATE INDEX "quality_reports_documentId_idx" ON "quality_reports"("documentId");
CREATE INDEX "review_tasks_documentId_idx" ON "review_tasks"("documentId");
CREATE INDEX "feedbacks_documentId_idx" ON "feedbacks"("documentId");
CREATE INDEX "source_materials_documentId_idx" ON "source_materials"("documentId");
CREATE UNIQUE INDEX "prompt_templates_name_key" ON "prompt_templates"("name");

ALTER TABLE "topic_banks" ADD CONSTRAINT "topic_banks_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "topic_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "chapters" ADD CONSTRAINT "chapters_topicBankId_fkey" FOREIGN KEY ("topicBankId") REFERENCES "topic_banks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "documents" ADD CONSTRAINT "documents_topicBankId_fkey" FOREIGN KEY ("topicBankId") REFERENCES "topic_banks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "documents" ADD CONSTRAINT "documents_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "chapters"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_qualityReportId_fkey" FOREIGN KEY ("qualityReportId") REFERENCES "quality_reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "document_tags" ADD CONSTRAINT "document_tags_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "document_tags" ADD CONSTRAINT "document_tags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "learning_progress" ADD CONSTRAINT "learning_progress_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "document_interview_sessions" ADD CONSTRAINT "document_interview_sessions_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_answer_scores" ADD CONSTRAINT "user_answer_scores_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "document_interview_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_answer_scores" ADD CONSTRAINT "user_answer_scores_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_task_steps" ADD CONSTRAINT "ai_task_steps_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ai_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quality_reports" ADD CONSTRAINT "quality_reports_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "review_tasks" ADD CONSTRAINT "review_tasks_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "feedbacks" ADD CONSTRAINT "feedbacks_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "source_materials" ADD CONSTRAINT "source_materials_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
