import SwiftUI
import Combine

/// The compact (collapsed) pill state of the in-app Dynamic Island
struct IslandCompactView: View {
    @ObservedObject var audioPlayer: AudioPlayerManager
    let isExpanded: Bool
    let deviceType: DeviceType
    
    var body: some View {
        HStack(spacing: 10) {
            // Left: thumbnail or music icon
            if let track = audioPlayer.currentTrack {
                // Track thumbnail
                if !track.thumbnailURL.isEmpty {
                    AsyncImage(url: URL(string: track.thumbnailURL)) { phase in
                        if let image = phase.image {
                            image.resizable().scaledToFill()
                        } else {
                            Image(systemName: "music.note")
                                .font(.system(size: 12, weight: .bold))
                                .foregroundColor(.white.opacity(0.6))
                        }
                    }
                    .frame(width: 28, height: 28)
                    .clipShape(RoundedRectangle(cornerRadius: 7))
                } else {
                    ZStack {
                        Circle()
                            .fill(Color.white.opacity(0.1))
                            .frame(width: 28, height: 28)
                        Image(systemName: "music.note")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundColor(.white.opacity(0.6))
                    }
                }
                
                // Title (truncated)
                Text(cleanTrackTitle(track.title))
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(.white)
                    .lineLimit(1)
                    .frame(maxWidth: .infinity, alignment: .leading)
                
                Spacer(minLength: 4)
                
                // Right: audio bars or play state
                if audioPlayer.isDownloading {
                    ProgressView()
                        .progressViewStyle(CircularProgressViewStyle(tint: .white))
                        .scaleEffect(0.6)
                } else if audioPlayer.isPlaying {
                    AudioBarsView()
                } else {
                    Image(systemName: "pause.fill")
                        .font(.system(size: 10))
                        .foregroundColor(.white.opacity(0.5))
                }
            } else {
                // No track — show search prompt
                Spacer()
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(.white.opacity(0.5))
                Text("Search or upload...")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(.white.opacity(0.5))
                    .lineLimit(1)
                Spacer()
            }
        }
        .padding(.horizontal, 14)
        .opacity(isExpanded ? 0 : 1)
        .animation(.easeInOut(duration: 0.15), value: isExpanded)
    }
    
    private func cleanTrackTitle(_ title: String) -> String {
        var cleaned = title
        // Remove common YouTube suffixes
        let patterns = [
            "\\s*[\\[\\(].*?(official|music|video|audio|lyric|lyrics|hd|hq|4k|live).*?[\\)\\]]",
            "\\s*-\\s*.*?(official|music|video|audio).*$"
        ]
        for pattern in patterns {
            if let regex = try? NSRegularExpression(pattern: pattern, options: .caseInsensitive) {
                cleaned = regex.stringByReplacingMatches(in: cleaned, range: NSRange(cleaned.startIndex..., in: cleaned), withTemplate: "")
            }
        }
        return cleaned.trimmingCharacters(in: .whitespaces).isEmpty ? "Unknown Track" : cleaned.trimmingCharacters(in: .whitespaces)
    }
}

/// Animated audio bars like iOS Dynamic Island
struct AudioBarsView: View {
    @State private var heights: [CGFloat] = [0.3, 0.5, 0.4, 0.35]
    
    let timer = Timer.publish(every: 0.15, on: .main, in: .common).autoconnect()
    
    var body: some View {
        HStack(spacing: 2) {
            ForEach(0..<4, id: \.self) { i in
                RoundedRectangle(cornerRadius: 1.5)
                    .fill(Color.white.opacity(0.8))
                    .frame(width: 2.5, height: 14 * heights[i])
            }
        }
        .frame(height: 14)
        .onReceive(timer) { _ in
            withAnimation(.easeInOut(duration: 0.15)) {
                heights = (0..<4).map { _ in CGFloat.random(in: 0.2...1.0) }
            }
        }
    }
}

#Preview {
    IslandCompactView(audioPlayer: AudioPlayerManager.shared, isExpanded: false, deviceType: .notch)
        .background(Color.black)
}

