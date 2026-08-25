import { parse } from "@solidity-parser/parser";

const cache = new Map();

function walkNode(node, functions, fileName) {
  if (!node || typeof node !== "object") return;

  if (node.type === "FunctionDefinition") {
    if (!node.name) return; // skip receive/fallback
    functions.push({
      name: node.name,
      file: fileName,
      line: node.loc?.start?.line || 0,
    });
    return;
  }

  if (node.type === "EventDefinition" && node.name) {
    functions.push({
      name: node.name,
      file: fileName,
      line: node.loc?.start?.line || 0,
    });
    return;
  }

  if (node.type === "CustomErrorDefinition" && node.name) {
    functions.push({
      name: node.name,
      file: fileName,
      line: node.loc?.start?.line || 0,
    });
    return;
  }

  if (Array.isArray(node)) {
    for (const item of node) {
      walkNode(item, functions, fileName);
    }
    return;
  }

  // Walk children for container nodes (ContractDefinition, SourceUnit, etc.)
  for (const key of Object.keys(node)) {
    if (key === "parent" || key === "loc" || key === "range") continue;
    const child = node[key];
    if (child && typeof child === "object") {
      walkNode(child, functions, fileName);
    }
  }
}

export function buildFunctionMap(sources) {
  if (!sources) return null;

  const cacheKey = Object.keys(sources)
    .sort()
    .map((k) => `${k}:${sources[k].length}`)
    .join(",");
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const map = new Map();
  for (const [file, content] of Object.entries(sources)) {
    try {
      const ast = parse(content, { loc: true, range: true });
      const fns = [];
      walkNode(ast, fns, file);
      for (const fn of fns) {
        if (!map.has(fn.name)) {
          map.set(fn.name, fn);
        }
      }
    } catch {
      // Skip invalid files
    }
  }

  cache.set(cacheKey, map);
  return map;
}

export function findFunctionSource(functionName, sources) {
  if (!functionName || !sources) return null;
  const baseName = functionName.split("(")[0];
  if (!baseName) return null;

  const map = buildFunctionMap(sources);
  return map.get(baseName) || null;
}
