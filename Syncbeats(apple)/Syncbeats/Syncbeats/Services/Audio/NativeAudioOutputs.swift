import AVFoundation
import Foundation
#if os(macOS)
import CoreAudio
import IOKit.audio
#endif

nonisolated struct LocalAudioOutput: Identifiable, Equatable, Sendable {
    let id: String
    let output: RoomAudioOutput
    var canSelect = false
    var canSetVolume = false
}

#if os(macOS)
/// All HAL queries and route changes run on the audio renderer's serial queue.
nonisolated final class MacAudioOutputs {
    struct Device: Equatable {
        let id: AudioDeviceID
        let uid: String
        let name: String
        let kind: RoomAudioOutput.Kind
        let canSelect: Bool
        let channelCount: Int

        var volumeChannels: NativeOutputChannels? {
            kind == .builtIn ? nil : .init(id: uid, count: channelCount)
        }
    }

    private static let system = AudioObjectID(kAudioObjectSystemObject)
    private let listeners = [kAudioHardwarePropertyDevices, kAudioHardwarePropertyDefaultOutputDevice]
    private let queue: DispatchQueue
    private let listener: AudioObjectPropertyListenerBlock
    private var observedPorts: Set<AudioDeviceID> = []
    private let portSelectors = [kAudioDevicePropertyDataSource, kAudioDevicePropertyJackIsConnected,
                                 kAudioDevicePropertyStreams, kAudioDevicePropertyStreamConfiguration]
    private var boundOutputs: [Device] = []
    private(set) var selection: [String] = []
    private(set) var boundDevice: AudioDeviceID?
    private(set) var boundMembers: [AudioDeviceID] = []

    init(queue: DispatchQueue, onChange: @escaping @Sendable () -> Void) {
        self.queue = queue
        listener = { _, _ in onChange() }
        for selector in listeners {
            var address = Self.address(selector)
            AudioObjectAddPropertyListenerBlock(Self.system, &address, queue, listener)
        }
    }

    deinit {
        for id in observedPorts { observePort(id, add: false) }
        for selector in listeners {
            var address = Self.address(selector)
            AudioObjectRemovePropertyListenerBlock(Self.system, &address, queue, listener)
        }
    }

    var defaultDevice: AudioDeviceID {
        Self.number(Self.system, kAudioHardwarePropertyDefaultOutputDevice)
    }

    func devices() -> [Device] {
        let defaultID = defaultDevice
        let ids = Self.deviceIDs(Self.system, kAudioHardwarePropertyDevices)
        var ports: Set<AudioDeviceID> = []
        let devices: [Device] = ids.compactMap { id in
            let transport = Self.number(id, kAudioDevicePropertyTransportType)
            if transport == kAudioDeviceTransportTypeBuiltIn { ports.insert(id) }
            let channelCount = Self.outputChannelCount(id)
            guard channelCount > 0,
                  Self.number(id, kAudioDevicePropertyDeviceIsAlive) != 0,
                  let uid = Self.string(id, kAudioDevicePropertyDeviceUID),
                  let name = Self.string(id, kAudioObjectPropertyName) else { return nil }
            let kind: RoomAudioOutput.Kind
            switch transport {
            case kAudioDeviceTransportTypeBuiltIn:
                let scope = kAudioObjectPropertyScopeOutput
                let sources = Self.deviceIDs(id, kAudioDevicePropertyDataSource, scope: scope)
                let terminals = Self.deviceIDs(id, kAudioDevicePropertyStreams, scope: scope)
                    .map { Self.number($0, kAudioStreamPropertyTerminalType) }
                let jackConnected = Self.number(id, kAudioDevicePropertyJackIsConnected, scope: scope) != 0
                kind = Self.builtInOutputKind(sources: sources, terminals: terminals, jackConnected: jackConnected)
            case kAudioDeviceTransportTypeBluetooth, kAudioDeviceTransportTypeBluetoothLE: kind = .bluetooth
            case kAudioDeviceTransportTypeUSB, kAudioDeviceTransportTypeHDMI, kAudioDeviceTransportTypeDisplayPort,
                 kAudioDeviceTransportTypeThunderbolt: kind = .wired
            case kAudioDeviceTransportTypeAirPlay: kind = .airPlay
            default: kind = .other
            }
            let canSelect = transport != kAudioDeviceTransportTypeAggregate && kind != .airPlay
            guard canSelect || id == defaultID else { return nil }
            return Device(id: id, uid: uid, name: name, kind: kind, canSelect: canSelect, channelCount: channelCount)
        }.sorted {
            if ($0.kind == .builtIn) != ($1.kind == .builtIn) { return $0.kind == .builtIn }
            return $0.name == $1.name ? $0.uid < $1.uid : $0.name.localizedStandardCompare($1.name) == .orderedAscending
        }
        for id in observedPorts.subtracting(ports) { observePort(id, add: false) }
        for id in ports.subtracting(observedPorts) { observePort(id, add: true) }
        observedPorts = ports
        return devices
    }

    static func builtInOutputKind(sources: [UInt32], terminals: [UInt32], jackConnected: Bool) -> RoomAudioOutput.Kind {
        if sources.contains(UInt32(kIOAudioOutputPortSubTypeHeadphones)) ||
            sources.contains(UInt32(kIOAudioOutputPortSubTypeLine)) { return .wired }
        if sources.contains(UInt32(kIOAudioOutputPortSubTypeInternalSpeaker)) { return .builtIn }
        if terminals.contains(kAudioStreamTerminalTypeHeadphones) ||
            terminals.contains(kAudioStreamTerminalTypeLine) || jackConnected { return .wired }
        return .builtIn
    }

    private func observePort(_ id: AudioDeviceID, add: Bool) {
        for selector in portSelectors {
            var address = Self.address(selector, kAudioObjectPropertyScopeOutput)
            if add {
                guard AudioObjectHasProperty(id, &address) else { continue }
                AudioObjectAddPropertyListenerBlock(id, &address, queue, listener)
            } else {
                AudioObjectRemovePropertyListenerBlock(id, &address, queue, listener)
            }
        }
    }

    func outputs(_ devices: [Device]) -> [LocalAudioOutput] {
        let defaultID = defaultDevice
        let defaultMembers = Self.deviceIDs(defaultID, kAudioAggregateDevicePropertyActiveSubDeviceList)
        return devices.filter { $0.id != defaultID || defaultMembers.isEmpty }.map { device in
            let selected = selection.isEmpty ? device.id == defaultID || defaultMembers.contains(device.id)
                : boundMembers.contains(device.id)
            return LocalAudioOutput(id: device.uid, output: .init(name: device.name, type: device.kind, selected: selected),
                                    canSelect: device.canSelect,
                                    canSetVolume: device.kind != .builtIn && (device.canSelect || device.id == defaultID))
        }
    }

    func select(_ requested: [String], from devices: [Device],
                bind: ([Device], NativeOutputChannels?) throws -> Void) throws {
        let members = devices.filter { $0.canSelect && requested.contains($0.uid) }
        let ids = members.map(\.id)
        let defaultID = defaultDevice
        let fallback = devices.first { $0.id == defaultID }
        let outputs = members.isEmpty ? fallback.map { [$0] } ?? [] : members
        if ids == boundMembers && boundDevice == (ids.first ?? defaultID) && outputs == boundOutputs { return }

        let channels = fallback.flatMap { $0.canSelect || $0.kind == .airPlay ? $0.volumeChannels : nil }
        try bind(members, channels)
        boundDevice = ids.first ?? defaultID
        boundMembers = ids
        boundOutputs = outputs
        selection = members.map(\.uid)
    }

    private static func address(_ selector: AudioObjectPropertySelector, _ scope: AudioObjectPropertyScope = kAudioObjectPropertyScopeGlobal) -> AudioObjectPropertyAddress {
        .init(mSelector: selector, mScope: scope, mElement: kAudioObjectPropertyElementMain)
    }

    private static func deviceIDs(_ id: AudioObjectID, _ selector: AudioObjectPropertySelector,
                                  scope: AudioObjectPropertyScope = kAudioObjectPropertyScopeGlobal) -> [AudioObjectID] {
        var address = address(selector, scope)
        var size: UInt32 = 0
        guard AudioObjectHasProperty(id, &address),
              AudioObjectGetPropertyDataSize(id, &address, 0, nil, &size) == noErr, size > 0 else { return [] }
        var ids = [AudioObjectID](repeating: 0, count: Int(size) / MemoryLayout<AudioObjectID>.stride)
        guard !ids.isEmpty else { return [] }
        let status = ids.withUnsafeMutableBytes {
            AudioObjectGetPropertyData(id, &address, 0, nil, &size, $0.baseAddress!)
        }
        return status == noErr ? Array(ids.prefix(Int(size) / MemoryLayout<AudioObjectID>.stride)) : []
    }

    private static func outputChannelCount(_ id: AudioDeviceID) -> Int {
        var address = address(kAudioDevicePropertyStreamConfiguration, kAudioDevicePropertyScopeOutput)
        var size: UInt32 = 0
        guard AudioObjectGetPropertyDataSize(id, &address, 0, nil, &size) == noErr, size > 0 else { return 0 }
        let buffer = UnsafeMutableRawPointer.allocate(byteCount: Int(size), alignment: MemoryLayout<AudioBufferList>.alignment)
        defer { buffer.deallocate() }
        guard AudioObjectGetPropertyData(id, &address, 0, nil, &size, buffer) == noErr else { return 0 }
        return UnsafeMutableAudioBufferListPointer(buffer.assumingMemoryBound(to: AudioBufferList.self))
            .reduce(0) { $0 + Int($1.mNumberChannels) }
    }

    private static func string(_ id: AudioObjectID, _ selector: AudioObjectPropertySelector) -> String? {
        var address = address(selector)
        var value: Unmanaged<CFString>?
        var size = UInt32(MemoryLayout.size(ofValue: value))
        guard AudioObjectGetPropertyData(id, &address, 0, nil, &size, &value) == noErr else { return nil }
        return value.map { $0.takeRetainedValue() as String }
    }

    private static func number(_ id: AudioObjectID, _ selector: AudioObjectPropertySelector,
                               scope: AudioObjectPropertyScope = kAudioObjectPropertyScopeGlobal) -> UInt32 {
        var address = address(selector, scope)
        guard AudioObjectHasProperty(id, &address) else { return 0 }
        var value: UInt32 = 0
        var size = UInt32(MemoryLayout.size(ofValue: value))
        AudioObjectGetPropertyData(id, &address, 0, nil, &size, &value)
        return value
    }

}
#endif

#if os(iOS)
nonisolated enum MobileAudioOutputs {
    static func current() -> [LocalAudioOutput] {
        AVAudioSession.sharedInstance().currentRoute.outputs.map { port in
            let kind: RoomAudioOutput.Kind
            switch port.portType {
            case .builtInSpeaker, .builtInReceiver: kind = .builtIn
            case .bluetoothA2DP, .bluetoothHFP, .bluetoothLE: kind = .bluetooth
            case .airPlay: kind = .airPlay
            case .headphones, .usbAudio, .lineOut, .HDMI: kind = .wired
            default: kind = .other
            }
            return LocalAudioOutput(id: port.uid, output: .init(name: port.portName, type: kind, selected: true),
                                    canSetVolume: kind != .builtIn)
        }
    }

    static func channels() -> [NativeOutputChannels] {
        AVAudioSession.sharedInstance().currentRoute.outputs.map {
            .init(id: $0.uid, count: $0.channels?.count ?? 0)
        }
    }
}
#endif

nonisolated enum AudioOutputFailure: Error {
    case unavailable
}
