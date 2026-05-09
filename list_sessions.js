/* eslint-disable @typescript-eslint/no-require-imports */
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const sessions = await prisma.interviewSession.findMany({
    include: { messages: true },
  });
  console.log(`Total sessions: ${sessions.length}`);
  for (const session of sessions) {
    console.log(`ID: ${session.id}, Score: ${session.score}, Messages: ${session.messages.length}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
