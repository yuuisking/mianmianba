const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const sessions = await prisma.interviewSession.findMany({
    include: { messages: true }
  });
  console.log(`Total sessions: ${sessions.length}`);
  for (const s of sessions) {
    console.log(`ID: ${s.id}, Score: ${s.score}, Messages: ${s.messages.length}`);
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());
