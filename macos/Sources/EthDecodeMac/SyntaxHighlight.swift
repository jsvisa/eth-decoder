import EthDecodeCore
import SwiftUI

// JSON syntax highlighting with the web app's code-panel palette
// (VSCode-style colors on a dark background that stays dark in both modes).

enum CodeColors {
    static let panel = Color(red: 0x1e / 255, green: 0x1e / 255, blue: 0x1e / 255)
    static let text = Color(red: 0xd4 / 255, green: 0xd4 / 255, blue: 0xd4 / 255)
    static let key = Color(red: 0x9c / 255, green: 0xdc / 255, blue: 0xfe / 255)
    static let string = Color(red: 0xce / 255, green: 0x91 / 255, blue: 0x78 / 255)
    static let number = Color(red: 0xb5 / 255, green: 0xce / 255, blue: 0xa8 / 255)
    static let boolean = Color(red: 0x56 / 255, green: 0x9c / 255, blue: 0xd6 / 255)
    static let null = Color(red: 0x80 / 255, green: 0x80 / 255, blue: 0x80 / 255)
    /// Darkened string tone for arg values on light surfaces.
    static let argValue = Color(red: 0x8a / 255, green: 0x63 / 255, blue: 0x51 / 255)
}

enum JSONSyntax {
    static func attributed(_ source: String) -> AttributedString {
        var out = AttributedString()
        out.foregroundColor = CodeColors.text

        func push(_ text: String, color: Color?) {
            guard !text.isEmpty else { return }
            var run = AttributedString(text)
            if let color { run.foregroundColor = color }
            out.append(run)
        }

        var i = source.startIndex
        while i < source.endIndex {
            let c = source[i]

            if c == "\"" {
                let end = stringEnd(source, from: i)
                let isKey = firstNonSpace(after: end, in: source) == ":"
                push(String(source[i..<end]), color: isKey ? CodeColors.key : CodeColors.string)
                i = end
                continue
            }

            let isMinusNumber = c == "-"
                && nextChar(after: i, in: source).map(\.isNumber) == true
            if c.isNumber || isMinusNumber {
                let end = numberEnd(source, from: i)
                push(String(source[i..<end]), color: CodeColors.number)
                i = end
                continue
            }

            if hasWord("true", at: i, in: source) || hasWord("false", at: i, in: source) {
                let word = c == "t" ? "true" : "false"
                let end = source.index(i, offsetBy: word.count, limitedBy: source.endIndex) ?? source.endIndex
                push(String(source[i..<end]), color: CodeColors.boolean)
                i = end
                continue
            }

            if hasWord("null", at: i, in: source) {
                let end = source.index(i, offsetBy: 4, limitedBy: source.endIndex) ?? source.endIndex
                push(String(source[i..<end]), color: CodeColors.null)
                i = end
                continue
            }

            push(String(c), color: nil)
            i = source.index(after: i)
        }
        return out
    }

    private static func stringEnd(_ s: String, from start: String.Index) -> String.Index {
        var i = s.index(after: start)
        while i < s.endIndex {
            if s[i] == "\\" {
                i = s.index(i, offsetBy: 2, limitedBy: s.endIndex) ?? s.endIndex
            } else if s[i] == "\"" {
                return s.index(after: i)
            } else {
                i = s.index(after: i)
            }
        }
        return s.endIndex
    }

    private static func numberEnd(_ s: String, from start: String.Index) -> String.Index {
        var i = start
        while i < s.endIndex, "-+.eE".contains(s[i]) || s[i].isNumber {
            i = s.index(after: i)
        }
        return i
    }

    private static func nextChar(after idx: String.Index, in s: String) -> Character? {
        let next = s.index(after: idx)
        return next < s.endIndex ? s[next] : nil
    }

    private static func firstNonSpace(after idx: String.Index, in s: String) -> Character? {
        var i = idx
        while i < s.endIndex {
            if !s[i].isWhitespace { return s[i] }
            i = s.index(after: i)
        }
        return nil
    }

    private static func hasWord(_ word: String, at idx: String.Index, in s: String) -> Bool {
        guard s[idx] == word.first,
              let end = s.index(idx, offsetBy: word.count, limitedBy: s.endIndex)
        else { return false }
        return s[idx..<end] == word
    }
}

// MARK: - Minimal YAML writer (JSONValue → block-style YAML)

enum YamlFormat {
    static func dump(_ value: JSONValue) -> String {
        switch value {
        case .array(let a):
            return a.map { renderListItem($0, indent: 0) }.joined()
                + "\n"
        case .object(let o):
            return renderObject(o, indent: 0)
        default:
            return scalar(value) + "\n"
        }
    }

    private static func renderObject(_ o: [String: JSONValue], indent: Int) -> String {
        let pad = String(repeating: " ", count: indent)
        guard !o.isEmpty else { return pad + "{}\n" }
        return o.keys.sorted().map { key in
            "\(pad)\(key): \(inlineOrBlock(o[key]!, indent: indent))"
        }.joined(separator: "\n") + "\n"
    }

    /// Item after a "- " dash: nested containers are indented two extra spaces.
    private static func renderListItem(_ v: JSONValue, indent: Int) -> String {
        let pad = String(repeating: " ", count: indent)
        switch v {
        case .object(let o):
            guard !o.isEmpty else { return pad + "- {}\n" }
            let keys = o.keys.sorted()
            let first = keys[0]
            var lines = ["\(pad)- \(first): \(inlineOrBlock(o[first]!, indent: indent))"]
            for k in keys.dropFirst() {
                lines.append("\(pad)  \(k): \(inlineOrBlock(o[k]!, indent: indent + 2))")
            }
            // inlineOrBlock already ended each line; reassemble without dup newlines
            return lines.map { line -> String in
                line.hasSuffix("\n") ? String(line.dropLast()) : line
            }.joined(separator: "\n") + "\n"
        case .array(let a):
            guard !a.isEmpty else { return pad + "- []\n" }
            let body = a.map { renderListItem($0, indent: indent + 2) }.joined()
            return "\(pad)- \n" + body
        default:
            return pad + "- " + scalar(v) + "\n"
        }
    }

    /// Inline scalars stay on the key's line; containers open a block below it.
    private static func inlineOrBlock(_ v: JSONValue, indent: Int) -> String {
        switch v {
        case .object(let o):
            guard !o.isEmpty else { return "{}" }
            return "\n" + renderObject(o, indent: indent + 2).trimmingCharacters(in: .newlines)
        case .array(let a):
            guard !a.isEmpty else { return "[]" }
            return "\n" + a.map { renderListItem($0, indent: indent + 2) }
                .joined()
                .trimmingCharacters(in: .newlines)
        default:
            return scalar(v)
        }
    }

    private static func scalar(_ v: JSONValue) -> String {
        switch v {
        case .null: return "null"
        case .bool(let b): return b ? "true" : "false"
        case .number(.int(let i)): return String(i)
        case .number(.text(let t)): return t
        case .string(let s): return quotedIfNeeded(s)
        default: return ""
        }
    }

    private static func quotedIfNeeded(_ s: String) -> String {
        let specials = "!&*[{}],>|@`\"'%-?"
        let needsQuotes =
            s.isEmpty
            || s != s.trimmingCharacters(in: .whitespaces)
            || s.contains("\n")
            || s.contains(": ")
            || s.hasSuffix(":")
            || s.hasPrefix("#")
            || s.first.map(specials.contains) == true
        guard needsQuotes else { return s }
        let escaped = s
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "\"", with: "\\\"")
            .replacingOccurrences(of: "\n", with: "\\n")
        return "\"\(escaped)\""
    }
}
