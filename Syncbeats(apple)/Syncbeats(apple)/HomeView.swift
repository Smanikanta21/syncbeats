import SwiftUI

struct HomeView: View {
    @StateObject private var yt = YouTubeService.shared
    @ObservedObject private var auth = AuthManager.shared
    
    @State private var hoveredTrackId: String? = nil
    
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 32) {
                // Header
                HStack {
                    Text("Home")
                        .font(.system(size: 36, weight: .bold, design: .rounded))
                        .foregroundColor(.white)
                    Spacer()
                }
                .padding(.horizontal)
                
                if auth.ytToken == nil {
                    VStack(spacing: 16) {
                        Image(systemName: "music.note.house.fill")
                            .font(.system(size: 48))
                            .foregroundColor(.gray)
                        Text("Welcome to SyncBeats")
                            .font(.title2.bold())
                            .foregroundColor(.white)
                        Text("Connect your YouTube account in the Library tab to see your personalized recommendations and most listened tracks.")
                            .foregroundColor(.gray)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 40)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.top, 60)
                } else if yt.isLoading && yt.homeSections.isEmpty {
                    ProgressView()
                        .padding()
                        .frame(maxWidth: .infinity)
                } else {
                    ForEach(yt.homeSections) { section in
                        VStack(alignment: .leading, spacing: 16) {
                            Text(section.title)
                                .font(.title2.bold())
                                .foregroundColor(.white)
                                .padding(.horizontal)
                            
                            ScrollView(.horizontal, showsIndicators: false) {
                                HStack(spacing: 20) {
                                    if let tracks = section.tracks {
                                        ForEach(tracks) { track in
                                            TrackCard(track: track, hoveredTrackId: $hoveredTrackId)
                                        }
                                    }
                                }
                                .padding(.horizontal)
                                .padding(.bottom, 20)
                            }
                        }
                    }
                }
            }
            .padding(.top, 24)
            .padding(.bottom, 100) // Space for floating FAB
        }
        .onAppear {
            Task {
                if auth.ytToken != nil && yt.homeSections.isEmpty {
                    await yt.fetchHomeData()
                }
            }
        }
    }
}

struct TrackCard: View {
    let track: YouTubeService.Track
    @Binding var hoveredTrackId: String?
    
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            ZStack {
                Rectangle()
                    .fill(Color.white.opacity(0.05))
                    .aspectRatio(1, contentMode: .fit)
                    .cornerRadius(16)
                
                if let thumb = track.thumbnail, let url = URL(string: thumb) {
                    AsyncImage(url: url) { phase in
                        if let image = phase.image {
                            image.resizable().aspectRatio(contentMode: .fill)
                        }
                    }
                }
                
                let isHovered = hoveredTrackId == track.id
                
                if isHovered {
                    Color.black.opacity(0.4)
                    Image(systemName: "play.circle.fill")
                        .font(.system(size: 48))
                        .foregroundColor(Color(red: 0.0, green: 1.0, blue: 0.7))
                        .shadow(radius: 10)
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .shadow(color: .black.opacity(hoveredTrackId == track.id ? 0.6 : 0.2), radius: hoveredTrackId == track.id ? 16 : 8, y: hoveredTrackId == track.id ? 8 : 4)
            .scaleEffect(hoveredTrackId == track.id ? 1.05 : 1.0)
            .animation(.spring(response: 0.3, dampingFraction: 0.6), value: hoveredTrackId)
            
            Text(track.title)
                .font(.headline)
                .foregroundColor(.white)
                .lineLimit(1)
            
            Text(track.artist)
                .font(.subheadline)
                .foregroundColor(.gray)
                .lineLimit(1)
        }
        .frame(width: 180)
        .onHover { hovering in
            if hovering {
                hoveredTrackId = track.id
            } else if hoveredTrackId == track.id {
                hoveredTrackId = nil
            }
        }
        .onTapGesture {
            YouTubeService.shared.logListen(track: track)
            SocketService.shared.playTrackDirectly(videoId: track.id, title: track.title)
        }
    }
}
