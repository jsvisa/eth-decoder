import EthDecodeCore
import SwiftUI

struct SimulationResultView: View {
    let result: SimulateResponse
    let rawJSON: JSONValue?

    var body: some View {
        Card(title: "Simulation Result") {
            VStack(alignment: .leading, spacing: 16) {
                statusHeader
                if let error = result.error, result.isFailure { ErrorView(message: error) }
                if let results = result.results { sessionBody(results) } else { singleBody }
            }
        }
    }

    // MARK: - Status

    private var statusHeader: some View {
        HStack(spacing: 8) {
            Image(systemName: result.isFailure ? "xmark.octagon.fill" : "checkmark.seal.fill")
                .font(.title3).foregroundStyle(result.isFailure ? .red : .green)
            Badge(text: result.isFailure ? "Reverted" : "Success", color: result.isFailure ? .red : .green, icon: result.isFailure ? "exclamationmark" : "checkmark")
            if result.simulated == true { Badge(text: "Simulated", color: .teal, icon: "bolt.fill") }
            if result.session == true { Badge(text: "Session", color: .indigo, icon: "square.stack.3d.down.right") }
            Spacer()
            if let block = result.blockNumber { Badge(text: "Block \(block)", color: .gray) }
        }
    }

    // MARK: - Single result

    private var singleBody: some View {
        VStack(alignment: .leading, spacing: 12) {
            metricsRow

            if let decoded = result.decoded, !decoded.isEmpty {
                SectionHeader(title: "Decoded Return")
                DecodedTable(outputs: decoded)
            }

            if let logs = result.logs, !logs.isEmpty {
                SectionHeader(title: "Event Logs", count: logs.count)
                ForEach(Array(logs.enumerated()), id: \.offset) { _, log in logRow(log) }
            }

            if let changes = result.balanceChanges, !changes.isEmpty {
                SectionHeader(title: "Balance Changes", count: changes.count)
                balanceTable(changes)
            }

            if let trace = result.callTrace {
                SectionHeader(title: "Call Trace")
                CallFrameCard(frame: trace)
            }

            if let state = result.stateChanges, !state.isEmpty {
                SectionHeader(title: "State Changes")
                MonoText(text: JSONValue.object(state).prettyJSON, size: 10, color: .secondary)
            }

            if let extra = nonEmptyExtra {
                SectionHeader(title: "Other Fields")
                KVTable(rows: extra.keys.sorted().map { ($0, extra[$0]!.display) })
            }

            JSONView(title: "Raw Response", json: rawJSON)
        }
    }

    private var nonEmptyExtra: [String: JSONValue]? {
        let filtered = result.extra.filter { k, _ in !k.hasPrefix("_") || k == "_tokenMeta" }
        return filtered.isEmpty ? nil : filtered
    }

    private var metricsRow: some View {
        HStack(spacing: 6) {
            if let gas = result.gasUsed { Badge(text: "Gas \(gas.display)", color: .blue) }
            if let raw = result.rawData, !raw.isEmpty, raw != "0x" {
                HStack(spacing: 4) {
                    Badge(text: raw.truncatedHex, color: .gray)
                    CopyButton(text: raw)
                }
            }
            if let id = result.simulationId { Badge(text: id, color: .orange, icon: "link") }
        }
    }

    // MARK: - Log

    private func logRow(_ log: SimLog) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Badge(text: log.name ?? "Log", color: .purple, icon: "list.bullet.rectangle")
                if let addr = log.address { MonoText(text: addr, size: 10, color: .secondary) }
            }
            if let inputs = log.inputs, !inputs.isEmpty { DecodedTable(outputs: inputs).padding(.leading, 8) }
            if !log.extra.isEmpty { KVTable(rows: log.extra.keys.sorted().map { ($0, log.extra[$0]!.display) }).padding(.leading, 8) }
        }
        .padding(10)
        .background(Color(nsColor: .controlBackgroundColor))
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    // MARK: - Balance changes

    private func balanceTable(_ changes: [BalanceChange]) -> some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                Text("Token").font(.caption2).foregroundStyle(.tertiary).frame(width: 80, alignment: .leading)
                Text("Amount").font(.caption2).foregroundStyle(.tertiary).frame(width: 100, alignment: .trailing)
                Text("USD").font(.caption2).foregroundStyle(.tertiary).frame(width: 80, alignment: .trailing)
                Text("Holder").font(.caption2).foregroundStyle(.tertiary)
            }
            .padding(.horizontal, 8).padding(.vertical, 4)
            Divider()
            ForEach(changes, id: \.tokenAddress) { change in
                HStack(spacing: 12) {
                    MonoText(text: change.symbol ?? change.name ?? change.tokenAddress ?? "?", size: 11)
                        .frame(width: 80, alignment: .leading)
                    MonoText(text: change.amount ?? "", size: 11)
                        .frame(width: 100, alignment: .trailing)
                    MonoText(text: change.valueUsd?.display ?? "", size: 11)
                        .frame(width: 80, alignment: .trailing)
                    MonoText(text: (change.address ?? "").truncatedHex, size: 10, color: .secondary)
                }
                .padding(.horizontal, 8).padding(.vertical, 4)
                Divider().opacity(0.3)
            }
        }
        .background(Color(nsColor: .controlBackgroundColor))
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(.separator.opacity(0.5)))
    }

    // MARK: - Session

    private func sessionBody(_ results: [SimulateResponse]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 6) {
                if let block = result.blockNumber { Badge(text: "Block \(block)", color: .gray) }
                if let id = result.simulationId { Badge(text: id, color: .orange, icon: "link") }
            }
            ForEach(Array(results.enumerated()), id: \.offset) { index, call in
                VStack(alignment: .leading, spacing: 8) {
                    HStack(spacing: 6) {
                        Badge(text: "Call \(index + 1)", color: .indigo, icon: "play.fill")
                        Image(systemName: call.isFailure ? "xmark.circle.fill" : "checkmark.circle.fill")
                            .foregroundStyle(call.isFailure ? .red : .green)
                        if let gas = call.gasUsed { Badge(text: "Gas \(gas.display)", color: .blue) }
                        if let error = call.error { Text(error).font(.caption).foregroundStyle(.red) }
                        Spacer()
                    }
                    if let decoded = call.decoded, !decoded.isEmpty { DecodedTable(outputs: decoded) }
                    if let logs = call.logs, !logs.isEmpty { ForEach(Array(logs.enumerated()), id: \.offset) { _, log in logRow(log) } }
                    if let changes = call.balanceChanges, !changes.isEmpty { balanceTable(changes) }
                    if let trace = call.callTrace { CallFrameCard(frame: trace) }
                }
                .padding(12)
                .background(Color(nsColor: .controlBackgroundColor))
                .clipShape(RoundedRectangle(cornerRadius: 10))
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(.separator.opacity(0.5)))
            }
        }
    }
}

// MARK: - Call Trace

struct CallFrameCard: View {
    let frame: CallFrame
    @State private var expanded = true

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
                    ForEach(Array(logs.enumerated()), id: \.offset) { _, log in
                        Badge(text: log.name ?? "log", color: .purple)
                    }
                }
                if let calls = frame.calls, !calls.isEmpty {
                    SectionHeader(title: "Sub-calls", count: calls.count)
                    ForEach(Array(calls.enumerated()), id: \.offset) { _, child in
                        CallFrameCard(frame: child)
                            .padding(.leading, 8)
                    }
                }
                if !frame.extra.isEmpty {
                    KVTable(rows: frame.extra.keys.sorted().map { ($0, frame.extra[$0]!.display) })
                }
            }
        } label: {
            HStack(spacing: 6) {
                Image(systemName: "arrow.triangle.branch").font(.caption).foregroundStyle(.teal)
                MonoText(text: frame.functionName ?? "call", size: 12)
                if let to = frame.to { MonoText(text: to, size: 10, color: .secondary) }
            }
        }
        .padding(8)
        .background(Color(nsColor: .controlBackgroundColor))
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }
}