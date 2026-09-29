#if os(macOS)
import SwiftUI

/// The notch island. Collapsed it hugs the camera housing — artwork in the left
/// lobe, level meter in the right, nothing in the middle because those pixels
/// don't exist. Hovering expands it into the full remote.
struct DynamicIslandView: View {
    @EnvironmentObject private var room: RoomManager
    @EnvironmentObject private var notch: NotchController

    var body: some View {
        ZStack(alignment: .top) {
            shape
                .fill(.black)
                .shadow(
                    color: .black.opacity(notch.isExpanded ? 0.5 : (notch.isHovered ? 0.3 : 0)),
                    radius: notch.isExpanded ? 20 : 8,
                    y: notch.isExpanded ? 10 : 4
                )
                .overlay(shape.stroke(.white.opacity(notch.isExpanded ? 0.12 : 0), lineWidth: 0.5))

            if notch.isExpanded {
                expanded
                    .transition(.opacity.combined(with: .blurReplace))
            } else {
                collapsed
                    .transition(.opacity)
            }
        }
        .frame(
            width: notch.isExpanded ? notch.expandedSize.width : (notch.isHovered ? notch.hoverSize.width : notch.collapsedSize.width),
            height: notch.isExpanded ? notch.expandedSize.height : (notch.isHovered ? notch.hoverSize.height : notch.collapsedSize.height),
            alignment: .top
        )
        .animation(.spring(response: 0.4, dampingFraction: 0.75, blendDuration: 0.1), value: notch.isExpanded)
        .animation(.spring(response: 0.3, dampingFraction: 0.7), value: notch.isHovered)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .ignoresSafeArea()
        .contentShape(shape)
        .onTapGesture {
            notch.toggleExpanded()
        }
        .animation(.easeInOut(duration: 0.2), value: room.currentTrack?.id)
    }

    private var shape: some Shape {
        // Increased from 16 to 28 (expanded) and 12 to 16 (hovered) to make the curve sweep further outward!
        let topRadius: CGFloat = notch.hasNotch && notch.isExpanded ? 16 : (notch.hasNotch && notch.isHovered ? 8 : 0)
        let bottomRadius: CGFloat = notch.isExpanded ? 32 : (notch.hasNotch ? 10 : 12)
        
        return NotchNookShape(
            topRadius: topRadius,
            bottomRadius: bottomRadius
        )
    }

    // MARK: - Collapsed

    private var collapsed: some View {
        HStack(spacing: 0) {
            let isIdle = room.currentTrack == nil
            if !isIdle || !notch.hasNotch {
                artwork(size: notch.barHeight - 9)
                    .frame(maxWidth: .infinity)

                // The camera housing lives here — leave it empty.
                Spacer().frame(width: notch.notchWidth)

                Group {
                    if !isIdle {
                        LevelMeter(active: room.isPlaying)
                    } else {
                        Circle()
                            .fill(statusColor)
                            .frame(width: 5, height: 5)
                    }
                }
                .frame(maxWidth: .infinity)
            } else {
                Spacer().frame(width: notch.notchWidth)
            }
        }
        .frame(height: notch.barHeight)
        .padding(.horizontal, (room.currentTrack == nil && notch.hasNotch) ? 0 : 7)
    }

    // MARK: - Expanded

    private var expanded: some View {
        VStack(spacing: 12) {
            HStack(alignment: .top, spacing: 12) {
                artwork(size: 58)

                VStack(alignment: .leading, spacing: 3) {
                    Text(room.currentTrack?.title ?? "Nothing queued")
                        .font(.system(size: 13, weight: .semibold))
                        .lineLimit(1)
                    Text(room.currentTrack?.artist ?? "Add a track to get started")
                        .font(.system(size: 11))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)

                    HStack(spacing: 6) {
                        Label(Endpoint.transport.label, systemImage: Endpoint.transport.symbol)
                        Text("·")
                        Label("\(room.readyCount)/\(room.participants.count)", systemImage: "person.2.fill")
                        if room.clock.isSynced {
                            Text("·")
                            Text("±\(Int(room.clock.rttMs / 2))ms")
                        }
                    }
                    .font(.system(size: 10, weight: .medium))
                    .foregroundStyle(statusColor)
                    .padding(.top, 2)
                }

                Spacer(minLength: 0)

                Button(action: { notch.focusMainWindow() }) {
                    Image(systemName: "macwindow")
                        .font(.system(size: 11, weight: .semibold))
                }
                .buttonStyle(IslandGlyphButton())
                .help("Open the room window")
            }

            Scrubber()

            HStack(spacing: 18) {
                Button(action: room.toggleShuffle) {
                    Image(systemName: "shuffle")
                }
                .buttonStyle(IslandGlyphButton(tinted: room.shuffle))

                Spacer()

                Button(action: room.previous) { Image(systemName: "backward.fill") }
                    .buttonStyle(IslandGlyphButton(size: 15))

                Button(action: room.togglePlayPause) {
                    Image(systemName: room.isPlaying ? "pause.fill" : "play.fill")
                        .font(.system(size: 17, weight: .medium))
                        .frame(width: 34, height: 34)
                        .background(.white.opacity(0.14), in: Circle())
                }
                .buttonStyle(.plain)
                .foregroundStyle(.white)

                Button(action: room.next) { Image(systemName: "forward.fill") }
                    .buttonStyle(IslandGlyphButton(size: 15))

                Spacer()

                Button(action: room.cycleRepeat) {
                    Image(systemName: room.repeatMode.symbol)
                }
                .buttonStyle(IslandGlyphButton(tinted: room.repeatMode != .off))
            }
            .disabled(room.connection != .connected)
        }
        // This controls the margins for all the content INSIDE the expanded island!
        .padding(.horizontal, 32)
        .padding(.top, notch.hasNotch ? notch.barHeight + 4 : 20)
        .padding(.bottom, 20)
        .foregroundStyle(.white)
        .environment(\.colorScheme, .dark)
    }

    private var statusColor: Color {
        switch room.connection {
        case .connected:    return room.clock.isSynced ? .green : .yellow
        case .connecting:   return .yellow
        case .disconnected: return .orange
        case .idle:         return .secondary
        }
    }

    @ViewBuilder
    private func artwork(size: CGFloat) -> some View {
        let radius = max(3, size * 0.22)
        Group {
            if let url = room.currentTrack?.artworkURL {
                AsyncImage(url: url) { phase in
                    if let image = phase.image {
                        image.resizable().aspectRatio(contentMode: .fill)
                    } else {
                        artworkFallback
                    }
                }
            } else {
                artworkFallback
            }
        }
        .frame(width: size, height: size)
        .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
    }

    private var artworkFallback: some View {
        RoundedRectangle(cornerRadius: 4, style: .continuous)
            .fill(.white.opacity(0.1))
            .overlay(
                Image(systemName: "music.note")
                    .font(.system(size: 10))
                    .foregroundStyle(.white.opacity(0.45))
            )
    }
}

// MARK: - Pieces

/// Progress bar that reads the derived timeline and commits a seek on release.
private struct Scrubber: View {
    @EnvironmentObject private var room: RoomManager
    @State private var dragProgress: Double?

    var body: some View {
        // TimelineView redraws off the run loop, so no timer is needed to advance
        // a position that is computed from the server clock.
        TimelineView(.periodic(from: .now, by: 0.25)) { _ in
            let live = dragProgress ?? room.progress
            VStack(spacing: 3) {
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        Capsule().fill(.white.opacity(0.16))
                        Capsule().fill(.white.opacity(0.85))
                            .frame(width: max(0, geo.size.width * live))
                    }
                    .contentShape(Rectangle())
                    .gesture(
                        DragGesture(minimumDistance: 0)
                            .onChanged { value in
                                guard room.durationSec > 0 else { return }
                                dragProgress = min(1, max(0, value.location.x / geo.size.width))
                            }
                            .onEnded { _ in
                                if let p = dragProgress, room.durationSec > 0 {
                                    room.seek(toSeconds: p * room.durationSec)
                                }
                                dragProgress = nil
                            }
                    )
                }
                .frame(height: 4)

                HStack {
                    Text(Self.clock(live * room.durationSec))
                    Spacer()
                    Text(room.durationSec > 0 ? Self.clock(room.durationSec) : "--:--")
                }
                .font(.system(size: 9, weight: .medium).monospacedDigit())
                .foregroundStyle(.white.opacity(0.5))
            }
        }
    }

    static func clock(_ seconds: Double) -> String {
        guard seconds.isFinite, seconds >= 0 else { return "0:00" }
        let total = Int(seconds)
        return String(format: "%d:%02d", total / 60, total % 60)
    }
}

/// Four bars driven off a TimelineView tick — no repeatForever animation to leak
/// when the island collapses.
private struct LevelMeter: View {
    let active: Bool

    var body: some View {
        TimelineView(.periodic(from: .now, by: 0.1)) { context in
            let t = context.date.timeIntervalSinceReferenceDate
            HStack(spacing: 2) {
                ForEach(0..<4, id: \.self) { i in
                    Capsule()
                        .fill(.white.opacity(active ? 0.9 : 0.3))
                        .frame(width: 2, height: 11)
                        .scaleEffect(y: active ? height(t, i) : 0.28, anchor: .center)
                }
            }
            .frame(width: 16, height: 11)
        }
    }

    private func height(_ t: Double, _ index: Int) -> Double {
        0.3 + 0.7 * abs(sin(t * (2.3 + Double(index) * 0.7)))
    }
}

private struct IslandGlyphButton: ButtonStyle {
    var size: CGFloat = 12
    var tinted: Bool = false

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: size, weight: .semibold))
            .foregroundStyle(tinted ? Color.accentColor : Color.white.opacity(0.72))
            .opacity(configuration.isPressed ? 0.5 : 1)
            .contentShape(Rectangle())
    }
}
#endif

#if os(macOS)
struct NotchNookShape: Shape {
    var topRadius: CGFloat
    var bottomRadius: CGFloat

    var animatableData: AnimatablePair<CGFloat, CGFloat> {
        get { AnimatablePair(topRadius, bottomRadius) }
        set {
            topRadius = newValue.first
            bottomRadius = newValue.second
        }
    }

    func path(in rect: CGRect) -> Path {
        var p = Path()
        let w = rect.width
        let h = rect.height
        
        if topRadius <= 0 {
            p.move(to: CGPoint(x: 0, y: 0))
            p.addLine(to: CGPoint(x: w, y: 0))
            p.addLine(to: CGPoint(x: w, y: h - bottomRadius))
            if bottomRadius > 0 {
                p.addArc(center: CGPoint(x: w - bottomRadius, y: h - bottomRadius), radius: bottomRadius, startAngle: .degrees(0), endAngle: .degrees(90), clockwise: false)
                p.addLine(to: CGPoint(x: bottomRadius, y: h))
                p.addArc(center: CGPoint(x: bottomRadius, y: h - bottomRadius), radius: bottomRadius, startAngle: .degrees(90), endAngle: .degrees(180), clockwise: false)
            } else {
                p.addLine(to: CGPoint(x: w, y: h))
                p.addLine(to: CGPoint(x: 0, y: h))
            }
            p.addLine(to: CGPoint(x: 0, y: 0))
            p.closeSubpath()
            return p
        }
        
        // 1. Start at top-left
        p.move(to: CGPoint(x: 0, y: 0))
        
        // 2. Line across the top edge (hugging the screen)
        p.addLine(to: CGPoint(x: w, y: 0))
        
        // 3. Top-right concave flare (fillet)
        p.addArc(
            center: CGPoint(x: w, y: topRadius),
            radius: topRadius,
            startAngle: .degrees(270),
            endAngle: .degrees(180),
            clockwise: true
        )
        
        // 4. Right vertical edge
        p.addLine(to: CGPoint(x: w - topRadius, y: h - bottomRadius))
        
        // 5. Bottom-right convex corner
        if bottomRadius > 0 {
            p.addArc(
                center: CGPoint(x: w - topRadius - bottomRadius, y: h - bottomRadius),
                radius: bottomRadius,
                startAngle: .degrees(0),
                endAngle: .degrees(90),
                clockwise: false
            )
        } else {
            p.addLine(to: CGPoint(x: w - topRadius, y: h))
        }
        
        // 6. Bottom horizontal edge
        p.addLine(to: CGPoint(x: topRadius + bottomRadius, y: h))
        
        // 7. Bottom-left convex corner
        if bottomRadius > 0 {
            p.addArc(
                center: CGPoint(x: topRadius + bottomRadius, y: h - bottomRadius),
                radius: bottomRadius,
                startAngle: .degrees(90),
                endAngle: .degrees(180),
                clockwise: false
            )
        } else {
            p.addLine(to: CGPoint(x: topRadius, y: h))
        }
        
        // 8. Left vertical edge
        p.addLine(to: CGPoint(x: topRadius, y: topRadius))
        
        // 9. Top-left concave flare (fillet)
        p.addArc(
            center: CGPoint(x: 0, y: topRadius),
            radius: topRadius,
            startAngle: .degrees(0),
            endAngle: .degrees(270),
            clockwise: true
        )
        
        p.closeSubpath()
        return p
    }
}
#endif
