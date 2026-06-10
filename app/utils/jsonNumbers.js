/**
 * Lossless JSON parsing and serialization for big integers (16+ digits)
 * that exceed Number.MAX_SAFE_INTEGER (9007199254740991, 15-16 digits)
 */

// JSON integer literals of 16+ digits exceed Number.MAX_SAFE_INTEGER
// and silently lose precision in JSON.parse.
// Quote them in the raw text first so they parse as lossless strings.
// Matches: optional whitespace/colon/bracket, optional minus sign, 16+ digits,
// lookahead for , } ] or whitespace (not a decimal point)
const BIG_INT_LITERAL = /([:,[]\s*)(-?\d{16,})(?=\s*[,}\]])/g;

export function parseJsonWithBigNumbers(text) {
  return JSON.parse(text.replace(BIG_INT_LITERAL, '$1"$2"'));
}

export function stringifyForEditor(value) {
  return JSON.stringify(
    value,
    (key, v) => {
      if (typeof v === "bigint") return v.toString();
      if (typeof v === "number" && !Number.isSafeInteger(v) && Number.isFinite(v)) {
        return v.toLocaleString("en-US", {
          useGrouping: false,
          maximumFractionDigits: 0,
        });
      }
      return v;
    },
    2,
  );
}
