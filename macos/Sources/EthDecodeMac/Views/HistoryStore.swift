import EthDecodeCore
import Foundation

// In-memory history + SQLite persistence.
//
// The views observe @Published arrays; every mutation rewrites the whole
// (capped) array to the database in one transaction. On first launch any
// legacy UserDefaults history is imported once and then removed.

@MainActor
final class HistoryStore: ObservableObject {
    static let legacyDecoderKey = "evm_decoder_history"
    static let legacyCallerKey = "contract_caller_history"
    static let decoderMax = 100
    static let callerMax = 50

    @Published var decoderHistory: [DecodeHistoryItem] = []
    @Published var callerHistory: [CallHistoryItem] = []

    private let db: HistoryDatabase?

    init() {
        var store: HistoryDatabase?
        do {
            store = try HistoryDatabase(path: HistoryDatabase.defaultPath())
        } catch {
            // Disk problems must not take the app down; degrade to session-only history.
            store = nil
        }
        db = store
        load()
        migrateLegacyUserDefaults()
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
        persistDecoder()
    }

    func loadDecoderFromHistory(_ item: DecodeHistoryItem) -> (input: String, options: (Bool, Bool)) {
        (item.input, (item.options?.withAbi ?? true, item.options?.withSign ?? true))
    }

    func clearDecoder() {
        decoderHistory = []
        try? db?.clearDecoder()
    }

    func deleteDecoder(_ item: DecodeHistoryItem) {
        decoderHistory.removeAll { $0.id == item.id }
        persistDecoder()
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
            timestamp: isoNow()
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
        persistCaller()
    }

    func clearCaller() {
        callerHistory = []
        try? db?.clearCaller()
    }

    func deleteCaller(_ item: CallHistoryItem) {
        callerHistory.removeAll { $0.id == item.id }
        persistCaller()
    }

    // MARK: - Persistence

    private func load() {
        if let items = try? db?.loadDecoder() {
            decoderHistory = items
        }
        if let items = try? db?.loadCaller() {
            callerHistory = items
        }
    }

    private func persistDecoder() {
        try? db?.saveDecoder(decoderHistory)
    }

    private func persistCaller() {
        try? db?.saveCaller(callerHistory)
    }

    /// One-time import of pre-SQLite history stored in UserDefaults.
    private func migrateLegacyUserDefaults() {
        let defaults = UserDefaults.standard

        if let data = defaults.data(forKey: Self.legacyDecoderKey),
           let items = try? JSONDecoder().decode([DecodeHistoryItem].self, from: data),
           !items.isEmpty {
            var merged = decoderHistory.filter { existing in
                !items.contains { $0.input.lowercased() == existing.input.lowercased() }
            }
            merged.append(contentsOf: items)
            merged.sort { $0.id > $1.id }
            decoderHistory = Array(merged.prefix(Self.decoderMax))
            persistDecoder()
        }

        if let data = defaults.data(forKey: Self.legacyCallerKey),
           let items = try? JSONDecoder().decode([CallHistoryItem].self, from: data),
           !items.isEmpty {
            var seen = Set(callerHistory.map { "\($0.chain)-\($0.address.lowercased())-\($0.functionSig ?? "")-\($0.args?.joined() ?? "")" })
            var merged = callerHistory
            for item in items where !seen.contains("\(item.chain)-\(item.address.lowercased())-\(item.functionSig ?? "")-\(item.args?.joined() ?? "")") {
                seen.insert("\(item.chain)-\(item.address.lowercased())-\(item.functionSig ?? "")-\(item.args?.joined() ?? "")")
                merged.append(item)
            }
            merged.sort { $0.id > $1.id }
            callerHistory = Array(merged.prefix(Self.callerMax))
            persistCaller()
        }

        defaults.removeObject(forKey: Self.legacyDecoderKey)
        defaults.removeObject(forKey: Self.legacyCallerKey)
    }

    private func isoNow() -> String {
        let df = ISO8601DateFormatter()
        df.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return df.string(from: Date())
    }
}
