import EthDecodeCore
import Foundation

var failures = 0

func check(_ condition: Bool, _ name: String) {
    if condition {
        print("PASS  \(name)")
    } else {
        failures += 1
        print("FAIL  \(name)")
    }
}

func checkEqual(_ actual: String, _ expected: String, _ name: String) {
    if actual == expected {
        print("PASS  \(name)")
    } else {
        failures += 1
        print("FAIL  \(name)")
        print("      expected: \(expected)")
        print("      actual:   \(actual)")
    }
}

func expectThrows(_ name: String, _ body: () throws -> Void) {
    do {
        try body()
        failures += 1
        print("FAIL  \(name) (expected an error, none thrown)")
    } catch {
        print("PASS  \(name) (\(String(describing: error)))")
    }
}

private func fn(_ name: String, inputs: [ABIInput], outputs: [ABIInput] = []) -> ABIItem {
    ABIItem(type: "function", name: name, stateMutability: "nonpayable",
            constant: nil, payable: false, inputs: inputs, outputs: outputs, anonymous: nil)
}

// MARK: - Keccak-256

func testKeccak() {
    let emptyResult = Keccak256.hash([]).map { String(format: "%02x", $0) }.joined()
    print("  DEBUG keccak empty: \(emptyResult)")
    let abcResult = Keccak256.hashHex("abc")
    print("  DEBUG keccak abc: \(abcResult)")
    let helloResult = Keccak256.hashHex("hello")
    print("  DEBUG keccak hello: \(helloResult)")
    let transferResult = Keccak256.hashHex("transfer(address,uint256)")
    print("  DEBUG keccak transfer: \(transferResult)")
    let TransferResult = Keccak256.hashHex("Transfer(address,uint256)")
    print("  DEBUG keccak Transfer: \(TransferResult)")
    checkEqual(emptyResult,
               "c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
               "keccak(\"\")")
    checkEqual(String(Keccak256.hashHex("transfer(address,uint256)").prefix(8)), "a9059cbb",
               "selector transfer(address,uint256)")
    checkEqual(String(Keccak256.hashHex("approve(address,uint256)").prefix(8)), "095ea7b3",
               "selector approve(address,uint256)")
    checkEqual(String(Keccak256.hashHex("balanceOf(address)").prefix(8)), "70a08231",
               "selector balanceOf(address)")
    checkEqual(String(Keccak256.hashHex("totalSupply()").prefix(8)), "18160ddd",
               "selector totalSupply()")
    checkEqual(String(Keccak256.hashHex("name()").prefix(8)), "06fdde03",
               "selector name()")
    checkEqual(Keccak256.hashHex("Transfer(address,address,uint256)"),
               "ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
               "topic0 Transfer(address,address,uint256)")
    // A couple of extra selectors to exercise the permutation deeper
    checkEqual(String(Keccak256.hashHex("transferFrom(address,address,uint256)").prefix(8)), "23b872dd",
               "selector transferFrom")
    checkEqual(String(Keccak256.hashHex("symbol()").prefix(8)), "95d89b41",
               "selector symbol()")
    checkEqual(String(Keccak256.hashHex("decimals()").prefix(8)), "313ce567",
               "selector decimals()")
}

// MARK: - ABI encoding

func testABIEncoding() {
    do {
        let item = fn("approve", inputs: [
            ABIInput(name: "spender", type: "address"),
            ABIInput(name: "amount", type: "uint256"),
        ])
        let calldata = try ABIEncoder.encodeCalldata(function: item, args: [
            "0x000000000022D473030F116dDEE9F6B43aC78BA3",
            "115792089237316195423570985008687907853269984665640564039457584007913129639935",
        ])
        checkEqual(calldata,
            "0x095ea7b3000000000000000000000000000000000022d473030f116ddee9f6b43ac78ba3ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
            "approve(address,uint256) full calldata")
    } catch {
        check(false, "approve encoding threw: \(error)")
    }

    do {
        let item = fn("transfer", inputs: [
            ABIInput(name: "to", type: "address"),
            ABIInput(name: "amount", type: "uint256"),
        ])
        let calldata = try ABIEncoder.encodeCalldata(function: item, args: [
            "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
            "1000",
        ])
        checkEqual(calldata,
            "0xa9059cbb0000000000000000000000007a250d5630b4cf539739df2c5dacb4c659f2488d00000000000000000000000000000000000000000000000000000000000003e8",
            "transfer(address,uint256) full calldata")
    } catch {
        check(false, "transfer encoding threw: \(error)")
    }

    do {
        let item = fn("setMessage", inputs: [ABIInput(name: "message", type: "string")])
        let calldata = try ABIEncoder.encodeCalldata(function: item, args: ["hello"])
let body = String(calldata.dropFirst(2).dropFirst(8))
        checkEqual(String(body.prefix(64)), String(repeating: "0", count: 62) + "20", "string offset")
        checkEqual(String(body.dropFirst(64).prefix(64)), String(repeating: "0", count: 63) + "5", "string length")
        check(body.contains("68656c6c6f"), "string payload 'hello'")
    } catch {
        check(false, "string encoding threw: \(error)")
    }

    do {
        let item = fn("f", inputs: [ABIInput(name: "x", type: "uint256[]")])
        let calldata = try ABIEncoder.encodeCalldata(function: item, args: ["[1, 2, 3]"])
        let body = String(calldata.dropFirst(2).dropFirst(8))
        checkEqual(String(body.prefix(64)), String(repeating: "0", count: 62) + "20", "uint[] array offset")
        checkEqual(String(body.dropFirst(64).prefix(64)), String(repeating: "0", count: 63) + "3", "uint[] length")
        checkEqual(String(body.dropFirst(128).prefix(64)), String(repeating: "0", count: 63) + "1", "uint[] [0]")
        checkEqual(String(body.dropFirst(192).prefix(64)), String(repeating: "0", count: 63) + "2", "uint[] [1]")
        checkEqual(String(body.dropFirst(256).prefix(64)), String(repeating: "0", count: 63) + "3", "uint[] [2]")
    } catch {
        check(false, "uint[] encoding threw: \(error)")
    }

    do {
        let item = fn("f", inputs: [ABIInput(name: "x", type: "int256")])
        let calldata = try ABIEncoder.encodeCalldata(function: item, args: ["-1"])
        checkEqual(String(calldata.dropFirst(2).dropFirst(8)), String(repeating: "f", count: 64), "int256 -1")
        let maxNeg = try ABIEncoder.encodeCalldata(function: item, args: ["-57896044618658097711785492504343953926634992332820282019728792003956564819968"])
        checkEqual(String(maxNeg.dropFirst(2).dropFirst(8)), "8" + String(repeating: "0", count: 63), "int256 min")
    } catch {
        check(false, "int encoding threw: \(error)")
    }

    do {
        let item = fn("f", inputs: [ABIInput(name: "x", type: "bytes32")])
        let calldata = try ABIEncoder.encodeCalldata(function: item, args: ["0x11"])
        let body = String(calldata.dropFirst(2).dropFirst(8))
        check(body.hasPrefix("11"), "bytes32 left-aligned")
        check(body.hasSuffix(String(repeating: "0", count: 62)), "bytes32 zero-padded")
    } catch {
        check(false, "bytes32 encoding threw: \(error)")
    }

    do {
        let item = fn("f", inputs: [ABIInput(name: "t", type: "tuple", components: [
            ABIInput(name: "to", type: "address"),
            ABIInput(name: "value", type: "uint256"),
        ])])
        let calldata = try ABIEncoder.encodeCalldata(function: item, args: [
            "[\"0x0000000000000000000000000000000000000001\", \"7\"]",
        ])
        let body = String(calldata.dropFirst(2).dropFirst(8))
        checkEqual(String(body.prefix(64)), String(repeating: "0", count: 63) + "1", "tuple member 0")
        checkEqual(String(body.dropFirst(64).prefix(64)), String(repeating: "0", count: 63) + "7", "tuple member 1")
    } catch {
        check(false, "tuple encoding threw: \(error)")
    }

    do {
        let item = fn("f", inputs: [ABIInput(name: "x", type: "string[]")])
        let calldata = try ABIEncoder.encodeCalldata(function: item, args: ["[\"a\", \"b\"]"])
        let body = String(calldata.dropFirst(2).dropFirst(8))
        print("  DEBUG string[] body: \(body)")
        checkEqual(String(body.prefix(64)), String(repeating: "0", count: 62) + "20", "string[] array offset")
        checkEqual(String(body.dropFirst(64).prefix(64)), String(repeating: "0", count: 63) + "2", "string[] length")
        checkEqual(String(body.dropFirst(128).prefix(64)), String(repeating: "0", count: 62) + "40", "string[] elem offset 0")
        checkEqual(String(body.dropFirst(192).prefix(64)), String(repeating: "0", count: 62) + "80", "string[] elem offset 1")
        check(body.contains("61"), "string[] contains 'a'")
        check(body.contains("62"), "string[] contains 'b'")
    } catch {
        check(false, "string[] encoding threw: \(error)")
    }

    do {
        // Mixed static + dynamic in one call, offset accounting across inputs
        let item = fn("f", inputs: [
            ABIInput(name: "a", type: "uint256"),
            ABIInput(name: "b", type: "string"),
            ABIInput(name: "c", type: "uint256"),
        ])
        let calldata = try ABIEncoder.encodeCalldata(function: item, args: ["1", "hi", "2"])
        let body = String(calldata.dropFirst(2).dropFirst(8))
        print("  DEBUG mixed body: \(body)")
        checkEqual(String(body.prefix(64)), String(repeating: "0", count: 63) + "1", "mixed arg a")
        // head: a=1, b=offset(0x60), c=2 -> tails start at 0x60
        checkEqual(String(body.dropFirst(64).prefix(64)), String(repeating: "0", count: 62) + "60", "mixed arg b offset")
        checkEqual(String(body.dropFirst(128).prefix(64)), String(repeating: "0", count: 63) + "2", "mixed arg c")
        checkEqual(String(body.dropFirst(192).prefix(64)), String(repeating: "0", count: 63) + "2", "mixed string length")
    } catch {
        check(false, "mixed encoding threw: \(error)")
    }

    expectThrows("uint8 out of range") {
        let item = fn("f", inputs: [ABIInput(name: "x", type: "uint8")])
        _ = try ABIEncoder.encodeCalldata(function: item, args: ["300"])
    }
    expectThrows("arg count mismatch") {
        let item = fn("f", inputs: [ABIInput(name: "a", type: "uint256")])
        _ = try ABIEncoder.encodeCalldata(function: item, args: [])
    }
    expectThrows("bad address") {
        let item = fn("f", inputs: [ABIInput(name: "a", type: "address")])
        _ = try ABIEncoder.encodeCalldata(function: item, args: ["0x123"])
    }
    expectThrows("bad bool") {
        let item = fn("f", inputs: [ABIInput(name: "a", type: "bool")])
        _ = try ABIEncoder.encodeCalldata(function: item, args: ["yes"])
    }
}

// MARK: - JSONValue

func testJSONValue() {
    do {
        let json = #"{"a": 1, "b": "2", "c": 1.5, "d": true, "e": null, "f": [1, "x"], "g": {"h": 3}}"#
        let value = try JSONDecoder().decode(JSONValue.self, from: Data(json.utf8))
        guard case .object(let obj) = value else { check(false, "json root object"); return }
        check(obj["a"] == .number(.int(1)), "json int")
        check(obj["b"] == .string("2"), "json string")
        check(obj["d"] == .bool(true), "json bool")
        check(obj["e"] == .null, "json null")
        check(obj["f"] == .array([.number(.int(1)), .string("x")]), "json array")
        check(obj["g"] == .object(["h": .number(.int(3))]), "json nested object")
    } catch {
        check(false, "json decode threw: \(error)")
    }

    do {
        // huge ints are sent as strings by the API, so this tests JSONValue's
        // fallback: Double can't represent this precisely, so it becomes .text.
        let json = #"{"n": 115792089237316195423570985008687907853269984665640564039457584007913129639935}"#
        let value = try JSONDecoder().decode(JSONValue.self, from: Data(json.utf8))
        guard case .object(let obj) = value, case .number(let n) = obj["n"]! else {
            check(false, "huge number present"); return
        }
        guard case .text = n else { check(false, "huge number preserved as text"); return }
        check(true, "huge number kept as text")
    } catch {
        check(false, "huge number decode threw: \(error)")
    }
}

// MARK: - Model decoding

func testModels() {
    do {
        let json = #"{"msg": "ok", "data": [{"func": "transfer(address,uint256)", "args": {"to": "0xabc", "amount": 1000}, "source": "sourcify"}]}"#
        let response = try JSONDecoder().decode(DecodeResponse.self, from: Data(json.utf8))
        check(response.data?.first?.funcName == "transfer(address,uint256)", "decode func")
        check(response.data?.first?.args?["amount"] == .number(.int(1000)), "decode args")
        check(response.data?.first?.source == "sourcify", "decode source")
    } catch {
        check(false, "decode response threw: \(error)")
    }

    do {
        let json = #"{"contractName": "Token", "isProxy": false, "abi": [{"type": "function", "name": "transfer", "inputs": [{"name": "to", "type": "address"}], "outputs": [], "stateMutability": "nonpayable"}]}"#
        let response = try JSONDecoder().decode(FetchAbiResponse.self, from: Data(json.utf8))
        check(response.contractName == "Token", "fetch-abi name")
        check(response.abi?.first?.canonicalSignature == "transfer(address)", "fetch-abi sig")
        check(response.abi?.first?.selectorHex == "0x1a695230", "fetch-abi selector for transfer(address)")
    } catch {
        check(false, "fetch-abi response threw: \(error)")
    }

    do {
        let json = #"{"success": true, "gasUsed": 24611, "blockNumber": "0x123", "logs": [{"name": "Approval", "address": "0xabc", "inputs": []}], "someUnknownField": {"x": 1}}"#
        let response = try JSONDecoder().decode(SimulateResponse.self, from: Data(json.utf8))
        check(response.success == true, "simulate success")
        check(response.logs?.first?.name == "Approval", "simulate log name")
        check(response.extra["someUnknownField"] == .object(["x": .number(.int(1))]), "simulate extra keys")
    } catch {
        check(false, "simulate response threw: \(error)")
    }

    do {
        let json = #"{"type": "call", "index": 0, "selector": "0xa9059cbb", "data": "0x1234", "target": "0xabc", "value": 5, "weird": true}"#
        let call = try JSONDecoder().decode(InnerCall.self, from: Data(json.utf8))
        check(call.index == 0, "inner call index")
        check(call.selector == "0xa9059cbb", "inner call selector")
        check(call.target == "0xabc", "inner call target")
        check(call.value == .number(.int(5)), "inner call value")
        check(call.extra["weird"] == .bool(true), "inner call extra")
    } catch {
        check(false, "inner call decode threw: \(error)")
    }

    do {
        let json = #"{"type": "command", "name": "V3_SWAP_EXACT_IN", "allow_revert": false, "args": {"recipient": "0xabc", "amountIn": 100}}"#
        let call = try JSONDecoder().decode(InnerCall.self, from: Data(json.utf8))
        check(call.type == "command", "command type")
        check(call.name == "V3_SWAP_EXACT_IN", "command name")
        check(call.allowRevert == .bool(false), "command allow_revert")
    } catch {
        check(false, "command decode threw: \(error)")
    }
}

// MARK: - HistoryDatabase (SQLite)

func testHistoryDatabase() {
    let path = URL(fileURLWithPath: NSTemporaryDirectory())
        .appendingPathComponent("ethdecode-test-\(UUID().uuidString)")
        .appendingPathComponent("history.sqlite")
        .path

    do {
        let db = try HistoryDatabase(path: path)

        // Decoder round-trip
        try db.saveDecoder([
            DecodeHistoryItem(id: 2, input: "0xbb", output: .string("approve"),
                              options: .init(withAbi: true, withSign: false),
                              timestamp: "2026-01-02T00:00:00.000Z"),
            DecodeHistoryItem(id: 1, input: "0xaa", output: nil,
                              options: nil, timestamp: "2026-01-01T00:00:00.000Z"),
        ])
        var loaded = try db.loadDecoder()
        check(loaded.count == 2, "sqlite decoder count")
        check(loaded.first?.id == 2, "sqlite decoder newest-first")
        check(loaded.first?.output == .string("approve"), "sqlite decoder output json")

        // Whole-array write-back replaces previous rows
        try db.saveDecoder([loaded[0]])
        loaded = try db.loadDecoder()
        check(loaded.count == 1, "sqlite decoder replace-all")
        check(loaded[0] == DecodeHistoryItem(
            id: 2, input: "0xbb", output: .string("approve"),
            options: .init(withAbi: true, withSign: false),
            timestamp: "2026-01-02T00:00:00.000Z"), "sqlite decoder round-trip equality")
        try db.clearDecoder()
        check(try db.loadDecoder().isEmpty, "sqlite decoder cleared")

        // Caller round-trip (nulls, args array, session bundle)
        let callerItem = CallHistoryItem(
            id: 7, chain: "ethereum", address: "0xabc",
            functionName: nil, functionSig: "transfer(address,uint256)",
            args: ["0xdef", "100"], fromAddress: nil,
            output: .object(["success": .bool(true)]),
            contractName: "Token", isWrite: true,
            timestamp: "2026-01-03T12:30:45.123Z",
            type: "session",
            txs: [CallHistoryItem.SessionCall(id: "s1", type: "call",
                                              functionName: "transfer",
                                              contractName: "Token",
                                              inputs: [DecodedOutput(name: "to", type: "address", value: .string("0xdef"))],
                                              outputs: nil, success: true)])
        try db.saveCaller([callerItem])
        let callers = try db.loadCaller()
        check(callers.first == callerItem, "sqlite caller round-trip equality")
        check(callers.first?.args?.count == 2, "sqlite caller args")
        check(callers.first?.fromAddress == nil, "sqlite caller null column")
        check(callers.first?.txs?.first?.inputs?.first?.name == "to", "sqlite session bundle")
        try db.clearCaller()
        check(try db.loadCaller().isEmpty, "sqlite caller cleared")
    } catch {
        failures += 1
        print("FAIL  sqlite history threw: \(error)")
    }

    // Reopening an existing database file must work (idempotent schema).
    do {
        _ = try HistoryDatabase(path: path)
        check(true, "sqlite reopen existing file")
    } catch {
        failures += 1
        print("FAIL  sqlite reopen threw: \(error)")
    }
}

// MARK: - Runner

@main
struct TestRunner {
    static func main() {
        testKeccak()
        testABIEncoding()
        testJSONValue()
        testModels()
        testHistoryDatabase()
        if failures > 0 {
            print("\(failures) test(s) FAILED")
            exit(1)
        }
        print("All tests passed")
    }
}