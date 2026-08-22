import Foundation

public enum ABIEncodeError: LocalizedError {
    case countMismatch(expected: Int, got: Int)
    case invalidNumber(String)
    case numberOutOfRange(String)
    case invalidHex(String)
    case invalidBool(String)
    case invalidAddress(String)
    case invalidLength(expected: String, got: String)
    case typeMismatch(String)
    case jsonParse(String)

    public var errorDescription: String? {
        switch self {
        case .countMismatch(let expected, let got):
            return "Expected \(expected) arguments, got \(got)"
        case .invalidNumber(let s): return "Not a valid number: \"\(s)\""
        case .numberOutOfRange(let s): return "Number out of range: \"\(s)\""
        case .invalidHex(let s): return "Not valid hex: \"\(s)\""
        case .invalidBool(let s): return "Not a valid boolean: \"\(s)\" (use true/false or 0/1)"
        case .invalidAddress(let s): return "Not a valid address: \"\(s)\""
        case .invalidLength(let expected, let got):
            return "Length mismatch: expected \(expected) bytes, got \(got)"
        case .typeMismatch(let s): return "Value does not match ABI type: \(s)"
        case .jsonParse(let s): return "Could not parse as JSON: \(s)"
        }
    }
}

// Encodes Solidity function calls to EVM calldata (selector + ABI-encoded args).
public enum ABIEncoder {

    // MARK: - Public API

    public static func encodeCalldata(function: ABIItem, args: [String]) throws -> String {
        let inputs = function.inputs ?? []
        guard args.count == inputs.count else {
            throw ABIEncodeError.countMismatch(expected: inputs.count, got: args.count)
        }
        let values = try zip(inputs, args).map { try parse(text: $0.1, input: $0.0) }
        let body = try encodeSequence(Array(zip(inputs, values)))
        let selector = function.selectorHex
        return "0x" + String(selector.dropFirst(2)) + body.hexString
    }

    public static func encodeValue(input: ABIInput, text: String) throws -> String {
        "0x" + (try encodeSequence([(input, try parse(text: text, input: input))])).hexString
    }

    public static func decimalToBinaryBytes(_ decimal: String) -> [UInt8] {
        decimal.isEmpty ? [0] : decimalToBinary(decimal)
    }

    // MARK: - Parsing user text into typed values

    public enum ParamValue {
        case number32([UInt8]) // 32-byte big-endian (uint) or two's-complement (int)
        case bool(Bool)
        case address([UInt8]) // 20 bytes
        case fixedBytes([UInt8])
        case bytes([UInt8])
        case string(String)
        case array([ParamValue])
        case tuple([ParamValue])
    }

    private static func parse(text: String, input: ABIInput) throws -> ParamValue {
        let t = input.type
        if t == "uint256" || t == "int256" {
            return .number32(try parseInteger(text, bits: 256, signed: t.hasPrefix("int")))
        }
        if let bits = intBits(of: t) {
            return .number32(try parseInteger(text, bits: bits, signed: t.hasPrefix("int")))
        }
        if t == "bool" {
            switch text.trimmingCharacters(in: .whitespaces).lowercased() {
            case "true", "1": return .bool(true)
            case "false", "0": return .bool(false)
            default: throw ABIEncodeError.invalidBool(text)
            }
        }
        if t == "address" {
            var hex = text.trimmingCharacters(in: .whitespaces)
            if hex.hasPrefix("0x") { hex = String(hex.dropFirst(2)) }
            guard hex.count == 40, isHex(hex) else { throw ABIEncodeError.invalidAddress(text) }
            return .address(hexBytes(hex))
        }
        if let size = fixedBytesSize(of: t) {
            let bytes = try parseHex(text)
            guard bytes.count <= size else {
                throw ABIEncodeError.invalidLength(expected: "≤\(size)", got: "\(bytes.count)")
            }
            return .fixedBytes(bytes + [UInt8](repeating: 0, count: size - bytes.count))
        }
        if t == "bytes" {
            return .bytes(try parseHex(text))
        }
        if t == "string" {
            var s = text
            if s.hasPrefix("\"") && s.hasSuffix("\"") && s.count >= 2 {
                s = String(s.dropFirst().dropLast())
            }
            return .string(s)
        }
        if let (base, _) = splitArrayType(t) {
            let elements = try parseArrayText(text)
            return .array(try elements.map { try parse(text: $0, input: elementInput(base: base, of: input)) })
        }
        if t == "tuple" {
            let components = input.components ?? []
            let elementTexts = try parseTupleText(text)
            guard elementTexts.count == components.count else {
                throw ABIEncodeError.countMismatch(expected: components.count, got: elementTexts.count)
            }
            return .tuple(try zip(components, elementTexts).map { try parse(text: $0.1, input: $0.0) })
        }
        throw ABIEncodeError.typeMismatch(t)
    }

    private static func elementInput(base: String, of parent: ABIInput) -> ABIInput {
        base == "tuple" ? ABIInput(name: nil, type: base, components: parent.components)
                        : ABIInput(name: nil, type: base)
    }

    // Split "uint256[]" -> ("uint256", nil), "uint256[3]" -> ("uint256", 3)
    private static func splitArrayType(_ t: String) -> (base: String, count: Int?)? {
        if t.hasSuffix("[]") { return (String(t.dropLast(2)), nil) }
        if t.hasSuffix("]"), let open = t.lastIndex(of: "["), open < t.index(before: t.endIndex) {
            let inner = String(t[t.index(after: open)..<t.index(before: t.endIndex)])
            if let n = Int(inner) { return (String(t[..<open]), n) }
        }
        return nil
    }

    private static func intBits(of t: String) -> Int? {
        for prefix in ["uint", "int"] where t.hasPrefix(prefix) {
            let rest = t.dropFirst(prefix.count)
            if rest.isEmpty { return 256 }
            guard rest.allSatisfy({ $0.isNumber }), let n = Int(rest) else { return nil }
            return n
        }
        return nil
    }

    private static func fixedBytesSize(of t: String) -> Int? {
        guard t.hasPrefix("bytes"), t.count > "bytes".count else { return nil }
        let rest = t.dropFirst("bytes".count)
        guard rest.allSatisfy({ $0.isNumber }), let n = Int(rest), n >= 1, n <= 32 else { return nil }
        return n
    }

    // MARK: - Number parsing

    private static func parseInteger(_ text: String, bits: Int, signed: Bool) throws -> [UInt8] {
        let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
        let byteWidth = (bits + 7) / 8
        let negative = t.hasPrefix("-")
        let magnitude = negative ? String(t.dropFirst()) : t

        let magnitudeBytes: [UInt8]
        if magnitude.lowercased().hasPrefix("0x") {
            magnitudeBytes = hexBytes(String(magnitude.dropFirst(2)))
        } else {
            guard magnitude.allSatisfy({ $0.isNumber }) else {
                throw ABIEncodeError.invalidNumber(text)
            }
            magnitudeBytes = decimalToBinary(magnitude)
        }

        if magnitudeBytes.count > byteWidth {
            throw ABIEncodeError.numberOutOfRange(text)
        }
        if !signed, bits % 8 != 0, magnitudeBytes.count == byteWidth {
            let top = magnitudeBytes[0]
            let shift = 8 - (bits % 8)
            if top >> UInt8(shift) != 0 { throw ABIEncodeError.numberOutOfRange(text) }
        }

        var out = [UInt8](repeating: 0x00, count: 32)
        for i in 0..<magnitudeBytes.count {
            out[32 - magnitudeBytes.count + i] = magnitudeBytes[i]
        }
        if negative { out = twosComplement(out) }
        return out
    }

    private static func decimalToBinary(_ decimal: String) -> [UInt8] {
        var digits = decimal.map { $0.wholeNumberValue! }
        if digits.allSatisfy({ $0 == 0 }) { return [0] }
        var result: [UInt8] = []
        while !digits.allSatisfy({ $0 == 0 }) {
            var remainder = 0
            for i in 0..<digits.count {
                let current = remainder * 10 + digits[i]
                digits[i] = current / 256
                remainder = current % 256
            }
            result.insert(UInt8(remainder), at: 0)
            while digits.count > 1 && digits[0] == 0 { digits.removeFirst() }
        }
        return result
    }

    private static func twosComplement(_ bytes: [UInt8]) -> [UInt8] {
        var result = bytes.map { ~$0 }
        var carry = true
        for i in stride(from: result.count - 1, through: 0, by: -1) {
            if carry {
                let sum = Int(result[i]) + 1
                result[i] = UInt8(sum & 0xFF)
                carry = sum > 0xFF
            }
        }
        return result
    }

    // MARK: - Hex / text helpers

    private static func parseHex(_ text: String) throws -> [UInt8] {
        var hex = text.trimmingCharacters(in: .whitespaces)
        if hex.hasPrefix("0x") { hex = String(hex.dropFirst(2)) }
        guard isHex(hex) else { throw ABIEncodeError.invalidHex(text) }
        return hexBytes(hex)
    }

    private static func isHex(_ s: String) -> Bool {
        s.allSatisfy { $0.isHexDigit }
    }

    private static func hexBytes(_ s: String) -> [UInt8] {
        var result: [UInt8] = []
        result.reserveCapacity(s.count / 2 + 1)
        var i = s.startIndex
        while i < s.endIndex {
            let hi = s[i]
            let lo = s[s.index(after: i)]
            result.append(UInt8(hi.hexDigitValue!) << 4 | UInt8(lo.hexDigitValue!))
            i = s.index(i, offsetBy: 2)
        }
        return result
    }

    private static func parseArrayText(_ text: String) throws -> [String] {
        let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard t.hasPrefix("[") else { throw ABIEncodeError.jsonParse(text) }
        return try jsonElements(t)
    }

    private static func parseTupleText(_ text: String) throws -> [String] {
        let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if t.hasPrefix("[") { return try jsonElements(t) }
        if t.hasPrefix("("), t.hasSuffix(")") {
            return splitTopLevel(String(t.dropFirst().dropLast()), separator: ",")
        }
        throw ABIEncodeError.jsonParse(text)
    }

    // Parse a JSON array into the textual form of each element so the generic
    // text parser can be reused recursively.
    private static func jsonElements(_ text: String) throws -> [String] {
        guard let data = text.data(using: .utf8),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [Any] else {
            throw ABIEncodeError.jsonParse(text)
        }
        return obj.map { elementText($0) }
    }

    private static func elementText(_ value: Any) -> String {
        switch value {
        case let s as String: return s
        case let n as NSNumber:
            return n.stringValue
        case let a as [Any]:
            let inner = a.map { elementText($0) }.joined(separator: ",")
            return "[\(inner)]"
        default: return String(describing: value)
        }
    }

    // Split on a separator at top level (not inside brackets/parens/quotes).
    private static func splitTopLevel(_ s: String, separator: Character) -> [String] {
        var result: [String] = []
        var current = ""
        var depth = 0
        var inQuote = false
        for ch in s {
            if ch == "\"" { inQuote.toggle() }
            if !inQuote, ch == "[" || ch == "(" { depth += 1 }
            if !inQuote, ch == "]" || ch == ")" { depth -= 1 }
            if !inQuote, depth == 0, ch == separator {
                result.append(current.trimmingCharacters(in: .whitespaces))
                current = ""
            } else {
                current.append(ch)
            }
        }
        if !current.isEmpty {
            result.append(current.trimmingCharacters(in: .whitespaces))
        }
        return result
    }

    // MARK: - ABI encoding

    private static func isDynamic(_ input: ABIInput) -> Bool {
        let t = input.type
        if t == "bytes" || t == "string" { return true }
        if let (base, count) = splitArrayType(t) {
            if count == nil { return true }
            if base == "tuple" { return (input.components ?? []).contains { isDynamic($0) } }
            return base == "bytes" || base == "string"
        }
        if t == "tuple" { return (input.components ?? []).contains { isDynamic($0) } }
        return false
    }

    private static func staticSize(_ input: ABIInput) -> Int {
        let t = input.type
        if let (base, count) = splitArrayType(t), let n = count {
            if base == "tuple" {
                let per = (input.components ?? []).reduce(0) { $0 + staticSize($1) }
                return n * per
            }
            return n * 32
        }
        if t == "tuple" {
            return (input.components ?? []).reduce(0) { $0 + staticSize($1) }
        }
        return 32
    }

    // Core head/tail encoder. Offsets are relative to the start of this
    // sequence's encoding (for arrays: just after the length word).
    private static func encodeSequence(_ items: [(ABIInput, ParamValue)]) throws -> Data {
        var head = Data()
        var tail = Data()
        var headSize = 0
        for (input, _) in items {
            headSize += isDynamic(input) ? 32 : staticSize(input)
        }
        for (input, value) in items {
            if !isDynamic(input) {
                head.append(try encodeStatic(value, input: input))
            } else {
                head.append(encodeWord(headSize + tail.count))
                tail.append(try encodeDynamic(value, input: input))
            }
        }
        head.append(tail)
        return head
    }

    private static func encodeStatic(_ value: ParamValue, input: ABIInput) throws -> Data {
        if let (base, count) = splitArrayType(input.type), let n = count {
            guard case .array(let arr) = value, arr.count == n else {
                throw ABIEncodeError.typeMismatch("fixed array of \(n) elements")
            }
            var out = Data()
            for element in arr {
                out.append(try encodeStatic(element, input: elementInput(base: base, of: input)))
            }
            return out
        }
        switch value {
        case .number32(let b): return Data(b)
        case .bool(let b): return encodeWord(b ? 1 : 0)
        case .address(let b): return Data(repeating: 0, count: 12) + Data(b)
        case .fixedBytes(let b):
            guard b.count <= 32 else { throw ABIEncodeError.typeMismatch("bytes\(b.count) > bytes32") }
            return Data(b) + Data(repeating: 0, count: 32 - b.count)
        case .tuple(let vals):
            let comps = input.components ?? []
            guard comps.count == vals.count else {
                throw ABIEncodeError.countMismatch(expected: comps.count, got: vals.count)
            }
            return try encodeSequence(Array(zip(comps, vals)))
        default:
            throw ABIEncodeError.typeMismatch(input.type)
        }
    }

    private static func encodeDynamic(_ value: ParamValue, input: ABIInput) throws -> Data {
        switch value {
        case .string(let s):
            let bytes = Array(s.utf8)
            return encodeWord(bytes.count) + padRight(bytes)
        case .bytes(let b):
            return encodeWord(b.count) + padRight(b)
        case .array(let arr):
            var out = encodeWord(arr.count)
            let items = arr.enumerated().map { (_, v) -> (ABIInput, ParamValue) in
                let base = splitArrayType(input.type)!.base
                return (elementInput(base: base, of: input), v)
            }
            out.append(try encodeSequence(items))
            return out
        case .tuple(let vals):
            let comps = input.components ?? []
            guard comps.count == vals.count else {
                throw ABIEncodeError.countMismatch(expected: comps.count, got: vals.count)
            }
            return try encodeSequence(Array(zip(comps, vals)))
        default:
            throw ABIEncodeError.typeMismatch(input.type)
        }
    }

    private static func encodeWord(_ value: Int) -> Data {
        var bytes = [UInt8](repeating: 0, count: 32)
        var v = value
        for i in stride(from: 31, through: 0, by: -1) {
            bytes[i] = UInt8(v & 0xFF)
            v >>= 8
        }
        return Data(bytes)
    }

    private static func padRight(_ bytes: [UInt8]) -> Data {
        var out = Data(bytes)
        while out.count % 32 != 0 { out.append(0) }
        return out
    }
}

public extension Data {
    public var hexString: String {
        map { String(format: "%02x", $0) }.joined()
    }
}