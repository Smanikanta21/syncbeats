import SwiftUI

struct RoomMiniPlayer: View {
    @Bindable var room: RoomSession
    let palette: NativePalette
    var onExpand: () -> Void
    var onQueue: () -> Void
    var onFloat: () -> Void
    var floating = false
    var body: some View {
        #if os(iOS)
        MobileRoomMiniPlayer(room: room, palette: palette, onExpand: onExpand, onQueue: onQueue)
        #else
        VStack(spacing: 8) {
            HStack(spacing: 12) {
                Button(action: onExpand) {
                    HStack(spacing: 12) {
                        RoomArtwork(request: room.currentTrack?.artworkRequest, palette: palette).frame(width: 44, height: 44).clipShape(RoundedRectangle(cornerRadius: 7))
                        VStack(alignment: .leading, spacing: 4) {
                            Text(room.currentTrack?.title ?? "Choose your first track").font(.system(size: 13, weight: .medium)).lineLimit(1)
                            Text(room.currentTrack?.artistLabel ?? "Your shared room is ready").font(.system(size: 11)).foregroundStyle(palette.quiet).lineLimit(1)
                        }.frame(maxWidth: .infinity, alignment: .leading)
                    }.contentShape(Rectangle())
                }.buttonStyle(NativeButtonStyle(palette: palette))
                    .simultaneousGesture(DragGesture(minimumDistance: 18).onEnded { value in
                        if PlayerGestures.expands(translation: value.translation, predicted: value.predictedEndTranslation) { onExpand() }
                    })
                    #if os(macOS)
                    .accessibilityLabel("Open full-screen player")
                    #else
                    .accessibilityLabel("Open full player")
                    #endif
                if floating {
                    Button(action: room.togglePlayback) { Image(systemName: room.pendingPlay ? "stop.fill" : room.isPlaying ? "pause.fill" : "play.fill").frame(width: 32, height: 32) }
                        .buttonStyle(NativeButtonStyle(palette: palette)).foregroundStyle(palette.gold).disabled(!room.canControl || room.currentTrack == nil)
                        .accessibilityLabel(room.pendingPlay ? "Cancel pending playback" : room.isPlaying ? "Pause room" : "Play room")
                } else { RoomTransport(room: room, palette: palette, compact: true) }
                Button(action: onQueue) { Image(systemName: "list.bullet").frame(width: 30, height: 32) }
                    .buttonStyle(NativeButtonStyle(palette: palette)).accessibilityLabel("Open shared queue")
                #if os(macOS)
                if !floating {
                    Button(action: onFloat) { Image(systemName: "pip.enter").frame(width: 30, height: 32) }
                        .buttonStyle(NativeButtonStyle(palette: palette)).accessibilityLabel("Float player above other windows")
                }
                #endif
            }
            RoomProgress(room: room, palette: palette)
        }.padding(.horizontal, floating ? 16 : 24).padding(.vertical, 12)
            .background(floating ? palette.panel : palette.background).foregroundStyle(palette.text)
        #endif
    }
}

struct RoomExpandedPlayer: View {
    @Bindable var room: RoomSession
    let palette: NativePalette
    @Binding var showsQueue: Bool
    var onClose: () -> Void
    var onFloat: () -> Void
    var onFullScreen: (() -> Void)? = nil
    var body: some View {
        GeometryReader { geometry in
            let wide = RoomLayout.showsQueueAlongside(width: geometry.size.width)
            let queueWidth = min(400, max(336, geometry.size.width * 0.28))
            let artworkSize = max(140, min(480, geometry.size.height - 350,
                                          wide ? geometry.size.width - queueWidth - 96 : geometry.size.width - 80))
            let queueHeight = min(640, max(260, CGFloat(room.visibleQueue.count) * 80 + 140),
                                  max(200, geometry.size.height - 256))
            VStack(spacing: 0) {
                HStack(spacing: 14) {
                    Button(action: onClose) { Label("Home", systemImage: "chevron.down").font(.system(size: 13)).padding(.horizontal, 10).frame(height: 32) }
                        .buttonStyle(NativeButtonStyle(palette: palette)).keyboardShortcut(.escape, modifiers: [])
                    Spacer()
                    Text("Your room player").font(.system(size: 13)).foregroundStyle(palette.secondary)
                    Spacer()
                    if !wide {
                        Button { showsQueue.toggle() } label: { Image(systemName: showsQueue ? "square.stack" : "list.bullet").frame(width: 32, height: 32) }
                            .buttonStyle(NativeButtonStyle(palette: palette)).accessibilityLabel(showsQueue ? "Show artwork" : "Show queue")
                    }
                    #if os(macOS)
                    if let onFullScreen {
                        Button(action: onFullScreen) { Image(systemName: "arrow.up.left.and.arrow.down.right").frame(width: 32, height: 32) }
                            .buttonStyle(NativeButtonStyle(palette: palette)).accessibilityLabel("Open full-screen player")
                    }
                    Button(action: onFloat) { Image(systemName: "pip.enter").frame(width: 32, height: 32) }
                        .buttonStyle(NativeButtonStyle(palette: palette)).accessibilityLabel("Float player above other windows")
                    #endif
                }.padding(.horizontal, 24).padding(.vertical, 16)
                    .contentShape(Rectangle())
                    .simultaneousGesture(DragGesture(minimumDistance: 18).onEnded { value in
                        if PlayerGestures.dismisses(translation: value.translation, predicted: value.predictedEndTranslation) { onClose() }
                    })
                Rectangle().fill(palette.line).frame(height: 1)
                Spacer(minLength: 0)
                HStack(spacing: 24) {
                    if wide || !showsQueue {
                        ScrollView {
                            artworkPlayer(size: artworkSize)
                                .frame(maxWidth: .infinity).padding(.vertical, 12)
                        }.defaultScrollAnchor(.center, for: .alignment)
                            .frame(maxWidth: .infinity)
                    }
                    if wide || showsQueue {
                        RoomQueueView(room: room, palette: palette)
                            .frame(width: wide ? queueWidth : nil)
                            .frame(maxWidth: wide ? nil : 560)
                            .frame(height: wide ? queueHeight : nil)
                    }
                }.frame(maxWidth: 1160, maxHeight: 668)
                    .padding(.horizontal, 24).padding(.vertical, 16)
                    .frame(maxWidth: .infinity)
                VStack(spacing: 12) {
                    RoomProgress(room: room, palette: palette).frame(maxWidth: 580)
                    RoomTransport(room: room, palette: palette)
                }.padding(.horizontal, 28).padding(.vertical, 18)
                Group {
                    if room.audio.loading { Text("Preparing audio on this Mac…") }
                    else if let error = room.audio.error {
                        HStack { Text(error).lineLimit(2); Button("Retry audio") { room.retryAudio() } }
                    } else { Text(room.audio.loadedKey != nil ? "Audio ready on this Mac" : "Choose a track for this Mac") }
                }.font(.system(size: 11)).foregroundStyle(palette.secondary).padding(.bottom, 16)
                Spacer(minLength: 0)
            }
        }.background { RoomAlbumAmbient(room: room, light: palette.light) }
            .clipped().foregroundStyle(palette.text)
            .environment(\.colorScheme, palette.light ? .light : .dark)
    }
    private func artworkPlayer(size: CGFloat) -> some View {
        VStack(spacing: 18) {
            RoomArtwork(request: room.currentTrack?.artworkRequest, palette: palette).frame(width: size, height: size).clipShape(RoundedRectangle(cornerRadius: 16))
                .shadow(color: .black.opacity(palette.light ? 0.12 : 0.22), radius: 24, y: 12)
            VStack(spacing: 8) {
                Text(room.currentTrack?.title ?? "Your next shared moment").font(.system(size: 24, weight: .medium, design: .serif))
                    .multilineTextAlignment(.center).lineLimit(2)
                Text(room.currentTrack?.artistLabel ?? "Add a track from Home to get started").font(.system(size: 13)).foregroundStyle(palette.secondary).lineLimit(1)
                if room.pendingPlay { Text("Waiting for connected players…").font(.system(size: 12)).foregroundStyle(palette.gold) }
            }
        }
    }
}

struct RoomQueueView: View {
    @Bindable var room: RoomSession
    let palette: NativePalette
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            header
            Rectangle().fill(palette.text.opacity(0.1)).frame(height: 1)
            SharedRoomQueue(room: room, palette: palette)
            .overlay {
                if room.visibleQueue.isEmpty && room.recentRoomTracks.isEmpty {
                    VStack(spacing: 12) {
                        Image(systemName: "music.note.list").font(.system(size: 26, weight: .light)).accessibilityHidden(true)
                        Text("Your queue starts here").font(.system(size: 14, weight: .medium))
                        Text("Find music on Home and add it to your room.").font(.system(size: 12))
                            .multilineTextAlignment(.center).foregroundStyle(palette.secondary)
                    }.padding(20)
                }
            }
            if !room.visibleQueue.isEmpty {
                HStack(alignment: .top, spacing: 8) {
                    Image(systemName: room.isReordering ? "arrow.triangle.2.circlepath" : "arrow.up.arrow.down")
                        .accessibilityHidden(true)
                    Text(room.isReordering ? "Updating the shared queue…" : "Drag upcoming tracks to reorder.")
                        .fixedSize(horizontal: false, vertical: true)
                }.font(.system(size: 11)).foregroundStyle(palette.secondary)
            }
        }.padding(20)
            .modifier(RoomQueueGlass(light: palette.light))
            .foregroundStyle(palette.text)
    }
    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Shared queue").font(.system(size: 21, weight: .medium, design: .serif))
                Spacer()
                Text("\(room.visibleQueue.count)").font(.system(size: 12, weight: .medium, design: .rounded)).monospacedDigit()
                    .padding(.horizontal, 10).padding(.vertical, 5)
                    .background(palette.text.opacity(0.07), in: Capsule())
                    .accessibilityLabel("\(room.visibleQueue.count) tracks in the shared queue")
            }
            TimelineView(.periodic(from: .now, by: 1)) { context in
                let known = room.visibleQueue.compactMap { track -> Double? in
                    guard let duration = room.duration(for: track) else { return nil }
                    return max(0, duration - (track.id == room.currentTrack?.id ? room.position(at: context.date) : 0))
                }
                if !known.isEmpty {
                    Text(playbackTime(known.reduce(0, +)) + (known.count < room.visibleQueue.count ? "+ remaining" : " remaining"))
                        .font(.system(size: 12)).foregroundStyle(palette.secondary)
                }
            }
        }
    }
}

/// Untinted native glass lets the album ambience provide the queue's color.
/// Accessibility preferences use a neutral solid surface with stronger edges.
private struct RoomQueueGlass: ViewModifier {
    let light: Bool
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    @Environment(\.colorSchemeContrast) private var contrast
    private var shape: RoundedRectangle { RoundedRectangle(cornerRadius: 24, style: .continuous) }

    func body(content: Content) -> some View {
        surface(content)
            .overlay { shape.strokeBorder((light ? Color.black : .white).opacity(contrast == .increased ? 0.35 : 0.1), lineWidth: 1) }
            .shadow(color: .black.opacity(light ? 0.08 : 0.16), radius: 20, y: 8)
    }
    @ViewBuilder private func surface(_ content: Content) -> some View {
        if reduceTransparency || contrast == .increased {
            content.background(light ? Color(white: 0.97) : Color(white: 0.12), in: shape)
        } else if #available(macOS 26.0, iOS 26.0, *) {
            content.glassEffect(.regular, in: shape)
        } else {
            content.background(.regularMaterial, in: shape)
        }
    }
}


private struct RoomQueueButtonStyle: ButtonStyle {
    let light: Bool
    func makeBody(configuration: Configuration) -> some View {
        QueueButtonSurface(configuration: configuration, light: light)
    }
    private struct QueueButtonSurface: View {
        let configuration: ButtonStyleConfiguration
        let light: Bool
        @Environment(\.isEnabled) private var enabled
        @State private var hovered = false
        var body: some View {
            configuration.label
                .background((light ? Color.black : .white).opacity(enabled && (hovered || configuration.isPressed) ? 0.08 : 0),
                            in: RoundedRectangle(cornerRadius: 6))
                .opacity(enabled ? 1 : 0.45)
                .onHover { hovered = $0 }
        }
    }
}
