import EthDecodeCore
import SwiftUI

// Interactive JSON explorer used inside result cards: recursive expand/collapse
// nodes with type-aware coloring and per-node copy. Complements CodeBlock,
// which stays the tool of choice for raw payloads.

struct JSONTree: View {
    let value: JSONValue
    var startExpanded = true

    var body: some View {
        JSONNode(key: nil, value: value, depth: 0, forceExpanded: startExpanded)
    }
}

private struct JSONNode: View {
    let key: String?
    let value: JSONValue
    let depth: Int

    @State private var expanded: Bool

    init(key: String?, value: JSONValue, depth: Int, forceExpanded: Bool? = nil) {
        self.key = key
        self.value = value
        self.depth = depth
        _expanded = State(initialValue: forceExpanded ?? (depth < 2))
    }

    var body: some View {
        switch value {
        case .object(let o):
            ContainerNode(
                key: key, count: o.count, kind: "{}", expanded: $expanded,
                label: KeyLabel(key: key),
                collapsedPreview: collapsedPreview,
                children: {
                    ForEach(o.keys.sorted(), id: \.self) { k in
                        JSONNode(key: k, value: o[k] ?? .null, depth: depth + 1)
                    }
                }
            )
        case .array(let a):
            ContainerNode(
                key: key, count: a.count, kind: "[]", expanded: $expanded,
                label: KeyLabel(key: key),
                collapsedPreview: collapsedPreview,
                children: {
                    ForEach(Array(a.enumerated()), id: \.offset) { i, v in
                        JSONNode(key: "\(i)", value: v, depth: depth + 1)
                    }
                }
            )
        default:
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                KeyLabel(key: key)
                ScalarValue(value: value)
                Spacer(minLength: 0)
            }
            .padding(.vertical, 1)
        }
    }

    /// Short inline summary shown while the container is collapsed.
    private func collapsedPreview() -> String {
        switch value {
        case .array(let a):
            return a.prefix(3).map(\.display).joined(separator: ", ") + (a.count > 3 ? ", …" : "")
        case .object:
            return ""
        default:
            return value.display
        }
    }
}

// MARK: - Key text

private struct KeyLabel: View {
    let key: String?

    var body: some View {
        if let key {
            Text(key)
                .font(.system(size: 11.5, weight: .semibold, design: .monospaced))
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
    }
}

// MARK: - Container node with chevron + children

private struct ContainerNode<Children: View>: View {
    let key: String?
    let count: Int
    let kind: String // "{}" or "[]"
    @Binding var expanded: Bool
    let label: KeyLabel
    let collapsedPreview: () -> String
    @ViewBuilder var children: () -> Children

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 6) {
                Image(systemName: "chevron.right")
                    .font(.system(size: 8.5, weight: .bold))
                    .foregroundStyle(.tertiary)
                    .rotationEffect(.degrees(expanded ? 90 : 0))
                label
                Text(kind == "[]" ? "[\(count)]" : "{\(count)}")
                    .font(.caption2.monospaced())
                    .foregroundStyle(.quaternary)
                if !expanded && !collapsedPreview().isEmpty {
                    Text(collapsedPreview())
                        .font(.system(size: 11, design: .monospaced))
                        .foregroundStyle(.tertiary)
                        .lineLimit(1)
                        .truncationMode(.tail)
                }
                Spacer(minLength: 0)
            }
            .contentShape(Rectangle())
            .onTapGesture {
                withAnimation(.easeOut(duration: 0.15)) { expanded.toggle() }
            }

            if expanded {
                VStack(alignment: .leading, spacing: 2) {
                    children()
                }
                .padding(.leading, 14)
                .overlay(alignment: .leading) {
                    Rectangle()
                        .fill(Color.primary.opacity(0.08))
                        .frame(width: 1)
                        .padding(.leading, 4)
                        .padding(.vertical, 2)
                }
            }
        }
        .padding(.vertical, 1)
    }
}

// MARK: - Colored scalar rendering (adaptive to light/dark surface)

private struct ScalarValue: View {
    let value: JSONValue

    var body: some View {
        Text(display)
            .font(.system(size: 11.5, weight: .regular, design: .monospaced))
            .foregroundStyle(color)
            .textSelection(.enabled)
            .fixedSize(horizontal: false, vertical: true)
    }

    private var color: Color {
        switch value {
        case .string: return .orange
        case .bool: return .blue
        case .number: return .green
        case .null: return Color(nsColor: .tertiaryLabelColor)
        default: return .primary
        }
    }

    private var display: String {
        switch value {
        case .null: return "null"
        case .string(let s):
            let oneLine = s.replacingOccurrences(of: "\n", with: " ⏎ ")
            return "\"\(oneLine.truncate(max: 160))\""
        default:
            return value.display
        }
    }
}

private extension String {
    func truncate(max: Int) -> String {
        count > max ? "\(prefix(max))…" : self
    }
}
