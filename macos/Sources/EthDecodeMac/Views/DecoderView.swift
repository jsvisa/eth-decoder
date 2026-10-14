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
    /// Switches the result panel between highlighted JSON and YAML.
    @State private var resultFormat = "JSON"
    @State private var showInspector = false
    @State private var clipboardCandidate: String?

    private var trimmedCalldata: String {
        calldata.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if let candidate = clipboardCandidate {
                    clipboardPill(candidate)
                }
                inputCard
                if let errorMessage {
                    ErrorView(message: errorMessage) { self.errorMessage = nil }
                }
                if let (decoded, raw) = result {
                    resultSection(decoded, raw)
                }
            }
            .padding(20)
        }
        .frame(maxHeight: .infinity)
        .background(Color(nsColor: .windowBackgroundColor))
        .overlay {
            if result == nil && errorMessage == nil && !isLoading {
                emptyState
            }
        }
        .inspector(isPresented: $showInspector) {
            inspectorContent
        }
        .focusedValue(\.decodeCommand, { _ = Task { await decode() } })
        .focusedValue(\.clearResultsCommand, {
            result = nil
            errorMessage = nil
        })
        .onAppear { refreshClipboardCandidate() }
        .onReceive(NotificationCenter.default.publisher(for: NSWindow.didBecomeKeyNotification)) { _ in
            refreshClipboardCandidate()
        }
    }

    // MARK: - Empty state with examples

    private var emptyState: some View {
        VStack(spacing: 22) {
            ContentUnavailableView {
                Label("No calldata yet", systemImage: "arrow.left.arrow.right.square")
            } description: {
                Text("Paste transaction input data and press ⌘↩,\nor try an example below.")
            }

            HStack(spacing: 8) {
                ForEach(ExamplePayload.allCases) { sample in
                    Button {
                        Task { await decodeWith(input: sample.hex, withAbi: true, withSign: true) }
                    } label: {
                        VStack(spacing: 3) {
                            Text(sample.title)
                                .font(.callout.weight(.medium))
                            Text(sample.hex)
                                .font(.system(size: 10, design: .monospaced))
                                .foregroundStyle(.tertiary)
                                .lineLimit(1)
                                .truncationMode(.middle)
                        }
                        .padding(.horizontal, 14)
                        .padding(.vertical, 8)
                    }
                    .buttonStyle(.bordered)
                }
            }
        }
        .offset(y: -50)
        .allowsHitTesting(true)
    }

    enum ExamplePayload: CaseIterable, Identifiable {
        case erc20Transfer, erc20Approve, balanceOf

        var id: String { title }
        var title: String {
            switch self {
            case .erc20Transfer: "ERC-20 Transfer"
            case .erc20Approve: "ERC-20 Approve"
            case .balanceOf: "Balance Check"
            }
        }

        var hex: String {
            let zeroAddr = String(repeating: "0", count: 24)
            let deadPadded = zeroAddr + "dead"
            switch self {
            case .erc20Transfer:
                return ("0xa9059cbb" + deadPadded
                    + String(repeating: "0", count: 61) + "e8")
            case .erc20Approve:
                return ("0x095ea7b3" + deadPadded
                    + String(repeating: "f", count: 64))
            case .balanceOf:
                return "0x70a08231" + deadPadded
            }
        }
    }

    // MARK: - Clipboard pill

    private func clipboardPill(_ candidate: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: "doc.on.clipboard")
                .foregroundStyle(Theme.accent)
            Text("Clipboard contains what looks like calldata")
                .font(.callout)
            Button("Decode it") {
                Task { await decodeWith(input: candidate, withAbi: includeAbi, withSign: includeSign) }
            }
            .buttonStyle(.link)
            .fontWeight(.semibold)
            Button("Dismiss") { clipboardCandidate = nil }
                .buttonStyle(.link)
                .foregroundStyle(.tertiary)
            Spacer()
        }
        .padding(10)
        .background(Theme.accent.opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(Theme.accent.opacity(0.35)))
    }

    private func refreshClipboardCandidate() {
        guard trimmedCalldata.isEmpty else { clipboardCandidate = nil; return }
        guard let content = NSPasteboard.general.string(forType: .string)?
            .trimmingCharacters(in: .whitespacesAndNewlines),
            !content.isEmpty,
            content.hasPrefix("0x"),
            content.dropFirst().count >= 16,
            content.dropFirst().count <= 400_000,
            content.dropFirst().allSatisfy({ $0.isHexDigit })
        else { clipboardCandidate = nil; return }
        clipboardCandidate = content
    }

    // MARK: - Input card

    private var inputCard: some View {
        Card(title: "Calldata", subtitle: "0x-prefixed transaction input") {
            VStack(alignment: .leading, spacing: 12) {
                TextField("Enter hex data to decode (e.g. 0x095ea7b3…)", text: $calldata)
                    .textFieldStyle(.plain)
                    .font(.system(size: 13, design: .monospaced))
                    .padding(10)
                    .background(Color(nsColor: .textBackgroundColor))
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                    .overlay(RoundedRectangle(cornerRadius: 8).stroke(.separator.opacity(0.7)))
                    .disabled(isLoading)

                HStack(spacing: 16) {
                    Toggle("With ABI", isOn: $includeAbi)
                        .toggleStyle(.checkbox).controlSize(.small).font(.caption)
                    Toggle("With Selector", isOn: $includeSign)
                        .toggleStyle(.checkbox).controlSize(.small).font(.caption)
                    Spacer()

                    Button {
                        withAnimation { showInspector.toggle() }
                    } label: {
                        Label("Raw", systemImage: "sidebar.right")
                    }
                    .help("Toggle the raw response inspector (⌥⌘I)")
                    .keyboardShortcut("i", modifiers: [.command, .option])

                    Button {
                        Task { await decode() }
                    } label: {
                        Label(isLoading ? "Decoding…" : "Decode",
                              systemImage: "arrow.down.right.circle")
                            .frame(minWidth: 74)
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.regular)
                    .disabled(isLoading || trimmedCalldata.isEmpty)
                    .keyboardShortcut(.return, modifiers: .command)

                    if !trimmedCalldata.isEmpty {
                        CopyButton(text: trimmedCalldata).help("Copy calldata")
                    }
                }
            }
        }
        .loading(isLoading)
    }

    // MARK: - Result

    @ViewBuilder
    private func resultSection(_ decoded: DecodeResponse, _ raw: JSONValue) -> some View {
        if decoded.data == nil || decoded.data!.isEmpty {
            Card(title: "Result", subtitle: decoded.msg) {
                Text("No matching function found.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }
        } else {
            ForEach(Array(decoded.data!.enumerated()), id: \.offset) { _, item in
                DecodedResultCard(item: item, isYaml: resultFormat == "YAML") {
                    SegmentedPicker(
                        options: [("JSON", "JSON"), ("YAML", "YAML")],
                        selection: $resultFormat)
                }
            }
        }
    }

    // MARK: - Inspector (raw response / ABI)

    @ViewBuilder
    private var inspectorContent: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text("Raw Response").font(.headline)
                Spacer()
                CopyButton(text: rawPretty)
            }
            CodeBlock(json: currentRaw, maxHeight: 3000)
            if let abi = currentAbi {
                Divider()
                Text("ABI").font(.headline)
                CodeBlock(json: abi, maxHeight: 3000)
            }
            Spacer()
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .toolbar {
            ToolbarItem(placement: .destructiveAction) {
                Button {
                    showInspector = false
                } label: {
                    Image(systemName: "xmark.circle.fill").foregroundStyle(.quaternary)
                }
                .keyboardShortcut(.cancelAction)
            }
        }
    }

    private var currentRaw: JSONValue? {
        result?.1
    }

    private var currentAbi: JSONValue? {
        result?.0.data?.first?.abi
    }

    private var rawPretty: String {
        currentRaw?.prettyJSON ?? ""
    }

    // MARK: - Actions

    private func decodeWith(input: String, withAbi: Bool, withSign: Bool) async {
        calldata = input
        includeAbi = withAbi
        includeSign = withSign
        await decode()
    }

    private func decode() async {
        guard !trimmedCalldata.isEmpty else { return }
        isLoading = true
        errorMessage = nil
        clipboardCandidate = nil
        do {
            let api = DecoderAPI(client: settings.client)
            let raw = try await api.client.getJSON(
                "/api/v1/decode",
                query: [
                    "data": trimmedCalldata,
                    "with_abi": includeAbi ? "true" : "false",
                    "with_sign": includeSign ? "true" : "false",
                ]
            )
            let typed = try APIClient.typed(DecodeResponse.self, from: raw)
            result = (typed, raw)
            history.saveDecoder(
                input: trimmedCalldata, output: summary(of: typed),
                withAbi: includeAbi, withSign: includeSign)
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    /// History rows carry a compact `{func, …}` summary like the web app.
    private func summary(of decoded: DecodeResponse) -> JSONValue {
        guard let first = decoded.data?.first else { return .null }
        var dict: [String: JSONValue] = [:]
        if let fn = first.funcName { dict["func"] = .string(fn) }
        if let args = first.args {
            dict["args"] = .object(args.mapValues { arg in
                if case .array(let values) = arg { return values.first ?? .null }
                return arg
            })
        }
        return .object(dict)
    }
}

// MARK: - Decoded result card

struct DecodedResultCard<Trailing: View>: View {
    let item: DecodedItem
    var isYaml = false
    @ViewBuilder var trailing: () -> Trailing

    init(item: DecodedItem, isYaml: Bool = false,
         @ViewBuilder trailing: @escaping () -> Trailing = { EmptyView() }) {
        self.item = item
        self.isYaml = isYaml
        self.trailing = trailing
    }

    var body: some View {
        Card(
            title: item.funcName ?? "Unknown function",
            subtitle: item.multicallType?.replacingOccurrences(of: "_", with: " "),
            trailing: { trailing() }
        ) {
            VStack(alignment: .leading, spacing: 14) {
                HStack(spacing: 6) {
                    if let source = item.source { Badge(text: source, color: .teal) }
                    if let type = item.multicallType {
                        Badge(text: type, color: .indigo, icon: "square.on.square")
                    }
                    if let sign = item.sign { Badge(text: sign, color: .secondaryBG) }
                }

                if let args = item.args, !args.isEmpty {
                    sectionBlock("Arguments") {
                        ForEach(args.keys.sorted(), id: \.self) { key in
                            argRow(key: key, value: args[key]!)
                        }
                    }
                }

                if let innerCalls = item.innerCalls, !innerCalls.isEmpty {
                    SectionHeader(title: "Inner Calls", count: innerCalls.count)
                    VStack(alignment: .leading, spacing: 6) {
                        ForEach(Array(innerCalls.enumerated()), id: \.offset) { idx, call in
                            InnerCallRow(call: call, index: idx)
                        }
                    }
                }
            }
        }
    }

    private func argRow(key: String, value: JSONValue) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Text(key)
                .font(.caption.monospaced().weight(.semibold))
                .frame(width: 110, alignment: .trailing)
            if isYaml || isComplex(value) {
                JSONTree(value: value, startExpanded: false)
            } else {
                MonoText(text: flatten(value), size: 12, color: CodeColors.argValue)
            }
        }
        .padding(.vertical, 1)
    }

    private func isComplex(_ v: JSONValue) -> Bool {
        switch v {
        case .array(let a) where a.count > 3: return true
        case .object: return true
        default: return false
        }
    }

    private func flatten(_ v: JSONValue) -> String {
        switch v {
        case .string(let s): return s
        case .array(let a):
            let items = a.map { el in
                if case .string(let s) = el { return s }
                return el.display
            }
            let joined = items.joined(separator: ", ")
            return "[\(joined)]"
        default:
            return v.display
        }
    }

    private func sectionBlock<Content: View>(
        _ title: String, @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            SectionHeader(title: title)
            VStack(alignment: .leading, spacing: 6) {
                content()
            }
            .padding(10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color(nsColor: .textBackgroundColor).opacity(0.6))
            .clipShape(RoundedRectangle(cornerRadius: 8))
        }
    }
}

extension Color {
    static let secondaryBG = Color(nsColor: .secondaryLabelColor)
}

// MARK: - Inner call row

struct InnerCallRow: View {
    let call: InnerCall
    var index: Int?
    @State private var expanded = false

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            header
            if expanded { details }
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(nsColor: .textBackgroundColor).opacity(0.6))
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(.separator.opacity(0.3)))
        .onTapGesture { withAnimation(.easeOut(duration: 0.15)) { expanded.toggle() } }
    }

    private var header: some View {
        HStack(spacing: 8) {
            Image(systemName: "chevron.right")
                .font(.system(size: 9, weight: .semibold))
                .foregroundStyle(.tertiary)
                .rotationEffect(.degrees(expanded ? 90 : 0))
            if let i = index ?? call.index {
                Text("#\(i)")
                    .font(.caption2.monospaced().weight(.bold))
                    .foregroundStyle(.secondary)
            }
            titleContent
            Spacer()
            statusChips
            if let data = call.data {
                CopyButton(text: data)
            }
        }
    }

    @ViewBuilder
    private var titleContent: some View {
        if call.type == "command", let name = call.name {
            MonoText(text: name, size: 12, color: Theme.accent)
        } else if let fn = call.decoded?.funcName {
            MonoText(text: fn, size: 12, color: Theme.accent)
        } else if let sel = call.selector {
            MonoText(text: sel, size: 11.5, color: .secondary)
        } else if let target = call.target {
            MonoText(text: target.truncatedHexShort, size: 11, color: .secondary)
        } else {
            Text("call").font(.callout).foregroundStyle(.secondary)
        }
    }

    @ViewBuilder
    private var statusChips: some View {
        if call.type == "command", let ar = call.allowRevert {
            Badge(text: ar.boolValue ? "may revert" : "strict",
                  color: ar.boolValue ? .yellow : .green)
        }
    }

    @ViewBuilder
    private var details: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let args = call.decoded?.args, !args.isEmpty {
                ForEach(args.keys.sorted(), id: \.self) { key in
                    HStack(alignment: .top, spacing: 10) {
                        Text(key)
                            .font(.caption.monospaced().weight(.semibold))
                            .frame(width: 110, alignment: .trailing)
                        JSONTree(value: args[key]!, startExpanded: depthOK(call.decoded?.args?[key]))
                    }
                }
            } else if let args = call.args {
                JSONTree(value: args, startExpanded: true)
            }

            if let value = call.value {
                KVRow(key: "value", value: value.display)
            }
            if let target = call.target, call.decoded != nil || call.args != nil {
                KVRow(key: "to", value: target.truncatedHexShort)
            }
            if let data = call.data, call.decoded == nil {
                HStack(alignment: .top, spacing: 8) {
                    Text("data").font(.caption).foregroundStyle(.secondary)
                        .frame(width: 110, alignment: .trailing)
                    MonoText(text: data.truncatedHex, size: 10, color: .secondary)
                }
            }
            if !call.extra.isEmpty {
                KVTable(rows: call.extra.keys.sorted().map { ($0, call.extra[$0]!.display) })
            }
        }
        .padding(.leading, 24)
    }

    private func depthOK(_ v: JSONValue?) -> Bool {
        switch v {
        case .array(let a) where a.count > 4: return false
        case .object: return false
        default: return true
        }
    }
}

extension Optional where Wrapped == Int {
    static func ?? (lhs: Self, rhs: @autoclosure () -> Int?) -> Int? {
        switch lhs {
        case .some(let value): return value
        case .none: return rhs()
        }
    }
}
