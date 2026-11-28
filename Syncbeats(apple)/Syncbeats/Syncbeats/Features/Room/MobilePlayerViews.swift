#if os(iOS)
import SwiftUI
import AVKit

struct MobileRoomMiniPlayer: View {
    let room: RoomSession
    let palette: NativePalette
    let onExpand: () -> Void
    let onQueue: () -> Void
    var body: some View {
        VStack(spacing: 8) {
            HStack(spacing: 4) {
                Button(action: onExpand) {
                    HStack(spacing: 12) {
                        RoomArtwork(request: room.currentTrack?.artworkRequest, palette: palette)
                            .frame(width: 44, height: 44).clipShape(RoundedRectangle(cornerRadius: 8))
                        VStack(alignment: .leading, spacing: 4) {
                            Text(room.currentTrack?.title ?? "Choose your first track").font(.system(size: 13, weight: .medium)).lineLimit(1)
                            Text(room.localAudioSuspended ? "Tap Play to resume audio" : room.currentTrack?.artistLabel ?? "Your shared room is ready")
                                .font(.system(size: 11)).foregroundStyle(palette.secondary).lineLimit(1)
                        }.frame(maxWidth: .infinity, alignment: .leading)
                    }.contentShape(Rectangle())
                }.buttonStyle(.plain).accessibilityLabel("Open full player")
                    .simultaneousGesture(DragGesture(minimumDistance: 18).onEnded { value in
                        if PlayerGestures.expands(translation: value.translation, predicted: value.predictedEndTranslation) { onExpand() }
                    })
                Button(action: room.togglePlayback) {
                    Image(systemName: room.pendingPlay ? "stop.fill" : room.isPlaying && !room.localAudioSuspended ? "pause.fill" : "play.fill")
                        .font(.system(size: 20)).frame(width: 44, height: 44)
                }.accessibilityLabel(room.localAudioSuspended ? "Resume audio on this device" : room.pendingPlay ? "Cancel pending playback" : room.isPlaying ? "Pause room" : "Play room")
                    .disabled(!room.canControl || room.currentTrack == nil)
                Button(action: room.next) { Image(systemName: "forward.end.fill").frame(width: 44, height: 44) }
                    .accessibilityLabel("Next track").disabled(!room.canControl || room.currentTrack == nil)
                Button(action: onQueue) { Image(systemName: "list.bullet").frame(width: 44, height: 44) }
                    .accessibilityLabel("Open shared queue")
            }.buttonStyle(.plain)
            RoomProgress(room: room, palette: palette)
        }.padding(.horizontal, 16).padding(.vertical, 12)
            .background(palette.background).foregroundStyle(palette.text)
    }
}

/// Uses the system route picker for AirPlay and available audio outputs.
struct MobileAudioRoutePicker: UIViewRepresentable {
    func makeUIView(context: Context) -> AVRoutePickerView {
        let view = AVRoutePickerView()
        view.prioritizesVideoDevices = false
        view.tintColor = .secondaryLabel
        view.activeTintColor = .systemYellow
        return view
    }
    func updateUIView(_ uiView: AVRoutePickerView, context: Context) { }
}
#endif
