import SwiftUI

struct RoomArtwork: View {
    var request: AlbumArtworkRequest?
    @State private var cover: Image?
    let palette: NativePalette
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
                BrandMark().frame(width: geometry.size.width * 0.13, height: geometry.size.width * 0.13)
                if let cover {
                    cover.resizable().scaledToFill()
                        .frame(width: geometry.size.width, height: geometry.size.height).clipped()
                }
            }
        }
        .aspectRatio(1, contentMode: .fit)
        .clipShape(RoundedRectangle(cornerRadius: 4))
        .overlay(RoundedRectangle(cornerRadius: 4).strokeBorder(palette.line))
        .task(id: request) {
            cover = nil
            guard let request, let data = await AlbumArtworkResolver.shared.imageData(for: request), !Task.isCancelled else { return }
            #if os(macOS)
            if let native = NSImage(data: data) { cover = Image(nsImage: native) }
            #else
            if let native = UIImage(data: data) { cover = Image(uiImage: native) }
            #endif
        }
        .accessibilityHidden(true)
    }
}

struct RoomTransport: View {
    let room: RoomSession
    let palette: NativePalette
    var compact = false
    var body: some View {
        HStack(spacing: compact ? 8 : 16) {
            control("Shuffle", icon: "shuffle", selected: room.shuffle, action: room.toggleShuffle)
            control("Previous track", icon: "backward.end.fill", action: room.previous)
            Button(action: room.togglePlayback) {
                ZStack {
                    Circle().fill(palette.gold)
                    Image(systemName: room.pendingPlay ? "stop.fill" : room.isPlaying && !room.localAudioSuspended ? "pause.fill" : "play.fill")
                        .font(.system(size: compact ? 16 : 20, weight: .medium))
                        .offset(x: !room.isPlaying && !room.pendingPlay ? 1 : 0)
                        .foregroundStyle(palette.buttonText)
                }.frame(width: compact ? 40 : 56, height: compact ? 40 : 56)
            }.buttonStyle(.borderless)
                .help(room.pendingPlay ? "Cancel playback request" : room.isPlaying ? "Pause room" : "Play room")
                .accessibilityLabel(room.localAudioSuspended ? "Resume audio on this device" : room.pendingPlay ? "Cancel playback request" : room.isPlaying ? "Pause room" : "Play room")
            control("Next track", icon: "forward.end.fill", action: room.next)
            control("Repeat: \(room.repeatMode)", icon: room.repeatMode == "track" ? "repeat.1" : "repeat", selected: room.repeatMode != "off", action: room.cycleRepeat)
        }
        .disabled(!room.canControl || room.currentTrack == nil)
    }
    private func control(_ title: String, icon: String, selected: Bool = false, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon).font(.system(size: compact ? 16 : 18))
                .foregroundStyle(selected ? palette.gold : palette.secondary).frame(width: compact ? 32 : 40, height: 40)
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
