import EthDecodeCore
import SwiftUI

// MARK: - Decoder History Sidebar

struct DecoderHistorySidebar: View {
    @EnvironmentObject private var history: HistoryStore
    @Binding var calldata: String
    @Binding var withAbi: Bool
    @Binding var withSign: Bool
    var onLoad: (String, Bool, Bool) -> Void
    @State private var showClear = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("History").font(.caption).foregroundStyle(.secondary)
                Spacer()
                if !history.decoderHistory.isEmpty {
                    Button { showClear = true } label: {
                        Image(systemName: "trash").font(.caption2).foregroundStyle(.tertiary)
                    }
                    .buttonStyle(.plain)
                    .help("Clear history")
                    .alert("Clear all decode history?", isPresented: $showClear) {
                        Button("Clear", role: .destructive) { history.clearDecoder() }
                        Button("Cancel", role: .cancel) {}
                    }
                }
            }
            .padding(.horizontal, 10).padding(.vertical, 6)

            if history.decoderHistory.isEmpty {
                VStack(spacing: 4) {
                    Text("No history").font(.caption2).foregroundStyle(.quaternary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollView {
                    LazyVStack(spacing: 4) {
                        ForEach(history.decoderHistory) { item in
                            Button {
                                let (input, options) = history.loadDecoderFromHistory(item)
                                calldata = input
                                withAbi = options.0
                                withSign = options.1
                                onLoad(input, options.0, options.1)
                            } label: {
                                HStack(spacing: 6) {
                                    Circle().fill(Color.accentColor.opacity(0.3)).frame(width: 6, height: 6)
                                    VStack(alignment: .leading, spacing: 2) {
                                        MonoText(text: item.input.truncatedHex, size: 10, color: .secondary)
                                            .lineLimit(1)
                                        if let funcName = item.output?.display {
                                            Text(funcName).font(.caption2).foregroundStyle(.primary).lineLimit(1)
                                        }
                                    }
                                }
                                .padding(.horizontal, 8).padding(.vertical, 4)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .background(Color(nsColor: .controlBackgroundColor))
                            .clipShape(RoundedRectangle(cornerRadius: 4))
                        }
                    }
                    .padding(.horizontal, 6).padding(.vertical, 4)
                }
            }
        }
        .frame(width: 180)
        .background(Color(nsColor: .windowBackgroundColor))
        .overlay(alignment: .trailing) { Divider() }
    }
}

// MARK: - Contract Caller History Sidebar

struct CallerHistorySidebar: View {
    @EnvironmentObject private var history: HistoryStore
    var currentChain: String
    var onLoad: (CallHistoryItem) -> Void
    @State private var showClear = false

    private var filtered: [CallHistoryItem] {
        history.callerHistory.filter { $0.chain == currentChain }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("History").font(.caption).foregroundStyle(.secondary)
                Spacer()
                if !history.callerHistory.isEmpty {
                    Button { showClear = true } label: {
                        Image(systemName: "trash").font(.caption2).foregroundStyle(.tertiary)
                    }
                    .buttonStyle(.plain)
                    .help("Clear history")
                    .alert("Clear all call history?", isPresented: $showClear) {
                        Button("Clear", role: .destructive) { history.clearCaller() }
                        Button("Cancel", role: .cancel) {}
                    }
                }
            }
            .padding(.horizontal, 10).padding(.vertical, 6)

            if filtered.isEmpty {
                VStack(spacing: 4) {
                    Text("No history for this chain").font(.caption2).foregroundStyle(.quaternary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollView {
                    LazyVStack(spacing: 4) {
                        ForEach(filtered) { item in
                            Button { onLoad(item) } label: {
                                HStack(spacing: 6) {
                                    Badge(text: item.isWrite == true ? "W" : "R",
                                          color: item.isWrite == true ? .orange : .blue)
                                    VStack(alignment: .leading, spacing: 2) {
                                        MonoText(text: item.functionSig ?? item.functionName ?? "?", size: 10, color: .primary)
                                            .lineLimit(1)
                                        HStack(spacing: 4) {
                                            MonoText(text: item.address.truncatedHex, size: 9, color: .secondary)
                                            if let name = item.contractName {
                                                Text(name).font(.caption2).foregroundStyle(.tertiary).lineLimit(1)
                                            }
                                        }
                                    }
                                }
                                .padding(.horizontal, 8).padding(.vertical, 4)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .background(Color(nsColor: .controlBackgroundColor))
                            .clipShape(RoundedRectangle(cornerRadius: 4))
                        }
                    }
                    .padding(.horizontal, 6).padding(.vertical, 4)
                }
            }
        }
        .frame(width: 200)
        .background(Color(nsColor: .windowBackgroundColor))
        .overlay(Divider(), alignment: .trailing)
    }
}