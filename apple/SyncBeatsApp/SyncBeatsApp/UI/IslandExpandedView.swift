import SwiftUI

/// Expanded state of the in-app Dynamic Island — shows player controls & search
struct IslandExpandedView: View {
    @ObservedObject var audioPlayer: AudioPlayerManager
    @State private var activeTab: IslandTab = .player
    @State private var showingDevicePicker = false
    let isExpanded: Bool
    let deviceType: DeviceType
    
    enum IslandTab: String, CaseIterable {
        case player = "Player"
        case search = "Search"
    }
    
    var body: some View {
        VStack(spacing: 0) {

            // Content
            ZStack {
                if activeTab == .player {
                    playerContent
                        .transition(.asymmetric(
                            insertion: .move(edge: .leading).combined(with: .opacity),
                            removal: .move(edge: .leading).combined(with: .opacity)
                        ))
                } else {
                    VStack(spacing: 0) {
                        HStack {
                            Button(action: {
                                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                                    activeTab = .player
                                }
                            }) {
                                Image(systemName: "chevron.left")
                                    .font(.system(size: 16, weight: .bold))
                                    .foregroundColor(.white.opacity(0.7))
                            }
                            .padding(.leading, 12)
                            .padding(.top, 12)
                            
                            Spacer()
                        }
                        
                        IslandSearchView(audioPlayer: audioPlayer)
                            .padding(.horizontal, 12)
                            .padding(.top, 0)
                    }
                    .transition(.asymmetric(
                        insertion: .move(edge: .trailing).combined(with: .opacity),
                        removal: .move(edge: .trailing).combined(with: .opacity)
                    ))
                }
            }
            .frame(maxHeight: .infinity)
            .clipped()
        }
        .opacity(isExpanded ? 1 : 0)
        .animation(.easeInOut(duration: 0.2).delay(isExpanded ? 0.1 : 0), value: isExpanded)
    }
    
    // MARK: - Player Tab
    
    private var playerContent: some View {
        VStack(spacing: 14) {
            if let track = audioPlayer.currentTrack {
                // Track info
                HStack(spacing: 12) {
                    // Large thumbnail
                    if !track.thumbnailURL.isEmpty {
                        AsyncImage(url: URL(string: track.thumbnailURL)) { phase in
                            if let image = phase.image {
                                image.resizable().scaledToFill()
                            } else {
                                Color.white.opacity(0.1)
                            }
                        }
                        .frame(width: 56, height: 56)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                        .shadow(color: .black.opacity(0.3), radius: 8)
                        .overlay(
                            Group {
                                if audioPlayer.isDownloading {
                                    ZStack {
                                        Color.black.opacity(0.5)
                                        ProgressView()
                                            .progressViewStyle(CircularProgressViewStyle(tint: .white))
                                    }
                                    .clipShape(RoundedRectangle(cornerRadius: 12))
                                }
                            }
                        )
                    } else {
                        ZStack {
                            RoundedRectangle(cornerRadius: 12)
                                .fill(
                                    LinearGradient(
                                        colors: [Color.white.opacity(0.1), Color.white.opacity(0.05)],
                                        startPoint: .topLeading,
                                        endPoint: .bottomTrailing
                                    )
                                )
                                .frame(width: 56, height: 56)
                            Image(systemName: "music.note")
                                .font(.system(size: 22, weight: .bold))
                                .foregroundColor(.white.opacity(0.4))
                        }
                    }
                    
                    VStack(alignment: .leading, spacing: 3) {
                        Text(track.title)
                            .font(.system(size: 15, weight: .bold))
                            .foregroundColor(.white)
                            .lineLimit(2)
                        if !track.artist.isEmpty {
                            Text(track.artist)
                                .font(.system(size: 12, weight: .medium))
                                .foregroundColor(.white.opacity(0.5))
                                .lineLimit(1)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    
                    // Audio bars
                    if audioPlayer.isPlaying {
                        AudioBarsView()
                    }
                }
                .padding(.horizontal, 16)
                
                // Progress bar
                VStack(spacing: 4) {
                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            // Track
                            RoundedRectangle(cornerRadius: 2)
                                .fill(Color.white.opacity(0.1))
                                .frame(height: 4)
                            // Progress
                            RoundedRectangle(cornerRadius: 2)
                                .fill(Color.white.opacity(0.8))
                                .frame(width: geo.size.width * CGFloat(audioPlayer.progress), height: 4)
                        }
                        .contentShape(Rectangle())
                        .gesture(
                            DragGesture(minimumDistance: 0)
                                .onEnded { value in
                                    let fraction = max(0, min(1, value.location.x / geo.size.width))
                                    audioPlayer.seek(to: audioPlayer.duration * Double(fraction))
                                }
                        )
                    }
                    .frame(height: 4)
                    
                    HStack {
                        Text(AudioPlayerManager.formatTime(audioPlayer.currentTime))
                            .font(.system(size: 10, weight: .medium, design: .monospaced))
                            .foregroundColor(.white.opacity(0.4))
                        Spacer()
                        Text("-" + AudioPlayerManager.formatTime(max(0, audioPlayer.duration - audioPlayer.currentTime)))
                            .font(.system(size: 10, weight: .medium, design: .monospaced))
                            .foregroundColor(.white.opacity(0.4))
                    }
                }
                .padding(.horizontal, 16)
                
                // Controls
                ZStack {
                    // Playback controls in exact center
                    HStack(spacing: 32) {
                        // Rewind 10s
                        Button(action: { audioPlayer.seekRelative(by: -10) }) {
                            Image(systemName: "gobackward.10")
                                .font(.system(size: 20, weight: .medium))
                                .foregroundColor(.white.opacity(0.7))
                        }
                        
                        // Play/Pause
                        Button(action: { audioPlayer.togglePlayPause() }) {
                            ZStack {
                                Circle()
                                    .fill(Color.white)
                                    .frame(width: 44, height: 44)
                                Image(systemName: audioPlayer.isPlaying ? "pause.fill" : "play.fill")
                                    .font(.system(size: 18, weight: .bold))
                                    .foregroundColor(.black)
                            }
                        }
                        
                        // Forward 10s
                        Button(action: { audioPlayer.seekRelative(by: 10) }) {
                            Image(systemName: "goforward.10")
                                .font(.system(size: 20, weight: .medium))
                                .foregroundColor(.white.opacity(0.7))
                        }
                    }
                    
                    // SyncBeats button and Search button on edges
                    HStack {
                        // SyncBeats button on far left
                        Button(action: {
                            showingDevicePicker = true
                        }) {
                            Image(systemName: "arrow.triangle.2.circlepath")
                                .font(.system(size: 20, weight: .bold))
                                .foregroundColor(.blue)
                                .padding(10)
                                .background(Color.white.opacity(0.15))
                                .clipShape(Circle())
                        }
                        
                        Spacer()
                        
                        // Search button on far right
                        Button(action: {
                            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                                activeTab = .search
                            }
                        }) {
                            Image(systemName: "magnifyingglass")
                                .font(.system(size: 20, weight: .bold))
                                .foregroundColor(.white)
                                .padding(10)
                                .background(Color.white.opacity(0.15))
                                .clipShape(Circle())
                        }
                    }
                }
                .padding(.horizontal, 24)
            } else {
                // No track playing
                VStack(spacing: 10) {
                    Image(systemName: "waveform")
                        .font(.system(size: 36))
                        .foregroundColor(.white.opacity(0.15))
                    Text("No track playing")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(.white.opacity(0.3))
                    Text("Use the Search icon to find music")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(.white.opacity(0.2))
                    
                    Button(action: {
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                            activeTab = .search
                        }
                    }) {
                        Text("Search Music")
                            .font(.system(size: 14, weight: .bold))
                            .foregroundColor(.black)
                            .padding(.horizontal, 20)
                            .padding(.vertical, 10)
                            .background(Color.white)
                            .clipShape(Capsule())
                    }
                    .padding(.top, 10)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .padding(.top, 8)
        .sheet(isPresented: $showingDevicePicker) {
            DevicePickerView()
        }
    }
}

#Preview {
    IslandExpandedView(audioPlayer: AudioPlayerManager.shared, isExpanded: true, deviceType: .notch)
        .background(Color.black)
}

