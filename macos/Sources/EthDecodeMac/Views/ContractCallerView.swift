import EthDecodeCore
import SwiftUI

struct ContractCallerView: View {
    @EnvironmentObject private var settings: AppSettings
    @EnvironmentObject private var history: HistoryStore

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

    // MARK: - Body

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    contractCard
                    if let abi { functionCard(abi) }
                    if let actionError {
                        ErrorView(message: actionError) { self.actionError = nil }
                    }
                    if let readResult { readResultCard(readResult) }
                    if let (sim, raw) = simulateResult {
                        SimulationResultView(result: sim, rawJSON: raw)
                    }
                }
                .padding(20)
            }
            .frame(maxHeight: .infinity)
            Divider()
            CallerHistoryStrip(currentChain: chain.id) { item in
                loadFromHistory(item)
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 12)
        }
        .overlay(alignment: .center) {
            if abi == nil && actionError == nil && !isLoadingAbi && !isRunning {
                EmptyState(
                    icon: "phone.badge.checkmark",
                    title: "Contract caller",
                    message: "Pick a network, enter a contract address and fetch its ABI."
                )
                .offset(y: -60)
                .allowsHitTesting(false)
            }
        }
        .background(Color(nsColor: .windowBackgroundColor))
        .onChange(of: selectedFunctionID) { _, newID in
            guard let newID, let fn = functions.first(where: { $0.id == newID }) else {
                argTexts = []
                return
            }
            argTexts = (fn.inputs ?? []).map { defaultArgValue(for: $0) }
            readResult = nil
            simulateResult = nil
            actionError = nil
        }
    }

    // MARK: - Contract card

    private var contractCard: some View {
        Card(title: "Contract") {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 10) {
                    Picker("Network", selection: $chain) {
                        ForEach(Chains.all) { c in
                            Text(c.name).tag(c)
                        }
                    }
                    .labelsHidden()
                    .frame(width: 150)

                    MonoField(placeholder: "0x…", text: $address)

                    Button {
                        Task { await fetchAbi() }
                    } label: {
                        if isLoadingAbi {
                            ProgressView().controlSize(.small)
                        } else {
                            Label("Fetch ABI", systemImage: "arrow.triangle.2.circlepath")
                                .frame(minWidth: 70)
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(isLoadingAbi || validAddress.isEmpty)
                    .keyboardShortcut(.return, modifiers: .command)
                }

                if let name = contractName {
                    HStack(spacing: 6) {
                        Badge(text: name, color: .indigo, icon: "building.2")
                        Badge(text: "\(abi?.count ?? 0) items", color: .gray)
                    }
                }
                if let abiError {
                    Text(abiError).font(.caption).foregroundStyle(.red)
                }
            }
        }
        .loading(isLoadingAbi)
    }

    // MARK: - Function card

    private func functionCard(_ loaded: [ABIItem]) -> some View {
        Card(title: "Call", subtitle: selectedFunction.map(\.canonicalSignature)) {
            VStack(alignment: .leading, spacing: 14) {
                functionPicker(loaded)

                if let fn = selectedFunction, let inputs = fn.inputs, !inputs.isEmpty {
                    argsSection(inputs)
                }

                if selectedFunction != nil {
                    contextRow

                    if let calldata = calldataPreview {
                        calldataPreviewRow(calldata)
                    }

                    actionBar
                }
            }
        }
        .loading(isRunning)
    }

    private func functionPicker(_ loaded: [ABIItem]) -> some View {
        Picker("Function", selection: $selectedFunctionID) {
            Text("Select a function…").tag(nil as String?)
            Divider()
            ForEach(functions.filter { $0.isConstant }) { fn in
                Text("\(marker(for: fn)) \(fn.canonicalSignature)")
                    .tag(fn.id as String?)
            }
            Divider()
            ForEach(functions.filter { !$0.isConstant }) { fn in
                Text("\(marker(for: fn)) \(fn.canonicalSignature)")
                    .tag(fn.id as String?)
            }
        }
        .labelsHidden()
    }

    private func marker(for fn: ABIItem) -> String {
        fn.isPayable ? "💰" : (fn.isConstant ? "👁" : "✍️")
    }

    private func argsSection(_ inputs: [ABIInput]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionHeader(title: "Arguments")
            ForEach(Array(inputs.enumerated()), id: \.offset) { index, input in
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    VStack(alignment: .trailing, spacing: 1) {
                        Text(input.name ?? "arg\(index)")
                            .font(.caption.monospaced().weight(.semibold))
                        Text(input.type)
                            .font(.system(size: 9.5, design: .monospaced))
                            .foregroundStyle(.teal.opacity(0.85))
                    }
                    .frame(width: 128, alignment: .trailing)
                    MonoField(placeholder: placeholderText(for: input),
                              text: bindingForArg(at: index), font: 12)
                }
            }
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(nsColor: .textBackgroundColor).opacity(0.6))
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    private var contextRow: some View {
        HStack(spacing: 10) {
            MonoField(placeholder: "From address (optional)", text: $fromAddress, font: 12)
            if selectedFunction?.isPayable == true {
                MonoField(placeholder: "Value (wei hex e.g. 0x0)", text: $ethValue, font: 12)
            }
        }
    }

    private func calldataPreviewRow(_ calldata: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text("Calldata")
                .font(.caption)
                .foregroundStyle(.secondary)
                .frame(width: 128, alignment: .trailing)
            MonoText(text: calldata.truncatedHexShort, size: 10, color: CodeColors.argValue)
                .lineLimit(2)
            CopyButton(text: calldata)
        }
        .padding(10)
        .background(Color(nsColor: .textBackgroundColor).opacity(0.6))
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    private var actionBar: some View {
        HStack(spacing: 10) {
            Button {
                Task { await read() }
            } label: {
                Label("Read", systemImage: "arrow.down.circle")
                    .frame(minWidth: 54)
            }
            .buttonStyle(.borderedProminent)
            .tint(.teal)
            .disabled(isRunning)

            Button {
                Task { await simulate() }
            } label: {
                Label("Simulate", systemImage: "play.fill")
                    .frame(minWidth: 62)
            }
            .buttonStyle(.borderedProminent)
            .disabled(isRunning || fromAddress.trimmingCharacters(in: .whitespaces).isEmpty)
            .help("Simulation requires a from address")

            Spacer()

            Button(role: .destructive) {
                readResult = nil
                simulateResult = nil
                actionError = nil
            } label: {
                Label("Clear results", systemImage: "xmark.circle")
            }
            .controlSize(.small)
            .disabled(isRunning)
        }
    }

    // MARK: - Read result

    private func readResultCard(_ result: CallContractResponse) -> some View {
        Card(title: "Read Result", subtitle: selectedFunction?.name) {
            VStack(alignment: .leading, spacing: 12) {
                if let decoded = result.decoded, !decoded.isEmpty {
                    DecodedTable(outputs: decoded)
                }
                if let rawData = result.rawData {
                    KVRow(key: "raw data", value: rawData.truncatedHexShort)
                }
            }
        }
    }

    // MARK: - Actions

    private func fetchAbi() async {
        guard isValidAddress(validAddress) else {
            abi = nil
            abiError = "Invalid address."
            return
        }
        isLoadingAbi = true
        abiError = nil
        do {
            let response = try await DecoderAPI(client: settings.client)
                .fetchAbi(address: validAddress, chain: chain.id)
            abi = response.abi
            contractName = response.contractName ?? response.implContractName
            selectedFunctionID = nil
            argTexts = []
            readResult = nil
            simulateResult = nil
            actionError = nil
        } catch {
            abiError = error.localizedDescription
            abi = nil
        }
        isLoadingAbi = false
    }

    private func read() async {
        guard let fn = selectedFunction, let abi else { return }
        isRunning = true
        actionError = nil
        simulateResult = nil
        do {
            let req = CallContractRequest(
                chain: chain.id, address: validAddress,
                functionName: fn.canonicalSignature, args: argTexts, abi: abi,
                fromAddress: fromAddress.isEmpty ? nil : fromAddress)
            let res = try await DecoderAPI(client: settings.client).callContract(req)
            readResult = res
            let out = try? JSONEncoder().encode(res)
            let json = out.flatMap { try? JSONDecoder().decode(JSONValue.self, from: $0) }
            history.saveCaller(
                chain: chain.id, address: validAddress, functionSig: fn.canonicalSignature,
                args: argTexts, fromAddress: fromAddress.isEmpty ? nil : fromAddress,
                output: json, contractName: contractName, isWrite: false)
        } catch {
            actionError = error.localizedDescription
        }
        isRunning = false
    }

    private func simulate() async {
        guard let fn = selectedFunction else { return }
        isRunning = true
        actionError = nil
        readResult = nil
        do {
            let calldata = try ABIEncoder.encodeCalldata(function: fn, args: argTexts)
            let valueHex = try valueToHex(ethValue)
            let req = SimulateRequest(
                chainId: chain.chainId, to: validAddress, data: calldata,
                from: fromAddress.isEmpty ? "0x0000000000000000000000000000000000000000" : fromAddress,
                value: valueHex, gas: nil, blockNumber: nil,
                apiKeys: settings.etherscanApiKey.isEmpty ? nil : ["etherscan": settings.etherscanApiKey],
                price: true)
            let (sim, raw) = try await DecoderAPI(client: settings.client).simulate(req)
            simulateResult = (sim, raw)
            history.saveCaller(
                chain: chain.id, address: validAddress, functionSig: fn.canonicalSignature,
                args: argTexts, fromAddress: fromAddress.isEmpty ? nil : fromAddress,
                output: raw, contractName: contractName, isWrite: true)
        } catch {
            actionError = error.localizedDescription
        }
        isRunning = false
    }

    private func loadFromHistory(_ item: CallHistoryItem) {
        chain = Chains.chain(named: item.chain) ?? Chains.all[0]
        address = item.address
        fromAddress = item.fromAddress ?? ""
        if let sig = item.functionSig {
            selectedFunctionID = functions.first(where: { $0.canonicalSignature == sig })?.id
            if let args = item.args { argTexts = args }
        }
        if address != validAddress || abi == nil {
            Task { await fetchAbi() }
        }
        readResult = nil
        simulateResult = nil
        if let output = item.output {
            if item.isWrite == true, let sim = try? APIClient.typed(SimulateResponse.self, from: output) {
                simulateResult = (sim, output)
            } else if item.isWrite != true, let res = try? APIClient.typed(CallContractResponse.self, from: output) {
                readResult = res
            }
        }
    }

    // MARK: - Helpers

    private var calldataPreview: String? {
        guard let fn = selectedFunction else { return nil }
        return try? ABIEncoder.encodeCalldata(function: fn, args: argTexts)
    }

    private func valueToHex(_ text: String) throws -> String {
        let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if t.lowercased().hasPrefix("0x") {
            guard !t.dropFirst(2).isEmpty, t.dropFirst(2).allSatisfy({ $0.isHexDigit }) else {
                throw ABIEncodeError.invalidHex(text)
            }
            return t
        }
        guard t.allSatisfy({ $0.isNumber }), !t.isEmpty else {
            throw ABIEncodeError.invalidNumber(text)
        }
        let bytes = ABIEncoder.decimalToBinaryBytes(t)
        return "0x" + bytes.map { String(format: "%02x", $0) }.joined()
    }

    private func bindingForArg(at index: Int) -> Binding<String> {
        Binding(
            get: { argTexts.indices.contains(index) ? argTexts[index] : "" },
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

    private func placeholderText(for input: ABIInput) -> String {
        let t = input.type
        if t.hasPrefix("uint") || t.hasPrefix("int") { return "decimal or 0x hex" }
        if t == "bool" { return "true / false" }
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
