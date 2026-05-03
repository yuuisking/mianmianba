import { NextResponse } from 'next/server';
import { learningDb } from '@/lib/db/learningDb';

export async function GET() {
  const data = learningDb.getLearningData();
  
  // No mock data injection anymore. Real CMS data only.
  
  return NextResponse.json({
    kbs: data.kbs,
    trees: data.trees,
    contents: data.contents
  });
}
