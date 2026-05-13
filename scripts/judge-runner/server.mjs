#!/usr/bin/env node

import http from "node:http";
import os from "node:os";
import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

const PORT = Number.parseInt(process.env.JUDGE_RUNNER_PORT || "3088", 10);
const HOST = process.env.JUDGE_RUNNER_HOST || "127.0.0.1";
const EXECUTION_TIMEOUT_MS = Number.parseInt(
  process.env.JUDGE_EXECUTION_TIMEOUT_MS || "8000",
  10
);
const MAX_BUFFER_BYTES = 1024 * 1024;

function jsonResponse(reply, statusCode, payload) {
  reply.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  reply.end(JSON.stringify(payload));
}

function valueToJavaLiteral(value, type) {
  if (type === "int") {
    return `${Number(value)}`;
  }
  if (type === "boolean") {
    return value ? "true" : "false";
  }
  if (type === "string") {
    return JSON.stringify(String(value));
  }
  if (type === "int[]") {
    return `new int[]{${value.map((item) => Number(item)).join(", ")}}`;
  }
  if (type === "string[]") {
    return `new String[]{${value.map((item) => JSON.stringify(String(item))).join(", ")}}`;
  }
  if (type === "int[][]") {
    return `new int[][]{${value
      .map((row) => `{${row.map((item) => Number(item)).join(", ")}}`)
      .join(", ")}}`;
  }
  throw new Error(`Unsupported Java type: ${type}`);
}

function valueToCppLiteral(value, type) {
  if (type === "int") {
    return `${Number(value)}`;
  }
  if (type === "boolean") {
    return value ? "true" : "false";
  }
  if (type === "string") {
    return JSON.stringify(String(value));
  }
  if (type === "int[]") {
    return `{${value.map((item) => Number(item)).join(", ")}}`;
  }
  if (type === "string[]") {
    return `{${value.map((item) => JSON.stringify(String(item))).join(", ")}}`;
  }
  if (type === "int[][]") {
    return `{${value
      .map((row) => `{${row.map((item) => Number(item)).join(", ")}}`)
      .join(", ")}}`;
  }
  throw new Error(`Unsupported C++ type: ${type}`);
}

function valueToGoLiteral(value, type) {
  if (type === "int") {
    return `${Number(value)}`;
  }
  if (type === "boolean") {
    return value ? "true" : "false";
  }
  if (type === "string") {
    return JSON.stringify(String(value));
  }
  if (type === "int[]") {
    return `[]int{${value.map((item) => Number(item)).join(", ")}}`;
  }
  if (type === "string[]") {
    return `[]string{${value.map((item) => JSON.stringify(String(item))).join(", ")}}`;
  }
  if (type === "int[][]") {
    return `[][]int{${value
      .map((row) => `[]int{${row.map((item) => Number(item)).join(", ")}}`)
      .join(", ")}}`;
  }
  throw new Error(`Unsupported Go type: ${type}`);
}

function buildJavascriptRunner(problem, code, cases) {
  const functionName = problem.functionNameByLanguage.javascript;
  return `
${code}

const __resolveCandidate = () => {
  if (typeof module.exports === "function") return module.exports;
  if (module.exports && typeof module.exports["${functionName}"] === "function") {
    return module.exports["${functionName}"];
  }
  if (typeof globalThis["${functionName}"] === "function") {
    return globalThis["${functionName}"];
  }
  if (typeof Solution === "function") {
    const instance = new Solution();
    if (typeof instance["${functionName}"] === "function") {
      return (...args) => instance["${functionName}"](...args);
    }
  }
  throw new Error("Cannot resolve candidate function ${functionName}");
};

const __candidate = __resolveCandidate();
const __cases = ${JSON.stringify(cases)};
for (const item of __cases) {
  const result = __candidate(...item.input);
  console.log("__CASE__" + JSON.stringify({ index: item.index, result }));
}
`.trim();
}

function buildPythonRunner(problem, code, cases) {
  const functionName = problem.functionNameByLanguage.python;
  return `
import json

${code}

def __resolve_candidate():
    if "Solution" in globals():
        instance = Solution()
        if hasattr(instance, "${functionName}"):
            return getattr(instance, "${functionName}")
    if "${functionName}" in globals():
        return globals()["${functionName}"]
    raise Exception("Cannot resolve candidate function ${functionName}")

__candidate = __resolve_candidate()
__cases = ${JSON.stringify(cases)}
for item in __cases:
    result = __candidate(*item["input"])
    print("__CASE__" + json.dumps({"index": item["index"], "result": result}, ensure_ascii=False))
`.trim();
}

function buildJavaRunner(problem, code, cases) {
  const functionName = problem.functionNameByLanguage.java;
  const caseLines = cases
    .map((item) => {
      const params = problem.parameters
        .map((parameter, index) => valueToJavaLiteral(item.input[index], parameter.type))
        .join(", ");
      return [
        `results.add(caseResult(${item.index}, solution.${functionName}(${params})));`,
      ].join("\n");
    })
    .join("\n        ");

  return `
import java.util.*;

${code}

public class Main {
    private static String escape(String value) {
        return value
            .replace("\\\\", "\\\\\\\\")
            .replace("\\"", "\\\\\\"")
            .replace("\\n", "\\\\n")
            .replace("\\r", "\\\\r");
    }

    private static String toJson(Object value) {
        if (value == null) return "null";
        if (value instanceof String) return "\\"" + escape((String) value) + "\\"";
        if (value instanceof Boolean || value instanceof Number) return String.valueOf(value);
        if (value instanceof int[]) {
            int[] items = (int[]) value;
            StringBuilder builder = new StringBuilder("[");
            for (int index = 0; index < items.length; index++) {
                if (index > 0) builder.append(",");
                builder.append(items[index]);
            }
            return builder.append("]").toString();
        }
        if (value instanceof int[][]) {
            int[][] items = (int[][]) value;
            StringBuilder builder = new StringBuilder("[");
            for (int index = 0; index < items.length; index++) {
                if (index > 0) builder.append(",");
                builder.append(toJson(items[index]));
            }
            return builder.append("]").toString();
        }
        if (value instanceof String[]) {
            String[] items = (String[]) value;
            StringBuilder builder = new StringBuilder("[");
            for (int index = 0; index < items.length; index++) {
                if (index > 0) builder.append(",");
                builder.append(toJson(items[index]));
            }
            return builder.append("]").toString();
        }
        return toJson(String.valueOf(value));
    }

    private static String caseResult(int index, Object result) {
        return "__CASE__{\\"index\\":" + index + ",\\"result\\":" + toJson(result) + "}";
    }

    public static void main(String[] args) {
        Solution solution = new Solution();
        List<String> results = new ArrayList<>();
        ${caseLines}
        for (String line : results) {
            System.out.println(line);
        }
    }
}
`.trim();
}

function buildCppRunner(problem, code, cases) {
  const functionName = problem.functionNameByLanguage.cpp;
  const caseLines = cases
    .map((item) => {
      const params = problem.parameters
        .map((parameter, index) => valueToCppLiteral(item.input[index], parameter.type))
        .join(", ");
      return `cout << "__CASE__{\\"index\\":${item.index},\\"result\\":" << toJson(solution.${functionName}(${params})) << "}" << endl;`;
    })
    .join("\n    ");

  return `
#include <bits/stdc++.h>
using namespace std;

${code}

string escapeJson(const string& value) {
    string output;
    for (char ch : value) {
        if (ch == '\\\\' || ch == '"') output.push_back('\\\\');
        if (ch == '\\n') {
            output += "\\\\n";
            continue;
        }
        output.push_back(ch);
    }
    return output;
}

string toJson(int value) { return to_string(value); }
string toJson(bool value) { return value ? "true" : "false"; }
string toJson(const string& value) { return "\\"" + escapeJson(value) + "\\""; }

template <typename T>
string toJson(const vector<T>& items) {
    string output = "[";
    for (size_t index = 0; index < items.size(); index++) {
        if (index > 0) output += ",";
        output += toJson(items[index]);
    }
    output += "]";
    return output;
}

int main() {
    Solution solution;
    ${caseLines}
    return 0;
}
`.trim();
}

function buildGoRunner(problem, code, cases) {
  const functionName = problem.functionNameByLanguage.go;
  const caseLines = cases
    .map((item) => {
      const params = problem.parameters
        .map((parameter, index) => valueToGoLiteral(item.input[index], parameter.type))
        .join(", ");
      return `printCase(${item.index}, ${functionName}(${params}))`;
    })
    .join("\n    ");

  return `
package main

import (
  "encoding/json"
  "fmt"
)

${code.replace(/^package\s+main\s*/m, "")}

func printCase(index int, value interface{}) {
  raw, _ := json.Marshal(map[string]interface{}{"index": index, "result": value})
  fmt.Println("__CASE__" + string(raw))
}

func main() {
    ${caseLines}
}
`.trim();
}

function buildSourceFiles(problem, language, code, cases) {
  switch (language) {
    case "javascript":
      return {
        files: [{ name: "solution.js", content: buildJavascriptRunner(problem, code, cases) }],
        compile: null,
        run: ["node", ["solution.js"]],
      };
    case "python":
      return {
        files: [{ name: "solution.py", content: buildPythonRunner(problem, code, cases) }],
        compile: null,
        run: ["python3", ["solution.py"]],
      };
    case "java":
      return {
        files: [{ name: "Main.java", content: buildJavaRunner(problem, code, cases) }],
        compile: ["javac", ["Main.java"]],
        run: ["java", ["Main"]],
      };
    case "cpp":
      return {
        files: [{ name: "main.cpp", content: buildCppRunner(problem, code, cases) }],
        compile: ["g++", ["-std=c++17", "-O2", "-o", "main", "main.cpp"]],
        run: ["./main", []],
      };
    case "go":
      return {
        files: [{ name: "main.go", content: buildGoRunner(problem, code, cases) }],
        compile: null,
        run: ["go", ["run", "main.go"]],
      };
    default:
      throw new Error(`Unsupported language: ${language}`);
  }
}

function runCommand(command, args, cwd) {
  return spawnSync(command, args, {
    cwd,
    encoding: "utf-8",
    timeout: EXECUTION_TIMEOUT_MS,
    maxBuffer: MAX_BUFFER_BYTES,
  });
}

function normalizeCaseResult(stdout) {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("__CASE__"))
    .map((line) => JSON.parse(line.replace("__CASE__", "")));
}

function compareValues(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function executeJudge(payload) {
  const cases = payload.problem.testCases
    .map((item, index) => ({ ...item, index }))
    .filter((item) => (payload.mode === "submit" ? true : !item.hidden));
  const workdir = await fs.mkdtemp(path.join(os.tmpdir(), "resumer-judge-"));
  const startedAt = Date.now();

  try {
    const buildResult = buildSourceFiles(payload.problem, payload.language, payload.code, cases);
    for (const file of buildResult.files) {
      await fs.writeFile(path.join(workdir, file.name), file.content, "utf-8");
    }

    if (buildResult.compile) {
      const compileResult = runCommand(buildResult.compile[0], buildResult.compile[1], workdir);
      if (compileResult.error?.code === "ETIMEDOUT" || compileResult.signal === "SIGTERM") {
        return {
          compileStatus: "timeout",
          runStatus: "timeout",
          stdout: compileResult.stdout || "",
          stderr: compileResult.stderr || "编译超时",
          passedCount: 0,
          totalCount: cases.length,
          failedCases: [],
          timeMs: Date.now() - startedAt,
          memoryKb: 0,
          sampleResults: [],
        };
      }

      if (compileResult.status !== 0) {
        return {
          compileStatus: "error",
          runStatus: "compile_error",
          stdout: compileResult.stdout || "",
          stderr: compileResult.stderr || "编译失败",
          passedCount: 0,
          totalCount: cases.length,
          failedCases: [],
          timeMs: Date.now() - startedAt,
          memoryKb: 0,
          sampleResults: [],
        };
      }
    }

    const runResult = runCommand(buildResult.run[0], buildResult.run[1], workdir);
    if (runResult.error?.code === "ETIMEDOUT" || runResult.signal === "SIGTERM") {
      return {
        compileStatus: "success",
        runStatus: "timeout",
        stdout: runResult.stdout || "",
        stderr: runResult.stderr || "执行超时",
        passedCount: 0,
        totalCount: cases.length,
        failedCases: [],
        timeMs: Date.now() - startedAt,
        memoryKb: 0,
        sampleResults: [],
      };
    }

    if (runResult.status !== 0) {
      return {
        compileStatus: "success",
        runStatus: "runtime_error",
        stdout: runResult.stdout || "",
        stderr: runResult.stderr || "运行失败",
        passedCount: 0,
        totalCount: cases.length,
        failedCases: [],
        timeMs: Date.now() - startedAt,
        memoryKb: 0,
        sampleResults: [],
      };
    }

    const results = normalizeCaseResult(runResult.stdout || "");
    const sampleResults = [];
    const failedCases = [];
    let passedCount = 0;

    for (const item of cases) {
      const actualCase = results.find((result) => result.index === item.index);
      const passed = actualCase ? compareValues(actualCase.result, item.expected) : false;
      if (passed) {
        passedCount += 1;
      } else {
        failedCases.push({
          index: item.index,
          input: item.input,
          expected: item.expected,
          actual: actualCase?.result,
        });
      }

      sampleResults.push({
        index: item.index,
        passed,
        hidden: Boolean(item.hidden),
        actual: item.hidden ? undefined : actualCase?.result,
        expected: item.hidden ? undefined : item.expected,
      });
    }

    return {
      compileStatus: "success",
      runStatus: failedCases.length > 0 ? "failed" : "passed",
      stdout: runResult.stdout || "",
      stderr: runResult.stderr || "",
      passedCount,
      totalCount: cases.length,
      failedCases,
      timeMs: Date.now() - startedAt,
      memoryKb: 0,
      sampleResults,
    };
  } finally {
    await fs.rm(workdir, { recursive: true, force: true });
  }
}

const server = http.createServer(async (request, reply) => {
  if (request.method === "GET" && request.url === "/healthz") {
    jsonResponse(reply, 200, { ok: true });
    return;
  }

  if (request.method !== "POST" || request.url !== "/execute") {
    jsonResponse(reply, 404, { error: "Not found" });
    return;
  }

  let body = "";
  request.on("data", (chunk) => {
    body += chunk;
    if (body.length > MAX_BUFFER_BYTES) {
      request.destroy(new Error("Payload too large"));
    }
  });

  request.on("end", async () => {
    try {
      const payload = JSON.parse(body || "{}");
      if (!payload.language || !payload.problem || !payload.code) {
        jsonResponse(reply, 400, { error: "language, problem and code are required" });
        return;
      }

      const result = await executeJudge(payload);
      jsonResponse(reply, 200, { data: result });
    } catch (error) {
      jsonResponse(reply, 500, {
        error: error instanceof Error ? error.message : "Judge runner failed",
      });
    }
  });
});

server.listen(PORT, HOST, () => {
  console.log(`judge-runner listening on http://${HOST}:${PORT}`);
});
