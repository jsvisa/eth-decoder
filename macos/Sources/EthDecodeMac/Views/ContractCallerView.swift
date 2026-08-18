import EthDecodeCore
import SwiftUI

struct ContractCallerView: View {
    @EnvironmentObject private var settings: AppSettings
    @State private var chain: Chain = Chains.all[0]
    @State private var address = ""
    @State private var abi: [ABIItem]?
    @State private var contractName: String?
    @State private var isLoadingAbi = false
    @State private var abiError: String?
    @State private var selectedFunctionID: String?
    @State private var argTexts: [String] = []
    @State private var fromAddress = ""
    @State private var ethValue = "0x0"
    @State private var isRunning = false
    @State private var actionError: String?
    @State private var readResult: CallContractResponse?
    @State private var simulateResult: (SimulateResponse, JSONValue)?

    private var functions: [ABIItem] { (abi ?? []).filter { $0.isFunction } }
    private var selectedFunction: ABIItem? {
        guard let id = selectedFunctionID else { return nil }
        return functions.first { $0.id == id }
    }
    private var validAddress: String { address.trimmingCharacters(in: .whitespaces) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                contractCard
                if let abi { functionCard(abi) }
                if let actionError { ErrorView(message: actionError) { self.actionError = nil } }
                if let readResult { resultCard("Read Result", readResult) }
                if let (sim, raw) = simulateResult { SimulationResultView(result: sim, rawJSON: raw) }
                if abi == nil && actionError == nil && !isLoadingAbi {
                    EmptyState(icon: "phone.badge.checkmark", title: "Contract Caller",
                               message: "Enter a contract address and fetch its ABI to get started.")
                }
            }
            .padding(24)
        }
        .background(Color(nsColor: .windowBackgroundColor))
        .onChange(of: selectedFunctionID) { newID in
            guard let newID, let fn = functions.first(where: { $0.id == newID }) else {
                argTexts = []; return
            }
            argTexts = (fn.inputs ?? []).map { defaultArgValue(for: $0) }
            readResult = nil; simulateResult = nil; actionError = nil
        }
    }

    // MARK: - Contract

    private var contractCard: some View {
        Card(title: "Contract", subtitle: "Select network and enter address") {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 10) {
                    Picker("Network", selection: $chain) {
                        ForEach(Chains.all) { c in
                            Text(c.name).tag(c)
                        }
                    }
                    .frame(width: 150)
                    MonoField(placeholder: "0x…", text: $address, font: 13)
                    Button {
                        Task { await fetchAbi() }
                    } label: {
                        if isLoadingAbi {
                            ProgressView().controlSize(.small)
                        } else {
                            Label("Fetch ABI", systemImage: "doc.text")
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.small)
                    .disabled(isLoadingAbi || validAddress.isEmpty)
                    .keyboardShortcut(.return, modifiers: .command)
                }
                if let contractName {
                    HStack(spacing: 6) {
                        Badge(text: contractName, color: .indigo, icon: "building.2")
                        Badge(text: "\(abi?.count ?? 0) items", color: .gray)
                    }
                }
                if let abiError { Text(abiError).font(.caption).foregroundStyle(.red) }
            }
        }
        .loading(isLoadingAbi)
    }

    // MARK: - Function

    private func functionCard(_ loaded: [ABIItem]) -> some View {
        Card(title: "Function", subtitle: "Select a function and fill arguments") {
            VStack(alignment: .leading, spacing: 12) {
                Picker("Function", selection: $selectedFunctionID) {
                    Text("Select a function").tag(nil as String?)
                    Divider()
                    ForEach(functions) { fn in
                        HStack(spacing: 6) {
                            Badge(text: fn.isConstant ? "R" : "W", color: fn.isConstant ? .blue : .orange)
                            Text(fn.canonicalSignature).tag(fn.id as String?)
                        }
                    }
                }
                .pickerStyle(.menu)
                .labelsHidden()

                if let fn = selectedFunction, let inputs = fn.inputs, !inputs.isEmpty {
                    VStack(alignment: .leading, spacing: 10) {
                        SectionHeader(title: "Arguments")
                        ForEach(Array(inputs.enumerated()), id: \.offset) { index, input in
                            VStack(alignment: .leading, spacing: 4) {
                                HStack(spacing: 4) {
                                    Text(input.name ?? "arg\(index)").font(.caption).foregroundStyle(.primary)
                                    Text(input.type).font(.caption2).foregroundStyle(.tertiary)
                                }
                                MonoField(placeholder: defaultPlaceholder(for: input), text: bindingForArg(at: index), font: 12)
                            }
                        }
                    }
                }

                if selectedFunction != nil {
                    HStack(spacing: 10) {
                        MonoField(placeholder: "From address (0x…)", text: $fromAddress, font: 12)
                        if selectedFunction?.isPayable == true {
                            MonoField(placeholder: "Value (wei hex, e.g. 0x0)", text: $ethValue, font: 12)
                        }
                    }

                    if let calldata = calldataPreview {
                        HStack(alignment: .top, spacing: 8) {
                            Text("Calldata").font(.caption).foregroundStyle(.tertiary).padding(.top, 4)
                            MonoText(text: calldata, size: 10, color: .secondary)
                            CopyButton(text: calldata)
                        }
                        .padding(10)
                        .background(Color(nsColor: .textBackgroundColor))
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                        .overlay(RoundedRectangle(cornerRadius: 8).stroke(.separator.opacity(0.5)))
                    }

                    HStack(spacing: 10) {
                        ToolbarAction(title: "Read", icon: "arrow.down.circle", action: { Task { await read() } }, disabled: isRunning)
                        ToolbarAction(title: "Simulate", icon: "play.circle", action: { Task { await simulate() } }, disabled: isRunning)
                        Spacer()
                        Button("Clear") { readResult = nil; simulateResult = nil; actionError = nil }
                            .buttonStyle(.plain).font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
        }
        .loading(isRunning)
    }

    // MARK: - Result

    private func resultCard(_ title: String, _ result: CallContractResponse) -> some View {
        Card(title: title) {
            VStack(alignment: .leading, spacing: 10) {
                if let decoded = result.decoded { DecodedTable(outputs: decoded) }
                if let rawData = result.rawData {
                    HStack(spacing: 6) {
                        Text("Return data").font(.caption).foregroundStyle(.tertiary)
                        MonoText(text: rawData.truncatedHex, size: 10, color: .secondary)
                        CopyButton(text: rawData)
                    }
                    .padding(8)
                    .background(Color(nsColor: .textBackgroundColor))
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                }
            }
        }
    }

    // MARK: - Actions

    private func fetchAbi() async {
        guard isValidAddress(validAddress) else { abi = nil; abiError = "Invalid address."; return }
        isLoadingAbi = true; abiError = nil
        do {
            let response = try await DecoderAPI(client: settings.client).fetchAbi(address: validAddress, chain: chain.id)
            abi = response.abi; contractName = response.contractName
            selectedFunctionID = nil; argTexts = []; readResult = nil; simulateResult = nil; actionError = nil
        } catch { abiError = error.localizedDescription; abi = nil }
        isLoadingAbi = false
    }

    private func read() async {
        guard let fn = selectedFunction, let abi else { return }
        isRunning = true; actionError = nil; simulateResult = nil
        do {
            let req = CallContractRequest(chain: chain.id, address: validAddress, functionName: fn.canonicalSignature, args: argTexts, abi: abi, fromAddress: fromAddress.isEmpty ? nil : fromAddress)
            readResult = try await DecoderAPI(client: settings.client).callContract(req)
        } catch { actionError = error.localizedDescription }
        isRunning = false
    }

    private func simulate() async {
        guard let fn = selectedFunction else { return }
        isRunning = true; actionError = nil; readResult = nil
        do {
            let calldata = try ABIEncoder.encodeCalldata(function: fn, args: argTexts)
            let valueHex = try valueToHex(ethValue)
            let req = SimulateRequest(chainId: chain.chainId, to: validAddress, data: calldata, from: fromAddress.isEmpty ? "0x0000000000000000000000000000000000000000" : fromAddress, value: valueHex, gas: nil, blockNumber: nil, apiKeys: settings.etherscanApiKey.isEmpty ? nil : ["etherscan": settings.etherscanApiKey], price: true)
            simulateResult = try await DecoderAPI(client: settings.client).simulate(req)
        } catch { actionError = error.localizedDescription }
        isRunning = false
    }

    // MARK: - Helpers

    private var calldataPreview: String? {
        guard let fn = selectedFunction else { return nil }
        return try? ABIEncoder.encodeCalldata(function: fn, args: argTexts)
    }

    private func valueToHex(_ text: String) throws -> String {
        let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if t.lowercased().hasPrefix("0x") {
            guard !t.dropFirst(2).isEmpty, t.dropFirst(2).allSatisfy({ $0.isHexDigit }) else { throw ABIEncodeError.invalidHex(text) }
            return t
        }
        guard t.allSatisfy({ $0.isNumber }), !t.isEmpty else { throw ABIEncodeError.invalidNumber(text) }
        let bytes = ABIEncoder.decimalToBinaryBytes(t)
        return "0x" + bytes.map { String(format: "%02x", $0) }.joined()
    }

    private func bindingForArg(at index: Int) -> Binding<String> {
        Binding(get: { argTexts.indices.contains(index) ? argTexts[index] : "" },
                set: { if argTexts.indices.contains(index) { argTexts[index] = $0 } })
    }

    private func defaultArgValue(for input: ABIInput) -> String {
        let t = input.type
        if t == "address" { return "0x" }
        if t.hasPrefix("uint") || t.hasPrefix("int") { return "0" }
        if t == "bool" { return "false" }
        if t == "bytes" { return "0x" }
        if t == "string" { return "" }
        if t == "tuple" { return "[]" }
        if let (base, count) = splitArray(t) {
            if count == nil { return "[]" }
            let elem = defaultArgValue(for: ABIInput(name: nil, type: base, components: input.components))
            return "[" + Array(repeating: elem, count: count!).joined(separator: ",") + "]"
        }
        return ""
    }

    private func defaultPlaceholder(for input: ABIInput) -> String {
        let t = input.type
        if t.hasPrefix("uint") || t.hasPrefix("int") { return "decimal or 0x hex" }
        if t == "bool" { return "true or false" }
        if t == "address" || t.hasPrefix("bytes") { return "0x…" }
        if t == "string" { return "text" }
        if t.hasSuffix("]") || t == "tuple" { return "JSON e.g. [1, 2]" }
        return ""
    }

    private func splitArray(_ t: String) -> (base: String, count: Int?)? {
        if t.hasSuffix("[]") { return (String(t.dropLast(2)), nil) }
        if t.hasSuffix("]"), let open = t.lastIndex(of: "["), open < t.index(before: t.endIndex) {
            let inner = String(t[t.index(after: open)..<t.index(before: t.endIndex)])
            if let n = Int(inner) { return (String(t[..<open]), n) }
        }
        return nil
    }

    private func isValidAddress(_ s: String) -> Bool {
        guard s.lowercased().hasPrefix("0x") else { return false }
        let hex = String(s.dropFirst(2))
        return hex.count == 40 && hex.allSatisfy { $0.isHexDigit }
    }
}