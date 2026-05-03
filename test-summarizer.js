require("dotenv").config({ path: ".env.local" });
const { summarizeDocument } = require("./src/lib/ai/summarizer.ts"); // Wait, this won't work in JS without compilation.
