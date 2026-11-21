#if os(macOS)
import SwiftUI

struct NotchIslandView: View {
    let room: RoomSession
    let controller: NotchWindowController
    @State private var showsEqualizer = false
    private let palette = NativePalette(light: false)
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    private var reveal: Double { min(1, max(0, (controller.expansion - 0.18) / 0.72)) }
    private var compactReveal: Double { 1 - min(1, max(0, controller.expansion / 0.22)) }
    private var shape: IslandShape { IslandShape(attached: controller.geometry.hasCameraCutout, expansion: controller.expansion) }

    var body: some View {
        // Lay out at rest, then zoom the outline and content together around the
        // top center. The native viewport stays fixed throughout hover.
        let size = controller.restingFrame.size
        let scale = controller.presentationScale
        let presentationSize = controller.presentationFrame.size
        ZStack(alignment: .top) {
            shape.fill(.black)
            VStack(spacing: 0) {
                // Keep the camera spacer, but let the expanded header replace
                // the compact artwork/indicator instead of showing both rows.
                cap.frame(width: size.width)
                    .opacity(compactReveal)
                    .allowsHitTesting(!controller.expanded && compactReveal > 0.95)
                    .accessibilityHidden(controller.expanded || compactReveal < 0.95)
                // Keep the open layout stable while its silhouette grows around it.
                // Content remains mounted for the entire closing animation as well.
                expandedContent
                    .frame(width: controller.geometry.expandedWidth - NotchGeometry.contentSideInset * 2)
                    .fixedSize(horizontal: false, vertical: true)
                    .onGeometryChange(for: CGFloat.self, of: { $0.size.height }, action: controller.updateContentHeight)
                    .padding(.top, NotchGeometry.contentTopInset).padding(.bottom, NotchGeometry.contentBottomInset)
                    .opacity(reveal)
                    .offset(y: reduceMotion ? 0 : -8 * (1 - reveal))
                    .scaleEffect(reduceMotion ? 1 : 0.97 + reveal * 0.03, anchor: .top)
                    .allowsHitTesting(controller.expanded && reveal > 0.95)
                    .accessibilityHidden(!controller.expanded || reveal < 0.95)
            }.frame(width: size.width)
        }
        .frame(width: size.width, height: presentationSize.height / scale, alignment: .top)
        .overlay(alignment: .top) {
            Capsule().fill(palette.secondary.opacity(0.35)).frame(width: 32, height: 4)
                .offset(y: controller.geometry.closedHeight + NotchGeometry.contentTopInset + controller.expandedContentHeight + 12)
                .opacity(reveal)
        }
        .clipShape(shape)
        .contentShape(shape)
        .foregroundStyle(palette.text)
        .preferredColorScheme(.dark)
        .shadow(color: .black.opacity(0.16), radius: 5, x: 0, y: 3)
        .scaleEffect(scale, anchor: .top)
        .frame(width: presentationSize.width, height: presentationSize.height, alignment: .top)
        .padding(.horizontal, NotchGeometry.shadowInset)
        .padding(.bottom, NotchGeometry.shadowBottomInset)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .ignoresSafeArea(.container, edges: .all)
        .onHover(perform: controller.hover)
        .onExitCommand(perform: controller.collapse)
        .onChange(of: showsEqualizer) { _, visible in
            controller.equalizerPresented = visible
            if !visible { controller.equalizerDismissed() }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("SyncBeats notch player")
    }

    /// The camera/artwork opens the island; the right wing controls playback.
    private var cap: some View {
        HStack(spacing: 0) {
            Button(action: controller.toggleFromClick) {
                RoomArtwork(request: room.currentTrack?.artworkRequest, palette: palette)
                    .frame(width: controller.geometry.compactArtworkSize,
                           height: controller.geometry.compactArtworkSize)
                    .frame(width: NotchGeometry.sideWingWidth, height: controller.geometry.closedHeight)
                    .contentShape(Rectangle())
            }.buttonStyle(.plain).accessibilityLabel("Open notch player")
            Button(action: controller.toggleFromClick) {
                Color.clear
                    .frame(width: controller.geometry.cameraWidth + NotchGeometry.cameraClearance * 2,
                           height: controller.geometry.closedHeight)
                    .contentShape(Rectangle())
            }.buttonStyle(.plain).accessibilityLabel("Open notch player")
            Button(action: controller.togglePlayback) {
                ZStack {
                    AudioSpectrumView(audio: room.audio, compact: true)
                        .frame(width: 24, height: 18)
                        .opacity(room.isPlaying && !controller.pointerInside ? 1 : 0)
                    Image(systemName: room.isPlaying ? "pause.fill" : "play.fill")
                        .font(.system(size: 15, weight: .semibold))
                        .opacity(!room.isPlaying || controller.pointerInside ? 1 : 0)
                }
                .foregroundStyle(palette.gold)
                .frame(width: NotchGeometry.sideWingWidth, height: controller.geometry.closedHeight)
                .contentShape(Rectangle())
                .animation(reduceMotion ? nil : .easeOut(duration: 0.12), value: controller.pointerInside)
                .animation(reduceMotion ? nil : .easeOut(duration: 0.12), value: room.isPlaying)
            }.buttonStyle(.plain).disabled(room.currentTrack == nil)
                .accessibilityLabel(room.isPlaying ? "Pause" : "Play")
        }
        .frame(width: controller.geometry.closedWidth, height: controller.geometry.closedHeight)
        .frame(maxWidth: .infinity)
        .frame(height: controller.geometry.closedHeight, alignment: .top)
    }

    private var expandedContent: some View {
        VStack(spacing: 12) {
            HStack(spacing: 12) {
                RoomArtwork(request: room.currentTrack?.artworkRequest, palette: palette).frame(width: 64, height: 64)
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
            Button { controller.equalizerPresented = true; showsEqualizer = true } label: {
                HStack {
                    Label("Equalizer", systemImage: "slider.horizontal.3").font(.system(size: 11))
                    Spacer()
                    AudioSpectrumView(audio: room.audio).frame(width: 100, height: 24)
                }
            }.buttonStyle(.plain).accessibilityLabel("Open equalizer for this Mac")
                .popover(isPresented: $showsEqualizer) { RoomEqualizerView(audio: room.audio) }

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
