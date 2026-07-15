import { toFunctionSelector } from "viem";
import { normalizeArg } from "../../utils/normalizeArg";

export const getFunctionSig = (func) => {
  const types = func.inputs?.map((input) => input.type).join(",") || "";
  return `${func.name}(${types})`;
};

export const getFunctionSelector = (func) => {
  if (!func) return null;
  try {
    return toFunctionSelector(func);
  } catch {
    return null;
  }
};

export const getDefaultArgValue = (input) => {
  if (!input) return "";
  const type = input.type;
  if (type === "tuple" && input.components) {
    return input.components.map((component) => getDefaultArgValue(component));
  }
  if (type.endsWith("[]")) {
    return [];
  }
  return "";
};

export const viemDecodedToArgValue = (value, input) => {
  if (value === undefined || value === null) return getDefaultArgValue(input);
  const type = input.type;

  const arrayMatch = type.match(/^(.+)\[(\d*)\]$/);
  if (arrayMatch) {
    const baseType = arrayMatch[1];
    const baseInput =
      baseType === "tuple"
        ? { type: "tuple", components: input.components }
        : { type: baseType };
    return Array.isArray(value)
      ? value.map((item) => viemDecodedToArgValue(item, baseInput))
      : [];
  }

  if (type === "tuple" && input.components) {
    return input.components.map((component, index) => {
      const componentValue = Array.isArray(value)
        ? value[index]
        : value[component.name];
      return viemDecodedToArgValue(componentValue, component);
    });
  }

  if (typeof value === "bigint") return value.toString();
  if (typeof value === "boolean") return value.toString();
  return String(value);
};

export const normalizeInputValue = (value, input) => {
  const nextValue = value ?? getDefaultArgValue(input);
  if (typeof nextValue === "string" && /^.+\[(\d*)\]$/.test(input.type)) {
    if (!nextValue.trim()) {
      return normalizeArg([], input.type, input.components);
    }
    try {
      return normalizeArg(JSON.parse(nextValue), input.type, input.components);
    } catch {
      return normalizeArg(
        nextValue.split(",").map((item) => item.trim()),
        input.type,
        input.components,
      );
    }
  }
  return normalizeArg(nextValue, input.type, input.components);
};

export const isReadOnly = (func) =>
  func?.stateMutability === "view" || func?.stateMutability === "pure";

export const isPayable = (func) => func?.stateMutability === "payable";

/**
 * Find a function in an ABI by name or canonical signature (e.g. "transfer(address,uint256)").
 * @param {Array} abi
 * @param {string} functionName
 * @returns {object|null}
 */
export function findFunctionInAbi(abi, functionName) {
  return (
    abi.find((item) => {
      if (item.type !== "function") return false;
      if (functionName.includes("(")) {
        return getFunctionSig(item) === functionName;
      }
      return item.name === functionName;
    }) || null
  );
}

/**
 * Recursively convert BigInt values to strings for JSON serialization.
 */
export function serializeBigInts(value) {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(serializeBigInts);
  if (value && typeof value === "object") {
    const serialized = {};
    for (const key in value) {
      serialized[key] = serializeBigInts(value[key]);
    }
    return serialized;
  }
  return value;
}
