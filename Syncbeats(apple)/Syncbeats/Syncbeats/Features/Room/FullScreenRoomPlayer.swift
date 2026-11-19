import SwiftUI
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
    @State private var detail: FullScreenDetail = .lyrics
    @State private var compactPanel = false
    @State private var artworkOnly = false
    @State private var showsEqualizer = false
    @State private var lyrics = RoomLyrics()
    private let palette = NativePalette(light: false)
    private var artistLabel: String { lyrics.resolvedArtist.isEmpty ? room.currentTrack?.artistLabel ?? "Music for your room" : lyrics.resolvedArtist }
    var body: some View {
        GeometryReader { geometry in
            let size = geometry.size
            let wide = size.width >= 850 || (size.width >= 650 && size.height < 580)
            let dockHeight: CGFloat = size.width >= 1000 ? 96 : 120
            let cover = min(wide ? min(size.width * 0.31, 450) : size.width * 0.58,
                            max(120, (size.height - dockHeight - 135) * (wide ? 0.72 : 0.63)))
            ZStack {
                RoomAlbumAmbient(room: room)
                VStack(spacing: 0) {
                    header(wide: wide).padding(.horizontal, 28).padding(.top, 16)
                    if artworkOnly {
                        artwork(size: min(size.width * 0.6, max(120, size.height - dockHeight - 160)))
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                    } else if wide {
                        HStack(spacing: min(90, size.width * 0.06)) {
                            artwork(size: cover).frame(maxWidth: .infinity, maxHeight: .infinity)
                            detailPane(compact: false).frame(maxWidth: .infinity, maxHeight: .infinity)
                        }.padding(.horizontal, max(30, size.width * 0.055)).padding(.top, 28).padding(.bottom, 30)
                    } else {
                        ZStack {
                            VStack(spacing: 18) {
                                Spacer(minLength: 4)
                                artwork(size: cover)
                                Spacer(minLength: 4)
                                detailTabs(compact: true)
                            }
                            if compactPanel {
                                detailPane(compact: true).padding(18)
                                    .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 20))
                                    .overlay { RoundedRectangle(cornerRadius: 20).stroke(.white.opacity(0.12)) }
                            }
                        }.padding(.horizontal, 20).padding(.vertical, 18)
                    }
                    if !artworkOnly { dock(wide: size.width >= 1000).padding(.horizontal, 24).padding(.bottom, 20) }
                }
            }.foregroundStyle(.white).frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .task(id: FullScreenLyricsIdentity(request: room.currentTrack?.artworkRequest, duration: room.duration?.rounded())) {
            await lyrics.load(track: room.currentTrack, duration: room.duration)
        }
    }
    private func header(wide: Bool) -> some View {
        HStack(spacing: 12) {
            Button(action: onClose) { Image(systemName: "chevron.down").frame(width: 40, height: 40) }
                .accessibilityLabel("Close full-screen player").keyboardShortcut(.escape, modifiers: [])
            if wide {
                Text("Listening together").font(.system(size: 13, weight: .medium))
                Text(room.roomID.map { "/ \($0)" } ?? "").font(.system(size: 12)).foregroundStyle(.white.opacity(0.55))
            }
            Spacer()
            RoomConnectionBadge(room: room, palette: palette)
            Button { detail = .devices; compactPanel = true; artworkOnly = false } label: {
                Label("\(room.participants.count)", systemImage: "hifispeaker.and.homepod").font(.system(size: 12))
            }.accessibilityLabel("Show connected devices")
            Button { showsEqualizer = true } label: {
                Image(systemName: "slider.horizontal.3").frame(width: 40, height: 40)
            }.accessibilityLabel("Equalizer for this Mac")
                .popover(isPresented: $showsEqualizer) { RoomEqualizerView(audio: room.audio) }
            Button { artworkOnly.toggle() } label: { Image(systemName: artworkOnly ? "rectangle.split.2x1" : "photo").frame(width: 40, height: 40) }
                .accessibilityLabel(artworkOnly ? "Show player details" : "Show artwork only")
        }.buttonStyle(.plain)
    }
    private func artwork(size: CGFloat) -> some View {
        VStack(alignment: .leading, spacing: 20) {
            RoomArtwork(request: room.currentTrack?.artworkRequest, palette: palette)
                .frame(width: size, height: size).clipShape(RoundedRectangle(cornerRadius: 13))
                .shadow(color: .black.opacity(0.23), radius: 35, y: 20)
            VStack(alignment: .leading, spacing: 9) {
                Text(room.currentTrack?.title ?? "Choose a track").font(.system(size: size < 250 ? 25 : 36, weight: .semibold)).lineLimit(2)
                Text(artistLabel).font(.system(size: 16)).foregroundStyle(.white.opacity(0.8)).lineLimit(1)
            }.frame(width: size, alignment: .leading)
        }
    }
    private func detailTabs(compact: Bool) -> some View {
        HStack(spacing: 4) {
            ForEach(FullScreenDetail.allCases, id: \.self) { tab in
                Button { detail = tab; if compact { compactPanel = true } } label: {
                    Label(tab.rawValue, systemImage: tab.symbol).font(.system(size: 12, weight: .medium))
                        .padding(.horizontal, compact ? 10 : 14).padding(.vertical, 10)
                        .background(detail == tab ? .white.opacity(0.13) : .clear, in: RoundedRectangle(cornerRadius: 9))
                }.accessibilityAddTraits(detail == tab ? .isSelected : [])
            }
        }.padding(4).background(.black.opacity(0.13), in: RoundedRectangle(cornerRadius: 13)).buttonStyle(.plain)
    }
    private func detailPane(compact: Bool) -> some View {
        VStack(spacing: 22) {
            HStack {
                detailTabs(compact: compact)
                Spacer(minLength: 0)
                if compact {
                    Button { compactPanel = false } label: { Image(systemName: "xmark").frame(width: 30, height: 30) }
                        .buttonStyle(.plain).accessibilityLabel("Close detail panel")
                }
            }
            Group {
                switch detail {
                case .lyrics: FullScreenLyricsView(room: room, lyrics: lyrics)
                case .queue: queue
                case .devices: devices
                }
            }.frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }
    private var queue: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                Text("Shared queue · \(room.queue.count)").font(.system(size: 12)).foregroundStyle(.white.opacity(0.6)).padding(.bottom, 8)
                if room.queue.isEmpty { Text("Find your next track on Home.").foregroundStyle(.white.opacity(0.65)) }
                ForEach(room.queue) { track in
                    FullScreenQueueRow(track: track, room: room)
                }
            }
        }
    }
    private var devices: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Text("Your sound, together.").font(.system(size: 22, weight: .semibold))
                Text("\(room.participants.count) connected devices").font(.system(size: 12)).foregroundStyle(.white.opacity(0.6))
                ForEach(room.participants) { participant in
                    let own = participant.id == room.ownSocketID
                    VStack(spacing: 14) {
                        HStack(spacing: 12) {
                            Image(systemName: own ? "desktopcomputer" : "hifispeaker").frame(width: 34, height: 34).background(.white.opacity(0.07), in: RoundedRectangle(cornerRadius: 9))
                            VStack(alignment: .leading, spacing: 4) {
                                Text(participant.displayName).font(.system(size: 14, weight: .medium)).lineLimit(1)
                                Text(own ? "This Mac" : participant.outputDeviceName ?? "Connected device").font(.system(size: 11)).foregroundStyle(.white.opacity(0.6))
                            }
                            Spacer()
                            Text(participant.isBlocked == true ? "Blocked" : participant.isReady ? "Ready" : "Preparing")
                                .font(.system(size: 10)).foregroundStyle(.white.opacity(0.65))
                        }
                        HStack(spacing: 12) {
                            Image(systemName: "speaker.wave.2").font(.system(size: 13)).foregroundStyle(.white.opacity(0.65))
                            RoomDeviceVolume(participant: participant, room: room, palette: palette).tint(palette.gold)
                        }
                    }.padding(15).background(.white.opacity(0.05), in: RoundedRectangle(cornerRadius: 14))
                }
                Button { copyCode() } label: { Label("Copy room code to connect a device", systemImage: "plus").font(.system(size: 12)).frame(maxWidth: .infinity).padding(14) }
                    .buttonStyle(.plain).background(.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 11)).disabled(room.roomID == nil)
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
    private func dock(wide: Bool) -> some View {
        Group {
            if wide {
                HStack(spacing: 28) {
                    dockTrack.frame(width: 185, alignment: .leading)
                    RoomTransport(room: room, palette: palette)
                    RoomProgress(room: room, palette: palette).frame(maxWidth: .infinity)
                    if let local = room.participants.first(where: { $0.id == room.ownSocketID }) {
                        RoomDeviceVolume(participant: local, room: room, palette: palette).frame(width: 105)
                    }
                }
            } else {
                VStack(spacing: 10) {
                    HStack { dockTrack; Spacer(); RoomTransport(room: room, palette: palette, compact: true) }
                    RoomProgress(room: room, palette: palette)
                }
            }
        }.padding(16).background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 20))
            .overlay { RoundedRectangle(cornerRadius: 20).stroke(.white.opacity(0.12)) }
    }
    private var dockTrack: some View {
        HStack(spacing: 10) {
            RoomArtwork(request: room.currentTrack?.artworkRequest, palette: palette).frame(width: 42, height: 42).clipShape(RoundedRectangle(cornerRadius: 7))
            VStack(alignment: .leading, spacing: 5) {
                Text(room.currentTrack?.title ?? "Your room").font(.system(size: 12, weight: .medium)).lineLimit(1)
                Text(room.currentTrack == nil ? "Choose a track" : artistLabel).font(.system(size: 10)).foregroundStyle(.white.opacity(0.65)).lineLimit(1)
            }
        }
    }
}

private struct FullScreenLyricsView: View {
    let room: RoomSession
    @Bindable var lyrics: RoomLyrics
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
                        .foregroundStyle(.white.opacity(0.75)).frame(maxWidth: .infinity, alignment: .leading)
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
        return LyricInkLine(line: line, selected: line.id == active, progress: reduceMotion ? 1 : fill) {
            room.seek(to: line.time); following = true; center(active: line.id, proxy: proxy)
        }.id(line.id)
    }
    private func center(active: Int?, proxy: ScrollViewProxy) {
        guard let active else { return }
        withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.4)) { proxy.scrollTo(active, anchor: .center) }
    }
    private func stateMessage(_ title: String, symbol: String, detail: String? = nil) -> some View {
        VStack(spacing: 12) {
            Image(systemName: symbol).font(.system(size: 24)).foregroundStyle(.white.opacity(0.5))
            Text(title).font(.system(size: 20, weight: .medium))
            if let detail { Text(detail).font(.system(size: 12)).foregroundStyle(.white.opacity(0.55)) }
        }.frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

private struct LyricInkLine: View {
    let line: NativeLyricLine
    let selected: Bool
    let progress: Double
    let onSeek: () -> Void
    var body: some View {
        Button(action: onSeek) {
            Text(line.text.isEmpty ? "···" : line.text)
                .font(.system(size: 28, weight: .semibold)).foregroundStyle(.white)
                .textRenderer(LyricInkRenderer(progress: progress, active: selected))
                .fixedSize(horizontal: false, vertical: true)
                .multilineTextAlignment(.leading).frame(maxWidth: .infinity, alignment: .leading)
        }.buttonStyle(.plain)
            .accessibilityLabel("\(line.text.isEmpty ? "Instrumental passage" : line.text), seek to \(FullScreenTime.format(line.time))")
            .accessibilityAddTraits(selected ? .isSelected : [])
    }
}

private struct FullScreenQueueRow: View {
    let track: RoomTrack
    @Bindable var room: RoomSession
    private let palette = NativePalette(light: false)
    var body: some View {
        Button { room.jump(to: track) } label: {
            HStack(spacing: 13) {
                RoomArtwork(request: track.artworkRequest, palette: palette).frame(width: 52, height: 52).clipShape(RoundedRectangle(cornerRadius: 7))
                VStack(alignment: .leading, spacing: 6) {
                    Text(track.title).font(.system(size: 14, weight: .medium)).lineLimit(2)
                    Text(track.artistLabel).font(.system(size: 12)).foregroundStyle(.white.opacity(0.6)).lineLimit(1)
                }
                Spacer(minLength: 4)
                Text(FullScreenTime.format(room.duration(for: track))).font(.system(size: 11)).monospacedDigit().foregroundStyle(.white.opacity(0.6))
                if track.id == room.currentTrack?.id { Image(systemName: room.isPlaying ? "waveform" : "pause.fill").font(.system(size: 12)) }
            }.padding(13).frame(maxWidth: .infinity, alignment: .leading)
                .background(track.id == room.currentTrack?.id ? Color.white.opacity(0.09) : Color.clear, in: RoundedRectangle(cornerRadius: 13))
        }.buttonStyle(.plain).disabled(!room.canControl).accessibilityLabel("Play \(track.title) in the room")
    }
}
