// app/utils/decodeWithCandidates.js
import { decodeFunctionCalldata, decodeEventLog } from "./decoder.js";
import {
  lookupFunctionSignatures,
  lookupEventSignatures,
  sigToFunctionAbi,
  sigToEventAbi,
} from "./sourcify.js";
import {
  lookupFunctionCandidates,
  lookupEventCandidates,
} from "./backendAbiLookup.js";

function parseAbiJson(raw) {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export async function decodeFunctionWithCandidates(data) {
  const hex = data.startsWith("0x") ? data : "0x" + data;
  const selector = hex.slice(0, 10);

  const [dbRows, sourcifySigs] = await Promise.all([
    lookupFunctionCandidates(selector),
    lookupFunctionSignatures(selector),
  ]);

  const candidates = [
    ...dbRows
      .map((row) => ({ abi: parseAbiJson(row.abi), source: "cfd1" }))
      .filter((c) => c.abi),
    ...sourcifySigs.map((sig) => ({
      abi: sigToFunctionAbi(sig),
      source: "sourcify",
    })),
  ];

  for (const candidate of candidates) {
    try {
      const decoded = decodeFunctionCalldata(candidate.abi, hex);
      return { ...decoded, source: candidate.source, abi: candidate.abi };
    } catch {
      // selector/ABI mismatch — try next candidate
    }
  }
  return null;
}

export async function decodeEventWithCandidates(sign, topics, data) {
  const allTopics = topics ? topics.split(",") : [sign];
  const numIndexed = allTopics.length - 1;

  const [dbRows, sourcifySigs] = await Promise.all([
    lookupEventCandidates(sign),
    lookupEventSignatures(sign),
  ]);

  const candidates = [
    ...dbRows
      .map((row) => ({ abi: parseAbiJson(row.abi), source: "cfd1" }))
      .filter(
        (c) =>
          c.abi &&
          (c.abi.inputs || []).filter((i) => i.indexed).length === numIndexed,
      ),
    ...sourcifySigs.map((sig) => ({
      abi: sigToEventAbi(sig, numIndexed),
      source: "sourcify",
    })),
  ];

  for (const candidate of candidates) {
    try {
      const decoded = decodeEventLog(candidate.abi, allTopics, data || "0x");
      return {
        ...decoded,
        inputs: candidate.abi.inputs,
        source: candidate.source,
      };
    } catch {
      // ABI mismatch — try next candidate
    }
  }
  return null;
}
