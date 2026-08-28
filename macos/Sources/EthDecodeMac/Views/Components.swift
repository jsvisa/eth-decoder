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

// MARK: - Theme

enum Theme {
    /// Web app accent (#0070f3 light / #3b9eff dark).
    static let accent = Color(nsColor: NSColor(name: nil) { appearance in
        let dark = appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua
        return dark
            ? NSColor(srgbRed: 0x3b / 255, green: 0x9e / 255, blue: 0xff / 255, alpha: 1)
            : NSColor(srgbRed: 0x00 / 255, green: 0x70 / 255, blue: 0xf3 / 255, alpha: 1)
    })
}

// MARK: - Card

struct Card<Trailing: View, Content: View>: View {
    let title: String?
    let subtitle: String?
    var trailing: () -> Trailing
    var content: Content

    init(title: String? = nil, subtitle: String? = nil,
         trailing: @escaping () -> Trailing = { EmptyView() },
         @ViewBuilder content: () -> Content) {
        self.title = title
        self.subtitle = subtitle
        self.trailing = trailing
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Text(title ?? "")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(.primary)
                if let subtitle {
                    Text(subtitle)
                        .font(.subheadline)
                        .foregroundStyle(.tertiary)
                        .lineLimit(1)
                        .truncationMode(.tail)
                }
                Spacer(minLength: 12)
                trailing()
            }
            .opacity((title ?? subtitle) == nil ? 0 : 1)
            content
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(Color(nsColor: .controlBackgroundColor))
                .shadow(color: .black.opacity(0.08), radius: 5, x: 0, y: 2)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .strokeBorder(.separator.opacity(0.4), lineWidth: 0.5)
        )
    }
}

// MARK: - Code block

/// Dark code panel like the web result area — scrollable, selectable, and
/// dark in both color schemes.
struct CodeBlock: View {
    private let content: AttributedString
    private let copyText: String
    var maxHeight: CGFloat = 420

    /// Syntax-highlighted JSON value.
    init(json value: JSONValue?, maxHeight: CGFloat = 420) {
        let pretty = value?.prettyJSON ?? "null"
        content = JSONSyntax.attributed(pretty)
        copyText = pretty
        self.maxHeight = maxHeight
    }

    /// Preformatted text (already highlighted or intentionally plain).
    init(text: AttributedString, plainCopy: String, maxHeight: CGFloat = 420) {
        content = text
        copyText = plainCopy
        self.maxHeight = maxHeight
    }

    var body: some View {
        ScrollView([.horizontal, .vertical]) {
            Text(content)
                .font(.system(size: 11.5, weight: .regular, design: .monospaced))
                .textSelection(.enabled)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(12)
        }
        .frame(maxHeight: maxHeight)
        .background(CodeColors.panel)
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .overlay(alignment: .topTrailing) {
            CopyButton(text: copyText)
                .padding(6)
        }
    }
}

// MARK: - Monospaced helpers

struct MonoText: View {
    let text: String
    var size: CGFloat = 12
    var color: Color = .primary

    var body: some View {
        Text(text)
            .font(.system(size: size, weight: .regular, design: .monospaced))
            .foregroundStyle(color)
            .textSelection(.enabled)
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
            .padding(8)
            .background(Color(nsColor: .textBackgroundColor))
            .clipShape(RoundedRectangle(cornerRadius: 6))
            .overlay(RoundedRectangle(cornerRadius: 6).stroke(.separator.opacity(0.7)))
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
                Image(systemName: icon).font(.system(size: 8.5, weight: .bold))
            }
            Text(text)
                .font(.system(size: 10, weight: .semibold, design: .monospaced))
                .lineLimit(1)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 3)
        .background(color.opacity(0.14))
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
                .foregroundStyle(copied ? .green : .secondary)
                .frame(width: 22, height: 22)
                .background(Color.white.opacity(0.06))
                .clipShape(RoundedRectangle(cornerRadius: 5))
        }
        .buttonStyle(.plain)
        .help("Copy")
        .animation(.easeOut(duration: 0.15), value: copied)
    }
}

// MARK: - Error state

struct ErrorView: View {
    let message: String
    var dismiss: (() -> Void)?

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "exclamationmark.octagon.fill")
                .foregroundStyle(.red)
                .font(.callout)
            Text(message)
                .font(.callout)
                .foregroundStyle(.primary)
                .textSelection(.enabled)
                .fixedSize(horizontal: false, vertical: true)
            Spacer()
            if let dismiss {
                Button { dismiss() } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.callout)
                        .foregroundStyle(.tertiary)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(12)
        .background(Color.red.opacity(0.09))
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(Color.red.opacity(0.25)))
    }
}

// MARK: - Empty state

struct EmptyState: View {
    let icon: String
    let title: String
    let message: String

    var body: some View {
        ContentUnavailableView {
            Label(title, systemImage: icon)
        } description: {
            Text(message)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
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
                    .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 12))
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
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            Text(key)
                .font(.caption)
                .fontWeight(.medium)
                .foregroundStyle(.secondary)
                .frame(width: 120, alignment: .trailing)
            MonoText(text: value, size: 12, color: .primary.opacity(0.85))
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

struct KVTable: View {
    let rows: [(String, String)]

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            ForEach(rows, id: \.0) { key, value in
                KVRow(key: key, value: value)
            }
        }
    }
}

// MARK: - Decoded args/outputs table

struct DecodedTable: View {
    struct Row: Identifiable {
        let id = UUID()
        let name: String
        let type: String
        let value: String
    }

    let rows: [Row]

    init(args: [String: JSONValue]? = nil, outputs: [DecodedOutput]? = nil) {        var result: [Row] = []
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

    init(rows: [Row]) {
        self.rows = rows
    }

    var body: some View {
        if rows.isEmpty {
            Text("—").foregroundStyle(.tertiary).font(.caption)
        } else {
            VStack(alignment: .leading, spacing: 6) {
                ForEach(rows) { row in
                    HStack(alignment: .firstTextBaseline, spacing: 10) {
                        Text(row.name)
                            .font(.caption.monospaced().weight(.semibold))
                            .frame(width: 110, alignment: .trailing)
                        if !row.type.isEmpty {
                            Text(row.type)
                                .font(.caption2.monospaced())
                                .foregroundStyle(.teal.opacity(0.85))
                                .frame(width: 76, alignment: .leading)
                        }
                        MonoText(text: row.value, size: 12, color: .primary.opacity(0.85))
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
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
                .tracking(0.6)
            if let count {
                Text("\(count)")
                    .font(.caption2.monospaced().weight(.semibold))
                    .foregroundStyle(.white.opacity(0.75))
                    .padding(.horizontal, 6)
                    .padding(.vertical, 1)
                    .background(Capsule().fill(Color.secondary.opacity(0.35)))
            }
            Spacer()
        }
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
        .controlSize(.small)
    }
}

// MARK: - Collapsible raw JSON

struct CollapsibleJSON: View {
    let title: String
    let json: JSONValue?

    var body: some View {
        DisclosureGroup {
            CodeBlock(json: json)
        } label: {
            HStack(spacing: 6) {
                Image(systemName: "curlybraces.square")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
                Text(title).font(.caption).foregroundStyle(.secondary)
            }
        }
    }
}

// MARK: - Timestamp formatting

enum TimeStamp {
    static func short(_ iso: String) -> String {
        let parser = ISO8601DateFormatter()
        parser.formatOptions = [.withInternetDateTime]
        if let date = parser.date(from: iso) {
            return date.formatted(date: .omitted, time: .shortened)
        }
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = fractional.date(from: iso) {
            return date.formatted(date: .omitted, time: .shortened)
        }
        return ""
    }
}

// MARK: - Conveniences shared by multiple views

extension String {
    var truncatedHex: String {
        count > 80 ? "\(prefix(40))…\(suffix(36))" : self
    }
}

extension JSONValue {
    var boolValue: Bool {
        if case .bool(let b) = self { return b }
        return false
    }
}
