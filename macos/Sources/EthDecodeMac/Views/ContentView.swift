import SwiftUI

enum AppSection: String, CaseIterable, Identifiable {
    case decoder, signature, contract, settings

    var id: String { rawValue }

    var title: String {
        switch self {
        case .decoder: "Decoder"
        case .signature: "Signatures"
        case .contract: "Contract Caller"
        case .settings: "Settings"
        }
    }

    var icon: String {
        switch self {
        case .decoder: "arrow.left.arrow.right"
        case .signature: "text.magnifyingglass"
        case .contract: "phone.badge.checkmark"
        case .settings: "gearshape"
        }
    }

    var subtitle: String {
        switch self {
        case .decoder: "Decode transaction calldata"
        case .signature: "Look up 4-byte / topic0 signatures"
        case .contract: "Read & simulate contract calls"
        case .settings: "API connection & keys"
        }
    }
}

struct ContentView: View {
    @State private var selection: AppSection? = .decoder

    var body: some View {
        NavigationSplitView {
            List(AppSection.allCases, selection: $selection) { section in
                VStack(alignment: .leading, spacing: 2) {
                    Label(section.title, systemImage: section.icon)
                        .font(.body)
                    Text(section.subtitle)
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                        .padding(.leading, 24)
                }
                .padding(.vertical, 4)
                .tag(section)
            }
            .navigationSplitViewColumnWidth(min: 200, ideal: 220, max: 260)
        } detail: {
            NavigationStack {
                switch selection ?? .decoder {
                case .decoder: DecoderView()
                case .signature: SignatureView()
                case .contract: ContractCallerView()
                case .settings: SettingsView()
                }
            }
        }
        .focusedSceneValue(\.appSection, selection ?? .decoder)
    }
}

struct SettingsView: View {
    @EnvironmentObject private var settings: AppSettings

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                Card(title: "API Connection", subtitle: "Deployed eth-decoder instance") {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Base URL").font(.caption).foregroundStyle(.secondary)
                        MonoField(placeholder: "https://eth-decoder.vercel.app", text: $settings.baseURL)
                    }
                }

                Card(title: "Etherscan API Key", subtitle: "Optional ABI fallback") {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Used when Sourcify has no match. Stored locally.").font(.caption).foregroundStyle(.secondary)
                        SecureField("API key", text: $settings.etherscanApiKey)
                            .textFieldStyle(.plain)
                            .font(.system(size: 13, design: .monospaced))
                            .padding(10)
                            .background(Color(nsColor: .textBackgroundColor))
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                            .overlay(RoundedRectangle(cornerRadius: 8).stroke(.separator))
                    }
                }

                Spacer()
            }
            .padding(24)
        }
        .background(Color(nsColor: .windowBackgroundColor))
    }
}

// MARK: - Scene focus

private struct AppSectionKey: FocusedValueKey {
    typealias Value = AppSection
}

extension FocusedValues {
    var appSection: AppSection? {
        get { self[AppSectionKey.self] }
        set { self[AppSectionKey.self] = newValue }
    }
}