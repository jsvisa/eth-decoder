import EthDecodeCore
import SwiftUI

struct SimulationResultView: View {
    let result: SimulateResponse
    let rawJSON: JSONValue?

    var body: some View {
        Card(title: "Simulation", subtitle: result.isFailure ? "reverted" : "success") {
            VStack(alignment: .leading, spacing: 14) {
                statusHeader
                if let error = result.error, result.isFailure {
                    ErrorView(message: error)
                }
                if let results = result.results {
                    sessionBody(results)
                } else {
                    singleBody
                }
            }
        }
    }

    // MARK: - Status

    private var statusHeader: some View {
        HStack(spacing: 10) {
            Image(systemName: result.isFailure ? "xmark.octagon.fill" : "checkmark.seal.fill")
                .foregroundStyle(result.isFailure ? Color.red : Color.green)
                .font(.title3)
            Text(result.isFailure ? "Transaction reverted" : "Simulation succeeded")
                .font(.headline)
            Spacer()
            metricsRow
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 10)
                .fill((result.isFailure ? Color.red : Color.green).opacity(0.08))
        )
    }

    @ViewBuilder
    private var metricsRow: some View {
        HStack(spacing: 6) {
            if let gas = result.gasUsed {
                Badge(text: "gas \(gas.display)", color: .blue)
            }
            if let block = result.blockNumber {
                Badge(text: "block \(block)", color: .gray)
            }
            if let id = result.simulationId {
                Badge(text: "\(id.prefix(10))…", color: .orange, icon: "link")
                    .help("Web link: ?simulationId=\(id)")
                CopyButton(text: shareURL(id)).help("Copy web link for this result")
            }
        }
    }

    private func shareURL(_ id: String?) -> String {
        let base = UserDefaults.standard.string(forKey: "apiBaseURL") ?? ""
        return "\(base)/contract-caller?simulationId=\(id ?? "")"
    }

    // MARK: - Single call

    private var singleBody: some View {
        VStack(alignment: .leading, spacing: 14) {
            if let decoded = result.decoded, !decoded.isEmpty {
                section("Decoded Return") { DecodedTable(outputs: decoded) }
            }

            if let logs = result.logs, !logs.isEmpty {
                section("Event Logs", count: logs.count) {
                    VStack(alignment: .leading, spacing: 6) {
                        ForEach(Array(logs.enumerated()), id: \.offset) { _, log in
                            logRow(log)
                        }
                    }
                }
            }

            if let changes = result.balanceChanges, !changes.isEmpty {
                section("Balance Changes", count: changes.count) {
                    balanceTable(changes)
                }
            }

            if let trace = result.callTrace {
                section("Call Trace") { CallFrameCard(frame: trace) }
            }

            if let state = result.stateChanges, !state.isEmpty {
                section("State Changes") {
                    CodeBlock(json: .object(state), maxHeight: 220)
                }
            }

            CollapsibleJSON(title: "Raw response", json: rawJSON)
        }
    }

    // MARK: - Session (multi-call)

    private func sessionBody(_ calls: [SimulateResponse]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(Array(calls.enumerated()), id: \.offset) { index, call in
                VStack(alignment: .leading, spacing: 10) {
                    HStack(spacing: 8) {
                        Image(systemName: call.isFailure ? "xmark.circle.fill" : "checkmark.circle.fill")
                            .foregroundStyle(call.isFailure ? Color.red : Color.green)
                        Text("Call \(index + 1)").font(.callout.weight(.semibold))
                        if let gas = call.gasUsed { Badge(text: "gas \(gas.display)", color: .blue) }
                        if let error = call.error {
                            Text(error).font(.caption).foregroundStyle(.red).lineLimit(2)
                        }
                        Spacer()
                    }
                    if let decoded = call.decoded, !decoded.isEmpty {
                        DecodedTable(outputs: decoded)
                    }
                    if let logs = call.logs, !logs.isEmpty {
                        VStack(alignment: .leading, spacing: 4) {
                            ForEach(Array(logs.enumerated()), id: \.offset) { _, log in
                                logRow(log)
                            }
                        }
                    }
                    if let changes = call.balanceChanges, !changes.isEmpty {
                        balanceTable(changes)
                    }
                    if let trace = call.callTrace {
                        CallFrameCard(frame: trace)
                    }
                }
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color(nsColor: .textBackgroundColor).opacity(0.6))
                .clipShape(RoundedRectangle(cornerRadius: 10))
                .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(.separator.opacity(0.3)))
            }
        }
    }

    // MARK: - Building blocks

    private func section<Content: View>(
        _ title: String,
        count: Int? = nil,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            SectionHeader(title: title, count: count)
            content()
        }
    }

    private func logRow(_ log: SimLog) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                Badge(text: log.name ?? "Log", color: .purple, icon: "list.bullet.rectangle")
                Spacer()
                if let addr = log.address {
                    MonoText(text: addr.truncatedHexShort, size: 9.5, color: .secondary)
                }
            }
            if let inputs = log.inputs, !inputs.isEmpty {
                DecodedTable(outputs: inputs)
                    .padding(.leading, 6)
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 7)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(nsColor: .textBackgroundColor).opacity(0.55))
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(.separator.opacity(0.25)))
    }

    private func balanceTable(_ changes: [BalanceChange]) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 12) {
                Text("Token").frame(width: 90, alignment: .leading)
                Text("Δ Amount").frame(width: 130, alignment: .trailing)
                Text("USD").frame(width: 90, alignment: .trailing)
                Text("Holder").frame(maxWidth: .infinity, alignment: .leading)
            }
            .font(.caption2.weight(.semibold))
            .foregroundStyle(.tertiary)
            .padding(.horizontal, 12)
            .padding(.vertical, 5)

            ForEach(Array(changes.enumerated()), id: \.offset) { i, change in
                Divider().opacity(0.35)
                HStack(spacing: 12) {
                    MonoText(
                        text: change.symbol ?? change.name
                            ?? change.tokenAddress.map { String($0.prefix(10)) } ?? "?",
                        size: 11)
                    .frame(width: 90, alignment: .leading)
                    MonoText(text: change.amount ?? "", size: 11)
                        .frame(width: 130, alignment: .trailing)
                    MonoText(text: change.valueUsd.map(usdString) ?? "", size: 11)
                        .frame(width: 90, alignment: .trailing)
                    MonoText(text: (change.address ?? "").truncatedHexShort, size: 9.5, color: .secondary)
                        .lineLimit(1)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(i % 2 == 1 ? Color.primary.opacity(0.02) : Color.clear)
            }
        }
        .background(Color(nsColor: .textBackgroundColor).opacity(0.6))
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(.separator.opacity(0.3)))
    }

    private func usdString(_ v: JSONValue) -> String {
        switch v {
        case .string(let s):
            if let d = Double(s) { return d.formatted(.number.precision(.fractionLength(2))) }
            return s
        case .number(let n):
            let raw: String
            switch n {
            case .int(let i): raw = String(i)
            case .text(let t): raw = t
            }
            if let d = Double(raw) {
                return d.formatted(.number.precision(.fractionLength(2)))
            }
            return raw
        default:
            return ""
        }
    }
}

// MARK: - Call trace tree

struct CallFrameCard: View {
    let frame: CallFrame
    private let depth: Int
    @State private var expanded: Bool

    init(frame: CallFrame, depth: Int = 0) {
        self.frame = frame
        self.depth = depth
        _expanded = State(initialValue: depth < 2)
    }

    var body: some View {
        DisclosureGroup(isExpanded: $expanded) {
            VStack(alignment: .leading, spacing: 8) {
                if let inputs = frame.decodedInputs, !inputs.isEmpty {
                    SectionHeader(title: "Inputs")
                    DecodedTable(outputs: inputs)
                }
                if let outputs = frame.decodedOutputs, !outputs.isEmpty {
                    SectionHeader(title: "Outputs")
                    DecodedTable(outputs: outputs)
                }
                if let logs = frame.logs, !logs.isEmpty {
                    SectionHeader(title: "Logs", count: logs.count)
                    HStack(spacing: 4) {
                        ForEach(Array(logs.prefix(8).enumerated()), id: \.offset) { _, log in
                            Badge(text: log.name ?? "log", color: .purple)
                        }
                        if logs.count > 8 {
                            Text("+\(logs.count - 8)")
                                .font(.caption2)
                                .foregroundStyle(.quaternary)
                        }
                    }
                }
                if let calls = frame.calls, !calls.isEmpty {
                    SectionHeader(title: "Sub-calls", count: calls.count)
                    VStack(alignment: .leading, spacing: 4) {
                        ForEach(Array(calls.enumerated()), id: \.offset) { _, child in
                            CallFrameCard(frame: child, depth: depth + 1)
                                .padding(.leading, CGFloat(10 * min(depth + 1, 5)))
                        }
                    }
                }
            }
            .padding(.top, 4)
        } label: {
            HStack(spacing: 6) {
                Image(systemName: "arrow.triangle.branch")
                    .font(.caption)
                    .foregroundStyle(.teal)
                MonoText(text: frame.functionName ?? "call", size: 11.5, color: Theme.accent)
                if let to = frame.to {
                    MonoText(text: to.truncatedHexShort, size: 9.5, color: .secondary)
                }
            }
        }
    }
}
