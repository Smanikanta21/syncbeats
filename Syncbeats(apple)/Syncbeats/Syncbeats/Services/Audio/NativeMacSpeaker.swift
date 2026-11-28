#if os(macOS)
import AVFoundation
import CoreAudio

/// Each output keeps its own HAL endpoint. All control work runs on the renderer's serial queue.
nonisolated final class NativeMacSpeaker {
    let device: MacAudioOutputs.Device
    private let engine = AVAudioEngine()
    private let player = AVAudioPlayerNode()
    let equalizer = AVAudioUnitEQ(numberOfBands: NativeEqualizer.frequencies.count)
    private var file: AVAudioFile?

    init(device: MacAudioOutputs.Device) throws {
        self.device = device
        try Self.engine(engine, select: device.id)
        engine.attach(player)
        engine.attach(equalizer)
    }

    static func engine(_ engine: AVAudioEngine, select device: AudioDeviceID) throws {
        try engine.outputNode.auAudioUnit.setDeviceID(device)
    }

    func load(_ url: URL) throws {
        // AVAudioFile tracks its own decode position. Give each graph its own handle.
        let file = try AVAudioFile(forReading: url)
        engine.disconnectNodeOutput(player)
        engine.disconnectNodeOutput(equalizer)
        engine.connect(player, to: equalizer, format: file.processingFormat)
        engine.connect(equalizer, to: engine.mainMixerNode, format: file.processingFormat)
        self.file = file
    }

    func start() throws {
        guard file != nil else { throw AudioOutputFailure.unavailable }
        if !engine.isRunning { try engine.start() }
    }

    var latency: Double { engine.outputNode.presentationLatency }

    func schedule(frame: AVAudioFramePosition, count: AVAudioFrameCount, hostTime: UInt64) {
        guard let file, count > 0 else { return }
        player.scheduleSegment(file, startingFrame: frame, frameCount: count, at: nil, completionHandler: nil)
        player.play(at: AVAudioTime(hostTime: hostTime))
    }

    func volume(_ gain: Float) { engine.mainMixerNode.outputVolume = gain }
    func fade(_ gain: Float) { player.volume = gain }
    func stopPlayer() { player.stop() }
    func pause() { player.stop(); engine.pause() }
    func reset() { player.stop(); engine.stop(); file = nil }
}
#endif
