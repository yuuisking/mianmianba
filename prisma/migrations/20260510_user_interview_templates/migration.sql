CREATE TABLE "user_interview_templates" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "companyName" TEXT,
    "roleName" TEXT,
    "targetLevel" TEXT,
    "focusKeyword" TEXT,
    "interviewIntensity" TEXT,
    "mode" TEXT,
    "limitType" TEXT,
    "questionLimit" INTEGER,
    "durationLimitMinutes" INTEGER,
    "interviewerName" TEXT,
    "interviewerStyle" TEXT,
    "portraitUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_interview_templates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "user_interview_templates_userId_updatedAt_idx"
ON "user_interview_templates"("userId", "updatedAt");

ALTER TABLE "user_interview_templates"
ADD CONSTRAINT "user_interview_templates_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
