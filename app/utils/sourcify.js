import { getSignaturesFromCache, setSignaturesInCache } from "./serverSigCache";

const SOURCIFY_LOOKUP_URL =
  "https://api.4byte.sourcify.dev/signature-database/v1/lookup";

export async function lookupFunctionSignatures(selector) {
  const cached = await getSignaturesFromCache(selector);
  if (cached) return cached;

  try {
    const res = await fetch(`${SOURCIFY_LOOKUP_URL}?function=${selector}`);
    if (!res.ok) return [];
    const json = await res.json();
    if (!json.ok) return [];
    const sigs = (json.result?.function?.[selector] ?? []).map((e) => e.name);
    setSignaturesInCache(selector, sigs).catch(() => {});
    return sigs;
  } catch {
    return [];
  }
}

export async function lookupEventSignatures(topic0) {
  const cached = await getSignaturesFromCache(topic0);
  if (cached) return cached;

  try {
    const res = await fetch(`${SOURCIFY_LOOKUP_URL}?event=${topic0}`);
    if (!res.ok) return [];
    const json = await res.json();
    if (!json.ok) return [];
    const sigs = (json.result?.event?.[topic0] ?? []).map((e) => e.name);
    setSignaturesInCache(topic0, sigs).catch(() => {});
    return sigs;
  } catch {
    return [];
  }
}

// Split top-level comma-separated param type strings, respecting tuple nesting.
function parseParamTypes(raw) {
  if (!raw.trim()) return [];
  const out = [];
  let depth = 0,
    cur = "";
  for (const ch of raw) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

// Convert a canonical type string to a viem ABI input object.
// Handles primitives, arrays, and nested tuples.
function parseType(raw) {
  raw = raw.trim();
  if (!raw.startsWith("(")) return { type: raw };

  let depth = 0,
    close = -1;
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === "(") depth++;
    else if (raw[i] === ")") {
      depth--;
      if (depth === 0) {
        close = i;
        break;
      }
    }
  }
  const suffix = raw.slice(close + 1); // '' | '[]' | '[N]'
  const components = parseParamTypes(raw.slice(1, close)).map((t, i) => ({
    name: `arg${i}`,
    ...parseType(t),
  }));
  return { type: `tuple${suffix}`, components };
}

// Build a minimal function ABI item from a canonical signature string.
// e.g. 'withdraw(uint256,uint32,bytes,bytes32[])' or 'foo((uint256,address),bytes32)'
export function sigToFunctionAbi(sig) {
  const m = sig.match(/^(\w+)\((.*)\)$/);
  if (!m) throw new Error(`Invalid function signature: ${sig}`);
  return {
    type: "function",
    name: m[1],
    inputs: parseParamTypes(m[2]).map((t, i) => ({
      name: `arg${i}`,
      ...parseType(t),
    })),
  };
}

// Build a minimal event ABI item from a canonical signature string.
// numIndexed: number of params to mark indexed (inferred from topics count).
export function sigToEventAbi(sig, numIndexed = 0) {
  const m = sig.match(/^(\w+)\((.*)\)$/);
  if (!m) throw new Error(`Invalid event signature: ${sig}`);
  return {
    type: "event",
    name: m[1],
    inputs: parseParamTypes(m[2]).map((t, i) => ({
      name: `arg${i}`,
      indexed: i < numIndexed,
      ...parseType(t),
    })),
    anonymous: false,
  };
}

export async function fetchContractInfoFromSourcify(address, chainId) {
  try {
    const response = await fetch(
      `https://sourcify.dev/server/v2/contract/${chainId}/${address}?fields=abi,metadata,sources`,
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const abi = data.abi;

    if (!abi) {
      return null;
    }

    const contractName = data.metadata?.settings?.compilationTarget
      ? Object.values(data.metadata.settings.compilationTarget)[0]
      : null;

    const sourceCode = data.sources
      ? Object.fromEntries(
          Object.entries(data.sources).map(([file, info]) => [
            file,
            typeof info === "object" ? info.content || "" : info,
          ]),
        )
      : null;

    const compilerVersion = data.metadata?.compiler?.version || null;

    return {
      abi,
      contractName,
      source: "sourcify",
      sourceCode,
      compilerVersion,
    };
  } catch (e) {
    console.error("Sourcify fetch error:", e);
    return null;
  }
}
