import AVFoundation
import AudioToolbox
import os

nonisolated struct NativeOutputChannels: Equatable {
    let id: String
    let count: Int
}

/// Duplicates stereo into the hardware channels of each output, with independent gain.
nonisolated final class NativeSpeakerMixer {
    private let node: AVAudioUnit
    private let outputs: [NativeOutputChannels]

    init(engine: AVAudioEngine, outputs: [NativeOutputChannels]) throws {
        let count = outputs.reduce(0) { $0 + $1.count }
        let hardware = engine.outputNode.outputFormat(forBus: 0)
        guard hardware.channelCount == count, hardware.sampleRate > 0,
              let stereo = AVAudioFormat(standardFormatWithSampleRate: hardware.sampleRate, channels: 2),
              let layout = AVAudioChannelLayout(layoutTag: kAudioChannelLayoutTag_DiscreteInOrder | UInt32(count)) else {
            throw AudioOutputFailure.unavailable
        }
        let format = AVAudioFormat(standardFormatWithSampleRate: hardware.sampleRate, channelLayout: layout)

        let description = AudioComponentDescription(
            componentType: kAudioUnitType_Mixer, componentSubType: kAudioUnitSubType_MatrixMixer,
            componentManufacturer: kAudioUnitManufacturer_Apple, componentFlags: 0, componentFlagsMask: 0
        )
        // The renderer calls this on its worker. The system's in-process mixer does not require UI.
        let result = OSAllocatedUnfairLock<AVAudioUnit?>(uncheckedState: nil)
        let ready = DispatchSemaphore(value: 0)
        AVAudioUnit.instantiate(with: description) { unit, _ in
            result.withLockUnchecked { $0 = unit }
            ready.signal()
        }
        guard ready.wait(timeout: .now() + .seconds(1)) == .success,
              let node = result.withLockUnchecked({ $0 }) else { throw AudioOutputFailure.unavailable }

        var one: UInt32 = 1
        for scope in [kAudioUnitScope_Input, kAudioUnitScope_Output] {
            try Self.check(AudioUnitSetProperty(node.audioUnit, kAudioUnitProperty_ElementCount, scope, 0, &one, 4))
        }
        self.node = node
        self.outputs = outputs
        engine.attach(node)
        engine.connect(engine.mainMixerNode, to: node, format: stereo)
        engine.connect(node, to: engine.outputNode, format: format)
    }

    func configure() throws {
        let unit = node.audioUnit
        for scope in [kAudioUnitScope_Input, kAudioUnitScope_Output] {
            try Self.check(AudioUnitSetParameter(unit, kMatrixMixerParam_Enable, scope, 0, 1, 0))
        }
        try Self.check(AudioUnitSetParameter(unit, kMatrixMixerParam_Volume, kAudioUnitScope_Global, .max, 1, 0))
        for input in 0..<2 {
            try Self.check(AudioUnitSetParameter(unit, kMatrixMixerParam_Volume, kAudioUnitScope_Input, UInt32(input), 1, 0))
        }

        var offset = 0
        for output in outputs {
            for channel in 0..<output.count {
                let destination = UInt32(offset + channel)
                // Mix both stereo channels into a mono accessory and preserve stereo on wider outputs.
                let gains: (Float, Float) = output.count == 1 ? (0.5, 0.5) : channel.isMultiple(of: 2) ? (1, 0) : (0, 1)
                try Self.check(AudioUnitSetParameter(unit, kMatrixMixerParam_Volume, kAudioUnitScope_Global, destination, gains.0, 0))
                try Self.check(AudioUnitSetParameter(unit, kMatrixMixerParam_Volume, kAudioUnitScope_Global, (1 << 16) | destination, gains.1, 0))
            }
            offset += output.count
        }
    }

    func setVolumes(_ volumes: [String: Double]) {
        let unit = node.audioUnit
        var offset = 0
        for output in outputs {
            let gain = Float((volumes[output.id] ?? 100) / 100)
            for channel in offset..<(offset + output.count) {
                AudioUnitSetParameter(unit, kMatrixMixerParam_Volume, kAudioUnitScope_Output, UInt32(channel), gain, 0)
            }
            offset += output.count
        }
    }

    private static func check(_ status: OSStatus) throws {
        guard status == noErr else { throw NSError(domain: NSOSStatusErrorDomain, code: Int(status)) }
    }
}
