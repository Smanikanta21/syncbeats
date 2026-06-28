import Foundation
#if canImport(UIKit)
import UIKit
#endif

/// Detects device type to adapt the in-app Dynamic Island shape
enum DeviceType {
    /// iPhone 14 Pro, 14 Pro Max, 15, 15 Plus, 15 Pro, 15 Pro Max, 16 series
    case dynamicIsland
    /// iPhone X, XS, XR, 11, 12, 13 series (notch)
    case notch
    /// iPhone SE, iPhone 8 and older (home button)
    case homeButton
}

struct DeviceHelper {
    
    /// Returns the current device type based on the device model identifier
    static var deviceType: DeviceType {
        #if targetEnvironment(simulator)
        // In simulator, check the SIMULATOR_MODEL_IDENTIFIER
        let identifier = ProcessInfo.processInfo.environment["SIMULATOR_MODEL_IDENTIFIER"] ?? modelIdentifier
        #else
        let identifier = modelIdentifier
        #endif
        return classifyDevice(identifier: identifier)
    }
    
    /// The raw model identifier (e.g. "iPhone16,1")
    static var modelIdentifier: String {
        #if canImport(UIKit)
        var systemInfo = utsname()
        uname(&systemInfo)
        let machineMirror = Mirror(reflecting: systemInfo.machine)
        let identifier = machineMirror.children.reduce("") { identifier, element in
            guard let value = element.value as? Int8, value != 0 else { return identifier }
            return identifier + String(UnicodeScalar(UInt8(value)))
        }
        return identifier
        #else
        return "Mac"
        #endif
    }
    
    /// Human-readable device name
    static var deviceName: String {
        let id = modelIdentifier
        #if targetEnvironment(simulator)
        let simId = ProcessInfo.processInfo.environment["SIMULATOR_MODEL_IDENTIFIER"] ?? id
        return deviceNameMap[simId] ?? simId
        #else
        return deviceNameMap[id] ?? id
        #endif
    }
    
    /// The safe area top inset (accounts for notch/island height)
    static var topSafeAreaInset: CGFloat {
        #if canImport(UIKit)
        if let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
           let window = windowScene.windows.first {
            return window.safeAreaInsets.top
        }
        #endif
        return 0
    }
    
    /// Whether the device has a hardware Dynamic Island
    static var hasDynamicIsland: Bool {
        return deviceType == .dynamicIsland
    }
    
    /// Whether the device has a notch
    static var hasNotch: Bool {
        return deviceType == .notch
    }
    
    // MARK: - Private
    
    private static func classifyDevice(identifier: String) -> DeviceType {
        // Dynamic Island devices (iPhone 14 Pro and later)
        let dynamicIslandModels = [
            "iPhone15,2", "iPhone15,3",  // 14 Pro, 14 Pro Max
            "iPhone15,4", "iPhone15,5",  // 15, 15 Plus
            "iPhone16,1", "iPhone16,2",  // 15 Pro, 15 Pro Max
            "iPhone17,1", "iPhone17,2",  // 16 Pro, 16 Pro Max
            "iPhone17,3", "iPhone17,4",  // 16, 16 Plus
            "iPhone17,5", "iPhone17,6",  // 16e variants
        ]
        
        if dynamicIslandModels.contains(identifier) {
            return .dynamicIsland
        }
        
        // Notch devices (iPhone X through iPhone 14/14 Plus)
        let notchModels = [
            "iPhone10,3", "iPhone10,6",  // X
            "iPhone11,2",                // XS
            "iPhone11,4", "iPhone11,6",  // XS Max
            "iPhone11,8",                // XR
            "iPhone12,1",                // 11
            "iPhone12,3",                // 11 Pro
            "iPhone12,5",                // 11 Pro Max
            "iPhone13,1",                // 12 mini
            "iPhone13,2",                // 12
            "iPhone13,3",                // 12 Pro
            "iPhone13,4",                // 12 Pro Max
            "iPhone14,4",                // 13 mini
            "iPhone14,5",                // 13
            "iPhone14,2",                // 13 Pro
            "iPhone14,3",                // 13 Pro Max
            "iPhone14,7",                // 14
            "iPhone14,8",                // 14 Plus
            "iPhone15,4", "iPhone15,5",  // Also check via safe area
        ]
        
        if notchModels.contains(identifier) {
            return .notch
        }
        
        // Fallback: use safe area inset to detect
        #if canImport(UIKit)
        let topInset = topSafeAreaInset
        if topInset >= 59 {
            return .dynamicIsland  // Dynamic Island devices have ~59pt top inset
        } else if topInset >= 44 {
            return .notch  // Notch devices have ~47-50pt top inset
        }
        #endif
        
        return .homeButton
    }
    
    private static let deviceNameMap: [String: String] = [
        "iPhone10,3": "iPhone X", "iPhone10,6": "iPhone X",
        "iPhone11,2": "iPhone XS",
        "iPhone11,4": "iPhone XS Max", "iPhone11,6": "iPhone XS Max",
        "iPhone11,8": "iPhone XR",
        "iPhone12,1": "iPhone 11",
        "iPhone12,3": "iPhone 11 Pro",
        "iPhone12,5": "iPhone 11 Pro Max",
        "iPhone13,1": "iPhone 12 mini",
        "iPhone13,2": "iPhone 12",
        "iPhone13,3": "iPhone 12 Pro",
        "iPhone13,4": "iPhone 12 Pro Max",
        "iPhone14,4": "iPhone 13 mini",
        "iPhone14,5": "iPhone 13",
        "iPhone14,2": "iPhone 13 Pro",
        "iPhone14,3": "iPhone 13 Pro Max",
        "iPhone14,7": "iPhone 14",
        "iPhone14,8": "iPhone 14 Plus",
        "iPhone15,2": "iPhone 14 Pro",
        "iPhone15,3": "iPhone 14 Pro Max",
        "iPhone15,4": "iPhone 15",
        "iPhone15,5": "iPhone 15 Plus",
        "iPhone16,1": "iPhone 15 Pro",
        "iPhone16,2": "iPhone 15 Pro Max",
        "iPhone17,1": "iPhone 16 Pro",
        "iPhone17,2": "iPhone 16 Pro Max",
        "iPhone17,3": "iPhone 16",
        "iPhone17,4": "iPhone 16 Plus",
    ]
}
