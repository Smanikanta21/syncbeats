import SwiftUI

struct RoomArtwork: View {
    var request: AlbumArtworkRequest?
    @State private var cover: Image?
    @State private var displayedRequest: AlbumArtworkRequest?
    @Environment(\.displayScale) private var displayScale
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let palette: NativePalette
    private struct ArtworkSize: Equatable { let request: AlbumArtworkRequest?; let pixels: Int }
    var body: some View {
        GeometryReader { geometry in
            ZStack {
                LinearGradient(colors: [palette.raised, palette.background], startPoint: .topLeading, endPoint: .bottomTrailing)
                Circle().fill(palette.background).padding(geometry.size.width * 0.12)
                ForEach(0..<9) { index in
                    Circle().strokeBorder(palette.text.opacity(0.035 + Double(index % 3) * 0.02), lineWidth: 1)
                        .padding(geometry.size.width * (0.14 + Double(index) * 0.026))
                }
                Circle().fill(palette.gold.opacity(0.16)).frame(width: geometry.size.width * 0.24, height: geometry.size.width * 0.24)
                BrandMark(palette: palette).frame(width: geometry.size.width * 0.13, height: geometry.size.width * 0.13)
                if let cover {
                    cover.resizable().scaledToFill()
                        .frame(width: geometry.size.width, height: geometry.size.height).clipped()
                }
            }
            .task(id: ArtworkSize(request: request, pixels: RoomArtworkCache.pixelSize(for: geometry.size.width, scale: displayScale))) {
                if displayedRequest != request { cover = nil; displayedRequest = request }
                guard let request,
                      let decoded = await RoomArtworkCache.shared.image(for: request,
                        pixels: RoomArtworkCache.pixelSize(for: geometry.size.width, scale: displayScale)),
                      !Task.isCancelled else { return }
                withAnimation(reduceMotion ? nil : .easeOut(duration: 0.18)) {
                    cover = Image(decorative: decoded.image, scale: displayScale)
                }
            }
        }
        .aspectRatio(1, contentMode: .fit)
        .clipShape(RoundedRectangle(cornerRadius: 4))
        .overlay(RoundedRectangle(cornerRadius: 4).strokeBorder(palette.line))
        .accessibilityHidden(true)
    }
}

struct RoomTransport: View {
    let room: RoomSession
    let palette: NativePalette
    var compact = false
    var spacious = false
    private var controlWidth: CGFloat {
        #if os(iOS)
        return 44
        #else
        return compact ? 32 : 40
        #endif
    }
    private var controlSpacing: CGFloat {
        #if os(iOS)
        return compact ? 4 : 12
        #else
        return compact ? 8 : 16
        #endif
    }
    var body: some View {
        Group {
            #if os(iOS)
            if spacious {
                ViewThatFits(in: .horizontal) {
                    controls(spacing: 12).fixedSize(horizontal: true, vertical: false)
                    VStack(spacing: 12) {
                        HStack(spacing: 24) {
                            control("Previous track", icon: "backward.end.fill", action: room.previous)
                            playButton
                            control("Next track", icon: "forward.end.fill", action: room.next)
                        }
                        HStack(spacing: 32) {
                            control("Shuffle", icon: "shuffle", selected: room.shuffle, action: room.toggleShuffle)
                            control("Repeat: \(room.repeatMode)", icon: room.repeatMode == "track" ? "repeat.1" : "repeat", selected: room.repeatMode != "off", action: room.cycleRepeat)
                            autoplayControl
                        }
                    }
                }
            } else { controls(spacing: controlSpacing) }
            #else
            controls(spacing: controlSpacing)
            #endif
        }.disabled(!room.canControl || room.currentTrack == nil)
    }
    private func controls(spacing: CGFloat) -> some View {
        HStack(spacing: spacing) {
            control("Shuffle", icon: "shuffle", selected: room.shuffle, action: room.toggleShuffle)
            control("Previous track", icon: "backward.end.fill", action: room.previous)
            playButton
            control("Next track", icon: "forward.end.fill", action: room.next)
            control("Repeat: \(room.repeatMode)", icon: room.repeatMode == "track" ? "repeat.1" : "repeat", selected: room.repeatMode != "off", action: room.cycleRepeat)
            autoplayControl
        }
    }
    private var playButton: some View {
        Button(action: room.togglePlayback) {
                ZStack {
                    Circle().fill(palette.gold)
                    Image(systemName: room.pendingPlay ? "stop.fill" : room.isPlaying && !room.localAudioSuspended ? "pause.fill" : "play.fill")
                        .font(.system(size: compact ? 16 : 20, weight: .medium))
                        .offset(x: !room.isPlaying && !room.pendingPlay ? 1 : 0)
                        .foregroundStyle(palette.buttonText)
                }.frame(width: spacious || !compact ? 56 : max(40, controlWidth), height: spacious || !compact ? 56 : max(40, controlWidth))
            }.buttonStyle(.borderless)
                .help(room.pendingPlay ? "Cancel playback request" : room.isPlaying ? "Pause room" : "Play room")
                .accessibilityLabel(room.localAudioSuspended ? "Resume audio on this device" : room.pendingPlay ? "Cancel playback request" : room.isPlaying ? "Pause room" : "Play room")
    }
    private var autoplayControl: some View {
        control("Autoplay: \(room.autoplayEnabled ? "on" : "off")", icon: "play.square.stack", selected: room.autoplayEnabled, action: room.toggleAutoplay)
                .disabled(!room.supportsAutoplay)
                .accessibilityIdentifier("player-autoplay")
                .help(room.supportsAutoplay ? "Automatically play the next song in the shared queue" : "Autoplay is on. This room does not support changing it yet.")
    }
    private func control(_ title: String, icon: String, selected: Bool = false, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon).font(.system(size: compact ? 16 : 18))
                .foregroundStyle(selected ? palette.gold : palette.secondary).frame(width: controlWidth, height: max(40, controlWidth))
        }.buttonStyle(NativeButtonStyle(palette: palette)).help(title).accessibilityLabel(title)
            .accessibilityAddTraits(selected ? .isSelected : [])
    }
}

struct RoomProgress: View {
    let room: RoomSession
    let palette: NativePalette
    @State private var scrub: Double?
    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            let duration = room.duration ?? 0
            let position = max(0, scrub ?? room.position(at: context.date))
            let displayPosition = duration > 0 ? min(position, duration) : 0
            VStack(spacing: 4) {
                Slider(value: Binding(get: { displayPosition }, set: { scrub = $0 }), in: 0...max(1, duration)) { editing in
                    if !editing, let scrub { room.seek(to: scrub); self.scrub = nil }
                }
                .controlSize(.small).tint(palette.gold)
                .disabled(duration <= 0 || !room.canControl)
                .accessibilityLabel("Playback position")
                HStack {
                    Text(duration > 0 ? playbackTime(displayPosition) : "—:—")
                    Spacer()
                    Text(room.pendingPlay ? "Preparing players" : duration > 0 ? playbackTime(duration) : "—:—")
                }.font(.system(size: 12, design: .monospaced)).monospacedDigit().foregroundStyle(palette.quiet)
            }
        }.onChange(of: room.currentTrack?.id) { scrub = nil }
    }
}

struct RoomConnectionBadge: View {
    let room: RoomSession
    let palette: NativePalette
    var body: some View {
        HStack(spacing: 8) {
            Circle().fill(room.canControl ? palette.ready : palette.quiet).frame(width: 6, height: 6)
            Text(room.connection.label).font(.system(size: 12))
        }.foregroundStyle(palette.secondary)
    }
}
