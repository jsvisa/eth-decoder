import { decodeFunctionData, decodeEventLog as viemDecodeEventLog } from "viem";

/**
 * Returns true if the string is valid hex data (with or without 0x prefix).
 * Equivalent to the Python server's is_valid_hex_data().
 */
export function isValidHexData(data) {
  if (!data) return false;
  const hex = data.startsWith("0x") ? data.slice(2) : data;
  if (!hex) return false;
  return /^[0-9a-fA-F]+$/.test(hex);
}

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

/**
 * Recursively converts BigInt values to numbers (safe range) or strings
 * (unsafe range) so the result is JSON-safe and matches the decode backend's
 * API contract where small integers are plain JSON numbers.
 * Equivalent to the Python server's serialize_value().
 */
export function serializeValue(value) {
  if (typeof value === "bigint") {
    // Safe-range ints serialize as plain JSON numbers (matches the decode
    // backend's contract); only values that would lose precision stay strings.
    return value >= -MAX_SAFE && value <= MAX_SAFE
      ? Number(value)
      : value.toString();
  }
  if (Array.isArray(value)) return value.map(serializeValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, serializeValue(v)]),
    );
  }
  return value;
}

/**
 * Collapses an ABI parameter to its canonical type string,
 * expanding tuple types to "(type1,type2,...)" notation.
 */
function collapseType(param) {
  if (param.type === "tuple" || param.type.startsWith("tuple[")) {
    const inner = param.components.map(collapseType).join(",");
    const suffix = param.type.slice("tuple".length); // '' | '[]' | '[N]'
    return `(${inner})${suffix}`;
  }
  return param.type;
}

/**
 * Returns the canonical output type signature for a function ABI item,
 * e.g. "(uint256)" or "((uint128,bool))".
 * Equivalent to the Python server's extract_output_sign().
 */
export function extractOutputSign(abi) {
  const types = (abi.outputs || []).map(collapseType);
  return `(${types.join(",")})`;
}

/**
 * Decodes EVM calldata against a single ABI function item.
 * Returns { func: 'name(type,type)', args: { paramName: stringifiedValue } }.
 * Equivalent to the Python server's eth_decode_input() + serialize_value().
 *
 * @param {object} abiItem  - A single function ABI object (not an array)
 * @param {string} data     - Hex calldata (with or without 0x prefix)
 * @throws if the 4-byte selector does not match the ABI item
 */
export function decodeFunctionCalldata(abiItem, data) {
  if (!data.startsWith("0x")) data = "0x" + data;

  const { functionName, args } = decodeFunctionData({
    abi: [abiItem],
    data,
  });

  const inputs = abiItem.inputs || [];
  const paramTypes = inputs.map(collapseType).join(",");
  const func = `${functionName}(${paramTypes})`;

  const argsObj = {};
  inputs.forEach((inp, i) => {
    argsObj[inp.name || `arg${i}`] = serializeValue(args[i]);
  });

  return { func, args: argsObj };
}

/**
 * Decodes an EVM event log against a single ABI event item.
 * Returns { event: 'EventName', args: { paramName: stringifiedValue } }.
 * Equivalent to the Python server's eth_decode_log_as_dict() + serialize_value().
 *
 * @param {object} abiItem  - A single event ABI object (not an array)
 * @param {string[]} topics - Array of topic hex strings (topics[0] = event sig)
 * @param {string} data     - Log data hex (with or without 0x prefix)
 * @throws if the ABI does not match the topics
 */
export function decodeEventLog(abiItem, topics, data) {
  const { eventName, args } = viemDecodeEventLog({
    abi: [abiItem],
    topics,
    data: data || "0x",
  });

  return {
    event: eventName,
    args: serializeValue(args || {}),
  };
}
