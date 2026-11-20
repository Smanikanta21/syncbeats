#if os(macOS)
import SwiftUI

/// The notch island. Collapsed it hugs the camera housing — artwork in the left
/// lobe, level meter in the right, nothing in the middle because those pixels
/// don't exist. Hovering expands it into the full remote.
///
/// Motion notes, because this is easy to make janky again:
///  - Both layouts are always mounted at their own **fixed** size and cross-faded.
///    Nothing re-lays-out while the island moves; only the clip mask animates.
///  - Exactly one `.animation(_:value:)` drives the whole thing. Two springs on the
///    same frame fight each other and you see a double-step.
struct DynamicIslandView: View {
    @EnvironmentObject private var room: RoomManager
    @EnvironmentObject private var notch: NotchController
    @ObservedObject private var engine = AudioEngine.shared

    /// Everything that should animate as one gesture, in one Equatable value.
    private struct Phase: Equatable {
        var step: Int          // 0 collapsed · 1 hovered · 2 expanded
        var hasTrack: Bool     // flips the collapsed lobe width
        var isDownloading: Bool
    }

    private var phase: Phase {
        Phase(
            step: notch.isExpanded ? 2 : (notch.isHovered ? 1 : 0),
            hasTrack: room.currentTrack != nil,
            isDownloading: engine.isDownloading && !notch.isExpanded
        )
    }

    private var size: CGSize {
        if notch.isExpanded { return notch.expandedSize }
        if engine.isDownloading { return CGSize(width: notch.notchWidth + 160, height: notch.barHeight + 20) }
        return notch.isHovered ? notch.hoverSize : notch.collapsedSize
    }

    var body: some View {
        ZStack(alignment: .top) {
            shape
                .fill(.black)
                .overlay(shape.stroke(.white.opacity(notch.isExpanded ? 0.12 : 0), lineWidth: 0.5))
                .shadow(
                    color: .black.opacity(notch.isExpanded ? 0.5 : (notch.isHovered ? 0.3 : 0)),
                    radius: notch.isExpanded ? 20 : 8,
                    y: notch.isExpanded ? 10 : 4
                )

            // Fixed-size children, cross-faded. The animated clip does the reveal,
            // so neither layout is re-measured mid-flight.
            ZStack(alignment: .top) {
                collapsed
                    .frame(
                        width: (engine.isDownloading && !notch.isExpanded) ? notch.notchWidth + 160 : notch.collapsedSize.width,
                        height: (engine.isDownloading && !notch.isExpanded) ? notch.barHeight + 20 : notch.barHeight,
                        alignment: .top
                    )
                    .opacity(notch.isExpanded ? 0 : 1)
                    .scaleEffect(notch.isHovered && !notch.isExpanded ? 1.08 : 1)

                expanded
                    .frame(width: notch.expandedSize.width, height: notch.expandedSize.height, alignment: .top)
                    .opacity(notch.isExpanded ? 1 : 0)
                    .allowsHitTesting(notch.isExpanded)
            }
            .frame(width: size.width, height: size.height, alignment: .top)
            .compositingGroup()
            .clipShape(shape)
        }
        .frame(width: size.width, height: size.height, alignment: .top)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .ignoresSafeArea()
        // The island shape is always black, so force dark for the whole subtree.
        // That's what lets the shared `.primary`/`.secondary`/`.quaternary`
        // components from RoomChrome resolve to white-on-black in here without
        // needing an island-specific colour set.
        .foregroundStyle(.white)
        .environment(\.colorScheme, .dark)
        .animation(Design.layout, value: phase)
        .contentShape(shape)
        .onChange(of: notch.isHovered) { _, hovered in
            if hovered && !notch.isExpanded {
                Haptics.impact()
            }
        }
    }

    private var shape: some Shape {
        let isDownloading = engine.isDownloading && !notch.isExpanded
        let topRadius: CGFloat = notch.isExpanded ? 16 : (isDownloading ? 8 : (notch.isHovered ? 6 : 2))
        let bottomRadius: CGFloat = notch.isExpanded ? 32 : (isDownloading ? 16 : (notch.hasNotch ? 8 : 8))

        return NotchNookShape(topRadius: topRadius, bottomRadius: bottomRadius)
    }

    // MARK: - Collapsed

    private var collapsed: some View {
        VStack(spacing: 0) {
            HStack(spacing: 0) {
                let isIdle = room.currentTrack == nil
                if !isIdle || !notch.hasNotch {
                    artwork(size: notch.barHeight - 9)
                        .frame(maxWidth: .infinity)

                    // The camera housing lives here — leave it empty.
                    Spacer().frame(width: notch.notchWidth)

                    Group {
                        if !isIdle {
                            if notch.isHovered {
                                Button(action: room.togglePlayPause) {
                                    Image(systemName: room.isPlaying ? "pause.fill" : "play.fill")
                                        .font(.system(size: 12, weight: .bold))
                                        .foregroundStyle(.white)
                                        .frame(width: 16, height: 16)
                                        .contentShape(Rectangle())
                                }
                                .buttonStyle(.plain)
                            } else {
                                LevelMeter(active: room.isPlaying && !engine.isDownloading)
                                    .foregroundStyle(
                                        LinearGradient(
                                            colors: [
                                                Color(white: 1.0),
                                                Color(red: 1.0, green: 0.95, blue: 0.8), // warm white/yellow
                                                Color(red: 1.0, green: 0.85, blue: 0.6)  // subtle orange
                                            ],
                                            startPoint: .top,
                                            endPoint: .bottom
                                        )
                                    )
                                    .shadow(color: Color(red: 1.0, green: 0.9, blue: 0.7).opacity(0.8), radius: 2)
                                    .shadow(color: Color(red: 1.0, green: 0.8, blue: 0.5).opacity(0.4), radius: 6)
                            }
                        } else {
                            Image(systemName: "music.note")
                                .font(.system(size: 8, weight: .semibold))
                                .foregroundStyle(.white.opacity(0.4))
                        }
                    }
                    .frame(maxWidth: .infinity)
                } else {
                    Spacer().frame(width: notch.notchWidth)
                }
            }
            .frame(height: notch.barHeight)
            .padding(.horizontal, (room.currentTrack == nil && notch.hasNotch) ? 0 : 7)
            
            if engine.isDownloading {
                ProgressView(value: engine.downloadProgress)
                    .progressViewStyle(.linear)
                    .tint(.white)
                    .padding(.horizontal, 24)
                    .frame(height: 20)
            }
        }
        .contentShape(Rectangle())
        .onTapGesture {
            Haptics.tap()
            notch.expandNow()
        }
    }

    // MARK: - Expanded

    private var expanded: some View {
        ZStack {
            // Invisible background to catch clicks that should collapse the island
            Color.white.opacity(0.001)
                .onTapGesture { notch.setExpanded(false) }

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
                                .monospacedDigit()
                        }
                    }
                    .font(.system(size: 10, weight: .medium))
                    .foregroundStyle(.secondary)
                    .padding(.top, 2)
                }

                Spacer(minLength: 0)

                HStack(spacing: 8) {
                    if !DeviceManager.shared.activeSecondaryDevices.isEmpty {
                        HStack(spacing: 4) {
                            Image(systemName: "speaker.wave.2.fill")
                            Text("\(1 + DeviceManager.shared.activeSecondaryDevices.count)")
                                .monospacedDigit()
                        }
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(.white.opacity(0.85))
                        .padding(.horizontal, 6)
                        .padding(.vertical, 3)
                        .background(.white.opacity(0.12), in: Capsule())
                    }

                    Button(action: { notch.focusMainWindow() }) {
                        Image(systemName: "macwindow")
                            .font(.system(size: 11, weight: .semibold))
                    }
                    .buttonStyle(IslandGlyphButton())
                    .help("Open the room window")
                }
            }

            Scrubber(
                progress: room.progress,
                durationSec: room.durationSec,
                // Collapsed the subtree stays mounted at opacity 0, and a paused
                // room's position doesn't move — neither needs 30fps redraws.
                isLive: notch.isExpanded && room.isPlaying,
                compact: true,
                onSeek: { room.seek(toSeconds: $0) }
            )

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
        }
    }



    /// The island's lobes and expanded header are `ArtworkTile` at a tighter
    /// corner than the stage uses — a 15pt tile at the stage's 0.06 scale would
    /// read as a square.
    private func artwork(size: CGFloat) -> some View {
        ArtworkTile(url: room.currentTrack?.artworkURL, size: size, cornerScale: 0.22)
            .shadow(color: .black.opacity(size > 40 ? 0.35 : 0.15), radius: size > 40 ? 6 : 2, y: size > 40 ? 3 : 1)
    }
}

// MARK: - Pieces

private struct IslandGlyphButton: ButtonStyle {
    var size: CGFloat = 12
    var tinted: Bool = false

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: size, weight: .semibold))
            .foregroundStyle(tinted ? Color.primary : Color.secondary)
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
