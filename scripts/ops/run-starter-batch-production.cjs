const fs = require("fs");
const path = require("path");
const Module = require("module");
const ts = require("typescript");

const projectRoot = path.resolve(__dirname, "../..");
const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function soloResolveFilename(request, parent, isMain, options) {
  if (request === "server-only") {
    return path.join(projectRoot, "scripts/ops/server-only-stub.js");
  }
  if (request.startsWith("@/")) {
    request = path.join(projectRoot, "src", request.slice(2));
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

function compileTs(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const result = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      resolveJsonModule: true,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      jsx: ts.JsxEmit.ReactJSX,
    },
    fileName: filename,
  });
  module._compile(result.outputText, filename);
}

require.extensions[".ts"] = compileTs;
require.extensions[".tsx"] = compileTs;

function loadEnvFile(filePath, override = false) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }
    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    if (!key || (!override && process.env[key])) {
      continue;
    }
    const normalizedValue = rawValue.replace(/^['"]/, "").replace(/['"]$/, "");
    process.env[key] = normalizedValue;
  }
}

const DEFAULT_TOPICS = [
  "Java 基础",
  "Java 并发",
  "MySQL",
  "Redis",
  "JavaScript",
  "React",
  "计算机网络",
  "操作系统",
];

function parseArg(name, fallback) {
  const found = process.argv.find((item) => item.startsWith(`${name}=`));
  if (!found) {
    return fallback;
  }
  return found.slice(name.length + 1);
}

async function main() {
  process.chdir(projectRoot);
  loadEnvFile(path.join(projectRoot, ".env"));
  loadEnvFile(path.join(projectRoot, ".env.local"), true);
  const topicsRaw = parseArg("--topics", DEFAULT_TOPICS.join(","));
  const batchSizeRaw = parseArg("--batch-size", "2");
  const topics = topicsRaw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const batchSize = Number.parseInt(batchSizeRaw, 10);

  const { runStarterBatchProduction } = require(path.join(projectRoot, "src/lib/learning/batchProductionService.ts"));
  const summary = await runStarterBatchProduction({
    topics,
    batchSize: Number.isNaN(batchSize) ? 2 : batchSize,
    triggeredBy: null,
  });

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
