/* eslint-disable @typescript-eslint/no-require-imports */
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

prisma.interviewSession
  .deleteMany({})
  .then(console.log)
  .finally(() => prisma.$disconnect());
