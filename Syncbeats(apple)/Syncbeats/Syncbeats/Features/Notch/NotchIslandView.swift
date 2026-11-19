#if os(macOS)
import SwiftUI

struct NotchIslandView: View {
    let room: RoomSession
    let controller: NotchWindowController
    private let palette = NativePalette(light: false)
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    private var reveal: Double { min(1, max(0, (controller.expansion - 0.18) / 0.72)) }
    private var shape: IslandShape { IslandShape(attached: controller.geometry.hasCameraCutout, expansion: controller.expansion) }

    var body: some View {
        let size = controller.geometry.panelFrame(expansion: controller.expansion).size
        ZStack(alignment: .top) {
            shape.fill(.black)
            VStack(spacing: 0) {
                cap.frame(width: size.width)
                // Keep the open layout stable while its silhouette grows around it.
                // Content remains mounted for the entire closing animation as well.
                expandedContent
                    .frame(width: controller.geometry.expandedWidth - 80)
                    .padding(.top, 12).padding(.bottom, 20)
                    .opacity(reveal)
                    .offset(y: reduceMotion ? 0 : -8 * (1 - reveal))
                    .scaleEffect(reduceMotion ? 1 : 0.97 + reveal * 0.03, anchor: .top)
                    .allowsHitTesting(controller.expanded && reveal > 0.95)
                    .accessibilityHidden(!controller.expanded || reveal < 0.95)
            }.frame(width: size.width)
        }
        .frame(width: size.width, height: size.height, alignment: .top)
        .overlay(alignment: .bottom) {
            Capsule().fill(palette.secondary.opacity(0.35)).frame(width: 32, height: 4).padding(.bottom, 8).opacity(reveal)
        }
        .clipShape(shape)
        .contentShape(shape)
        .foregroundStyle(palette.text)
        .preferredColorScheme(.dark)
        .ignoresSafeArea(.container, edges: .all)
        .onHover(perform: controller.hover)
        .onExitCommand(perform: controller.collapse)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("SyncBeats notch player")
    }

    /// One full-width button includes the visible lip below the camera. Artwork and
    /// the music indicator stay in the wings; the hardware camera region is empty.
    private var cap: some View {
        Button(action: controller.toggleFromClick) {
            HStack(spacing: 0) {
                RoomArtwork(request: room.currentTrack?.artworkRequest, palette: palette)
                    .frame(width: 23, height: 23).frame(maxWidth: .infinity)
                if controller.geometry.hasCameraCutout {
                    Color.clear.frame(width: controller.geometry.cameraWidth)
                }
                Image(systemName: room.isPlaying ? "waveform" : "music.note")
                    .font(.system(size: 14, weight: .medium)).foregroundStyle(palette.gold)
                    .frame(maxWidth: .infinity)
            }
            .padding(.horizontal, controller.geometry.hasCameraCutout ? 10 : 16)
            .frame(maxWidth: .infinity)
            .frame(height: controller.geometry.closedHeight)
            .contentShape(Rectangle())
        }.buttonStyle(.plain)
            .accessibilityLabel(controller.expanded ? "Close SyncBeats notch player" : "Open SyncBeats notch player")
            .help(controller.expanded ? "Click to close" : "Click to open")
    }

    private var expandedContent: some View {
        VStack(spacing: 12) {
            HStack(spacing: 12) {
                RoomArtwork(request: room.currentTrack?.artworkRequest, palette: palette).frame(width: 52, height: 52)
                VStack(alignment: .leading, spacing: 4) {
                    Text(room.currentTrack?.title ?? "Your listening room")
                        .font(.system(size: 14, weight: .medium)).lineLimit(1)
                    Text(room.currentTrack?.artistLabel ?? "Find a song to get started")
                        .font(.system(size: 11)).foregroundStyle(palette.secondary).lineLimit(1)
                }.frame(maxWidth: .infinity, alignment: .leading)
                Button(action: controller.collapse) {
                    Image(systemName: "xmark").font(.system(size: 12))
                        .foregroundStyle(palette.quiet).frame(width: 24, height: 30)
                }.buttonStyle(NativeButtonStyle(palette: palette)).help("Close player")
                    .accessibilityLabel("Close notch player")
            }
            RoomProgress(room: room, palette: palette)
            RoomTransport(room: room, palette: palette, compact: true)
            Rectangle().fill(palette.line.opacity(0.8)).frame(height: 1)
            HStack(spacing: 9) {
                Image(systemName: "text.line.first.and.arrowtriangle.forward").font(.system(size: 11)).foregroundStyle(palette.gold)
                Text(room.upcoming.first.map { "Next · " + $0.title } ?? (room.currentTrack == nil ? "Your queue is ready for a first song" : "End of the queue"))
                    .font(.system(size: 11)).foregroundStyle(palette.secondary).lineLimit(1)
                Spacer(minLength: 0)
            }
            HStack {
                RoomConnectionBadge(room: room, palette: palette)
                Spacer()
                Button(action: controller.openRoom) {
                    HStack(spacing: 8) { Text("Open room"); Image(systemName: "arrow.up.right") }
                        .font(.system(size: 11, weight: .medium)).foregroundStyle(palette.gold)
                }.buttonStyle(NativeButtonStyle(palette: palette))
            }
        }
    }
}
#endif
