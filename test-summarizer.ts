/* eslint-disable @typescript-eslint/no-require-imports */
require("dotenv").config({ path: ".env.local" });

import { summarizeDocument } from "./src/lib/ai/summarizer";

async function run() {
  try {
    const res = await summarizeDocument("https://github.com/Snailclimb/JavaGuide/blob/main/docs/java/collection/hashmap-source-code.md");
    console.log("Success:", res);
  } catch (error: unknown) {
    console.error("Error:", error);
  }
}

run();
