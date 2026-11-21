import Foundation

nonisolated struct SpectrumMotion {
    /// Fold the real FFT bands into five readable compact-player bars.
    static func compactBands(_ spectrum: [Double]) -> [Double] {
        (0..<5).map { bar in
            let start = bar * spectrum.count / 5
            let end = (bar + 1) * spectrum.count / 5
            return spectrum[start..<end].filter(\.isFinite).map { min(1, max(0, $0)) }.max() ?? 0
        }
    }
    private(set) var bands = [Double](repeating: 0, count: AudioSpectrumAnalyzer.bandCount)
    private var lastTime: Double?
    mutating func update(target: [Double], time: Double, playing: Bool) {
        let elapsed = min(0.1, max(0, time - (lastTime ?? time)))
        lastTime = time
        guard playing else { bands = bands.map { _ in 0 }; return }
        for index in bands.indices {
            let raw = target.indices.contains(index) ? target[index] : 0
            let value = raw.isFinite ? min(1, max(0, raw)) : 0
            let blend = 1 - exp(-elapsed / (value > bands[index] ? 0.04 : 0.12))
            bands[index] += (value - bands[index]) * blend
        }
    }
}
