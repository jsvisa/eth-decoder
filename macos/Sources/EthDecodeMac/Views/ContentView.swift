import SwiftUI

enum AppSection: String, CaseIterable, Identifiable {
    case decoder, signature, contract

    var id: String { rawValue }

    var title: String {
        switch self {
        case .decoder: "Tx Decoder"
        case .signature: "Signature Lookup"
        case .contract: "Contract Caller"
        }
    }

    var icon: String {
        switch self {
        case .decoder: "arrow.left.arrow.right.square"
        case .signature: "text.magnifyingglass"
        case .contract: "phone.badge.checkmark"
        }
    }

    var navigationTitle: String {
        switch self {
        case .decoder: "Transaction Calldata Decoder"
        case .signature: "Signature Lookup"
        case .contract: "Contract Caller"
        }
    }
}

struct ContentView: View {
    @State private var selection: AppSection = .decoder

    var body: some View {
        NavigationSplitView {
            List(AppSection.allCases, selection: $selection) { section in
                Label(section.title, systemImage: section.icon)
                    .tag(section)
            }
            .navigationSplitViewColumnWidth(min: 190, ideal: 210, max: 260)
        } detail: {
            detail
                .navigationTitle(selection.navigationTitle)
                .navigationSubtitle(Text("eth-decoder"))
                .toolbar {
                    ToolbarItemGroup(placement: .primaryAction) {
                        // Native chrome; individual tools add their own items.
                        Spacer()
                    }
                }
        }
    }

    @ViewBuilder
    private var detail: some View {
        switch selection {
        case .decoder: DecoderView()
        case .signature: SignatureView()
        case .contract: ContractCallerView()
        }
    }
}

// MARK: - Settings (⌘,) window

struct SettingsForm: View {
    @EnvironmentObject private var settings: AppSettings
    @EnvironmentObject private var history: HistoryStore
    @State private var confirmErase = false

    enum Preset: String, CaseIterable, Identifiable {
        case production, local, custom
        var id: String { rawValue }

        var url: String? {
            switch self {
            case .production: return "https://eth-decoder.vercel.app"
            case .local: return "http://localhost:3000"
            case .custom: return nil
            }
        }

        var title: String {
            switch self {
            case .production: "Production (vercel.app)"
            case .local: "Local dev server"
            case .custom: "Custom…"
            }
        }
    }

    private var currentPreset: Preset {
        Preset.allCases.first { $0.url == settings.baseURL } ?? .custom
    }

    var body: some View {
        Form {
        Section("API Server") {
            Picker("Endpoint", selection: Binding(
                get: { currentPreset },
                set: { newValue in
                    if let url = newValue.url { settings.baseURL = url }
                }
            )) {
                ForEach(Preset.allCases) { preset in
                    Text(preset.title).tag(preset)
                }
            }
            if currentPreset == .custom {
                LabeledContent("Base URL") {
                    TextField("https://your-deployment.vercel.app", text: $settings.baseURL)
                        .textFieldStyle(.roundedBorder)
                        .font(.system(size: 12, design: .monospaced))
                        .frame(maxWidth: 240)
                }
            }
        }

        Section {
            LabeledContent("Etherscan key") {
                SecureField("", text: $settings.etherscanApiKey)
                    .textFieldStyle(.roundedBorder)
                    .font(.system(size: 12, design: .monospaced))
                    .frame(maxWidth: 240)
            }
        } header: {
            Text("Etherscan")
        } footer: {
            Text("Optional ABI fallback when Sourcify has no match. Stored locally.")
        }

        Section("Local Data") {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("\(history.decoderHistory.count) decodes · \(history.callerHistory.count) calls")
                        .font(.callout)
                    Text("Stored in Application Support/EthDecode/history.sqlite")
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                }
                Spacer()
                Button("Erase History…", role: .destructive) { confirmErase = true }
            }
        }
        .confirmationDialog(
            "Erase all decode and call history?",
            isPresented: $confirmErase,
            titleVisibility: .visible
        ) {
            Button("Erase All Local History", role: .destructive) {
                history.clearDecoder()
                history.clearCaller()
            }
            Button("Cancel", role: .cancel) {}
        }
        }
        .formStyle(.grouped)
    }
}
