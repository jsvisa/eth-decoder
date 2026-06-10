import {
  parseAbiItem,
  encodeFunctionData,
  decodeFunctionData,
} from "viem";
import { normalizeArg } from "./normalizeArg.js";
import { MULTICALL_ABIS } from "./multicallDecoder.js";

// Convert object-shaped tuples (as produced by decoders) to positional arrays
// so normalizeArg / viem can consume them. Matches by component name when
// available, falls back to object insertion order.
function toPositional(value, param) {
  const arrayMatch = param.type.match(/^(.+)\[(\d*)\]$/);
  if (arrayMatch && Array.isArray(value)) {
    const baseParam = { ...param, type: arrayMatch[1] };
    return value.map((v) => toPositional(v, baseParam));
  }
  if (
    param.components &&
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  ) {
    const positional = Object.values(value);
    return param.components.map((c, i) =>
      toPositional(c.name && c.name in value ? value[c.name] : positional[i], c),
    );
  }
  return value;
}

function orderedArgs(inputs, args) {
  const obj = args ?? {};
  const keys = Object.keys(obj);
  const useNames = inputs.length > 0 && inputs.every((inp) => inp.name && inp.name in obj);
  return inputs.map((inp, i) => {
    const raw = useNames ? obj[inp.name] : obj[keys[i]];
    return normalizeArg(toPositional(raw, inp), inp.type, inp.components);
  });
}

export function encodeFunction(funcSig, args) {
  const abiItem = parseAbiItem("function " + funcSig);
  return encodeFunctionData({
    abi: [abiItem],
    functionName: abiItem.name,
    args: orderedArgs(abiItem.inputs ?? [], args),
  });
}

export function reencodeMulticallInner(outerData, index, newInnerHex) {
  const hex = outerData.startsWith("0x") ? outerData : "0x" + outerData;
  const selector = hex.slice(0, 10).toLowerCase();
  const config = MULTICALL_ABIS[selector];
  if (!config) throw new Error(`Not a known multicall selector: ${selector}`);

  const decoded = decodeFunctionData({ abi: [config.abi], data: hex });
  const calls = [...decoded.args[0]];
  if (index < 0 || index >= calls.length) {
    throw new Error(`Inner call index ${index} out of range (0-${calls.length - 1})`);
  }

  if (config.isBytesArray) {
    calls[index] = newInnerHex;
  } else {
    calls[index] = { ...calls[index], [config.dataField]: newInnerHex };
  }

  return encodeFunctionData({
    abi: [config.abi],
    functionName: config.abi.name,
    args: [calls],
  });
}
