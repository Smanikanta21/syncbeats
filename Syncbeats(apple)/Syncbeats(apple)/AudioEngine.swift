import Foundation
import AVFoundation
import Combine

class AudioEngine: ObservableObject {
    static let shared = AudioEngine()
    
    private let engine = AVAudioEngine()
    private let playerNode = AVAudioPlayerNode()
    private let timePitchNode = AVAudioUnitTimePitch() // For adaptive sync playback rate
    // SWIFT CONCEPT: CPU Optimization
    // We removed `AVAudioEnvironmentNode` because spatial 3D audio processing is highly CPU intensive.
    // By connecting directly from `timePitchNode` to the `mainMixerNode`, we save battery and CPU cycles.
    
    @Published var isPlaying = false
    @Published var currentPosition: TimeInterval = 0
    
    private var audioFile: AVAudioFile?
    private var sampleRate: Double = 44100.0
    @Published var duration: TimeInterval = 0
    
    // Tracking manual seeks
    private var seekTime: TimeInterval = 0
    
    private init() {
        setupEngine()
    }
    
    private func setupEngine() {
        // Attach nodes
        engine.attach(playerNode)
        engine.attach(timePitchNode)
        
        // Connect nodes: Player -> TimePitch -> MainMixer
        let format = engine.outputNode.inputFormat(forBus: 0)
        engine.connect(playerNode, to: timePitchNode, format: format)
        engine.connect(timePitchNode, to: engine.mainMixerNode, format: format)
        
        
        do {
            try engine.start()
        } catch {
            print("AudioEngine failed to start: \(error)")
        }
        
        // Start a timer to publish current position for UI
        Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
            self?.updatePosition()
        }
    }
    
    func loadFile(url: URL) {
        do {
            let file = try AVAudioFile(forReading: url)
            self.audioFile = file
            self.sampleRate = file.processingFormat.sampleRate
            self.duration = Double(file.length) / self.sampleRate
            print("AudioEngine: Loaded file, duration \(self.duration)s")
            
            // SWIFT CONCEPT: Safe AVAudioEngine Mutation
            // It is very dangerous to disconnect nodes while the engine is actively rendering audio.
            // It can cause core audio to crash. We must stop the player and pause the engine first.
            playerNode.stop()
            engine.pause()
            
            // Reconnect with file format if needed, though usually standard
            engine.disconnectNodeInput(timePitchNode)
            engine.disconnectNodeInput(engine.mainMixerNode)
            
            engine.connect(playerNode, to: timePitchNode, format: file.processingFormat)
            engine.connect(timePitchNode, to: engine.mainMixerNode, format: engine.mainMixerNode.outputFormat(forBus: 0))
            
            try? engine.start()
            
        } catch {
            print("AudioEngine: Failed to load file: \(error)")
        }
    }
    
    func play(at positionMs: Double = 0) {
        guard let file = audioFile else { return }
        
        playerNode.stop()
        
        let startSample = AVAudioFramePosition(max(0, (positionMs / 1000.0) * sampleRate))
        let frameCount = AVAudioFrameCount(file.length - startSample)
        
        guard frameCount > 0 else { return }
        
        seekTime = positionMs / 1000.0
        
        playerNode.scheduleSegment(file, startingFrame: startSample, frameCount: frameCount, at: nil, completionHandler: nil)
        playerNode.play()
        isPlaying = true
    }
    
    func pause() {
        playerNode.pause()
        isPlaying = false
        updatePosition()
        
        // SWIFT CONCEPT: Position Tracking Fix
        // We previously set `seekTime = currentPosition` here. But AVAudioPlayerNode's `sampleTime` 
        // does NOT reset to 0 when paused; it just freezes. If we set `seekTime = currentPosition`, 
        // when we resume, the elapsed `sampleTime` would be added *again* to `seekTime`, causing 
        // the tracker to double-count elapsed time and skip forward visually! We removed it to fix the drift.
    }
    
    func seek(to positionMs: Double) {
        let wasPlaying = isPlaying
        play(at: positionMs)
        if !wasPlaying {
            pause()
        }
    }
    
    // For Adaptive Sync! 
    func setPlaybackRate(_ rate: Float) {
        // timePitchNode rate allows time stretching without pitch shifting
        timePitchNode.rate = rate
    }
    
    // Spatial Audio Control
    func setPan(pan: Float) {
        // SWIFT CONCEPT: Simplified Panning
        // Since we removed AVAudioEnvironmentNode for performance, we can just use 
        // the standard `AVAudioPlayerNode.pan` property for stereo panning (-1.0 to 1.0)
        playerNode.pan = pan
    }
    
    private func updatePosition() {
        guard isPlaying, let nodeTime = playerNode.lastRenderTime, let playerTime = playerNode.playerTime(forNodeTime: nodeTime) else {
            return
        }
        
        let newPosition = seekTime + (Double(playerTime.sampleTime) / playerTime.sampleRate)
        DispatchQueue.main.async {
            self.currentPosition = newPosition
        }
    }
}
