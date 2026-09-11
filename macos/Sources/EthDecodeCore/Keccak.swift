import Foundation

// Pure-Swift Keccak-256 (as used by Ethereum for selector / topic0 derivation).
// Delimiter 0x01, rate 1088 bits, output 256 bits.
public enum Keccak256 {
    private static let rate = 136 // bytes per block

    private static let rotation: [[Int]] = [
        [0, 36, 3, 41, 18],
        [1, 44, 10, 45, 2],
        [62, 6, 43, 15, 61],
        [28, 55, 25, 21, 56],
        [27, 20, 39, 8, 14],
    ]

    private static let roundConstants: [UInt64] = [
        0x0000000000000001, 0x0000000000008082, 0x800000000000808A,
        0x8000000080008000, 0x000000000000808B, 0x0000000080000001,
        0x8000000080008081, 0x8000000000008009, 0x000000000000008A,
        0x0000000000000088, 0x0000000080008009, 0x000000008000000A,
        0x000000008000808B, 0x800000000000008B, 0x8000000000008089,
        0x8000000000008003, 0x8000000000008002, 0x8000000000000080,
        0x000000000000800A, 0x800000008000000A, 0x8000000080008081,
        0x8000000000008080, 0x0000000080000001, 0x8000000080008008,
    ]

    public static func hash(_ input: [UInt8]) -> [UInt8] {
        var state = [UInt64](repeating: 0, count: 25)

        var message = input
        message.append(0x01)
        while message.count % rate != rate - 1 { message.append(0) }
        message.append(0x80)

        for blockStart in stride(from: 0, to: message.count, by: rate) {
            for i in 0..<(rate / 8) {
                let offset = blockStart + i * 8
                var lane: UInt64 = 0
                for j in 0..<8 {
                    lane |= UInt64(message[offset + j]) << (UInt64(j) * 8)
                }
                state[i] ^= lane
            }
            keccakF(&state)
        }

        var out: [UInt8] = []
        while out.count < 32 {
            for i in 0..<(rate / 8) {
                var lane = state[i]
                for _ in 0..<8 {
                    out.append(UInt8(lane & 0xFF))
                    lane >>= 8
                }
            }
            if out.count < 32 { keccakF(&state) }
        }
        return Array(out.prefix(32))
    }

    public static func hashHex(_ text: String) -> String {
        hash(Array(text.utf8)).map { String(format: "%02x", $0) }.joined()
    }

    private static func keccakF(_ state: inout [UInt64]) {
        var c = [UInt64](repeating: 0, count: 5)
        var d = [UInt64](repeating: 0, count: 5)
        var b = [UInt64](repeating: 0, count: 25)

        for round in 0..<24 {
            for x in 0..<5 {
                c[x] = state[x] ^ state[x + 5] ^ state[x + 10] ^ state[x + 15] ^ state[x + 20]
            }
            for x in 0..<5 {
                d[x] = c[(x + 4) % 5] ^ rotl(c[(x + 1) % 5], 1)
            }
            for x in 0..<5 {
                for y in 0..<5 {
                    state[x + 5 * y] ^= d[x]
                }
            }

            for x in 0..<5 {
                for y in 0..<5 {
                    b[y + 5 * ((2 * x + 3 * y) % 5)] = rotl(state[x + 5 * y], rotation[x][y])
                }
            }

            for x in 0..<5 {
                for y in 0..<5 {
                    state[x + 5 * y] = b[x + 5 * y] ^ ((~b[(x + 1) % 5 + 5 * y]) & b[(x + 2) % 5 + 5 * y])
                }
            }

            state[0] ^= roundConstants[round]
        }
    }

    private static func rotl(_ x: UInt64, _ n: Int) -> UInt64 {
        (x << UInt64(n)) | (x >> UInt64(64 - n))
    }
}