import Foundation
#if os(iOS)
import UIKit
#endif

/// Device identity is presentation only; all platforms share the same room protocol.
@MainActor enum NativeDevice {
    static var name: String {
        #if os(iOS)
        UIDevice.current.userInterfaceIdiom == .pad ? "iPad" : "iPhone"
        #else
        "Mac"
        #endif
    }
    static var symbol: String {
        #if os(iOS)
        UIDevice.current.userInterfaceIdiom == .pad ? "ipad" : "iphone"
        #else
        "macbook.gen2"
        #endif
    }
    static var type: String {
        #if os(iOS)
        UIDevice.current.userInterfaceIdiom == .pad ? "tablet" : "mobile"
        #else
        "laptop"
        #endif
    }
    static var thisDevice: String { "this \(name)" }
}
