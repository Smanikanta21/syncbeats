import SwiftUI

struct MiniPlayerView: View {
    @ObservedObject var audioPlayer = AudioPlayerManager.shared
    @State private var showingFullScreenPlayer = false
    
    var body: some View {
        VStack(spacing: 0) {
            // Divider line
            Divider()
                .background(Color.white.opacity(0.1))
            
            HStack(spacing: 12) {
                // Album Art
                if let track = audioPlayer.currentTrack, !track.thumbnailURL.isEmpty {
                    AsyncImage(url: URL(string: track.thumbnailURL)) { phase in
                        if let image = phase.image {
                            image.resizable().scaledToFill()
                        } else {
                            Color.gray.opacity(0.3)
                        }
                    }
                    .frame(width: 44, height: 44)
                    .clipShape(RoundedRectangle(cornerRadius: 6))
                    .shadow(color: .black.opacity(0.2), radius: 3)
                } else {
                    ZStack {
                        Color.gray.opacity(0.2)
                        Image(systemName: "music.note")
                            .foregroundColor(.white.opacity(0.5))
                    }
                    .frame(width: 44, height: 44)
                    .clipShape(RoundedRectangle(cornerRadius: 6))
                }
                
                // Track Info
                VStack(alignment: .leading, spacing: 2) {
                    Text(audioPlayer.currentTrack?.title ?? "Not Playing")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundColor(.white)
                        .lineLimit(1)
                    
                    Text(audioPlayer.currentTrack?.artist ?? "Select a track to play")
                        .font(.system(size: 13, weight: .regular))
                        .foregroundColor(.white.opacity(0.6))
                        .lineLimit(1)
                }
                
                Spacer()
                
                // Play/Pause Button
                if SocketManager.shared.isPendingPlay {
                    ProgressView()
                        .progressViewStyle(CircularProgressViewStyle(tint: .white))
                        .frame(width: 44, height: 44)
                } else {
                    Button(action: {
                        audioPlayer.togglePlayPause()
                    }) {
                        Image(systemName: audioPlayer.isPlaying ? "pause.fill" : "play.fill")
                            .font(.system(size: 22))
                            .foregroundColor(.white)
                            .frame(width: 44, height: 44)
                    }
                    .disabled(audioPlayer.currentTrack == nil)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
            .background(
                Rectangle()
                    // Blur effect works well if we have background, but solid color is safe
                    .fill(Color(red: 0.1, green: 0.1, blue: 0.12).opacity(0.98))
            )
            .contentShape(Rectangle())
            .onTapGesture {
                if audioPlayer.currentTrack != nil {
                    showingFullScreenPlayer = true
                }
            }
        }
        .sheet(isPresented: $showingFullScreenPlayer) {
            FullScreenPlayerView(audioPlayer: audioPlayer)
        }
    }
}

#Preview {
    ZStack(alignment: .bottom) {
        Color.black.ignoresSafeArea()
        MiniPlayerView()
    }
}
