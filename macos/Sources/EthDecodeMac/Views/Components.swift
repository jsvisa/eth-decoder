import EthDecodeCore
import SwiftUI

@MainActor
final class AppSettings: ObservableObject {
    @Published var baseURL: String {
        didSet { UserDefaults.standard.set(baseURL, forKey: "apiBaseURL") }
    }
    @Published var etherscanApiKey: String {
        didSet { UserDefaults.standard.set(etherscanApiKey, forKey: "etherscanApiKey") }
    }

    init() {
        baseURL = UserDefaults.standard.string(forKey: "apiBaseURL") ?? "https://eth-decoder.vercel.app"
        etherscanApiKey = UserDefaults.standard.string(forKey: "etherscanApiKey") ?? ""
    }

    var client: APIClient {
        APIClient(baseURL: baseURL, etherscanApiKey: etherscanApiKey.trimmingCharacters(in: .whitespaces).isEmpty ? nil : etherscanApiKey.trimmingCharacters(in: .whitespaces))
    }
}

// MARK: - Card

struct Card<Content: View>: View {
    let title: String?
    let subtitle: String?
    @ViewBuilder let content: Content

    init(title: String? = nil, subtitle: String? = nil, @ViewBuilder content: () -> Content) {
        self.title = title
        self.subtitle = subtitle
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let title {
                HStack {
                    Text(title).font(.headline).foregroundStyle(.primary)
                    if let subtitle {
                        Text(subtitle).font(.caption).foregroundStyle(.tertiary)
                    }
                    Spacer()
                }
            }
            content
        }
        .padding(16)
        .background(Color(nsColor: .controlBackgroundColor))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(.separator, lineWidth: 0.5))
    }
}

// MARK: - Monospaced

struct MonoText: View {
    let text: String
    var size: CGFloat = 12
    var color: Color = .primary

    var body: some View {
        Text(text)
            .font(.system(size: size, weight: .regular, design: .monospaced))
            .foregroundStyle(color)
            .textSelection(.enabled)
            .lineLimit(nil)
    }
}

struct MonoField: View {
    let placeholder: String
    @Binding var text: String
    var font: CGFloat = 13

    var body: some View {
        TextField(placeholder, text: $text)
            .textFieldStyle(.plain)
            .font(.system(size: font, design: .monospaced))
            .padding(10)
            .background(Color(nsColor: .textBackgroundColor))
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(.separator))
    }
}

// MARK: - Badge

struct Badge: View {
    let text: String
    var color: Color = .accentColor
    var icon: String?

    var body: some View {
        HStack(spacing: 4) {
            if let icon {
                Image(systemName: icon).font(.system(size: 9, weight: .semibold))
            }
            Text(text)
                .font(.system(size: 10, weight: .semibold, design: .monospaced))
        }
        .padding(.horizontal, 7)
        .padding(.vertical, 3)
        .background(color.opacity(0.12))
        .foregroundStyle(color)
        .clipShape(Capsule())
    }
}

// MARK: - Copy button

struct CopyButton: View {
    let text: String
    @State private var copied = false

    var body: some View {
        Button {
            NSPasteboard.general.clearContents()
            NSPasteboard.general.setString(text, forType: .string)
            copied = true
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { copied = false }
        } label: {
            Image(systemName: copied ? "checkmark" : "doc.on.doc")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .buttonStyle(.plain)
        .help("Copy")
    }
}

// MARK: - Error state

struct ErrorView: View {
    let message: String
    var dismiss: (() -> Void)?

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(.red)
                .font(.callout)
            Text(message)
                .font(.callout)
                .foregroundStyle(.secondary)
                .textSelection(.enabled)
            Spacer()
            if let dismiss {
                Button { dismiss() } label: {
                    Image(systemName: "xmark").font(.caption).foregroundStyle(.tertiary)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(12)
        .background(.red.opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }
}

// MARK: - Empty state

struct EmptyState: View {
    let icon: String
    let title: String
    let message: String

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 36))
                .foregroundStyle(.quaternary)
            Text(title)
                .font(.headline).foregroundStyle(.secondary)
            Text(message)
                .font(.caption).foregroundStyle(.tertiary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(40)
    }
}

// MARK: - Loading overlay

struct LoadingOverlay: ViewModifier {
    let isLoading: Bool

    func body(content: Content) -> some View {
        content.overlay {
            if isLoading {
                ProgressView()
                    .controlSize(.large)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(.ultraThinMaterial)
            }
        }
    }
}

extension View {
    func loading(_ isLoading: Bool) -> some View {
        modifier(LoadingOverlay(isLoading: isLoading))
    }
}

// MARK: - Key-value table

struct KVRow: View {
    let key: String
    let value: String

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            Text(key)
                .font(.caption)
                .foregroundStyle(.tertiary)
                .frame(width: 100, alignment: .trailing)
            MonoText(text: value, size: 12)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

struct KVTable: View {
    let rows: [(String, String)]

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            ForEach(rows, id: \.0) { key, value in
                KVRow(key: key, value: value)
            }
        }
    }
}

// MARK: - Decoded value table

struct DecodedTable: View {
    struct Row: Identifiable {
        let id = UUID()
        let name: String
        let type: String
        let value: String
    }

    let rows: [Row]

    init(args: [String: JSONValue]? = nil, outputs: [DecodedOutput]? = nil) {
        var result: [Row] = []
        if let args {
            for key in args.keys.sorted() {
                result.append(Row(name: key, type: "", value: args[key]!.display))
            }
        }
        if let outputs {
            for output in outputs {
                result.append(Row(
                    name: output.name ?? "output",
                    type: output.type ?? "",
                    value: output.value?.display ?? ""
                ))
            }
        }
        rows = result
    }

    var body: some View {
        if rows.isEmpty {
            Text("—").foregroundStyle(.tertiary).font(.caption)
        } else {
            VStack(alignment: .leading, spacing: 5) {
                ForEach(rows) { row in
                    HStack(alignment: .top, spacing: 10) {
                        Text(row.name)
                            .font(.caption)
                            .foregroundStyle(.primary)
                            .frame(width: 100, alignment: .trailing)
                        if !row.type.isEmpty {
                            Text(row.type)
                                .font(.caption2)
                                .foregroundStyle(.tertiary)
                                .frame(width: 80, alignment: .leading)
                        }
                        MonoText(text: row.value, size: 12)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
            }
        }
    }
}

// MARK: - Raw JSON

struct JSONView: View {
    let title: String
    let json: JSONValue?
    @State private var expanded = false

    var body: some View {
        DisclosureGroup(isExpanded: $expanded) {
            ScrollView([.vertical, .horizontal]) {
                MonoText(text: json?.prettyJSON ?? "null", size: 11, color: .secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(12)
            }
            .frame(maxHeight: 400)
            .background(Color(nsColor: .textBackgroundColor))
            .clipShape(RoundedRectangle(cornerRadius: 8))
        } label: {
            HStack(spacing: 6) {
                Image(systemName: "curlybraces").font(.caption).foregroundStyle(.tertiary)
                Text(title).font(.caption).foregroundStyle(.secondary)
            }
        }
    }
}

// MARK: - Section header

struct SectionHeader: View {
    let title: String
    var count: Int?

    var body: some View {
        HStack(spacing: 6) {
            Text(title.uppercased())
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(.tertiary)
                .tracking(0.5)
            if let count {
                Text("(\(count))")
                    .font(.caption2)
                    .foregroundStyle(.quaternary)
            }
            Spacer()
        }
        .padding(.top, 4)
    }
}

// MARK: - Toolbar button

struct ToolbarAction: View {
    let title: String
    let icon: String
    let action: () -> Void
    var disabled: Bool = false

    var body: some View {
        Button(action: action) {
            Label(title, systemImage: icon)
                .font(.subheadline)
        }
        .buttonStyle(.borderedProminent)
        .controlSize(.small)
        .disabled(disabled)
    }
}

// MARK: - Segmented control wrapper

struct SegmentedPicker: View {
    let options: [(String, String)]
    @Binding var selection: String

    var body: some View {
        Picker("", selection: $selection) {
            ForEach(options, id: \.0) { option in
                Text(option.1).tag(option.0)
            }
        }
        .pickerStyle(.segmented)
        .labelsHidden()
    }
}