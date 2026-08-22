import EthDecodeCore
import SwiftUI

struct DecoderView: View {
    @EnvironmentObject private var settings: AppSettings
    @EnvironmentObject private var history: HistoryStore
    @State private var calldata = ""
    @State private var includeAbi = true
    @State private var includeSign = true
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var result: (DecodeResponse, JSONValue)?
    @State private var copied = false

    private var trimmedCalldata: String { calldata.trimmingCharacters(in: .whitespacesAndNewlines) }

    var body: some View {
        HStack(spacing: 0) {
            DecoderHistorySidebar(calldata: $calldata, withAbi: $includeAbi, withSign: $includeSign) { input, abi, sign in
                Task { await decodeWith(input: input, withAbi: abi, withSign: sign) }
            }
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    inputCard
                    if let errorMessage { ErrorView(message: errorMessage) { self.errorMessage = nil } }
                    if let (decoded, raw) = result { resultsCard(decoded, raw) }
                    if result == nil && errorMessage == nil && !isLoading {
                        EmptyState(icon: "arrow.left.arrow.right", title: "Decode Calldata",
                                   message: "Paste a transaction hex string above to get started.")
                    }
                }
                .padding(24)
            }
        }
        .background(Color(nsColor: .windowBackgroundColor))
    }

    // MARK: - Input

    private var inputCard: some View {
        Card(title: "Calldata", subtitle: "Paste transaction input data") {
            VStack(alignment: .leading, spacing: 12) {
                TextEditor(text: $calldata)
                    .font(.system(size: 13, design: .monospaced))
                    .frame(minHeight: 110)
                    .scrollContentBackground(.hidden)
                    .padding(8)
                    .background(Color(nsColor: .textBackgroundColor))
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                    .overlay(RoundedRectangle(cornerRadius: 10).stroke(.separator))
                    .overlay(alignment: .topTrailing) {
                        if !calldata.isEmpty {
                            CopyButton(text: trimmedCalldata)
                                .padding(8)
                        }
                    }

                HStack(spacing: 16) {
                    Toggle(isOn: $includeAbi) { Text("Include ABI").font(.caption) }
                        .toggleStyle(.checkbox).controlSize(.small)
                    Toggle(isOn: $includeSign) { Text("Include selector").font(.caption) }
                        .toggleStyle(.checkbox).controlSize(.small)
                    Spacer()
                    Button {
                        Task { await decode() }
                    } label: {
                        Label("Decode", systemImage: "arrow.right.circle")
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.small)
                    .disabled(isLoading || trimmedCalldata.isEmpty)
                    .keyboardShortcut(.return, modifiers: .command)
                }
            }
            .loading(isLoading)
        }
    }

    // MARK: - Results

    private func resultsCard(_ decoded: DecodeResponse, _ raw: JSONValue) -> some View {
        Group {
            if decoded.data == nil || decoded.data!.isEmpty {
                Card(title: "Result", subtitle: decoded.msg) {
                    Text("No matching function found.").font(.callout).foregroundStyle(.secondary)
                }
            } else {
                ForEach(Array(decoded.data!.enumerated()), id: \.offset) { _, item in
                    DecodedResultCard(item: item, raw: rawItem(raw, count: decoded.data!.count))
                }
            }
        }
    }

    private func rawItem(_ raw: JSONValue, count: Int) -> JSONValue? {
        guard case .object(let obj) = raw, let arr = obj["data"], case .array(let items) = arr else {
            return nil
        }
        return items.count == 1 ? items[0] : nil
    }

    private func decodeWith(input: String, withAbi: Bool, withSign: Bool) async {
        calldata = input
        includeAbi = withAbi
        includeSign = withSign
        await decode()
    }

    private func decode() async {
        guard !trimmedCalldata.isEmpty else { return }
        isLoading = true; errorMessage = nil
        do {
            let (decoded, raw) = try await DecoderAPI(client: settings.client).decode(data: trimmedCalldata, withAbi: includeAbi, withSign: includeSign)
            result = (decoded, raw)
            history.saveDecoder(input: trimmedCalldata, output: raw, withAbi: includeAbi, withSign: includeSign)
        } catch { errorMessage = error.localizedDescription }
        isLoading = false
    }
}

// MARK: - Single decoded call

struct DecodedResultCard: View {
    let item: DecodedItem
    let raw: JSONValue?

    var body: some View {
        Card(title: item.funcName ?? "Unknown", subtitle: "decoded result") {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 6) {
                    if let source = item.source { Badge(text: source, color: .teal) }
                    if let type = item.multicallType { Badge(text: type, color: .indigo, icon: "square.on.square") }
                    if let sign = item.sign { Badge(text: sign, color: .orange) }
                }
                if let args = item.args, !args.isEmpty {
                    DecodedTable(args: args)
                }
                if let inner = item.innerCalls, !inner.isEmpty {
                    SectionHeader(title: "Inner Calls", count: inner.count)
                    ForEach(Array(inner.enumerated()), id: \.offset) { _, call in
                        InnerCallCard(call: call)
                    }
                }
                if let abi = item.abi { JSONView(title: "ABI", json: abi) }
                if let raw { JSONView(title: "Raw Response", json: raw) }
            }
        }
    }
}

struct InnerCallCard: View {
    let call: InnerCall

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                if let index = call.index {
                    Badge(text: "#\(index)", color: .gray)
                }
                if call.type == "command", let name = call.name {
                    Badge(text: name, color: .purple)
                } else if let sel = call.selector {
                    Badge(text: sel, color: .gray)
                }
                if call.type == "command", let ar = call.allowRevert {
                    Badge(text: ar.boolValue ? "revert ok" : "no revert", color: ar.boolValue ? .yellow : .green)
                }
                Spacer()
                if let data = call.data { CopyButton(text: data) }
            }
            if let decoded = call.decoded {
                MonoText(text: decoded.funcName ?? "?", size: 12).padding(.leading, 8)
                if let args = decoded.args, !args.isEmpty {
                    DecodedTable(args: args).padding(.leading, 8)
                }
            }
            if let args = call.args {
                KVTable(rows: objectRows(args)).padding(.leading, 8)
            }
            if let data = call.data, call.decoded == nil {
                MonoText(text: data.truncatedHex, size: 10, color: .secondary).padding(.leading, 8)
            }
            if !call.extra.isEmpty {
                KVTable(rows: call.extra.keys.sorted().map { ($0, call.extra[$0]!.display) }).padding(.leading, 8)
            }
        }
        .padding(10)
        .background(Color(nsColor: .controlBackgroundColor))
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(.separator.opacity(0.5)))
    }

    private func objectRows(_ value: JSONValue) -> [(String, String)] {
        guard case .object(let obj) = value else { return [("value", value.display)] }
        return obj.keys.sorted().map { ($0, obj[$0]!.display) }
    }
}

extension JSONValue {
    var boolValue: Bool {
        if case .bool(let b) = self { return b }
        return false
    }
}

extension String {
    var truncatedHex: String {
        count > 80 ? "\(prefix(40))…\(suffix(36))" : self
    }
}