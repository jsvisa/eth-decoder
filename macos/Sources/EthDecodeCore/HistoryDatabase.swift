import Foundation
import SQLite3

// SQLite-backed persistence for decoder/caller history.
//
// The store keeps full arrays in memory and writes them back wholesale inside a
// single transaction, which keeps the API tiny and the dedup/trim logic in one
// place (HistoryStore). Sizes are capped at ~100 rows so this is cheap.

public final class HistoryDatabase {
    private var db: OpaquePointer?

    public enum HistoryError: LocalizedError {
        case open(String)
        case prepare(String)
        case step(String)
        case exec(String)

        public var errorDescription: String? {
            switch self {
            case .open(let m): return "Could not open history database: \(m)"
            case .prepare(let m): return "Could not prepare history query: \(m)"
            case .step(let m): return "History write failed: \(m)"
            case .exec(let m): return "History database error: \(m)"
            }
        }
    }

    private static let transient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)

    // MARK: - Lifecycle

    public init(path: String) throws {
        try FileManager.default.createDirectory(
            at: URL(fileURLWithPath: (path as NSString).deletingLastPathComponent),
            withIntermediateDirectories: true
        )
        var handle: OpaquePointer?
        let rc = sqlite3_open_v2(path, &handle, SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_FULLMUTEX, nil)
        guard rc == SQLITE_OK else {
            let message = handle.map { String(cString: sqlite3_errmsg($0)) } ?? "rc=\(rc)"
            sqlite3_close(handle)
            throw HistoryError.open(message)
        }
        db = handle
        try exec("PRAGMA journal_mode=WAL")
        try exec("""
        CREATE TABLE IF NOT EXISTS decoder_history (
          id INTEGER PRIMARY KEY,
          input TEXT NOT NULL,
          output TEXT,
          with_abi INTEGER,
          with_sign INTEGER,
          timestamp TEXT NOT NULL)
        """)
        try exec("""
        CREATE TABLE IF NOT EXISTS caller_history (
          id INTEGER PRIMARY KEY,
          chain TEXT NOT NULL,
          address TEXT NOT NULL,
          function_name TEXT,
          function_sig TEXT,
          args TEXT,
          from_address TEXT,
          output TEXT,
          contract_name TEXT,
          is_write INTEGER,
          timestamp TEXT NOT NULL,
          type TEXT,
          txs TEXT)
        """)
    }

    deinit {
        if let db { sqlite3_close_v2(db) }
    }

    /// Standard on-disk location under Application Support.
    public static func defaultPath() -> String {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? URL(fileURLWithPath: NSTemporaryDirectory())
        return base.appendingPathComponent("EthDecode/history.sqlite", isDirectory: false).path
    }

    // MARK: - Decoder history

    public func loadDecoder() throws -> [DecodeHistoryItem] {
        let sql = "SELECT id, input, output, with_abi, with_sign, timestamp FROM decoder_history ORDER BY id DESC"
        let stmt = try prepare(sql)
        defer { sqlite3_finalize(stmt) }
        var items: [DecodeHistoryItem] = []
        while sqlite3_step(stmt) == SQLITE_ROW {
            let id = Int(sqlite3_column_int64(stmt, 0))
            let input = Self.text(stmt, 1) ?? ""
            let output = Self.jsonValue(stmt, 2)
            let withAbi = Self.bool(stmt, 3)
            let withSign = Self.bool(stmt, 4)
            let timestamp = Self.text(stmt, 5) ?? ""
            let options = DecodeHistoryItem.DecodeOptions(withAbi: withAbi ?? true, withSign: withSign ?? true)
            items.append(DecodeHistoryItem(id: id, input: input, output: output, options: options, timestamp: timestamp))
        }
        return items
    }

    public func saveDecoder(_ items: [DecodeHistoryItem]) throws {
        try exec("BEGIN IMMEDIATE")
        do {
            try exec("DELETE FROM decoder_history")
            let stmt = try prepare("INSERT INTO decoder_history (id, input, output, with_abi, with_sign, timestamp) VALUES (?,?,?,?,?,?)")
            defer { sqlite3_finalize(stmt) }
            for item in items {
                sqlite3_reset(stmt)
                sqlite3_bind_int64(stmt, 1, Int64(item.id))
                try Self.bind(item.input, at: 2, stmt)
                try Self.bindJSON(item.output, at: 3, stmt)
                try Self.bindOptionalBool(item.options?.withAbi, at: 4, stmt)
                try Self.bindOptionalBool(item.options?.withSign, at: 5, stmt)
                try Self.bind(item.timestamp, at: 6, stmt)
                guard sqlite3_step(stmt) == SQLITE_DONE else { throw lastStepError() }
            }
            try exec("COMMIT")
        } catch {
            try? exec("ROLLBACK")
            throw error
        }
    }

    public func clearDecoder() throws {
        try exec("DELETE FROM decoder_history")
    }

    // MARK: - Caller history

    public func loadCaller() throws -> [CallHistoryItem] {
        let sql = """
        SELECT id, chain, address, function_name, function_sig, args, from_address,
               output, contract_name, is_write, timestamp, type, txs
        FROM caller_history ORDER BY id DESC
        """
        let stmt = try prepare(sql)
        defer { sqlite3_finalize(stmt) }
        var items: [CallHistoryItem] = []
        while sqlite3_step(stmt) == SQLITE_ROW {
            let id = Int(sqlite3_column_int64(stmt, 0))
            let chain = Self.text(stmt, 1) ?? ""
            let address = Self.text(stmt, 2) ?? ""
            let functionName = Self.text(stmt, 3)
            let functionSig = Self.text(stmt, 4)
            let args = Self.stringArray(stmt, 5)
            let fromAddress = Self.text(stmt, 6)
            let output = Self.jsonValue(stmt, 7)
            let contractName = Self.text(stmt, 8)
            let isWrite = Self.bool(stmt, 9)
            let timestamp = Self.text(stmt, 10) ?? ""
            let type = Self.text(stmt, 11)
            let txs = Self.codableArray(CallHistoryItem.SessionCall.self, stmt, 12)
            items.append(CallHistoryItem(
                id: id, chain: chain, address: address, functionName: functionName,
                functionSig: functionSig, args: args, fromAddress: fromAddress,
                output: output, contractName: contractName, isWrite: isWrite,
                timestamp: timestamp, type: type, txs: txs))
        }
        return items
    }

    public func saveCaller(_ items: [CallHistoryItem]) throws {
        try exec("BEGIN IMMEDIATE")
        do {
            try exec("DELETE FROM caller_history")
            let stmt = try prepare("""
            INSERT INTO caller_history (id, chain, address, function_name, function_sig, args,
                                        from_address, output, contract_name, is_write, timestamp, type, txs)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
            """)
            defer { sqlite3_finalize(stmt) }
            for item in items {
                sqlite3_reset(stmt)
                sqlite3_bind_int64(stmt, 1, Int64(item.id))
                try Self.bind(item.chain, at: 2, stmt)
                try Self.bind(item.address, at: 3, stmt)
                try Self.bind(item.functionName, at: 4, stmt)
                try Self.bind(item.functionSig, at: 5, stmt)
                try Self.bindJSONArray(item.args, at: 6, stmt)
                try Self.bind(item.fromAddress, at: 7, stmt)
                try Self.bindJSON(item.output, at: 8, stmt)
                try Self.bind(item.contractName, at: 9, stmt)
                try Self.bindOptionalBool(item.isWrite, at: 10, stmt)
                try Self.bind(item.timestamp, at: 11, stmt)
                try Self.bind(item.type, at: 12, stmt)
                try Self.bindCodableArray(item.txs, at: 13, stmt)
                guard sqlite3_step(stmt) == SQLITE_DONE else { throw lastStepError() }
            }
            try exec("COMMIT")
        } catch {
            try? exec("ROLLBACK")
            throw error
        }
    }

    public func clearCaller() throws {
        try exec("DELETE FROM caller_history")
    }

    // MARK: - SQLite plumbing

    private func exec(_ sql: String) throws {
        var err: UnsafeMutablePointer<CChar>?
        let rc = sqlite3_exec(db, sql, nil, nil, &err)
        if rc != SQLITE_OK {
            let message = err.map { String(cString: $0) } ?? "rc=\(rc)"
            sqlite3_free(err)
            throw HistoryError.exec(message)
        }
    }

    private func prepare(_ sql: String) throws -> OpaquePointer {
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK, let stmt else {
            throw HistoryError.prepare(lastError())
        }
        return stmt
    }

    private func lastError() -> String {
        db.map { String(cString: sqlite3_errmsg($0)) } ?? "unknown"
    }

    private func lastStepError() -> Error { HistoryError.step(lastError()) }
}

// MARK: - Bind/read helpers

extension HistoryDatabase {

    private static func text(_ stmt: OpaquePointer?, _ col: Int32) -> String? {
        guard sqlite3_column_type(stmt, col) != SQLITE_NULL else { return nil }
        return String(cString: sqlite3_column_text(stmt, col))
    }

    private static func bool(_ stmt: OpaquePointer?, _ col: Int32) -> Bool? {
        guard sqlite3_column_type(stmt, col) != SQLITE_NULL else { return nil }
        return sqlite3_column_int64(stmt, col) != 0
    }

    private static func jsonValue(_ stmt: OpaquePointer?, _ col: Int32) -> JSONValue? {
        guard let raw = text(stmt, col), let data = raw.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode(JSONValue.self, from: data)
    }

    private static func stringArray(_ stmt: OpaquePointer?, _ col: Int32) -> [String]? {
        guard let data = text(stmt, col)?.data(using: .utf8),
              let arr = try? JSONDecoder().decode([String].self, from: data) else { return nil }
        return arr
    }

    private static func codableArray<T: Decodable>(_ type: T.Type, _ stmt: OpaquePointer?, _ col: Int32) -> [T]? {
        guard let data = text(stmt, col)?.data(using: .utf8),
              let arr = try? JSONDecoder().decode([T].self, from: data) else { return nil }
        return arr
    }

    private static func bind(_ value: String?, at index: Int32, _ stmt: OpaquePointer?) throws {
        guard let value else {
            sqlite3_bind_null(stmt, index)
            return
        }
        sqlite3_bind_text(stmt, index, value, -1, transient)
    }

    private static func bindOptionalBool(_ value: Bool?, at index: Int32, _ stmt: OpaquePointer?) throws {
        if let value {
            sqlite3_bind_int64(stmt, index, value ? 1 : 0)
        } else {
            sqlite3_bind_null(stmt, index)
        }
    }

    private static func bindJSON(_ value: JSONValue?, at index: Int32, _ stmt: OpaquePointer?) throws {
        guard let value else {
            sqlite3_bind_null(stmt, index)
            return
        }
        sqlite3_bind_text(stmt, index, value.compactJSON, -1, transient)
    }

    private static func bindJSONArray(_ values: [String]?, at index: Int32, _ stmt: OpaquePointer?) throws {
        guard let values else {
            sqlite3_bind_null(stmt, index)
            return
        }
        guard let data = try? JSONEncoder().encode(values), let str = String(data: data, encoding: .utf8) else {
            sqlite3_bind_null(stmt, index)
            return
        }
        sqlite3_bind_text(stmt, index, str, -1, transient)
    }

    private static func bindCodableArray<T: Encodable>(_ values: [T]?, at index: Int32, _ stmt: OpaquePointer?) throws {
        guard let values else {
            sqlite3_bind_null(stmt, index)
            return
        }
        guard let data = try? JSONEncoder().encode(values), let str = String(data: data, encoding: .utf8) else {
            sqlite3_bind_null(stmt, index)
            return
        }
        sqlite3_bind_text(stmt, index, str, -1, transient)
    }
}
