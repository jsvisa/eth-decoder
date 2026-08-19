import EthDecodeCore
import Foundation

// MARK: - History items (matching web app format)

struct DecodeHistoryItem: Codable, Identifiable {
    var id: Int
    let input: String
    let output: JSONValue?
    let options: DecodeOptions?
    let timestamp: String

    struct DecodeOptions: Codable {
        let withAbi: Bool
        let withSign: Bool
    }
}

struct CallHistoryItem: Codable, Identifiable {
    var id: Int
    let chain: String
    let address: String
    let functionName: String?
    let functionSig: String?
    let args: [String]?
    var fromAddress: String?
    var output: JSONValue?
    let contractName: String?
    var isWrite: Bool?
    var timestamp: String
    let type: String? // nil for single, "session" for session bundles

    struct SessionCall: Codable {
        let id: String
        let type: String?
        let functionName: String?
        let contractName: String?
        let inputs: [DecodedOutput]?
        let outputs: [DecodedOutput]?
        let success: Bool?
    }

    var txs: [SessionCall]?
}

// MARK: - Persistent store

@MainActor
final class HistoryStore: ObservableObject {
    static let decoderKey = "evm_decoder_history"
    static let callerKey = "contract_caller_history"
    static let decoderMax = 100
    static let callerMax = 50

    @Published var decoderHistory: [DecodeHistoryItem] = []
    @Published var callerHistory: [CallHistoryItem] = []

    init() {
        load()
    }

    // MARK: - Tx Decoder

    func saveDecoder(input: String, output: JSONValue?, withAbi: Bool, withSign: Bool) {
        let item = DecodeHistoryItem(
            id: Int(Date.timeIntervalSinceReferenceDate * 1000),
            input: input,
            output: output,
            options: .init(withAbi: withAbi, withSign: withSign),
            timestamp: isoNow()
        )
        var list = decoderHistory
        list.removeAll { $0.input.lowercased() == input.lowercased() }
        list.insert(item, at: 0)
        decoderHistory = Array(list.prefix(Self.decoderMax))
        saveDecoder()
    }

    func loadDecoderFromHistory(_ item: DecodeHistoryItem) -> (input: String, options: (Bool, Bool)) {
        (item.input, (item.options?.withAbi ?? true, item.options?.withSign ?? true))
    }

    func clearDecoder() {
        decoderHistory = []
        UserDefaults.standard.removeObject(forKey: Self.decoderKey)
    }

    // MARK: - Contract Caller

    func saveCaller(chain: String, address: String, functionSig: String?,
                    args: [String]?, fromAddress: String?, output: JSONValue?,
                    contractName: String?, isWrite: Bool) {
        let dedupKey = "\(chain)-\(address.lowercased())-\(functionSig ?? "")-\(args?.joined() ?? "")"
        let item = CallHistoryItem(
            id: Int(Date.timeIntervalSinceReferenceDate * 1000),
            chain: chain, address: address, functionName: functionSig,
            functionSig: functionSig, args: args, fromAddress: fromAddress,
            output: output, contractName: contractName, isWrite: isWrite,
            timestamp: isoNow(), type: nil
        )
        var list = callerHistory
        if let existing = list.firstIndex(where: { h in
            "\(h.chain)-\(h.address.lowercased())-\(h.functionSig ?? "")-\(h.args?.joined() ?? "")" == dedupKey
        }) {
            list[existing].id = item.id
            list[existing].timestamp = item.timestamp
            list[existing].output = item.output
            list[existing].fromAddress = item.fromAddress
            list[existing].isWrite = item.isWrite
            let entry = list.remove(at: existing)
            list.insert(entry, at: 0)
        } else {
            list.insert(item, at: 0)
        }
        callerHistory = Array(list.prefix(Self.callerMax))
        saveCaller()
    }

    func clearCaller() {
        callerHistory = []
        UserDefaults.standard.removeObject(forKey: Self.callerKey)
    }

    // MARK: - Persistence

    private func load() {
        if let data = UserDefaults.standard.data(forKey: Self.decoderKey),
           let items = try? JSONDecoder().decode([DecodeHistoryItem].self, from: data) {
            decoderHistory = items
        }
        if let data = UserDefaults.standard.data(forKey: Self.callerKey),
           let items = try? JSONDecoder().decode([CallHistoryItem].self, from: data) {
            callerHistory = items
        }
    }

    private func saveDecoder() {
        if let data = try? JSONEncoder().encode(decoderHistory) {
            UserDefaults.standard.set(data, forKey: Self.decoderKey)
        }
    }

    private func saveCaller() {
        if let data = try? JSONEncoder().encode(callerHistory) {
            UserDefaults.standard.set(data, forKey: Self.callerKey)
        }
    }

    private func isoNow() -> String {
        let df = ISO8601DateFormatter()
        df.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return df.string(from: Date())
    }
}

// MARK: - JSONValue Codable conformance for history

extension JSONValue: Codable {
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

// MARK: - DecodedOutput Codable conformance

extension DecodedOutput: Codable {
    enum CodingKeys: String, CodingKey {
        case name, type, value
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encodeIfPresent(name, forKey: .name)
        try c.encodeIfPresent(type, forKey: .type)
        try c.encodeIfPresent(value, forKey: .value)
    }
}