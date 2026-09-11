import EthDecodeCore
import SwiftUI

// Web-style "Recent …" history sections rendered below each tool's content,
// replacing the old fixed side panes. Both strips: search + hide/show + clear;
// tapping a row loads that entry back into the form.

// MARK: - Header bar

private struct HistoryHeaderBar<Actions: View>: View {
    let title: String
    let count: Int
    var searchText: Binding<String>
    var isShown: Binding<Bool>
    @State private var confirmClear = false
    var onClear: () -> Void
    var extraActions: () -> Actions

    init(title: String, count: Int, searchText: Binding<String>, isShown: Binding<Bool>,
         onClear: @escaping () -> Void,
         extraActions: @escaping () -> Actions = { EmptyView() }) {
        self.title = title
        self.count = count
        self.searchText = searchText
        self.isShown = isShown
        self.onClear = onClear
        self.extraActions = extraActions
    }

    var body: some View {
        HStack(spacing: 10) {
            Text("\(title) (\(count))")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(.secondary)
            if isShown.wrappedValue && count > 3 {
                TextField("Search…", text: searchText)
                    .textFieldStyle(.roundedBorder)
                    .controlSize(.small)
                    .frame(maxWidth: 180)
            }
            Spacer()
            extraActions()
            Button(isShown.wrappedValue ? "Hide" : "Show") { isShown.wrappedValue.toggle() }
                .buttonStyle(.link)
                .font(.caption)
            Button("Clear All", role: .destructive) { confirmClear = true }
                .buttonStyle(.link)
                .font(.caption)
                .foregroundStyle(.red.opacity(0.8))
        }
        .confirmationDialog(
            "Clear all history?",
            isPresented: $confirmClear,
            titleVisibility: .visible
        ) {
            Button("Clear", role: .destructive, action: onClear)
            Button("Cancel", role: .cancel) {}
        }
    }
}

// MARK: - Decoder history

struct DecoderHistoryStrip: View {
    @EnvironmentObject private var history: HistoryStore
    var onLoad: (String, Bool, Bool) -> Void

    @State private var searchText = ""
    @State private var isShown = true

    private var filtered: [DecodeHistoryItem] {
        guard !searchText.isEmpty else { return history.decoderHistory }
        let q = searchText.lowercased()
        return history.decoderHistory.filter {
            ($0.output?.display ?? "").lowercased().contains(q)
                || $0.input.lowercased().contains(q)
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HistoryHeaderBar(
                title: "Recent Decodes",
                count: history.decoderHistory.count,
                searchText: $searchText,
                isShown: $isShown,
                onClear: { history.clearDecoder() }
            )
            if isShown, !filtered.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    ForEach(filtered.prefix(50)) { item in
                        decoderRow(item)
                    }
                    if filtered.count > 50 {
                        Text("+ \(filtered.count - 50) more…")
                            .font(.caption2)
                            .foregroundStyle(.quaternary)
                            .padding(.leading, 10)
                    }
                }
            }
        }
        .padding(.top, 4)
    }

    private func decoderRow(_ item: DecodeHistoryItem) -> some View {
        Button {
            let (input, options) = history.loadDecoderFromHistory(item)
            onLoad(input, options.0, options.1)
        } label: {
            HStack(spacing: 8) {
                MonoText(text: item.input.truncatedHexShort, size: 10, color: .secondary)
                    .lineLimit(1)
                    .frame(minWidth: 140, maxWidth: 260, alignment: .leading)
                Spacer(minLength: 16)
                if let fn = functionName(of: item) {
                    Text(fn)
                        .font(.system(size: 10.5, weight: .semibold, design: .monospaced))
                        .foregroundStyle(Theme.accent)
                        .lineLimit(1)
                        .truncationMode(.tail)
                }
                Text(TimeStamp.short(item.timestamp))
                    .font(.caption2)
                    .foregroundStyle(.quaternary)
                optionFlags(item.options)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .background(Color(nsColor: .textBackgroundColor).opacity(0.55))
        .clipShape(RoundedRectangle(cornerRadius: 6))
        .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(.separator.opacity(0.25)))
        .contextMenu {
            Button("Copy calldata") {
                NSPasteboard.general.clearContents()
                NSPasteboard.general.setString(item.input, forType: .string)
            }
            Divider()
            Button("Delete entry", role: .destructive) { history.deleteDecoder(item) }
        }
    }

    private func functionName(of item: DecodeHistoryItem) -> String? {
        guard case .object(let obj)? = item.output else { return nil }
        for key in ["func", "funcName", "function"] {
            if case .string(let s)? = obj[key], !s.isEmpty { return s }
        }
        return nil
    }

    @ViewBuilder
    private func optionFlags(_ options: DecodeHistoryItem.DecodeOptions?) -> some View {
        if let o = options, o.withAbi || o.withSign {
            HStack(spacing: 2) {
                if o.withAbi { Text("A") }
                if o.withSign { Text("S") }
            }
            .font(.caption2.monospaced().weight(.semibold))
            .foregroundStyle(.secondary)
        }
    }
}

extension String {
    var truncatedHexShort: String {
        count > 26 ? "\(prefix(14))…\(suffix(10))" : self
    }
}

// MARK: - Caller history

struct CallerHistoryStrip: View {
    @EnvironmentObject private var history: HistoryStore
    var currentChain: String
    var onLoad: (CallHistoryItem) -> Void

    @State private var searchText = ""
    @State private var isShown = true

    private var chainItems: [CallHistoryItem] {
        history.callerHistory.filter { $0.chain == currentChain }
    }

    private var filtered: [CallHistoryItem] {
        guard !searchText.isEmpty else { return chainItems }
        let q = searchText.lowercased()
        return chainItems.filter {
            ($0.functionSig ?? "").lowercased().contains(q)
                || $0.address.lowercased().contains(q)
                || ($0.contractName ?? "").lowercased().contains(q)
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HistoryHeaderBar(
                title: "Recent Calls",
                count: chainItems.count,
                searchText: $searchText,
                isShown: $isShown,
                onClear: { history.clearCaller() }
            ) {
                Text(chain.name.uppercased())
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.quaternary)
            }
            if isShown, !filtered.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    ForEach(filtered.prefix(30)) { item in
                        callerRow(item)
                    }
                }
            }
        }
        .padding(.top, 4)
    }

    private var chain: Chain { Chains.chain(named: currentChain) ?? Chains.all[0] }

    private func callerRow(_ item: CallHistoryItem) -> some View {
        Button {
            onLoad(item)
        } label: {
            HStack(spacing: 8) {
                Badge(text: item.isWrite == true ? "W" : "R",
                      color: item.isWrite == true ? .orange : .blue)
                Text(item.functionSig ?? item.functionName ?? "?")
                    .font(.system(size: 11, weight: .medium, design: .monospaced))
                    .lineLimit(1)
                    .truncationMode(.tail)
                if let name = item.contractName {
                    Text(name)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .truncationMode(.tail)
                }
                Spacer(minLength: 16)
                MonoText(text: item.address.truncatedHexShort, size: 9.5, color: Color(nsColor: .tertiaryLabelColor))
                    .lineLimit(1)
                Text(TimeStamp.short(item.timestamp))
                    .font(.caption2)
                    .foregroundStyle(.quaternary)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .background(Color(nsColor: .textBackgroundColor).opacity(0.55))
        .clipShape(RoundedRectangle(cornerRadius: 6))
        .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(.separator.opacity(0.25)))
        .contextMenu {
            Button("Copy address") {
                NSPasteboard.general.clearContents()
                NSPasteboard.general.setString(item.address, forType: .string)
            }
            if let data = item.output?.compactJSON, data.count < 200_000 {
                Button("Copy result JSON") {
                    NSPasteboard.general.clearContents()
                    NSPasteboard.general.setString(data, forType: .string)
                }
            }
            Divider()
            Button("Delete entry", role: .destructive) { history.deleteCaller(item) }
        }
    }
}
