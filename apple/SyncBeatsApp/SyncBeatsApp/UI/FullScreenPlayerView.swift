import SwiftUI

struct FullScreenPlayerView: View {
    @ObservedObject var audioPlayer: AudioPlayerManager
    @Environment(\.presentationMode) var presentationMode
    @State private var showingDevicePicker = false
    
    // Extracted from IslandExpandedView logic
    private var progress: Double {
        guard audioPlayer.duration > 0 else { return 0 }
        return audioPlayer.currentTime / audioPlayer.duration
    }
    
    var body: some View {
        VStack(spacing: 30) {
            // Drag indicator & close button
            HStack {
                Spacer()
                Button(action: {
                    presentationMode.wrappedValue.dismiss()
                }) {
                    Image(systemName: "chevron.down.circle.fill")
                        .font(.system(size: 28))
                        .foregroundColor(.white.opacity(0.5))
                }
            }
            .padding(.top, 20)
            .padding(.horizontal, 20)
            
            // Album Art
            if let track = audioPlayer.currentTrack, !track.thumbnailURL.isEmpty {
                AsyncImage(url: URL(string: track.thumbnailURL)) { phase in
                    if let image = phase.image {
                        image.resizable().scaledToFill()
                    } else {
                        Color.gray.opacity(0.3)
                    }
                }
                .frame(width: UIScreen.main.bounds.width - 60, height: UIScreen.main.bounds.width - 60)
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .shadow(color: .black.opacity(0.5), radius: 10)
            } else {
                ZStack {
                    Color.gray.opacity(0.2)
                    Image(systemName: "music.note")
                        .font(.system(size: 60))
                        .foregroundColor(.white.opacity(0.3))
                }
                .frame(width: UIScreen.main.bounds.width - 60, height: UIScreen.main.bounds.width - 60)
                .clipShape(RoundedRectangle(cornerRadius: 12))
            }
            
            // Track Info
            VStack(alignment: .leading, spacing: 4) {
                Text(audioPlayer.currentTrack?.title ?? "Unknown Title")
                    .font(.system(size: 22, weight: .bold))
                    .foregroundColor(.white)
                    .lineLimit(1)
                
                Text(audioPlayer.currentTrack?.artist ?? "Unknown Artist")
                    .font(.system(size: 16, weight: .regular))
                    .foregroundColor(.white.opacity(0.6))
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 30)
            
            // Scrubber
            VStack(spacing: 8) {
                GeometryReader { geometry in
                    ZStack(alignment: .leading) {
                        // Background track
                        RoundedRectangle(cornerRadius: 3)
                            .fill(Color.white.opacity(0.2))
                            .frame(height: 6)
                        
                        // Progress
                        RoundedRectangle(cornerRadius: 3)
                            .fill(Color.white)
                            .frame(width: max(0, geometry.size.width * CGFloat(progress)), height: 6)
                    }
                    .gesture(
                        DragGesture(minimumDistance: 0)
                            .onChanged { value in
                                let percentage = max(0, min(1, value.location.x / geometry.size.width))
                                let newTime = percentage * audioPlayer.duration
                                audioPlayer.seek(to: newTime)
                            }
                    )
                }
                .frame(height: 6)
                
                HStack {
                    Text(formatTime(audioPlayer.currentTime))
                    Spacer()
                    Text("-" + formatTime(audioPlayer.duration - audioPlayer.currentTime))
                }
                .font(.system(size: 12, weight: .medium, design: .monospaced))
                .foregroundColor(.white.opacity(0.5))
            }
            .padding(.horizontal, 30)
            
            // Controls
            HStack {
                // Shuffle Icon
                Button(action: {}) {
                    Image(systemName: "shuffle")
                        .font(.system(size: 20))
                        .foregroundColor(.white.opacity(0.6))
                }
                
                Spacer()
                
                Button(action: {
                    let newTime = max(0, audioPlayer.currentTime - 15)
                    audioPlayer.seek(to: newTime)
                }) {
                    Image(systemName: "gobackward.15")
                        .font(.system(size: 28))
                        .foregroundColor(.white)
                }
                
                Spacer()
                
                Button(action: {
                    audioPlayer.togglePlayPause()
                }) {
                    Image(systemName: audioPlayer.isPlaying ? "pause.circle.fill" : "play.circle.fill")
                        .font(.system(size: 64))
                        .foregroundColor(.white)
                }
                
                Spacer()
                
                Button(action: {
                    let newTime = min(audioPlayer.duration, audioPlayer.currentTime + 15)
                    audioPlayer.seek(to: newTime)
                }) {
                    Image(systemName: "goforward.15")
                        .font(.system(size: 28))
                        .foregroundColor(.white)
                }
                
                Spacer()
                
                // SyncBeats Icon
                Button(action: {
                    showingDevicePicker = true
                }) {
                    Image(systemName: "arrow.triangle.2.circlepath")
                        .font(.system(size: 20))
                        .foregroundColor(.blue) // Highlighted to represent SyncBeats
                }
            }
            .padding(.horizontal, 40)
            
            Spacer()
        }
        .background(Color(red: 0.1, green: 0.1, blue: 0.12).ignoresSafeArea())
        .sheet(isPresented: $showingDevicePicker) {
            DevicePickerView()
        }
    }
    
    private func formatTime(_ time: Double) -> String {
        guard time > 0 && !time.isNaN else { return "0:00" }
        let minutes = Int(time) / 60
        let seconds = Int(time) % 60
        return String(format: "%d:%02d", minutes, seconds)
    }
}

#Preview {
    FullScreenPlayerView(audioPlayer: AudioPlayerManager.shared)
}
