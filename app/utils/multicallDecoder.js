import { decodeFunctionData } from "viem";
import { serializeValue } from "./decoder.js";

// All known multicall ABI items, keyed by 4-byte selector
export const MULTICALL_ABIS = {
  // multicall(bytes[])  — bytes_array, each element is full calldata to the same contract
  "0xac9650d8": {
    abi: {
      name: "multicall",
      type: "function",
      inputs: [{ name: "data", type: "bytes[]" }],
      outputs: [],
      stateMutability: "payable",
    },
    arrayParam: "data",
    dataField: "data", // for bytes[], the element itself is the calldata
    targetField: null,
    isBytesArray: true,
  },

  // multicall((bool,bytes)[])  — tuple_array, OZ-style
  "0x60fc8466": {
    abi: {
      name: "multicall",
      type: "function",
      inputs: [
        {
          name: "calls",
          type: "tuple[]",
          components: [
            { name: "allowFailure", type: "bool" },
            { name: "callData", type: "bytes" },
          ],
        },
      ],
      outputs: [],
      stateMutability: "payable",
    },
    arrayParam: "calls",
    dataField: "callData",
    targetField: null,
  },

  // multicall((address,bytes,uint256,bool,bytes32)[])  — weituo custom tuple_array
  "0x374f435d": {
    abi: {
      name: "multicall",
      type: "function",
      inputs: [
        {
          name: "bundle",
          type: "tuple[]",
          components: [
            { name: "to", type: "address" },
            { name: "data", type: "bytes" },
            { name: "value", type: "uint256" },
            { name: "skipRevert", type: "bool" },
            { name: "callbackHash", type: "bytes32" },
          ],
        },
      ],
      outputs: [],
      stateMutability: "payable",
    },
    arrayParam: "bundle",
    dataField: "data",
    targetField: "to",
  },

  // aggregate3((address,bool,bytes)[])  — Multicall3
  "0x82ad56cb": {
    abi: {
      name: "aggregate3",
      type: "function",
      inputs: [
        {
          name: "calls",
          type: "tuple[]",
          components: [
            { name: "target", type: "address" },
            { name: "allowFailure", type: "bool" },
            { name: "callData", type: "bytes" },
          ],
        },
      ],
      outputs: [],
      stateMutability: "payable",
    },
    arrayParam: "calls",
    dataField: "callData",
    targetField: "target",
  },

  // execute((address,uint256,bytes)[],bytes32)  — tuple_array + bytes32 salt/commit
  "0x571d3dc7": {
    abi: {
      name: "execute",
      type: "function",
      inputs: [
        {
          name: "calls",
          type: "tuple[]",
          components: [
            { name: "to", type: "address" },
            { name: "value", type: "uint256" },
            { name: "data", type: "bytes" },
          ],
        },
        { name: "commit", type: "bytes32" },
      ],
      outputs: [],
      stateMutability: "payable",
    },
    arrayParam: "calls",
    dataField: "data",
    targetField: "to",
  },

  // multicall(uint256,bytes[])  — bytes_array with a leading deadline (Uniswap V3 SwapRouter02)
  "0x5ae401dc": {
    abi: {
      name: "multicall",
      type: "function",
      inputs: [
        { name: "deadline", type: "uint256" },
        { name: "data", type: "bytes[]" },
      ],
      outputs: [],
      stateMutability: "payable",
    },
    arrayParam: "data",
    dataField: "data",
    targetField: null,
    isBytesArray: true,
    arrayIndex: 1,
  },

  // execute(address[],uint256[],bytes[],bytes32)  — parallel_arrays (OZ Governor)
  "0x2656227d": {
    abi: {
      name: "execute",
      type: "function",
      inputs: [
        { name: "targets", type: "address[]" },
        { name: "values", type: "uint256[]" },
        { name: "calldatas", type: "bytes[]" },
        { name: "descriptionHash", type: "bytes32" },
      ],
      outputs: [],
      stateMutability: "payable",
    },
    isParallelArrays: true,
    targetParam: "targets",
    valueParam: "values",
    dataParam: "calldatas",
  },
};

/**
 * Decodes a known multicall variant (bytes_array or tuple_array).
 * Returns { func, inner_calls: [{index, target?, selector, data, ...extras}] } or null.
 */
export function decodeMulticall(data) {
  const hex = data.startsWith("0x") ? data : "0x" + data;
  const selector = hex.slice(0, 10).toLowerCase();
  const config = MULTICALL_ABIS[selector];
  if (!config) return null;

  let decoded;
  try {
    decoded = decodeFunctionData({ abi: [config.abi], data: hex });
  } catch {
    return null;
  }

  let inner_calls;
  if (config.isParallelArrays) {
    // Parallel arrays — targets/values/calldatas are separate top-level args
    const argByName = {};
    decoded.args.forEach((arg, i) => {
      argByName[config.abi.inputs[i]?.name] = arg;
    });
    const targets = argByName[config.targetParam] ?? [];
    const values = argByName[config.valueParam] ?? [];
    const calldatas = argByName[config.dataParam] ?? [];

    inner_calls = calldatas.map((innerData, idx) => {
      const dataHex = typeof innerData === "string" ? innerData : "0x";
      const inner_selector =
        dataHex.length >= 10 ? dataHex.slice(0, 10).toLowerCase() : null;
      const entry = { index: idx, selector: inner_selector, data: dataHex };
      if (targets[idx] !== undefined)
        entry.target = serializeValue(targets[idx]);
      if (values[idx] !== undefined) entry.value = serializeValue(values[idx]);
      return entry;
    });
  } else {
    const callsArg = decoded.args[config.arrayIndex ?? 0];
    const calls = Array.isArray(callsArg) ? callsArg : [];

    inner_calls = calls.map((call, idx) => {
      let innerData, target;

      if (config.isBytesArray) {
        // bytes[] — element is the raw calldata hex string
        innerData = typeof call === "string" ? call : serializeValue(call);
        target = null;
      } else {
        innerData = call[config.dataField] ?? "0x";
        target = config.targetField ? call[config.targetField] : null;
      }

      const dataHex = typeof innerData === "string" ? innerData : "0x";
      const inner_selector =
        dataHex.length >= 10 ? dataHex.slice(0, 10).toLowerCase() : null;

      const entry = { index: idx, selector: inner_selector, data: dataHex };
      if (target !== null) entry.target = serializeValue(target);

      // Include remaining tuple fields (value, skipRevert, allowFailure, etc.)
      if (!config.isBytesArray && call && typeof call === "object") {
        for (const [k, v] of Object.entries(call)) {
          if (k !== config.dataField && k !== config.targetField) {
            entry[k] = serializeValue(v);
          }
        }
      }

      return entry;
    });
  }

  // Build named outer args (e.g. { calls: [...], commit: '0x...' }) with serialized values
  const outerArgs = {};
  decoded.args.forEach((arg, i) => {
    const name = config.abi.inputs[i]?.name || `arg${i}`;
    outerArgs[name] = serializeValue(arg);
  });

  const funcSig =
    config.abi.name +
    "(" +
    config.abi.inputs
      .map((inp) =>
        inp.components
          ? "(" + inp.components.map((c) => c.type).join(",") + ")[]"
          : inp.type,
      )
      .join(",") +
    ")";

  return { func: funcSig, args: outerArgs, inner_calls };
}
