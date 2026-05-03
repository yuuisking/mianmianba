import * as fs from 'fs';
import * as path from 'path';
import { uploadDocumentToKB } from '../src/lib/knowledge/volc';

async function importKnowledgeBase() {
  console.log('Starting knowledge base import...');
  const questionsDir = path.join(process.cwd(), 'assets', 'questions');
  
  if (!fs.existsSync(questionsDir)) {
    fs.mkdirSync(questionsDir, { recursive: true });
    // Create a dummy sample
    fs.writeFileSync(path.join(questionsDir, 'sample-react.md'), '# React Interview\n\nQ: What is React?\nA: React is a UI library.');
    console.log('Created dummy question directory and sample.');
  }

  const files = fs.readdirSync(questionsDir);
  for (const file of files) {
    if (file.endsWith('.md') || file.endsWith('.txt')) {
      const content = fs.readFileSync(path.join(questionsDir, file), 'utf8');
      console.log(`Processing file: ${file}`);
      try {
        await uploadDocumentToKB(file, content);
        console.log(`Successfully uploaded ${file} to Knowledge Base.`);
      } catch (error) {
        console.error(`Failed to upload ${file}:`, error);
      }
    }
  }
  
  console.log('Import finished.');
}

importKnowledgeBase().catch(console.error);
