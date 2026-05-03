const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const emptySessions = await prisma.interviewSession.findMany({
    where: {
      score: 0,
      messages: { none: {} }
    }
  });
  
  console.log(`Found ${emptySessions.length} empty sessions to delete.`);
  
  for (const session of emptySessions) {
    await prisma.interviewSession.delete({ where: { id: session.id } });
  }
  
  console.log('Done cleaning.');
}

main().catch(console.error).finally(() => prisma.$disconnect());
