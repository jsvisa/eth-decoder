import Foundation

public struct APIClient {
    public var baseURL: String
    public var etherscanApiKey: String?

    public init(baseURL: String, etherscanApiKey: String? = nil) {
        self.baseURL = baseURL
        self.etherscanApiKey = etherscanApiKey
    }

    public func get<T: Decodable>(_ path: String, query: [String: String] = [:]) async throws -> T {
        var components = URLComponents(string: baseURL + path)
        if !query.isEmpty {
            components?.queryItems = query.map { URLQueryItem(name: $0.key, value: $0.value) }
        }
        guard let url = components?.url else { throw APIError.invalidURL }
        return try await send(URLRequest(url: url))
    }

    public func getJSON(_ path: String, query: [String: String] = [:]) async throws -> JSONValue {
        var components = URLComponents(string: baseURL + path)
        if !query.isEmpty {
            components?.queryItems = query.map { URLQueryItem(name: $0.key, value: $0.value) }
        }
        guard let url = components?.url else { throw APIError.invalidURL }
        let (data, response) = try await sendData(URLRequest(url: url))
        guard let status = (response as? HTTPURLResponse)?.statusCode else {
            throw APIError.invalidResponse
        }
        guard (200..<300).contains(status) else {
            throw APIError.badStatus(status, errorMessage(from: data))
        }
        return try JSONDecoder().decode(JSONValue.self, from: data)
    }

    public static func typed<T: Decodable>(_ type: T.Type, from value: JSONValue) throws -> T {
        try JSONDecoder().decode(T.self, from: value.data)
    }

    public func postJSON(_ path: String, body: [String: JSONValue]) async throws -> JSONValue {
        var request = makeRequest(path)
        request.httpMethod = "POST"
        request.httpBody = JSONValue.object(body).compactJSON.data(using: .utf8)
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let (data, response) = try await sendData(request)
        guard let status = (response as? HTTPURLResponse)?.statusCode else {
            throw APIError.invalidResponse
        }
        guard (200..<300).contains(status) else {
            throw APIError.badStatus(status, errorMessage(from: data))
        }
        return try JSONDecoder().decode(JSONValue.self, from: data)
    }

    public func post(_ path: String, body: [String: JSONValue]) async throws -> SimulateResponse {
        var request = makeRequest(path)
        request.httpMethod = "POST"
        request.httpBody = JSONValue.object(body).compactJSON.data(using: .utf8)
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        return try await decode(SimulateResponse.self, request: request)
    }

    public func post(_ path: String, body: Encodable) async throws -> CallContractResponse {
        var request = makeRequest(path)
        request.httpMethod = "POST"
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        request.httpBody = try encoder.encode(body)
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        return try await decode(CallContractResponse.self, request: request)
    }

    public func decode<T: Decodable>(_ type: T.Type, request: URLRequest) async throws -> T {
        let (data, response) = try await sendData(request)
        guard let status = (response as? HTTPURLResponse)?.statusCode else {
            throw APIError.invalidResponse
        }
        guard (200..<300).contains(status) else {
            throw APIError.badStatus(status, errorMessage(from: data))
        }
        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch let error as DecodingError {
            if let serverError = try? JSONDecoder().decode(ErrorResponse.self, from: data),
               !serverError.error.isEmpty {
                throw APIError.serverMessage(serverError.error)
            }
            throw error
        }
    }

    private func makeRequest(_ path: String) -> URLRequest {
        guard let url = URL(string: baseURL + path) else {
            return URLRequest(url: URL(string: "about:blank")!)
        }
        var request = URLRequest(url: url)
        request.timeoutInterval = 120
        return request
    }

    private func sendData(_ request: URLRequest) async throws -> (Data, URLResponse) {
        try await URLSession.shared.data(for: request)
    }

    private func send<T: Decodable>(_ request: URLRequest) async throws -> T {
        let (data, response) = try await sendData(request)
        guard let status = (response as? HTTPURLResponse)?.statusCode else {
            throw APIError.invalidResponse
        }
        guard (200..<300).contains(status) else {
            throw APIError.badStatus(status, errorMessage(from: data))
        }
        return try JSONDecoder().decode(T.self, from: data)
    }

    private func errorMessage(from data: Data) -> String {
        (try? JSONDecoder().decode(ErrorResponse.self, from: data))?.error ?? ""
    }
}

public extension JSONValue {
    public var data: Data { compactJSON.data(using: .utf8) ?? Data() }
}

// Convenience wrappers for the specific endpoints this app uses.

public struct DecoderAPI {
    public let client: APIClient

    public init(client: APIClient) {
        self.client = client
    }

    public func decode(data: String, withAbi: Bool = true, withSign: Bool = true) async throws -> (DecodeResponse, JSONValue) {
        let query: [String: String] = [
            "data": data,
            "with_abi": withAbi ? "true" : "false",
            "with_sign": withSign ? "true" : "false",
        ]
        let raw = try await client.getJSON("/api/v1/decode", query: query)
        return (try APIClient.typed(DecodeResponse.self, from: raw), raw)
    }

    public func query(sign: String) async throws -> QueryResponse {
        try await client.get("/api/v1/query", query: ["sign": sign])
    }

    public func fetchAbi(address: String, chain: String) async throws -> FetchAbiResponse {
        var query: [String: String] = ["address": address, "chain": chain]
        if let key = client.etherscanApiKey, !key.isEmpty {
            query["apiKey"] = key
        }
        return try await client.get("/api/v1/fetch-abi", query: query)
    }

    public func callContract(_ request: CallContractRequest) async throws -> CallContractResponse {
        try await client.post("/api/call-contract", body: request)
    }

    public func simulate(_ request: SimulateRequest) async throws -> (SimulateResponse, JSONValue) {
        let raw = try await client.postJSON("/api/simulate-tx", body: request.body())
        return (try APIClient.typed(SimulateResponse.self, from: raw), raw)
    }
}