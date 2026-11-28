import SwiftUI

/// Row selection and playback use exclusive gestures so a double-click plays once.
struct NativeLibrarySongRow<Controls: View>: View {
    let song: NativeLibrarySong
    let palette: NativePalette
    var layout: NativeLibraryLayout = .list
    let selected: Bool
    let canPlay: Bool
    let select: () -> Void
    let play: () -> Void
    @ViewBuilder let controls: () -> Controls
    @State private var hovered = false

    var body: some View {
        Group {
            if layout == .gallery {
                VStack(alignment: .leading, spacing: 12) {
                    playbackRegion
                    HStack(spacing: 12) {
                        if let duration = song.duration {
                            Text(playbackTime(duration)).font(.system(size: 11, design: .monospaced)).foregroundStyle(palette.quiet)
                        }
                        Spacer(minLength: 0)
                        controls()
                    }
                }.padding(12)
            } else {
                HStack(spacing: 14) {
                    playbackRegion.padding(.vertical, 12).padding(.leading, 12)
                    controls().padding(.trailing, 12)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(RoundedRectangle(cornerRadius: 12))
        .modifier(NativeLibraryHoverSurface(palette: palette, selected: selected, hovered: hovered))
        .onHover { hovered = $0 }
        .zIndex(hovered ? 1 : 0)
    }

    private var playbackRegion: some View {
        Group {
            if layout == .gallery {
                VStack(alignment: .leading, spacing: 12) {
                    artwork.aspectRatio(1, contentMode: .fit)
                    labels
                }
            } else {
                HStack(spacing: 14) {
                    artwork.frame(width: 48, height: 48)
                    labels
                    if let duration = song.duration {
                        Text(playbackTime(duration)).font(.system(size: 11, design: .monospaced)).foregroundStyle(palette.quiet)
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
        .gesture(TapGesture(count: 2).exclusively(before: TapGesture()).onEnded { event in
            switch event {
            case .first: if canPlay { play() }
            case .second: select()
            }
        })
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(song.title), \(song.artist)")
        .accessibilityHint("Double-click to play in the room")
        .accessibilityAddTraits(selected ? [.isButton, .isSelected] : .isButton)
        .accessibilityAction { if canPlay { play() } }
    }

    private var artwork: some View {
        DiscoveryArtwork(source: .song(song.discoveryRequest), palette: palette, radius: 8)
    }
    private var labels: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(song.title).font(.system(size: 13, weight: .medium)).lineLimit(2)
            Text(song.artist.isEmpty ? sourceName : song.artist).font(.system(size: 12)).foregroundStyle(palette.secondary).lineLimit(1)
            if let album = song.album, !album.isEmpty { Text(album).font(.system(size: 11)).foregroundStyle(palette.quiet).lineLimit(1) }
        }.frame(maxWidth: .infinity, alignment: .leading)
    }
    private var sourceName: String {
        song.source == "APPLE_MUSIC" ? "Apple Music" : song.source.hasPrefix("SPOTIFY") ? "Spotify" : "SyncBeats"
    }
}
