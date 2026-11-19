import SwiftUI

/// The Linked Play mark traces one shared cycle across two device loops.
/// Keep the shape and 1.8-second timing aligned with the web SyncBeatsLoader.
struct NativeLoadingSignal: View {
    var size: CGFloat = 48
    var foreground: Color
    var secondary: Color? = nil
    var surface: Color
    var progress: Double? = nil
    var animates = true
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase
    @State private var started = Date()

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30.0, paused: reduceMotion || !animates || progress?.isFinite == true || scenePhase != .active)) { context in
            let phase = context.date.timeIntervalSince(started) / 1.8
            ZStack {
                loop(phase: phase, color: foreground)
                LinkedPlayLoop().stroke(surface, style: StrokeStyle(lineWidth: size * 10 / 64, lineJoin: .round))
                    .offset(x: size * 12 / 64, y: size * 7 / 64)
                loop(phase: phase + 0.1, color: secondary ?? foreground)
                    .offset(x: size * 12 / 64, y: size * 7 / 64)
            }
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }

    private func loop(phase: Double, color: Color) -> some View {
        let start = CGFloat(phase - floor(phase))
        let stroke = StrokeStyle(lineWidth: size * 5.5 / 64, lineCap: .round, lineJoin: .round)
        return ZStack {
            LinkedPlayLoop().stroke(color.opacity(0.16), style: stroke)
            if let progress, progress.isFinite {
                LinkedPlayLoop().trim(from: 0, to: CGFloat(min(100, max(0, progress)) / 100)).stroke(color, style: stroke)
            } else if reduceMotion || !animates {
                LinkedPlayLoop().stroke(color, style: stroke)
            } else {
                LinkedPlayLoop().trim(from: start, to: min(1, start + 0.3)).stroke(color, style: stroke)
                if start + 0.3 > 1 {
                    LinkedPlayLoop().trim(from: 0, to: start + 0.3 - 1).stroke(color, style: stroke)
                }
            }
        }
    }
}

/// Section and inline forms use the same signal, copy hierarchy and accessibility.
struct NativeLoader: View {
    let title: String
    var detail: String? = nil
    let palette: NativePalette
    var compact = false
    var progress: Double? = nil
    var animates = true

    private var boundedProgress: Double? {
        progress.flatMap { $0.isFinite ? min(100, max(0, $0)) : nil }
    }
    private var signal: some View {
        NativeLoadingSignal(size: compact ? 28 : 64, foreground: palette.text,
                            secondary: palette.secondary, surface: palette.background, progress: boundedProgress, animates: animates)
    }
    private var copy: some View {
        VStack(alignment: compact ? .leading : .center, spacing: 8) {
            Text(title).font(.system(size: compact ? 13 : 20, weight: .medium))
                .foregroundStyle(palette.text)
            if let detail, !detail.isEmpty {
                Text(detail).font(.system(size: 13)).foregroundStyle(palette.secondary)
                    .multilineTextAlignment(compact ? .leading : .center).lineSpacing(4)
            }
        }.fixedSize(horizontal: false, vertical: true)
    }
    var body: some View {
        VStack(spacing: 20) {
            if compact { HStack(spacing: 12) { signal; copy } }
            else { VStack(spacing: 20) { signal; copy }.frame(maxWidth: 320) }
            if let progress = boundedProgress {
                VStack(spacing: 8) {
                    GeometryReader { geometry in
                        Capsule().fill(palette.line)
                            .overlay(alignment: .leading) { Capsule().fill(palette.text).frame(width: geometry.size.width * progress / 100) }
                    }.frame(height: 2)
                    Text("\(Int(progress))%").font(.system(size: 11, design: .monospaced)).foregroundStyle(palette.secondary)
                }.frame(maxWidth: compact ? 140 : 176)
            }
        }
        .padding(.vertical, compact ? 4 : 24)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel([title, detail].compactMap { $0 }.joined(separator: ". "))
        .accessibilityValue(boundedProgress.map { "\(Int($0)) percent" } ?? "In progress")
    }
}
