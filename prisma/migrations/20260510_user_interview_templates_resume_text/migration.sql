ALTER TABLE "user_interview_templates"
ADD COLUMN "resumeText" TEXT;

CREATE UNIQUE INDEX "user_interview_templates_userId_name_key"
ON "user_interview_templates"("userId", "name");
