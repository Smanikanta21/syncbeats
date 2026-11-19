import Foundation
import AVFoundation

nonisolated struct NativeEqualizer: Equatable, Sendable {
    static let frequencies: [Float] = [60, 250, 1_000, 4_000, 12_000]
    static let labels = ["60 Hz", "250 Hz", "1 kHz", "4 kHz", "12 kHz"]
    var enabled = false
    var gains: [Float]
    init(enabled: Bool = false, gains: [Float] = []) {
        self.enabled = enabled
        self.gains = Self.frequencies.indices.map { index in
            let gain = gains.indices.contains(index) ? gains[index] : 0
            return gain.isFinite ? min(12, max(-12, gain)) : 0
        }
    }
    // Reserve headroom for boosts without altering playback rate or scheduling.
    var preamp: Float { enabled ? -max(0, gains.max() ?? 0) : 0 }
    func apply(to node: AVAudioUnitEQ) {
        node.bypass = !enabled
        node.globalGain = preamp
        for (index, band) in node.bands.enumerated() where Self.frequencies.indices.contains(index) {
            band.filterType = .parametric; band.frequency = Self.frequencies[index]
            band.bandwidth = 1; band.bypass = false; band.gain = gains[index]
        }
    }
    enum Preset: String, CaseIterable, Identifiable {
        case flat = "Flat", warm = "Warm", vocal = "Vocal", detail = "Detail"
        var id: String { rawValue }
        var gains: [Float] {
            switch self {
            case .flat: [0, 0, 0, 0, 0]
            case .warm: [4, 2, 0, -1, -2]
            case .vocal: [-2, -1, 3, 2, 0]
            case .detail: [-1, 0, 1, 2, 3]
            }
        }
    }
}
