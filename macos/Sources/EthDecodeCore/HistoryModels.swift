import Foundation

// History items (same JSON shapes as the web app's localStorage entries).

public struct DecodeHistoryItem: Codable, Equatable, Identifiable {
    public var id: Int
    public let input: String
    public let output: JSONValue?
    public let options: DecodeOptions?
    public let timestamp: String

    public struct DecodeOptions: Codable, Equatable {
        public let withAbi: Bool
        public let withSign: Bool

        public init(withAbi: Bool, withSign: Bool) {
            self.withAbi = withAbi
            self.withSign = withSign
        }
    }

    public init(id: Int, input: String, output: JSONValue?, options: DecodeOptions?, timestamp: String) {
        self.id = id
        self.input = input
        self.output = output
        self.options = options
        self.timestamp = timestamp
    }
}

public struct CallHistoryItem: Codable, Equatable, Identifiable {
    public var id: Int
    public let chain: String
    public let address: String
    public let functionName: String?
    public let functionSig: String?
    public let args: [String]?
    public var fromAddress: String?
    public var output: JSONValue?
    public let contractName: String?
    public var isWrite: Bool?
    public var timestamp: String
    public let type: String? // nil for single call, "session" for session bundles

    public struct SessionCall: Codable, Equatable {
        public let id: String
        public let type: String?
        public let functionName: String?
        public let contractName: String?
        public let inputs: [DecodedOutput]?
        public let outputs: [DecodedOutput]?
        public let success: Bool?

        public init(id: String, type: String?, functionName: String?, contractName: String?,
                    inputs: [DecodedOutput]?, outputs: [DecodedOutput]?, success: Bool?) {
            self.id = id
            self.type = type
            self.functionName = functionName
            self.contractName = contractName
            self.inputs = inputs
            self.outputs = outputs
            self.success = success
        }
    }

    public var txs: [SessionCall]?

    public init(id: Int, chain: String, address: String, functionName: String?, functionSig: String?,
                args: [String]?, fromAddress: String?, output: JSONValue?, contractName: String?,
                isWrite: Bool?, timestamp: String, type: String? = nil, txs: [SessionCall]? = nil) {
        self.id = id
        self.chain = chain
        self.address = address
        self.functionName = functionName
        self.functionSig = functionSig
        self.args = args
        self.fromAddress = fromAddress
        self.output = output
        self.contractName = contractName
        self.isWrite = isWrite
        self.timestamp = timestamp
        self.type = type
        self.txs = txs
    }
}
