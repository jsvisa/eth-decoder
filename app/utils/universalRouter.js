import { decodeFunctionData, decodeAbiParameters } from "viem";
import { serializeValue } from "./decoder.js";

// Command byte → human-readable name (Dispatcher.sol constants)
const COMMAND_NAMES = {
  0x00: "V3_SWAP_EXACT_IN",
  0x01: "V3_SWAP_EXACT_OUT",
  0x02: "PERMIT2_TRANSFER_FROM",
  0x03: "PERMIT2_PERMIT_BATCH",
  0x04: "SWEEP",
  0x05: "TRANSFER",
  0x06: "PAY_PORTION",
  0x08: "V2_SWAP_EXACT_IN",
  0x09: "V2_SWAP_EXACT_OUT",
  0x0a: "PERMIT2_PERMIT",
  0x0b: "WRAP_ETH",
  0x0c: "UNWRAP_WETH",
  0x0d: "PERMIT2_TRANSFER_FROM_BATCH",
  0x0e: "BALANCE_CHECK_ERC20",
  0x10: "V4_SWAP",
};

// ABI params for each command (inputs have no selector — bare ABI encoding)
const COMMAND_ABI_PARAMS = {
  0x00: [
    { name: "recipient", type: "address" },
    { name: "amountIn", type: "uint256" },
    { name: "amountOutMin", type: "uint256" },
    { name: "path", type: "bytes" },
    { name: "payerIsUser", type: "bool" },
  ],
  0x01: [
    { name: "recipient", type: "address" },
    { name: "amountOut", type: "uint256" },
    { name: "amountInMax", type: "uint256" },
    { name: "path", type: "bytes" },
    { name: "payerIsUser", type: "bool" },
  ],
  0x02: [
    { name: "token", type: "address" },
    { name: "recipient", type: "address" },
    { name: "amount", type: "uint160" },
  ],
  0x04: [
    { name: "token", type: "address" },
    { name: "recipient", type: "address" },
    { name: "amountMin", type: "uint160" },
  ],
  0x05: [
    { name: "token", type: "address" },
    { name: "recipient", type: "address" },
    { name: "value", type: "uint256" },
  ],
  0x06: [
    { name: "token", type: "address" },
    { name: "recipient", type: "address" },
    { name: "bips", type: "uint256" },
  ],
  0x08: [
    { name: "recipient", type: "address" },
    { name: "amountIn", type: "uint256" },
    { name: "amountOutMin", type: "uint256" },
    { name: "path", type: "address[]" },
    { name: "payerIsUser", type: "bool" },
  ],
  0x09: [
    { name: "recipient", type: "address" },
    { name: "amountOut", type: "uint256" },
    { name: "amountInMax", type: "uint256" },
    { name: "path", type: "address[]" },
    { name: "payerIsUser", type: "bool" },
  ],
  0x0b: [
    { name: "recipient", type: "address" },
    { name: "amountMin", type: "uint256" },
  ],
  0x0c: [
    { name: "recipient", type: "address" },
    { name: "amountMin", type: "uint256" },
  ],
  0x0e: [
    { name: "owner", type: "address" },
    { name: "token", type: "address" },
    { name: "minBalance", type: "uint256" },
  ],
};

const UR_EXECUTE_NO_DEADLINE = {
  name: "execute",
  type: "function",
  inputs: [
    { name: "commands", type: "bytes" },
    { name: "inputs", type: "bytes[]" },
  ],
  outputs: [],
  stateMutability: "payable",
};

const UR_EXECUTE_WITH_DEADLINE = {
  name: "execute",
  type: "function",
  inputs: [
    { name: "commands", type: "bytes" },
    { name: "inputs", type: "bytes[]" },
    { name: "deadline", type: "uint256" },
  ],
  outputs: [],
  stateMutability: "payable",
};

// Decode packed Uniswap V3 path: token(20 bytes) fee(3 bytes) token(20 bytes) ...
// Returns an array like ["0xtoken", 3000, "0xtoken", ...]
function decodeV3Path(pathHex) {
  const hex = (pathHex.startsWith("0x") ? pathHex.slice(2) : pathHex).toLowerCase();
  const hops = [];
  let i = 0;
  if (hex.length < 40) return hops;
  hops.push("0x" + hex.slice(0, 40));
  i = 40;
  while (i + 6 + 40 <= hex.length) {
    hops.push(parseInt(hex.slice(i, i + 6), 16)); // fee tier
    i += 6;
    hops.push("0x" + hex.slice(i, i + 40));
    i += 40;
  }
  return hops;
}

/**
 * Decodes a Uniswap Universal Router execute() call.
 * Returns null if data is not a recognised UR selector or decoding fails.
 * On success returns { func, args, inner_calls: [{index, name, allow_revert, args}] }.
 */
export function decodeUniversalRouter(data) {
  const hex = data.startsWith("0x") ? data : "0x" + data;
  const selector = hex.slice(0, 10).toLowerCase();

  let outerDecoded;
  try {
    const abi =
      selector === "0x3593564c"
        ? [UR_EXECUTE_WITH_DEADLINE]
        : [UR_EXECUTE_NO_DEADLINE];
    outerDecoded = decodeFunctionData({ abi, data: hex });
  } catch {
    return null;
  }

  const [commandsBytes, inputsArr, deadline] = outerDecoded.args;

  // viem returns `bytes` as a hex string "0x...", not a Uint8Array — parse manually
  const cmdHex = (typeof commandsBytes === "string" ? commandsBytes : "")
    .replace(/^0x/i, "");
  const cmdArray = cmdHex.match(/.{2}/g)?.map((b) => parseInt(b, 16)) ?? [];
  const inner_calls = cmdArray.map((cmdByte, idx) => {
    const cmd = cmdByte & 0x3f;
    const allow_revert = !!(cmdByte & 0x80);
    const name =
      COMMAND_NAMES[cmd] ?? `UNKNOWN_0x${cmd.toString(16).padStart(2, "0")}`;

    const inputHex = inputsArr[idx] ?? "0x";
    const abiParams = COMMAND_ABI_PARAMS[cmd];

    let args = null;
    if (abiParams && inputHex && inputHex !== "0x") {
      try {
        const decoded = decodeAbiParameters(abiParams, inputHex);
        args = {};
        abiParams.forEach((p, i) => {
          args[p.name] = serializeValue(decoded[i]);
        });
        // Expand packed V3 path into readable hops
        if ((cmd === 0x00 || cmd === 0x01) && args.path) {
          args.path_decoded = decodeV3Path(args.path);
        }
      } catch {
        args = { raw: inputHex };
      }
    } else if (inputHex && inputHex !== "0x") {
      args = { raw: inputHex };
    }

    return { index: idx, name, allow_revert, args };
  });

  const funcName =
    selector === "0x3593564c"
      ? "execute(bytes,bytes[],uint256)"
      : "execute(bytes,bytes[])";

  const outerArgs = {
    commands: "0x" + cmdHex,
    inputs: Array.from(inputsArr),
  };
  if (deadline !== undefined) outerArgs.deadline = serializeValue(deadline);

  return { func: funcName, args: outerArgs, inner_calls };
}
