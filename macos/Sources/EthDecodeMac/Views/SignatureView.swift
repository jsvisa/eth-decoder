import EthDecodeCore
import SwiftUI

struct SignatureView: View {
    @EnvironmentObject private var settings: AppSettings
    @State private var sign = ""
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var result: (QueryResponse, JSONValue)?

    private var trimmedSign: String {
        sign.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                queryCard
                if let errorMessage {
                    ErrorView(message: errorMessage) { self.errorMessage = nil }
                }
                if let (response, raw) = result {
                    resultCard(response, raw)
                }
            }
            .padding(20)
        }
        .frame(maxHeight: .infinity)
        .overlay {
            if result == nil && errorMessage == nil && !isLoading {
                EmptyState(
                    icon: "text.magnifyingglass",
                    title: "Signature lookup",
                    message: "Enter a 4-byte function selector or 32-byte event topic0."
                )
                .offset(y: -40)
                .allowsHitTesting(false)
            }
        }
        .background(Color(nsColor: .windowBackgroundColor))
    }

    private var queryCard: some View {
        Card(title: "Lookup", subtitle: "4-byte selector or topic0") {
            HStack(spacing: 10) {
                TextField("0xa9059cbb", text: $sign)
                    .textFieldStyle(.plain)
                    .font(.system(size: 13, design: .monospaced))
                    .padding(8)
                    .background(Color(nsColor: .textBackgroundColor))
                    .clipShape(RoundedRectangle(cornerRadius: 6))
                    .overlay(RoundedRectangle(cornerRadius: 6).stroke(.separator.opacity(0.7)))
                    .disabled(isLoading)

                Button {
                    Task { await lookup() }
                } label: {
                    Label(isLoading ? "Looking up…" : "Look up", systemImage: "magnifyingglass")
                        .frame(minWidth: 74)
                }
                .buttonStyle(.borderedProminent)
                .disabled(isLoading || trimmedSign.isEmpty)
                .keyboardShortcut(.return, modifiers: .command)
            }
        }
        .loading(isLoading)
    }

    @ViewBuilder
    private func resultCard(_ response: QueryResponse, _ raw: JSONValue) -> some View {
        Card(title: "Result", subtitle: response.msg) {
            VStack(alignment: .leading, spacing: 12) {
                if let data = response.data {
                    canonicalBanner(data)
                    detailTable(data)
                } else {
                    Text("No matching signature found.")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                }
                CollapsibleJSON(title: "Raw response", json: raw)
            }
        }
    }

    /// Big highlighted signature banner, like the web's `text_sign` display.
    @ViewBuilder
    private func canonicalBanner(_ data: JSONValue) -> some View {
        if case .object(let obj) = data,
           case .string(let text)? = obj["text_sign"], !text.isEmpty {
            HStack(spacing: 8) {
                Text(text)
                    .font(.system(size: 14, weight: .medium, design: .monospaced))
                    .foregroundStyle(CodeColors.key)
                    .textSelection(.enabled)
                    .lineLimit(2)
                    .minimumScaleFactor(0.7)
                Spacer()
                CopyButton(text: text)
            }
            .padding(12)
            .background(CodeColors.panel)
            .clipShape(RoundedRectangle(cornerRadius: 8))
        }
    }

    @ViewBuilder
    private func detailTable(_ data: JSONValue) -> some View {
        if case .object(let obj) = data {
            KVTable(rows: obj.keys.sorted().map { ($0, $0 == "text_sign" ? "" : obj[$0]!.display) }
                .filter { !$1.isEmpty })
        } else {
            KVTable(rows: [("data", data.display)])
        }
    }

    // MARK: - Actions

    private func lookup() async {
        guard !trimmedSign.isEmpty else { return }
        isLoading = true
        errorMessage = nil
        do {
            let api = DecoderAPI(client: settings.client)
            let raw = try await api.client.getJSON("/api/v1/query", query: ["sign": trimmedSign])
            result = (try APIClient.typed(QueryResponse.self, from: raw), raw)
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }
}
