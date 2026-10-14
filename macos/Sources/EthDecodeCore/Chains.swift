import Foundation

public struct Chain: Identifiable, Hashable {
    public let id: String
    public let name: String
    public let chainId: Int
}

public enum Chains {
    public static let all: [Chain] = [
        Chain(id: "ethereum", name: "Ethereum", chainId: 1),
        Chain(id: "arbitrum", name: "Arbitrum", chainId: 42161),
        Chain(id: "base", name: "Base", chainId: 8453),
        Chain(id: "polygon", name: "Polygon", chainId: 137),
        Chain(id: "bsc", name: "BSC", chainId: 56),
    ]

    public static func chain(named slug: String) -> Chain? {
        all.first { $0.id == slug }
    }
}