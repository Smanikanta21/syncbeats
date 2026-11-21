import Accelerate
import AVFoundation

/// Fixed FFT buffers reused by the audio tap.
nonisolated final class AudioSpectrumAnalyzer {
    static let bandCount = 24
    private let size = 1024
    private let setup: vDSP_DFT_Setup?
    private var window = [Float](repeating: 0, count: 1024)
    private var ring = [Float](repeating: 0, count: 1024)
    private var writeIndex = 0
    private var samplesReceived = 0
    private var sinceTransform = 0
    private var input = [Float](repeating: 0, count: 1024)
    private var imaginary = [Float](repeating: 0, count: 1024)
    private var realOutput = [Float](repeating: 0, count: 1024)
    private var imaginaryOutput = [Float](repeating: 0, count: 1024)
    private var smoothed = [Double](repeating: 0, count: bandCount)
    init() {
        setup = vDSP_DFT_zop_CreateSetup(nil, 1024, .FORWARD)
        vDSP_hann_window(&window, 1024, Int32(vDSP_HANN_NORM))
    }
    deinit { if let setup { vDSP_DFT_DestroySetup(setup) } }
    func reset() {
        for index in smoothed.indices { smoothed[index] = 0 }
        for index in ring.indices { ring[index] = 0 }
        writeIndex = 0; samplesReceived = 0; sinceTransform = 0
    }
    func consume(_ buffer: AVAudioPCMBuffer) -> [Double] {
        guard setup != nil, let channels = buffer.floatChannelData, buffer.frameLength > 0 else { return smoothed }
        let channelCount = Int(buffer.format.channelCount)
        // Consume every sample, including the second half of the 2048-frame tap.
        // 50% overlap keeps brief transients from falling between FFT windows.
        for frame in 0..<Int(buffer.frameLength) {
            var sample: Float = 0
            for channel in 0..<channelCount { sample += channels[channel][frame] }
            ring[writeIndex] = sample / Float(max(1, channelCount))
            writeIndex = (writeIndex + 1) % size
            samplesReceived += 1; sinceTransform += 1
            if samplesReceived >= size && sinceTransform >= size / 2 {
                sinceTransform = 0
                transform(sampleRate: buffer.format.sampleRate)
            }
        }
        return smoothed
    }
    private func transform(sampleRate: Double) {
        guard let setup else { return }
        for index in 0..<size { input[index] = ring[(writeIndex + index) % size] * window[index] }
        vDSP_DFT_Execute(setup, input, imaginary, &realOutput, &imaginaryOutput)
        let rate = sampleRate, top = min(20_000, sampleRate / 2)
        for band in 0..<Self.bandCount {
            let low = 40 * pow(top / 40, Double(band) / Double(Self.bandCount))
            let high = 40 * pow(top / 40, Double(band + 1) / Double(Self.bandCount))
            let first = max(1, min(size / 2 - 1, Int(low * Double(size) / rate)))
            let last = max(first, min(size / 2 - 1, Int(high * Double(size) / rate)))
            var peak = 0.0
            for bin in first...last {
                let real = Double(realOutput[bin]), imaginary = Double(imaginaryOutput[bin])
                peak = max(peak, sqrt(real * real + imaginary * imaginary) * 4 / Double(size))
            }
            let db = 20 * log10(max(peak, 0.000001))
            let target = min(1, max(0, (db + 60) / 55))
            let seconds = target > smoothed[band] ? 0.025 : 0.15
            let blend = 1 - exp(-Double(size / 2) / rate / seconds)
            smoothed[band] += (target - smoothed[band]) * blend
        }
    }
}
