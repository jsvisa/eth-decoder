/**
 * Shared validation utilities for Ethereum addresses and other common types
 */

/**
 * Check if a string is a valid Ethereum address
 * @param {string} address - The address to validate
 * @returns {boolean} - True if valid, false otherwise
 */
export const isValidEthAddress = (address) => {
  if (!address) return false;
  return /^0x[a-fA-F0-9]{40}$/.test(address);
};

/**
 * Check if a value is a valid fork block (empty, 'latest', or a positive integer)
 * @param {string} value - The value to validate
 * @returns {boolean} - True if valid, false otherwise
 */
export const isValidForkBlock = (value) => {
  if (!value || value === "") return true; // empty is valid (means latest)
  if (value.toLowerCase() === "latest") return true;
  return /^\d+$/.test(value); // valid positive integer
};

/**
 * Check if a value is a valid number (integer or decimal)
 * @param {string} value - The value to validate
 * @returns {boolean} - True if valid, false otherwise
 */
export const isValidNumber = (value) => {
  if (!value || value === "") return true; // empty is valid
  return /^-?\d*\.?\d+$/.test(value) && !isNaN(parseFloat(value));
};

/**
 * Check if a value is a valid positive integer
 * @param {string} value - The value to validate
 * @returns {boolean} - True if valid, false otherwise
 */
export const isValidPositiveInteger = (value) => {
  if (!value || value === "") return true; // empty is valid
  return /^\d+$/.test(value);
};

/**
 * Check if a string is a valid http:// or https:// URL.
 * Used to validate user-supplied RPC URLs before the server fetches them.
 * @param {string} value - The URL to validate
 * @returns {boolean} - True if valid, false otherwise
 */
export const isValidHttpUrl = (value) => {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
};
