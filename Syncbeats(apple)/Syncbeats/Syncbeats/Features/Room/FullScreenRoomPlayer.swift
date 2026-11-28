import SwiftUI
// Player surface polish informed by unslop by @heydamir (CC BY 4.0).
#if os(macOS)
import AppKit
#else
import UIKit
#endif

private enum FullScreenTime {
    static func format(_ value: Double?) -> String {
        guard let value, value.isFinite, value >= 0 else { return "—:—" }
        let seconds = Int(value)
        return String(format: "%d:%02d", seconds / 60, seconds % 60)
    }
}

private enum FullScreenDetail: String, CaseIterable { case lyrics = "Lyrics", queue = "Queue", devices = "Devices"
    var symbol: String { switch self { case .lyrics: "text.alignleft"; case .queue: "list.bullet"; case .devices: "hifispeaker.and.homepod" } }
}

private struct FullScreenLyricsIdentity: Equatable {
    let request: AlbumArtworkRequest?
    let duration: Double?
}

struct FullScreenRoomPlayer: View {
    @Bindable var room: RoomSession
    var onClose: () -> Void
    var startsWithQueue = false
    @State private var detail: FullScreenDetail = .lyrics
    @State private var compactPanel = false
    @State private var videoColors: [CoverColor]?
    @State private var showsEqualizer = false
    @AppStorage("native.videoCoverEnabled") private var videoCoverEnabled = false
    @State private var lyrics = RoomLyrics()
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.colorScheme) private var colorScheme
    @State private var presented = false
    @State private var dragOffset: CGFloat = 0
    @State private var closing = false
    private var palette: NativePalette { NativePalette(light: colorScheme == .light) }
    private var artistLabel: String { lyrics.resolvedArtist.isEmpty ? room.currentTrack?.artistLabel ?? "Music for your room" : lyrics.resolvedArtist }
    var body: some View {
        GeometryReader { geometry in
            let size = geometry.size
            #if os(iOS)
            let mobile = MobilePlayerLayout(size: size)
            let wide = mobile.wide
            let cover = mobile.coverSize
            let compressed = mobile.compressed
            let portraitDetails = mobile.portraitDetails
            #else
            let wide = size.width >= 850 || (size.width >= 650 && size.height < 580)
            let dockHeight: CGFloat = size.width >= 1000 ? 96 : 120
            let cover = min(wide ? min(size.width * 0.31, 450) : size.width * 0.58,
                            max(120, (size.height - dockHeight - 135) * (wide ? 0.72 : 0.63)))
            let compressed = false
            let portraitDetails = false
            #endif
            ZStack {
                RoomAlbumAmbient(room: room, light: palette.light, videoColors: videoColors)
                    .overlay(palette.background.opacity(palette.light ? 0.55 : 0.35))
                    .ignoresSafeArea(.container, edges: .all)
                VStack(spacing: 0) {
                    header(wide: wide, compactDetails: compressed && !wide, compactControls: size.width < 600).padding(.horizontal, size.width < 600 ? 16 : 28).padding(.top, 12)
                    if portraitDetails {
                        VStack(spacing: 16) {
                            if compactPanel {
                                detailPane(compact: true, showsTabs: false)
                                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                            } else {
                                Spacer(minLength: 0)
                                artwork(size: cover, compressed: compressed, textWidth: min(size.width - 48, max(cover, 280)))
                                Spacer(minLength: 0)
                            }
                            detailTabs(compact: true)
                        }.padding(.horizontal, 24).padding(.vertical, 16)
                    } else if wide {
                        HStack(spacing: size.width >= 1200 ? 64 : 40) {
                            artwork(size: cover, compressed: compressed).frame(maxWidth: .infinity, maxHeight: .infinity)
                            detailPane(compact: false).frame(maxWidth: .infinity, maxHeight: .infinity)
                        }.padding(.horizontal, size.width >= 1200 ? 64 : 32).padding(.vertical, compressed ? 8 : 24)
                    } else {
                        ZStack {
                            VStack(spacing: compressed ? 8 : 16) {
                                Spacer(minLength: 4)
                                artwork(size: cover, compressed: compressed)
                                Spacer(minLength: 4)
                                if !compressed { detailTabs(compact: true) }
                            }
                            if compactPanel {
                                detailPane(compact: true).padding(16)
                                    .background(palette.background, in: RoundedRectangle(cornerRadius: 16))
                                    .overlay { RoundedRectangle(cornerRadius: 16).stroke(palette.line) }
                            }
                        }.padding(.horizontal, 24).padding(.vertical, compressed ? 8 : 16)
                    }
                    dock(wide: size.width >= 1000, compressed: compressed).padding(.horizontal, size.width < 600 ? 16 : 24).padding(.top, compressed ? 0 : 8).padding(.bottom, 12)
                }
            }.foregroundStyle(palette.text).frame(maxWidth: .infinity, maxHeight: .infinity)
                .offset(y: reduceMotion ? 0 : presented ? dragOffset : size.height)
                .opacity(reduceMotion && !presented ? 0 : 1)
        }
        #if os(macOS)
        .clipped()
        .onExitCommand(perform: dismissPlayer)
        #else
        .background(.clear)
        #endif
        .onAppear {
            if startsWithQueue { detail = .queue; compactPanel = true }
            #if os(iOS)
            // The system cover supplies the entrance; dismissal is interactive here.
            NativeDisplaySleep.allow()
            presented = true
            #else
            withAnimation(reduceMotion ? .easeOut(duration: 0.12) : .spring(response: 0.42, dampingFraction: 0.9)) { presented = true }
            #endif
        }
        .task(id: FullScreenLyricsIdentity(request: room.currentTrack?.artworkRequest, duration: room.duration?.rounded())) {
            await lyrics.load(track: room.currentTrack, duration: room.duration)
        }
        #if os(iOS)
        .onChange(of: scenePhase) { _, phase in if phase == .active { NativeDisplaySleep.allow() } }
        .onDisappear { NativeDisplaySleep.allow() }
        #endif
    }
    private func header(wide: Bool, compactDetails: Bool = false, compactControls: Bool = false) -> some View {
        HStack(spacing: compactControls ? 12 : 8) {
            Button(action: dismissPlayer) { Image(systemName: "chevron.down").frame(width: 44, height: 44) }
                .accessibilityLabel("Close full-screen player").keyboardShortcut(.escape, modifiers: [])
            if wide {
                Text("Listening together").font(.system(size: 13, weight: .medium))
                Text(room.roomID.map { "/ \($0)" } ?? "").font(.system(size: 12)).foregroundStyle(palette.secondary)
            }
            Spacer()
            RoomConnectionBadge(room: room, palette: palette)
            Button { videoCoverEnabled.toggle() } label: {
                HStack(spacing: 6) {
                    Image(systemName: videoCoverEnabled ? "play.rectangle.fill" : "play.rectangle")
                    if !compactDetails && !compactControls { Text("Video cover").font(.system(size: 12)) }
                }.frame(minWidth: 44, minHeight: 44).foregroundStyle(videoCoverEnabled ? palette.gold : palette.text)
            }.accessibilityLabel(videoCoverEnabled ? "Turn off video cover" : "Turn on video cover")
                .help("Video cover · muted YouTube video while playing")
                .disabled(room.currentTrack.flatMap { YouTubeIdentity.id(in: $0.trackUrl) } == nil)
            if compactDetails {
                Menu {
                    ForEach(FullScreenDetail.allCases, id: \.self) { tab in
                        Button(tab.rawValue, systemImage: tab.symbol) { detail = tab; compactPanel = true }
                    }
                } label: { Image(systemName: "list.bullet.rectangle").frame(width: 44, height: 44) }
                    .accessibilityLabel("Lyrics, queue and devices")
            } else { Button { detail = .devices; compactPanel = true } label: {
                Label("\(room.participants.count)", systemImage: "hifispeaker.and.homepod").font(.system(size: 12))
                .frame(minWidth: 44, minHeight: 44)
            }.accessibilityLabel("Show connected devices") }
            Button { showsEqualizer = true } label: {
                Image(systemName: "slider.horizontal.3").frame(width: 44, height: 44)
            }.accessibilityLabel("Equalizer for \(NativeDevice.thisDevice)")
                .popover(isPresented: $showsEqualizer) { RoomEqualizerView(audio: room.audio) }
        }.buttonStyle(.plain).contentShape(Rectangle()).simultaneousGesture(dismissGesture)
    }
    private var dismissGesture: some Gesture {
        DragGesture(minimumDistance: 18)
            .onChanged { value in
                guard !closing, PlayerGestures.isDownward(value.translation) else { return }
                dragOffset = reduceMotion ? 0 : value.translation.height
            }
            .onEnded { value in
                if PlayerGestures.dismisses(translation: value.translation, predicted: value.predictedEndTranslation) {
                    dismissPlayer()
                } else {
                    withAnimation(reduceMotion ? nil : .spring(response: 0.3, dampingFraction: 0.9)) { dragOffset = 0 }
                }
            }
    }
    private func dismissPlayer() {
        guard !closing else { return }
        closing = true
        withAnimation(.easeInOut(duration: reduceMotion ? 0.12 : 0.28)) { presented = false }
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(reduceMotion ? 120 : 280))
            onClose()
        }
    }
    private func artwork(size: CGFloat, compressed: Bool = false, textWidth: CGFloat? = nil) -> some View {
        VStack(alignment: .leading, spacing: compressed ? 10 : 24) {
            RoomVideoArtwork(room: room, palette: palette, enabled: videoCoverEnabled, size: size, onColors: { videoColors = $0 })
                .frame(width: size, height: size).clipShape(RoundedRectangle(cornerRadius: 13))
                .shadow(color: .black.opacity(palette.light ? 0.12 : 0.23), radius: 24, y: 12)
                .simultaneousGesture(dismissGesture)
                .frame(width: textWidth ?? size, alignment: .center)
            VStack(alignment: .leading, spacing: 12) {
                Text(room.currentTrack?.title ?? "Choose a track").font(.system(size: compressed ? 16 : size < 250 ? 25 : 36, weight: .semibold)).lineLimit(compressed ? 1 : 2)
                Text(artistLabel).font(.system(size: compressed ? 12 : 16)).foregroundStyle(palette.secondary).lineLimit(1)
            }.frame(width: textWidth ?? (compressed ? max(size, 160) : size), alignment: .leading)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
    private func detailTabs(compact: Bool) -> some View {
        HStack(spacing: 8) {
            ForEach(FullScreenDetail.allCases, id: \.self) { tab in
                Button { detail = tab; if compact { compactPanel = true } } label: {
                    Group {
                        if compact { Text(tab.rawValue) }
                        else { Label(tab.rawValue, systemImage: tab.symbol) }
                    }.font(.system(size: 12, weight: .medium))
                        .padding(.horizontal, compact ? 12 : 14).frame(minHeight: 44)
                        .background(detail == tab ? palette.text.opacity(0.09) : .clear, in: RoundedRectangle(cornerRadius: 8))
                }.accessibilityAddTraits(detail == tab ? .isSelected : [])
            }
        }.padding(4).buttonStyle(NativeButtonStyle(palette: palette))
    }
    private func detailPane(compact: Bool, showsTabs: Bool = true) -> some View {
        VStack(spacing: 22) {
            HStack {
                if showsTabs { detailTabs(compact: compact) }
                Spacer(minLength: 0)
                if compact {
                    Button { compactPanel = false } label: { Image(systemName: "xmark").frame(width: 44, height: 44) }
                        .buttonStyle(.plain).accessibilityLabel("Close detail panel")
                }
            }
            Group {
                switch detail {
                case .lyrics: FullScreenLyricsView(room: room, lyrics: lyrics, palette: palette)
                case .queue: queue
                case .devices: devices
                }
            }.frame(maxWidth: .infinity, maxHeight: .infinity)
                .nativePageTransition(value: detail)
        }
    }
    private var queue: some View {
        SharedRoomQueue(room: room, palette: palette)
    }

    private var devices: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("Your sound, together.").font(.system(size: 22, weight: .semibold))
                Text("\(room.participants.count) connected devices").font(.system(size: 12)).foregroundStyle(palette.secondary)
                NativeHybridConnectionView(room: room, palette: palette)
                ForEach(room.participants) { participant in
                    let own = participant.id == room.ownSocketID
                    VStack(spacing: 14) {
                        HStack(spacing: 12) {
                            Image(systemName: own ? NativeDevice.symbol : participant.deviceSymbol).frame(width: 36, height: 36).background(palette.text.opacity(0.07), in: RoundedRectangle(cornerRadius: 8))
                            VStack(alignment: .leading, spacing: 4) {
                                Text(participant.displayName).font(.system(size: 14, weight: .medium)).lineLimit(1)
                                Text(own ? "Your \(NativeDevice.name)" : participant.outputDeviceName ?? "Connected device").font(.system(size: 11)).foregroundStyle(palette.secondary)
                                if !own {
                                    RoomDeviceConnectionStatus(participantID: participant.id, room: room, palette: palette)
                                }
                            }
                            Spacer()
                            Text(participant.isBlocked == true ? "Blocked" : participant.isReady ? "Ready" : "Preparing")
                                .font(.system(size: 11)).foregroundStyle(palette.secondary)
                        }
                        RoomDeviceTelemetryView(participant: participant, room: room, palette: palette)
                            .padding(.leading, 48)
                        RoomDeviceVolume(participant: participant, room: room, palette: palette).tint(palette.gold)
                        RoomAudioOutputsView(participant: participant, room: room, palette: palette).padding(.leading, 48)
                    }.padding(16).background(palette.text.opacity(0.05), in: RoundedRectangle(cornerRadius: 12))
                }
                Button { copyCode() } label: { Label("Copy room code to connect a device", systemImage: "plus").font(.system(size: 12)).frame(maxWidth: .infinity).padding(14) }
                    .buttonStyle(NativeButtonStyle(palette: palette)).disabled(room.roomID == nil)
            }
        }
    }
    private func copyCode() {
        guard let code = room.roomID else { return }
        #if os(macOS)
        NSPasteboard.general.clearContents(); NSPasteboard.general.setString(code, forType: .string)
        #else
        UIPasteboard.general.string = code
        #endif
    }
    private func dock(wide: Bool, compressed: Bool = false) -> some View {
        Group {
            if wide {
                HStack(spacing: 24) {
                    dockTrack.frame(width: 185, alignment: .leading)
                    RoomTransport(room: room, palette: palette)
                    RoomProgress(room: room, palette: palette).frame(maxWidth: .infinity)
                    if let local = room.participants.first(where: { $0.id == room.ownSocketID }) {
                        RoomDeviceVolume(participant: local, room: room, palette: palette).frame(width: 105)
                    }
                }
            } else {
                #if os(iOS)
                VStack(spacing: compressed ? 8 : 16) {
                    RoomProgress(room: room, palette: palette)
                    RoomTransport(room: room, palette: palette, compact: true, spacious: !compressed).frame(maxWidth: .infinity)
                }
                #else
                VStack(spacing: 10) {
                    HStack { dockTrack; Spacer(); RoomTransport(room: room, palette: palette, compact: true) }
                    RoomProgress(room: room, palette: palette)
                }
                #endif
            }
        }
        #if os(iOS)
        .padding(.horizontal, wide || !compressed ? 16 : 0)
        #else
        .padding(.horizontal, 16)
        #endif
        .padding(.vertical, compressed ? 8 : 16)
        .accessibilityIdentifier("player-inline-controls")
    }
    private var dockTrack: some View {
        HStack(spacing: 10) {
            RoomArtwork(request: room.currentTrack?.artworkRequest, palette: palette).frame(width: 42, height: 42).clipShape(RoundedRectangle(cornerRadius: 7))
            VStack(alignment: .leading, spacing: 5) {
                Text(room.currentTrack?.title ?? "Your room").font(.system(size: 12, weight: .medium)).lineLimit(1)
                Text(room.currentTrack == nil ? "Choose a track" : artistLabel).font(.system(size: 11)).foregroundStyle(palette.secondary).lineLimit(1)
            }
        }
    }
}

private struct FullScreenLyricsView: View {
    let room: RoomSession
    @Bindable var lyrics: RoomLyrics
    let palette: NativePalette
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var following = true
    var body: some View {
        Group {
            switch lyrics.state {
            case .synced:
                TimelineView(.periodic(from: .now, by: room.isPlaying && !reduceMotion ? 1.0 / 30 : 0.25)) { timeline in
                    syncedLyrics(position: room.position(at: timeline.date))
                }
            case .plain:
                ScrollView {
                    Text(lyrics.plain).font(.system(size: 24, weight: .medium)).lineSpacing(12)
                        .foregroundStyle(palette.secondary).frame(maxWidth: .infinity, alignment: .leading)
                }
            case .instrumental: stateMessage("An instrumental moment", symbol: "waveform", detail: "Let the artwork take the stage.")
            case .loading: stateMessage("Finding the lyrics…", symbol: "text.alignleft")
            case .unavailable: stateMessage("No lyrics for this track yet", symbol: "text.alignleft", detail: "Your queue and devices are still here.")
            case .failed:
                VStack(spacing: 16) {
                    stateMessage("Couldn't load lyrics", symbol: "wifi.exclamationmark")
                    Button("Try again") { Task { await lyrics.load(track: room.currentTrack, duration: room.duration) } }.buttonStyle(.plain)
                }
            }
        }.onChange(of: room.currentTrack?.id) { following = true }
    }
    private func syncedLyrics(position: Double) -> some View {
        let active = lyrics.lines.last(where: { $0.time <= position })?.id
        return ScrollViewReader { proxy in
            lyricScroll(position: position, active: active, proxy: proxy)
                .overlay(alignment: .topTrailing) { backToLive(active: active, proxy: proxy) }
                .onChange(of: active) { _, id in
                    if following { center(active: id, proxy: proxy) }
                }
                .onAppear { if following, let active { proxy.scrollTo(active, anchor: .center) } }
        }
    }
    private func lyricScroll(position: Double, active: Int?, proxy: ScrollViewProxy) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                ForEach(lyrics.lines) { line in
                    lyricLine(line, position: position, active: active, proxy: proxy)
                }
            }.padding(.vertical, 70).padding(.horizontal, 2)
        }.onScrollPhaseChange { _, phase in
            if phase == .interacting { following = false }
        }
    }
    @ViewBuilder private func backToLive(active: Int?, proxy: ScrollViewProxy) -> some View {
        if !following {
            Button { following = true; center(active: active, proxy: proxy) } label: {
                Label("Back to live", systemImage: "arrow.down.to.line").font(.system(size: 12, weight: .medium))
            }.buttonStyle(.bordered).padding(8)
        }
    }
    private func lyricLine(_ line: NativeLyricLine, position: Double, active: Int?, proxy: ScrollViewProxy) -> some View {
        let next = lyrics.lines.first(where: { $0.time > line.time })?.time
        let fill = NativeLRC.fillProgress(line: line, nextTime: next, position: position, duration: room.duration)
        return LyricInkLine(line: line, selected: line.id == active, progress: reduceMotion ? 1 : fill, palette: palette) {
            room.seek(to: line.time); following = true; center(active: line.id, proxy: proxy)
        }.id(line.id)
    }
    private func center(active: Int?, proxy: ScrollViewProxy) {
        guard let active else { return }
        withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.4)) { proxy.scrollTo(active, anchor: .center) }
    }
    private func stateMessage(_ title: String, symbol: String, detail: String? = nil) -> some View {
        VStack(spacing: 12) {
            Image(systemName: symbol).font(.system(size: 24)).foregroundStyle(palette.secondary)
            Text(title).font(.system(size: 20, weight: .medium))
            if let detail { Text(detail).font(.system(size: 12)).foregroundStyle(palette.secondary) }
        }.frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

private struct LyricInkLine: View {
    let line: NativeLyricLine
    let selected: Bool
    let progress: Double
    let palette: NativePalette
    let onSeek: () -> Void
    var body: some View {
        Button(action: onSeek) {
            Text(line.text.isEmpty ? "···" : line.text)
                .font(.system(size: 28, weight: .semibold)).foregroundStyle(palette.text)
                .textRenderer(LyricInkRenderer(progress: progress, active: selected, inactiveOpacity: palette.light ? 0.6 : 0.45))
                .fixedSize(horizontal: false, vertical: true)
                .multilineTextAlignment(.leading).frame(maxWidth: .infinity, alignment: .leading)
        }.buttonStyle(.plain)
            .accessibilityLabel("\(line.text.isEmpty ? "Instrumental passage" : line.text), seek to \(FullScreenTime.format(line.time))")
            .accessibilityAddTraits(selected ? .isSelected : [])
    }
}
