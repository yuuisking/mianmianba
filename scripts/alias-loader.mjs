import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const projectRoot = process.cwd();

/**
 * 尝试把无扩展名的本地路径补成可执行的真实文件 URL。
 * @param {string} specifier 原始模块路径。
 * @returns {string | null} 可解析的文件 URL，找不到时返回 `null`。
 */
function resolveLocalTsUrl(specifier) {
  const absolutePath = path.isAbsolute(specifier) ? specifier : path.join(projectRoot, specifier);
  const candidates = [
    absolutePath,
    `${absolutePath}.ts`,
    `${absolutePath}.tsx`,
    path.join(absolutePath, "index.ts"),
    path.join(absolutePath, "index.tsx"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return pathToFileURL(candidate).href;
    }
  }
  return null;
}

/**
 * 为校验脚本补齐 `@/` 别名与无扩展名 TypeScript 解析能力。
 * @param {string} specifier 原始导入路径。
 * @param {object} context Node ESM 上下文。
 * @param {(specifier: string, context: object, defaultResolve: Function) => Promise<{ url: string }>} defaultResolve Node 默认解析器。
 * @returns {Promise<{ url: string }>} 解析结果。
 */
export async function resolve(specifier, context, defaultResolve) {
  if (specifier.startsWith("@/")) {
    const mapped = resolveLocalTsUrl(path.join("src", specifier.slice(2)));
    if (mapped) {
      return { url: mapped, shortCircuit: true };
    }
  }

  if (specifier.startsWith("./") || specifier.startsWith("../") || specifier.startsWith("/")) {
    const parentPath = context.parentURL ? new URL(".", context.parentURL).pathname : projectRoot;
    const mapped = resolveLocalTsUrl(path.resolve(parentPath, specifier));
    if (mapped) {
      return { url: mapped, shortCircuit: true };
    }
  }

  return defaultResolve(specifier, context, defaultResolve);
}
