import {
  parseAbiItem,
  encodeAbiParameters,
  encodeFunctionData,
  decodeFunctionData,
} from "viem";
import { normalizeArg } from "./normalizeArg.js";
import { MULTICALL_ABIS } from "./multicallDecoder.js";
import {
  COMMAND_ABI_PARAMS,
  UR_EXECUTE_NO_DEADLINE,
  UR_EXECUTE_WITH_DEADLINE,
} from "./universalRouter.js";

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
      toPositional(
        c.name && c.name in value ? value[c.name] : positional[i],
        c,
      ),
    );
  }
  return value;
}

function orderedArgs(inputs, args) {
  const obj = args ?? {};
  const keys = Object.keys(obj);
  const useNames =
    inputs.length > 0 && inputs.every((inp) => inp.name && inp.name in obj);
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
    throw new Error(
      `Inner call index ${index} out of range (0-${calls.length - 1})`,
    );
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

export function reencodeURInput(outerData, index, newArgs) {
  const hex = outerData.startsWith("0x") ? outerData : "0x" + outerData;
  const selector = hex.slice(0, 10).toLowerCase();
  const abi =
    selector === "0x3593564c"
      ? [UR_EXECUTE_WITH_DEADLINE]
      : selector === "0x24856bc3"
        ? [UR_EXECUTE_NO_DEADLINE]
        : null;
  if (!abi) throw new Error(`Not a Universal Router selector: ${selector}`);

  const decoded = decodeFunctionData({ abi, data: hex });
  const [commands, inputsArr, deadline] = decoded.args;
  const inputs = [...inputsArr];
  if (index < 0 || index >= inputs.length) {
    throw new Error(
      `Command index ${index} out of range (0-${inputs.length - 1})`,
    );
  }

  const cmdHex = commands.replace(/^0x/i, "");
  const cmdByte = parseInt(cmdHex.slice(index * 2, index * 2 + 2), 16);
  const cmd = cmdByte & 0x3f;
  const params = COMMAND_ABI_PARAMS[cmd];
  const args = newArgs ?? {};

  // raw always wins: the decoder emits {raw} when it couldn't decode a known
  // command's input, and no COMMAND_ABI_PARAMS entry has a param named "raw".
  if (typeof args.raw === "string") {
    inputs[index] = args.raw;
  } else if (params) {
    const values = params.map((p) =>
      normalizeArg(toPositional(args[p.name], p), p.type, p.components),
    );
    inputs[index] = encodeAbiParameters(params, values);
  } else {
    throw new Error(
      `No ABI params known for command 0x${cmd.toString(16).padStart(2, "0")}; ` +
        `edit it as {"raw": "0x..."} instead`,
    );
  }

  const outerArgs =
    deadline !== undefined ? [commands, inputs, deadline] : [commands, inputs];
  return encodeFunctionData({ abi, functionName: "execute", args: outerArgs });
}
