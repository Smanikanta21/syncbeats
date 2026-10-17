import Foundation
import CoreAudio
import Combine
import os

#if !os(macOS)
public typealias AudioDeviceID = UInt32
#endif

/// Represents a physical audio output device connected to the Mac.
public struct AudioDevice: Identifiable, Equatable {
    public let id: AudioDeviceID
    public let name: String
    public let isDefault: Bool
}

/// Discovers and monitors connected audio devices using macOS CoreAudio.
@MainActor
public final class DeviceManager: ObservableObject {
    public static let shared = DeviceManager()
    
    @Published public private(set) var outputDevices: [AudioDevice] = []
    
    /// Dictionary mapping active AudioDeviceIDs to their measured latency offset (in ms).
    @Published public var activeSecondaryDevices: [AudioDeviceID: Double] = [:]
    
    /// Triggered when a new device is connected.
    @Published public var newlyConnectedDevice: AudioDevice?
    
    private let logger = Logger(subsystem: "com.syncbeats.mac", category: "DeviceManager")
    
    private init() {
        #if os(macOS)
        refreshDevices()
        setupListeners()
        #endif
    }
    
    #if os(macOS)
    /// Re-scans the system for all connected output devices.
    private func refreshDevices() {
        var propertyAddress = AudioObjectPropertyAddress(
            mSelector: kAudioHardwarePropertyDevices,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        
        var dataSize: UInt32 = 0
        let status = AudioObjectGetPropertyDataSize(AudioObjectID(kAudioObjectSystemObject), &propertyAddress, 0, nil, &dataSize)
        
        guard status == noErr else {
            logger.error("Failed to get device list size: \(status)")
            return
        }
        
        let deviceCount = Int(dataSize) / MemoryLayout<AudioDeviceID>.size
        var deviceIDs = [AudioDeviceID](repeating: 0, count: deviceCount)
        
        AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &propertyAddress, 0, nil, &dataSize, &deviceIDs)
        
        let defaultOutputID = getDefaultOutputDeviceID()
        var newDevices: [AudioDevice] = []
        
        for id in deviceIDs {
            if isOutputDevice(id: id) {
                let name = getDeviceName(id: id)
                guard !name.hasPrefix("CADefaultDeviceAggregate") else { continue }
                
                let isDef = (id == defaultOutputID)
                let device = AudioDevice(id: id, name: name, isDefault: isDef)
                newDevices.append(device)
            }
        }
        
        // Log changes for telemetry and remap active devices
        let oldNames = Set(outputDevices.map { $0.name })
        let newNames = Set(newDevices.map { $0.name })
        
        var connectedDevice: AudioDevice? = nil
        var newActiveSecondaryDevices = activeSecondaryDevices
        
        for oldDev in outputDevices {
            if !newDevices.contains(where: { $0.id == oldDev.id }) {
                // Device removed
                logger.warning("📡 [TELEMETRY] Audio Output Device Disconnected: \(oldDev.name)")
                
                if let latency = activeSecondaryDevices[oldDev.id] {
                    if let newDev = newDevices.first(where: { potentialNewDev in 
                        potentialNewDev.name == oldDev.name && !outputDevices.contains(where: { old in old.id == potentialNewDev.id }) 
                    }) {
                        newActiveSecondaryDevices.removeValue(forKey: oldDev.id)
                        newActiveSecondaryDevices[newDev.id] = latency
                        logger.info("📡 [TELEMETRY] Remapped active device \(newDev.name) to new ID \(newDev.id)")
                    } else {
                        // Gone completely. Remove from active devices so playback stops routing to dead ID.
                        // We could save its latency in UserDefaults by name if we want it to resume hours later,
                        // but for now, dropping it from active prevents ghost playback engines.
                        newActiveSecondaryDevices.removeValue(forKey: oldDev.id)
                    }
                }
            }
        }
        
        for added in newNames.subtracting(oldNames) {
            logger.info("📡 [TELEMETRY] New Audio Output Device Connected: \(added)")
            if let dev = newDevices.first(where: { $0.name == added }), !outputDevices.isEmpty {
                connectedDevice = dev
                
                // If this device was previously active before the app crashed or during a long disconnect, 
                // we could also restore it here if we saved it to UserDefaults!
            }
        }
        
        self.outputDevices = newDevices
        self.activeSecondaryDevices = newActiveSecondaryDevices
        if let dev = connectedDevice {
            self.newlyConnectedDevice = dev
        }
    }
    
    private func setupListeners() {
        var propertyAddress = AudioObjectPropertyAddress(
            mSelector: kAudioHardwarePropertyDevices,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        
        let selfPointer = Unmanaged.passUnretained(self).toOpaque()
        
        // Listen for hardware topology changes (e.g. plugging in headphones, connecting Bluetooth speaker)
        AudioObjectAddPropertyListener(AudioObjectID(kAudioObjectSystemObject), &propertyAddress, { (objectID, numberAddresses, addresses, clientData) -> OSStatus in
            guard let clientData = clientData else { return noErr }
            let manager = Unmanaged<DeviceManager>.fromOpaque(clientData).takeUnretainedValue()
            Task { @MainActor in
                manager.refreshDevices()
            }
            return noErr
        }, selfPointer)
    }
    
    // MARK: - CoreAudio Helpers
    
    private func isOutputDevice(id: AudioDeviceID) -> Bool {
        var propertyAddress = AudioObjectPropertyAddress(
            mSelector: kAudioDevicePropertyStreams,
            mScope: kAudioDevicePropertyScopeOutput,
            mElement: kAudioObjectPropertyElementMain
        )
        var dataSize: UInt32 = 0
        let status = AudioObjectGetPropertyDataSize(id, &propertyAddress, 0, nil, &dataSize)
        return status == noErr && dataSize > 0
    }
    
    private func getDeviceName(id: AudioDeviceID) -> String {
        var propertyAddress = AudioObjectPropertyAddress(
            mSelector: kAudioDevicePropertyDeviceNameCFString,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        var name: CFString = "" as CFString
        var dataSize = UInt32(MemoryLayout<CFString>.size)
        
        if AudioObjectGetPropertyData(id, &propertyAddress, 0, nil, &dataSize, &name) == noErr {
            return name as String
        }
        return "Unknown Device"
    }
    public func getBuiltInSpeakerID() -> AudioDeviceID? {
        // macOS Built-in speakers are typically named "MacBook Pro Speakers" or "Built-in Output"
        return outputDevices.first(where: { $0.name.contains("Speaker") || $0.name.contains("Built-in") })?.id
    }
    
    public func getDefaultOutputDeviceID() -> AudioDeviceID {
        var propertyAddress = AudioObjectPropertyAddress(
            mSelector: kAudioHardwarePropertyDefaultOutputDevice,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        var deviceID: AudioDeviceID = 0
        var dataSize = UInt32(MemoryLayout<AudioDeviceID>.size)
        AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &propertyAddress, 0, nil, &dataSize, &deviceID)
        return deviceID
    }
    
    /// Queries CoreAudio for the total hardware latency of a device in milliseconds.
    /// This includes Bluetooth codec/transmission latency reported by the driver.
    public func getDeviceLatencyMs(id: AudioDeviceID) -> Double {
        // 1. Device-level latency (frames)
        var latencyAddr = AudioObjectPropertyAddress(
            mSelector: kAudioDevicePropertyLatency,
            mScope: kAudioDevicePropertyScopeOutput,
            mElement: kAudioObjectPropertyElementMain
        )
        var deviceLatency: UInt32 = 0
        var size = UInt32(MemoryLayout<UInt32>.size)
        AudioObjectGetPropertyData(id, &latencyAddr, 0, nil, &size, &deviceLatency)
        
        // 2. Safety offset (frames)
        var safetyAddr = AudioObjectPropertyAddress(
            mSelector: kAudioDevicePropertySafetyOffset,
            mScope: kAudioDevicePropertyScopeOutput,
            mElement: kAudioObjectPropertyElementMain
        )
        var safetyOffset: UInt32 = 0
        size = UInt32(MemoryLayout<UInt32>.size)
        AudioObjectGetPropertyData(id, &safetyAddr, 0, nil, &size, &safetyOffset)
        
        // 3. Stream latency (frames) — first output stream
        var streamAddr = AudioObjectPropertyAddress(
            mSelector: kAudioDevicePropertyStreams,
            mScope: kAudioDevicePropertyScopeOutput,
            mElement: kAudioObjectPropertyElementMain
        )
        var streamDataSize: UInt32 = 0
        var streamLatency: UInt32 = 0
        if AudioObjectGetPropertyDataSize(id, &streamAddr, 0, nil, &streamDataSize) == noErr, streamDataSize > 0 {
            let streamCount = Int(streamDataSize) / MemoryLayout<AudioStreamID>.size
            var streamIDs = [AudioStreamID](repeating: 0, count: streamCount)
            AudioObjectGetPropertyData(id, &streamAddr, 0, nil, &streamDataSize, &streamIDs)
            
            if let firstStream = streamIDs.first {
                var sLatencyAddr = AudioObjectPropertyAddress(
                    mSelector: kAudioStreamPropertyLatency,
                    mScope: kAudioObjectPropertyScopeGlobal,
                    mElement: kAudioObjectPropertyElementMain
                )
                size = UInt32(MemoryLayout<UInt32>.size)
                AudioObjectGetPropertyData(firstStream, &sLatencyAddr, 0, nil, &size, &streamLatency)
            }
        }
        
        // 4. Get nominal sample rate to convert frames → ms
        var rateAddr = AudioObjectPropertyAddress(
            mSelector: kAudioDevicePropertyNominalSampleRate,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        var sampleRate: Float64 = 44100.0
        size = UInt32(MemoryLayout<Float64>.size)
        AudioObjectGetPropertyData(id, &rateAddr, 0, nil, &size, &sampleRate)
        
        let totalFrames = Double(deviceLatency + safetyOffset + streamLatency)
        let latencyMs = (totalFrames / sampleRate) * 1000.0
        
        logger.info("📡 [TELEMETRY] Device \(id) latency breakdown: device=\(deviceLatency)f safety=\(safetyOffset)f stream=\(streamLatency)f total=\(latencyMs)ms @ \(sampleRate)Hz")
        
        return latencyMs
    }
    #endif
}
