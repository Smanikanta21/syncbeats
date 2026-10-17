import Foundation
import AVFoundation
import os
import QuartzCore

@MainActor
final class CalibrationService {
    static let shared = CalibrationService()
    private let logger = Logger(subsystem: "com.syncbeats.mac", category: "CalibrationService")
    
    private init() {}
    
    /// Instantly returns CoreAudio's internal hardware estimate (no mic required).
    /// Used as the immediate baseline when a speaker is toggled on.
    func estimateCoreAudioLatency(deviceId: AudioDeviceID) -> Double {
        #if os(macOS)
        let hardwareLatency = DeviceManager.shared.getDeviceLatencyMs(id: deviceId)
        let builtInLatency: Double
        if let builtInId = DeviceManager.shared.getBuiltInSpeakerID() {
            builtInLatency = DeviceManager.shared.getDeviceLatencyMs(id: builtInId)
        } else {
            builtInLatency = 0
        }
        let differentialLatency = hardwareLatency - builtInLatency
        logger.info("📡 [TELEMETRY] CoreAudio Estimate: BT=\(hardwareLatency)ms, BuiltIn=\(builtInLatency)ms, Diff=\(differentialLatency)ms")
        return differentialLatency
        #else
        return 0.0
        #endif
    }
    
    /// Requests microphone permission and begins a silent acoustic calibration sequence
    /// to determine the true hardware latency offset for a newly connected Bluetooth speaker.
    func calibrate(deviceId: AudioDeviceID) async throws -> Double {
        #if os(macOS)
        let granted = await AVCaptureDevice.requestAccess(for: .audio)
        guard granted else {
            throw NSError(domain: "CalibrationService", code: 1, userInfo: [
                NSLocalizedDescriptionKey: "Microphone permission is required to auto-calibrate speaker latency."
            ])
        }
        
        logger.info("📡 [TELEMETRY] Mic access granted. Starting real-time acoustic calibration...")
        
        return try await withCheckedThrowingContinuation { continuation in
            Task {
                do {
                    let latency = try await performAcousticCalibration(deviceId: deviceId)
                    continuation.resume(returning: latency)
                } catch {
                    continuation.resume(throwing: error)
                }
            }
        }
        #else
        return 0.0
        #endif
    }
    
    #if os(macOS)
    private func performAcousticCalibration(deviceId: AudioDeviceID) async throws -> Double {
        // ENGINE 1: Output Engine (Plays the click on the Bluetooth Speaker)
        let outputEngine = AVAudioEngine()
        let player = AVAudioPlayerNode()
        outputEngine.attach(player)
        outputEngine.connect(player, to: outputEngine.mainMixerNode, format: nil)
        
        if let outputUnit = outputEngine.outputNode.audioUnit {
            var targetId = deviceId
            AudioUnitSetProperty(
                outputUnit,
                kAudioOutputUnitProperty_CurrentDevice,
                kAudioUnitScope_Global,
                0,
                &targetId,
                UInt32(MemoryLayout<AudioDeviceID>.size)
            )
        }
        
        // ENGINE 2: Input Engine (Records from the Mac Microphone exclusively)
        let inputEngine = AVAudioEngine()
        let inputFormat = inputEngine.inputNode.inputFormat(forBus: 0)
        let outputFormat = outputEngine.outputNode.outputFormat(forBus: 0)
        
        // Create a tiny 5ms click (less obnoxious than a beep)
        let frameCount = AVAudioFrameCount(outputFormat.sampleRate * 0.005)
        guard let clickBuffer = AVAudioPCMBuffer(pcmFormat: outputFormat, frameCapacity: frameCount) else {
            throw NSError(domain: "Calibration", code: 2, userInfo: [NSLocalizedDescriptionKey: "Failed to create audio buffer"])
        }
        clickBuffer.frameLength = frameCount
        
        // Fill with a sharp impulse (white noise burst or a single high frequency burst)
        for frame in 0..<Int(frameCount) {
            let value = Float.random(in: -1.0...1.0)
            for channel in 0..<Int(outputFormat.channelCount) {
                clickBuffer.floatChannelData?[channel][frame] = value
            }
        }
        
        class CalibrationState {
            var isCalibrating = false
            var startTime: CFTimeInterval = 0
            var detectedLatency: Double? = nil
            var ambientLevels: [Float] = []
            var ambientThreshold: Float = 0.0
            let lock = NSLock()
        }
        
        let state = CalibrationState()
        
        // High-speed tap on the microphone
        inputEngine.inputNode.installTap(onBus: 0, bufferSize: 512, format: inputFormat) { buffer, time in
            guard let channelData = buffer.floatChannelData?[0] else { return }
            let frameLength = Int(buffer.frameLength)
            
            var rms: Float = 0.0
            for i in 0..<frameLength {
                let sample = channelData[i]
                rms += sample * sample
            }
            rms = sqrt(rms / Float(frameLength))
            
            state.lock.lock()
            defer { state.lock.unlock() }
            
            if !state.isCalibrating {
                state.ambientLevels.append(rms)
                if state.ambientLevels.count > 10 { state.ambientLevels.removeFirst() }
            } else if state.detectedLatency == nil {
                if rms > state.ambientThreshold {
                    let endTime = CACurrentMediaTime()
                    state.detectedLatency = (endTime - state.startTime) * 1000.0
                }
            }
        }
        
        inputEngine.prepare()
        outputEngine.prepare()
        try inputEngine.start()
        try outputEngine.start()
        
        // 1. Profile room ambiance for 300ms
        try await Task.sleep(nanoseconds: 300_000_000)
        
        state.lock.lock()
        let avgAmbient = state.ambientLevels.reduce(0, +) / Float(max(1, state.ambientLevels.count))
        state.ambientThreshold = max(avgAmbient * 4.0, avgAmbient + 0.02)
        state.isCalibrating = true
        state.startTime = CACurrentMediaTime()
        state.lock.unlock()
        
        // 2. Fire the tiny click
        player.scheduleBuffer(clickBuffer, at: nil, options: .interrupts, completionHandler: nil)
        player.play()
        
        self.logger.info("📡 [TELEMETRY] Acoustic click fired. Awaiting mic spike (threshold: \(state.ambientThreshold))...")
        
        // 3. Wait up to 1 second
        let timeoutStart = CACurrentMediaTime()
        while CACurrentMediaTime() - timeoutStart < 1.0 {
            state.lock.lock()
            if let latency = state.detectedLatency {
                state.lock.unlock()
                
                inputEngine.inputNode.removeTap(onBus: 0)
                inputEngine.stop()
                outputEngine.stop()
                
                let finalLatency = min(max(latency, 0.0), 1000.0)
                self.logger.info("📡 [TELEMETRY] Acoustic Calibration SUCCESS! True latency: \(finalLatency)ms")
                return finalLatency
            }
            state.lock.unlock()
            try await Task.sleep(nanoseconds: 5_000_000) // 5ms polling
        }
        
        // 4. Fallback if mic failed to hear it
        inputEngine.inputNode.removeTap(onBus: 0)
        inputEngine.stop()
        outputEngine.stop()
        
        // If it fails, fallback to CoreAudio's driver reported latency as a best guess
        let fallback = DeviceManager.shared.getDeviceLatencyMs(id: deviceId)
        self.logger.info("📡 [TELEMETRY] Acoustic Calibration timed out. Falling back to CoreAudio driver latency: \(fallback)ms")
        return fallback
    }
    #endif
}
