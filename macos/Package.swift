// swift-tools-version:6.0
import PackageDescription

let package = Package(
    name: "EthDecodeMac",
    platforms: [.macOS(.v13)],
    targets: [
        .target(
            name: "EthDecodeCore",
            path: "Sources/EthDecodeCore",
            swiftSettings: [.swiftLanguageMode(.v5)]
        ),
        .executableTarget(
            name: "EthDecodeMac",
            dependencies: ["EthDecodeCore"],
            path: "Sources/EthDecodeMac",
            swiftSettings: [.swiftLanguageMode(.v5)]
        ),
        .executableTarget(
            name: "EthDecodeMacRunTests",
            dependencies: ["EthDecodeCore"],
            path: "Tests/EthDecodeMacRunTests",
            swiftSettings: [.swiftLanguageMode(.v5)]
        ),
    ]
)