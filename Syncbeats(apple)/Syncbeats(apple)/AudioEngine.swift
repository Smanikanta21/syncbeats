import Foundation
import AVFoundation
import Combine

class AudioEngine: ObservableObject {
    static let shared = AudioEngine()
    
    private let engine = AVAudioEngine()
    private let playerNode = AVAudioPlayerNode()
    private let timePitchNode = AVAudioUnitTimePitch() // For adaptive sync playback rate
    private let environmentNode = AVAudioEnvironmentNode() // For spatial audio
    
    @Published var isPlaying = false
    @Published var currentPosition: TimeInterval = 0
    
    private var audioFile: AVAudioFile?
    private var sampleRate: Double = 44100.0
    private var duration: TimeInterval = 0
    
    // Tracking manual seeks
    private var seekTime: TimeInterval = 0
    
    private init() {
        setupEngine()
    }
    
    private func setupEngine() {
        // Attach nodes
        engine.attach(playerNode)
        engine.attach(timePitchNode)
        engine.attach(environmentNode)
        
        // Setup Spatial Environment
        environmentNode.listenerPosition = AVAudio3DPoint(x: 0, y: 0, z: 0)
        environmentNode.listenerAngularOrientation = AVAudio3DAngularOrientation(yaw: 0, pitch: 0, roll: 0)
        
        // Connect nodes: Player -> TimePitch -> Environment -> MainMixer
        let format = engine.outputNode.inputFormat(forBus: 0)
        engine.connect(playerNode, to: timePitchNode, format: format)
        engine.connect(timePitchNode, to: environmentNode, format: format)
        engine.connect(environmentNode, to: engine.mainMixerNode, format: format)
        
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
            
            // Reconnect with file format if needed, though usually standard
            engine.disconnectNodeInput(timePitchNode)
            engine.disconnectNodeInput(environmentNode)
            engine.disconnectNodeInput(engine.mainMixerNode)
            
            engine.connect(playerNode, to: timePitchNode, format: file.processingFormat)
            engine.connect(timePitchNode, to: environmentNode, format: file.processingFormat)
            engine.connect(environmentNode, to: engine.mainMixerNode, format: engine.mainMixerNode.outputFormat(forBus: 0))
            
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
        seekTime = currentPosition // Save current position for resume
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
        // Simple 1D panning on X axis for spatial audio (-1.0 to 1.0)
        playerNode.position = AVAudio3DPoint(x: pan * 5.0, y: 0, z: -1.0)
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
