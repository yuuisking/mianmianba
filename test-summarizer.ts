require("dotenv").config({ path: ".env.local" });
const { summarizeDocument } = require("./src/lib/ai/summarizer");

async function run() {
  try {
    const res = await summarizeDocument("https://github.com/Snailclimb/JavaGuide/blob/main/docs/java/collection/hashmap-source-code.md");
    console.log("Success:", res);
  } catch (e) {
    console.error("Error:", e);
  }
}
run();
