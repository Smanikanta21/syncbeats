import SwiftUI

struct AudioSpectrumView: View {
    let audio: NativeRoomAudio
    var compact = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var motion = SpectrumMotion()
    var body: some View {
        TimelineView(.animation(minimumInterval: reduceMotion ? 0.25 : 1.0 / 60, paused: !audio.rendering)) { timeline in
            let bands = compact ? SpectrumMotion.compactBands(motion.bands) : motion.bands
            Canvas { context, size in
                let step = size.width / CGFloat(max(1, bands.count))
                for (index, level) in bands.enumerated() {
                    let height = compact ? 2 + CGFloat(pow(level, 0.65)) * max(0, size.height - 2) : max(2, size.height * CGFloat(level))
                    let rect = CGRect(x: CGFloat(index) * step + 1, y: compact ? (size.height - height) / 2 : size.height - height,
                                      width: max(1, step - 2), height: height)
                    context.fill(Path(roundedRect: rect, cornerRadius: min(3, step / 2)), with: .color(.accentColor.opacity(0.8)))
                }
            }.onChange(of: timeline.date, initial: true) { _, _ in
                motion.update(target: audio.meter.read().spectrum, time: ProcessInfo.processInfo.systemUptime, playing: audio.rendering)
            }
        }.accessibilityLabel(audio.rendering ? "Live audio spectrum" : "Audio spectrum paused")
            .onChange(of: audio.rendering) { _, playing in
                motion.update(target: audio.meter.read().spectrum, time: ProcessInfo.processInfo.systemUptime, playing: playing)
            }
    }
}
