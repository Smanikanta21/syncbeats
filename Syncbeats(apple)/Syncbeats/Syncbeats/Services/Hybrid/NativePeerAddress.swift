import Foundation
import Network
import Darwin

/// Bonjour TXT carries local numeric addresses as a fast path around DNS delays.
/// TLS and the room roster still authenticate the peer; TXT is never trusted identity.
nonisolated enum NativePeerAddress {
    static func isLocalIPv4(_ address: String) -> Bool {
        guard let ip = IPv4Address(address) else { return false }
        let bytes = Array(ip.rawValue)
        return bytes[0] == 127 || bytes[0] == 10 || (bytes[0] == 172 && (16...31).contains(bytes[1])) ||
            (bytes[0] == 192 && bytes[1] == 168) || (bytes[0] == 169 && bytes[1] == 254)
    }
    static func localIPv4() -> [String] {
        var first: UnsafeMutablePointer<ifaddrs>?
        guard getifaddrs(&first) == 0 else { return [] }
        defer { freeifaddrs(first) }
        var results: [String] = []
        var cursor = first
        while let entry = cursor {
            defer { cursor = entry.pointee.ifa_next }
            guard let address = entry.pointee.ifa_addr, Int32(address.pointee.sa_family) == AF_INET,
                  entry.pointee.ifa_flags & UInt32(IFF_UP) != 0 else { continue }
            let name = String(cString: entry.pointee.ifa_name)
            guard name.hasPrefix("en") || name.hasPrefix("bridge") else { continue }
            var host = [CChar](repeating: 0, count: Int(NI_MAXHOST))
            guard getnameinfo(address, socklen_t(address.pointee.sa_len), &host, socklen_t(host.count), nil, 0, NI_NUMERICHOST) == 0 else { continue }
            let value = String(cString: host)
            if isLocalIPv4(value), !results.contains(value) { results.append(value) }
        }
        return Array(results.sorted { !$0.hasPrefix("169.254.") && $1.hasPrefix("169.254.") }.prefix(4))
    }
    static func endpoints(_ metadata: NWBrowser.Result.Metadata) -> [NWEndpoint] {
        guard case .bonjour(let txt) = metadata,
              case .string(let value) = txt.getEntry(for: "port"), let raw = UInt16(value), raw > 0,
              case .string(let addresses) = txt.getEntry(for: "ipv4"), addresses.count <= 128,
              let port = NWEndpoint.Port(rawValue: raw) else { return [] }
        return addresses.split(separator: ",").prefix(4).compactMap { address in
            let address = String(address)
            guard isLocalIPv4(address) else { return nil }
            return .hostPort(host: NWEndpoint.Host(address), port: port)
        }
    }
}
