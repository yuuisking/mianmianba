-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- AlterTable
ALTER TABLE "User"
ADD COLUMN "avatarUrl" TEXT,
ADD COLUMN "lastLoginAt" TIMESTAMP(3),
ADD COLUMN "nickname" TEXT,
ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'USER',
ADD COLUMN "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN "vipExpiresAt" TIMESTAMP(3),
ADD COLUMN "vipType" TEXT NOT NULL DEFAULT 'none';

-- Backfill the known administrator account.
UPDATE "User"
SET "role" = 'ADMIN'
WHERE LOWER("email") = 'admin@resumer.com';
