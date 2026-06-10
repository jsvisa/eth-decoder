import {
  parseAbiItem,
  encodeFunctionData,
} from "viem";
import { normalizeArg } from "./normalizeArg.js";

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
