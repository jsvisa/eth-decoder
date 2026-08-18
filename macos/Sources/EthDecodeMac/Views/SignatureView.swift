import EthDecodeCore
import SwiftUI

struct SignatureView: View {
    @EnvironmentObject private var settings: AppSettings
    @State private var sign = ""
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var result: (QueryResponse, JSONValue)?

    private var trimmedSign: String { sign.trimmingCharacters(in: .whitespacesAndNewlines) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                queryCard
                if let errorMessage { ErrorView(message: errorMessage) { self.errorMessage = nil } }
                if let (response, raw) = result { resultCard(response, raw) }
                if result == nil && errorMessage == nil && !isLoading {
                    EmptyState(icon: "text.magnifyingglass", title: "Signature Lookup",
                               message: "Enter a 4-byte function selector or 32-byte event topic0 hex string.")
                }
            }
            .padding(24)
        }
        .background(Color(nsColor: .windowBackgroundColor))
    }

    private var queryCard: some View {
        Card(title: "Signature Lookup", subtitle: "4-byte selector or 32-byte topic0") {
            HStack(spacing: 10) {
                MonoField(placeholder: "0xa9059cbb", text: $sign, font: 14)
                    .frame(maxHeight: 36)
                Button {
                    Task { await lookup() }
                } label: {
                    Label("Lookup", systemImage: "magnifyingglass")
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.small)
                .disabled(isLoading || trimmedSign.isEmpty)
                .keyboardShortcut(.return, modifiers: .command)
            }
        }
        .loading(isLoading)
    }

    private func resultCard(_ response: QueryResponse, _ raw: JSONValue) -> some View {
        Card(title: "Result", subtitle: response.msg) {
            VStack(alignment: .leading, spacing: 12) {
                if let data = response.data {
                    if case .object(let obj) = data {
                        if let text = obj["text_sign"]?.display, !text.isEmpty, text != "null" {
                            MonoText(text: text, size: 14)
                                .padding(10)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .background(Color(nsColor: .textBackgroundColor))
                                .clipShape(RoundedRectangle(cornerRadius: 8))
                                .overlay(RoundedRectangle(cornerRadius: 8).stroke(.separator))
                                .overlay(alignment: .topTrailing) { CopyButton(text: text).padding(6) }
                        }
                        KVTable(rows: obj.keys.sorted().map { ($0, obj[$0]!.display) })
                    } else {
                        KVTable(rows: [("data", data.display)])
                    }
                } else {
                    Text("No matching signature found.").font(.callout).foregroundStyle(.secondary)
                }
                JSONView(title: "Raw Response", json: raw)
            }
        }
    }

    private func lookup() async {
        guard !trimmedSign.isEmpty else { return }
        isLoading = true; errorMessage = nil
        do {
            let api = DecoderAPI(client: settings.client)
            let raw = try await api.client.getJSON("/api/v1/query", query: ["sign": trimmedSign])
            let typed = try APIClient.typed(QueryResponse.self, from: raw)
            result = (typed, raw)
        } catch { errorMessage = error.localizedDescription }
        isLoading = false
    }
}