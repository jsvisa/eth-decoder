import Foundation

// A JSON value that preserves numbers as either a native Int64 or raw text,
// so large integers/decimals survive round-tripping without precision loss.
public enum JSONValue: Equatable {
    public enum Number: Equatable {
        case int(Int64)
        case text(String)
    }

    case null
    case bool(Bool)
    case number(Number)
    case string(String)
    case array([JSONValue])
    case object([String: JSONValue])
}

extension JSONValue: Decodable {
    public init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null; return }
        if let b = try? c.decode(Bool.self) { self = .bool(b); return }
        if let i = try? c.decode(Int64.self) { self = .number(.int(i)); return }
        if let d = try? c.decode(Double.self) {
            if d.rounded() == d, abs(d) < 9_007_199_254_740_992 {
                self = .number(.int(Int64(d)))
            } else {
                self = .number(.text(String(d)))
            }
            return
        }
        if let s = try? c.decode(String.self) { self = .string(s); return }
        if let a = try? c.decode([JSONValue].self) { self = .array(a); return }
        if let o = try? c.decode([String: JSONValue].self) { self = .object(o); return }
        throw DecodingError.dataCorruptedError(in: c, debugDescription: "Unsupported JSON value")
    }
}

extension JSONValue: Encodable {
    public func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .null: try c.encodeNil()
        case .bool(let b): try c.encode(b)
        case .number(.int(let i)): try c.encode(i)
        case .number(.text(let t)): try c.encode(t)
        case .string(let s): try c.encode(s)
        case .array(let a): try c.encode(a)
        case .object(let o): try c.encode(o)
        }
    }
}

public extension JSONValue {
    public var display: String {
        switch self {
        case .null: return "null"
        case .bool(let b): return b ? "true" : "false"
        case .number(.int(let i)): return String(i)
        case .number(.text(let t)): return t
        case .string(let s): return s
        case .array(let a): return a.map { $0.display }.joined(separator: ", ")
        case .object(let o):
            return o.keys.sorted().map { "\($0): \(o[$0]!.display)" }.joined(separator: ", ")
        }
    }

    public var compactJSON: String {
        switch self {
        case .null: return "null"
        case .bool(let b): return b ? "true" : "false"
        case .number(.int(let i)): return String(i)
        case .number(.text(let t)): return t
        case .string(let s):
            let escaped = s
                .replacingOccurrences(of: "\\", with: "\\\\")
                .replacingOccurrences(of: "\"", with: "\\\"")
                .replacingOccurrences(of: "\n", with: "\\n")
            return "\"\(escaped)\""
        case .array(let a): return "[" + a.map { $0.compactJSON }.joined(separator: ",") + "]"
        case .object(let o):
            let pairs = o.keys.sorted().map { "\"\($0)\":\(o[$0]!.compactJSON)" }
            return "{" + pairs.joined(separator: ",") + "}"
        }
    }

    public var prettyJSON: String {
        var out = ""
        pretty(&out, indent: 0)
        return out
    }

    private func pretty(_ out: inout String, indent: Int) {
        let pad = String(repeating: "  ", count: indent)
        switch self {
        case .object(let o):
            let keys = o.keys.sorted()
            if keys.isEmpty {
                out += "{}"
                return
            }
            out += "{\n"
            for (i, k) in keys.enumerated() {
                out += pad + "  \"" + k + "\": "
                o[k]!.pretty(&out, indent: indent + 1)
                out += i < keys.count - 1 ? ",\n" : "\n"
            }
            out += pad + "}"
        case .array(let a):
            if a.isEmpty {
                out += "[]"
                return
            }
            out += "[\n"
            for (i, v) in a.enumerated() {
                out += pad + "  "
                v.pretty(&out, indent: indent + 1)
                out += i < a.count - 1 ? ",\n" : "\n"
            }
            out += pad + "]"
        default:
            out += compactJSON
        }
    }
}

// MARK: - Generic API error body

public struct ErrorResponse: Decodable {
    public let error: String
}

public struct MessageResponse: Decodable {
    public let msg: String
}

// MARK: - Decode endpoint

public struct DecodeResponse: Decodable {
    public let msg: String
    public let data: [DecodedItem]?
}

public struct DecodedItem: Decodable {
    public let funcName: String?
    public let args: [String: JSONValue]?
    public let source: String?
    public let innerCalls: [InnerCall]?
    public let multicallType: String?
    public let sign: String?
    public let abi: JSONValue?

    public enum CodingKeys: String, CodingKey {
        case funcName = "func"
        case args
        case source
        case innerCalls = "inner_calls"
        case multicallType = "multicall_type"
        case sign
        case abi
    }
}

public struct DecodedInner: Decodable {
    public let funcName: String?
    public let args: [String: JSONValue]?
    public let source: String?

    public enum CodingKeys: String, CodingKey {
        case funcName = "func"
        case args
        case source
    }
}

public struct InnerCall: Decodable {
    public let type: String?
    public let index: Int?
    public let selector: String?
    public let data: String?
    public let decoded: DecodedInner?
    public let name: String?
    public let allowRevert: JSONValue?
    public let args: JSONValue?
    public let target: String?
    public let value: JSONValue?
    public let extra: [String: JSONValue]

    static let knownKeys: Set<String> = [
        "type", "index", "selector", "data", "decoded", "name",
        "allow_revert", "args", "target", "value",
    ]

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: DynamicCodingKey.self)
        type = try c.decodeIfPresent(String.self, forKey: .k("type"))
        index = try c.decodeIfPresent(Int.self, forKey: .k("index"))
        selector = try c.decodeIfPresent(String.self, forKey: .k("selector"))
        data = try c.decodeIfPresent(String.self, forKey: .k("data"))
        decoded = try c.decodeIfPresent(DecodedInner.self, forKey: .k("decoded"))
        name = try c.decodeIfPresent(String.self, forKey: .k("name"))
        allowRevert = try c.decodeIfPresent(JSONValue.self, forKey: .k("allow_revert"))
        args = try c.decodeIfPresent(JSONValue.self, forKey: .k("args"))
        target = try c.decodeIfPresent(String.self, forKey: .k("target"))
        value = try c.decodeIfPresent(JSONValue.self, forKey: .k("value"))
        var extra: [String: JSONValue] = [:]
        for key in c.allKeys where !Self.knownKeys.contains(key.stringValue) {
            extra[key.stringValue] = try? c.decode(JSONValue.self, forKey: key)
        }
        self.extra = extra
    }
}

public struct DynamicCodingKey: CodingKey {
    public var stringValue: String
    public var intValue: Int?

    public init(stringValue: String) {
        self.stringValue = stringValue
        intValue = nil
    }

    public init?(intValue: Int) {
        self.intValue = intValue
        stringValue = String(intValue)
    }

    public static func k(_ value: String) -> DynamicCodingKey {
        DynamicCodingKey(stringValue: value)
    }
}

// MARK: - Query endpoint

public struct QueryResponse: Decodable {
    public let msg: String
    public let data: JSONValue?
}

// MARK: - ABI / call-contract

public struct ABIItem: Codable, Equatable, Identifiable {
    public var id: String { type + ":" + (name ?? "") + ":" + canonicalSignature }

    public let type: String
    public let name: String?
    public let stateMutability: String?
    public let constant: Bool?
    public let payable: Bool?
    public let inputs: [ABIInput]?
    public let outputs: [ABIInput]?
    public let anonymous: Bool?

    public enum CodingKeys: String, CodingKey {
        case type, name, stateMutability, constant, payable, inputs, outputs, anonymous
    }

    public init(type: String, name: String?, stateMutability: String?, constant: Bool?,
         payable: Bool?, inputs: [ABIInput]?, outputs: [ABIInput]?, anonymous: Bool?) {
        self.type = type
        self.name = name
        self.stateMutability = stateMutability
        self.constant = constant
        self.payable = payable
        self.inputs = inputs
        self.outputs = outputs
        self.anonymous = anonymous
    }

    public var isFunction: Bool { type == "function" }
    public var isEvent: Bool { type == "event" }

    public var canonicalSignature: String {
        let sig = (inputs ?? []).map { $0.canonicalType }.joined(separator: ",")
        return "\(name ?? "")(\(sig))"
    }

    public var selectorHex: String {
        let hash = Keccak256.hash(Array(canonicalSignature.utf8))
        return "0x" + hash.prefix(4).map { String(format: "%02x", $0) }.joined()
    }

    public var isPayable: Bool {
        stateMutability == "payable" || payable == true
    }

    public var isConstant: Bool {
        stateMutability == "view" || stateMutability == "pure" || constant == true
    }
}

public struct ABIInput: Codable, Equatable {
    public let name: String?
    public let type: String
    public let indexed: Bool?
    public let components: [ABIInput]?
    public let internalType: String?

    public enum CodingKeys: String, CodingKey {
        case name, type, indexed, components, internalType
    }

    public init(name: String?, type: String, indexed: Bool? = nil,
         components: [ABIInput]? = nil, internalType: String? = nil) {
        self.name = name
        self.type = type
        self.indexed = indexed
        self.components = components
        self.internalType = internalType
    }

    public var canonicalType: String {
        if type == "tuple" || type.hasPrefix("tuple[") {
            let inner = (components ?? []).map { $0.canonicalType }.joined(separator: ",")
            let suffix = String(type.dropFirst("tuple".count))
            return "(\(inner))\(suffix)"
        }
        return type
    }
}

public struct FetchAbiResponse: Decodable {
    public let abi: [ABIItem]?
    public let contractName: String?
    public let implContractName: String?
    public let isProxy: Bool?
    public let implAddress: String?
}

public struct CallContractRequest: Encodable {
    public let chain: String
    public let address: String
    public let functionName: String
    public let args: [String]
    public let abi: [ABIItem]
    public let fromAddress: String?

    public init(chain: String, address: String, functionName: String,
                args: [String], abi: [ABIItem], fromAddress: String?) {
        self.chain = chain
        self.address = address
        self.functionName = functionName
        self.args = args
        self.abi = abi
        self.fromAddress = fromAddress
    }
}

public struct CallContractResponse: Decodable, Encodable {
    public let rawData: String?
    public let decoded: [DecodedOutput]?
    public let result: JSONValue?
    public let simulated: Bool?

    enum CodingKeys: String, CodingKey {
        case rawData, decoded, result, simulated
    }
}

public struct DecodedOutput: Decodable {
    public let name: String?
    public let type: String?
    public let value: JSONValue?
}

extension DecodedOutput: Encodable {
    enum CodingKeys: String, CodingKey { case name, type, value }
    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encodeIfPresent(name, forKey: .name)
        try c.encodeIfPresent(type, forKey: .type)
        try c.encodeIfPresent(value, forKey: .value)
    }
}

// MARK: - Simulation

public struct SimulateRequest: Encodable {
    public let chainId: Int
    public let to: String
    public let data: String
    public let from: String
    public let value: String?
    public let gas: String?
    public let blockNumber: String?
    public let apiKeys: [String: String]?
    public let price: Bool?

    public init(chainId: Int, to: String, data: String, from: String,
                value: String?, gas: String?, blockNumber: String?,
                apiKeys: [String: String]?, price: Bool?) {
        self.chainId = chainId
        self.to = to
        self.data = data
        self.from = from
        self.value = value
        self.gas = gas
        self.blockNumber = blockNumber
        self.apiKeys = apiKeys
        self.price = price
    }

    func body() -> [String: JSONValue] {
        var dict: [String: JSONValue] = [
            "chainId": .number(.int(Int64(chainId))),
            "to": .string(to),
            "data": .string(data),
            "from": .string(from),
        ]
        if let value { dict["value"] = .string(value) }
        if let gas { dict["gas"] = .string(gas) }
        if let blockNumber { dict["blockNumber"] = .string(blockNumber) }
        if let price { dict["price"] = .bool(price) }
        if let apiKeys {
            dict["apiKeys"] = .object(apiKeys.mapValues { .string($0) })
        }
        return dict
    }
}

public struct SimulateResponse: Decodable {
    public let success: Bool?
    public let simulated: Bool?
    public let session: Bool?
    public let blockNumber: String?
    public let gasUsed: JSONValue?
    public let logs: [SimLog]?
    public let callTrace: CallFrame?
    public let balanceChanges: [BalanceChange]?
    public let stateChanges: [String: JSONValue]?
    public let metrics: [String: JSONValue]?
    public let rawData: String?
    public let decoded: [DecodedOutput]?
    public let error: String?
    public let accessList: JSONValue?
    public let undecodedAddresses: JSONValue?
    public let requestBody: JSONValue?
    public let simulationId: String?
    public let results: [SimulateResponse]?
    public let tokenMeta: JSONValue?
    public let extra: [String: JSONValue]

    static let knownKeys: Set<String> = [
        "success", "simulated", "session", "blockNumber", "gasUsed", "logs",
        "callTrace", "balanceChanges", "stateChanges", "metrics", "rawData",
        "decoded", "error", "accessList", "undecodedAddresses", "requestBody",
        "simulationId", "results", "_tokenMeta",
    ]

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: DynamicCodingKey.self)
        success = try c.decodeIfPresent(Bool.self, forKey: .k("success"))
        simulated = try c.decodeIfPresent(Bool.self, forKey: .k("simulated"))
        session = try c.decodeIfPresent(Bool.self, forKey: .k("session"))
        blockNumber = try c.decodeIfPresent(String.self, forKey: .k("blockNumber"))
        gasUsed = try c.decodeIfPresent(JSONValue.self, forKey: .k("gasUsed"))
        logs = try c.decodeIfPresent([SimLog].self, forKey: .k("logs"))
        callTrace = try c.decodeIfPresent(CallFrame.self, forKey: .k("callTrace"))
        balanceChanges = try c.decodeIfPresent([BalanceChange].self, forKey: .k("balanceChanges"))
        stateChanges = try? c.decodeIfPresent([String: JSONValue].self, forKey: .k("stateChanges"))
        metrics = try? c.decodeIfPresent([String: JSONValue].self, forKey: .k("metrics"))
        rawData = try c.decodeIfPresent(String.self, forKey: .k("rawData"))
        decoded = try c.decodeIfPresent([DecodedOutput].self, forKey: .k("decoded"))
        error = try c.decodeIfPresent(String.self, forKey: .k("error"))
        accessList = try c.decodeIfPresent(JSONValue.self, forKey: .k("accessList"))
        undecodedAddresses = try c.decodeIfPresent(JSONValue.self, forKey: .k("undecodedAddresses"))
        requestBody = try c.decodeIfPresent(JSONValue.self, forKey: .k("requestBody"))
        simulationId = try c.decodeIfPresent(String.self, forKey: .k("simulationId"))
        results = try c.decodeIfPresent([SimulateResponse].self, forKey: .k("results"))
        tokenMeta = try c.decodeIfPresent(JSONValue.self, forKey: .k("_tokenMeta"))
        var extra: [String: JSONValue] = [:]
        for key in c.allKeys where !Self.knownKeys.contains(key.stringValue) {
            extra[key.stringValue] = try? c.decode(JSONValue.self, forKey: key)
        }
        self.extra = extra
    }

    public var isFailure: Bool { success == false }
}

public struct CallFrame: Decodable {
    public let functionName: String?
    public let to: String?
    public let from: String?
    public let decodedInputs: [DecodedOutput]?
    public let decodedOutputs: [DecodedOutput]?
    public let logs: [SimLog]?
    public let calls: [CallFrame]?
    public let extra: [String: JSONValue]

    static let knownKeys: Set<String> = [
        "functionName", "to", "from", "decodedInputs", "decodedOutputs", "logs", "calls",
    ]

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: DynamicCodingKey.self)
        functionName = try c.decodeIfPresent(String.self, forKey: .k("functionName"))
        to = try c.decodeIfPresent(String.self, forKey: .k("to"))
        from = try c.decodeIfPresent(String.self, forKey: .k("from"))
        decodedInputs = try c.decodeIfPresent([DecodedOutput].self, forKey: .k("decodedInputs"))
        decodedOutputs = try c.decodeIfPresent([DecodedOutput].self, forKey: .k("decodedOutputs"))
        logs = try c.decodeIfPresent([SimLog].self, forKey: .k("logs"))
        calls = try c.decodeIfPresent([CallFrame].self, forKey: .k("calls"))
        var extra: [String: JSONValue] = [:]
        for key in c.allKeys where !Self.knownKeys.contains(key.stringValue) {
            extra[key.stringValue] = try? c.decode(JSONValue.self, forKey: key)
        }
        self.extra = extra
    }
}

public struct SimLog: Decodable {
    public let name: String?
    public let address: String?
    public let inputs: [DecodedOutput]?
    public let topics: JSONValue?
    public let data: JSONValue?
    public let extra: [String: JSONValue]

    static let knownKeys: Set<String> = ["name", "address", "inputs", "topics", "data"]

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: DynamicCodingKey.self)
        name = try c.decodeIfPresent(String.self, forKey: .k("name"))
        address = try c.decodeIfPresent(String.self, forKey: .k("address"))
        inputs = try c.decodeIfPresent([DecodedOutput].self, forKey: .k("inputs"))
        topics = try c.decodeIfPresent(JSONValue.self, forKey: .k("topics"))
        data = try c.decodeIfPresent(JSONValue.self, forKey: .k("data"))
        var extra: [String: JSONValue] = [:]
        for key in c.allKeys where !Self.knownKeys.contains(key.stringValue) {
            extra[key.stringValue] = try? c.decode(JSONValue.self, forKey: key)
        }
        self.extra = extra
    }
}

public struct BalanceChange: Decodable {
    public let address: String?
    public let amount: String?
    public let decimals: JSONValue?
    public let name: String?
    public let price: JSONValue?
    public let symbol: String?
    public let tokenAddress: String?
    public let value: String?
    public let valueUsd: JSONValue?
    public let extra: [String: JSONValue]

    static let knownKeys: Set<String> = [
        "address", "amount", "decimals", "name", "price", "symbol",
        "tokenAddress", "value", "valueUsd",
    ]

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: DynamicCodingKey.self)
        address = try c.decodeIfPresent(String.self, forKey: .k("address"))
        amount = try c.decodeIfPresent(String.self, forKey: .k("amount"))
        decimals = try c.decodeIfPresent(JSONValue.self, forKey: .k("decimals"))
        name = try c.decodeIfPresent(String.self, forKey: .k("name"))
        price = try c.decodeIfPresent(JSONValue.self, forKey: .k("price"))
        symbol = try c.decodeIfPresent(String.self, forKey: .k("symbol"))
        tokenAddress = try c.decodeIfPresent(String.self, forKey: .k("tokenAddress"))
        value = try c.decodeIfPresent(String.self, forKey: .k("value"))
        valueUsd = try c.decodeIfPresent(JSONValue.self, forKey: .k("valueUsd"))
        var extra: [String: JSONValue] = [:]
        for key in c.allKeys where !Self.knownKeys.contains(key.stringValue) {
            extra[key.stringValue] = try? c.decode(JSONValue.self, forKey: key)
        }
        self.extra = extra
    }
}

// MARK: - Error helpers

public enum APIError: LocalizedError {
    case invalidURL
    case invalidResponse
    case badStatus(Int, String)
    case serverMessage(String)

    public var errorDescription: String? {
        switch self {
        case .invalidURL: return "Invalid URL"
        case .invalidResponse: return "Invalid response from server"
        case .badStatus(let code, let message):
            return message.isEmpty ? "Server returned status \(code)" : "Server error (\(code)): \(message)"
        case .serverMessage(let message): return message
        }
    }
}