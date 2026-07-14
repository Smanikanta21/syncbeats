import SwiftUI

struct QueueView: View {
    @ObservedObject var socket = SocketService.shared
    @Binding var isPresented: Bool
    
    var body: some View {
        VStack(spacing: 0) {
            // Header
            HStack {
                Text("Up Next")
                    .font(.title2.bold())
                    .foregroundColor(.white)
                
                Spacer()
                
                Button(action: {
                    withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
                        isPresented = false
                    }
                }) {
                    Image(systemName: "xmark.circle.fill")
                        .font(.title2)
                        .foregroundColor(.white.opacity(0.6))
                }
                .buttonStyle(.plain)
            }
            .padding(24)
            .background(Color.black.opacity(0.2))
            
            Divider().background(Color.white.opacity(0.1))
            
            // Queue List
            ScrollView {
                VStack(spacing: 16) {
                    if let room = socket.currentRoom, !room.queue.isEmpty {
                        ForEach(room.queue) { track in
                            QueueTrackRow(track: track)
                        }
                    } else {
                        VStack(spacing: 16) {
                            Spacer().frame(height: 100)
                            Image(systemName: "music.note.list")
                                .font(.system(size: 48))
                                .foregroundColor(.white.opacity(0.2))
                            Text("Queue is empty")
                                .font(.headline)
                                .foregroundColor(.white.opacity(0.4))
                            if socket.currentRoom == nil {
                                Text("Join a room to see the queue")
                                    .font(.caption)
                                    .foregroundColor(.white.opacity(0.3))
                            }
                        }
                    }
                }
                .padding(24)
            }
        }
        .frame(width: 380, alignment: .trailing)
        .background(.ultraThinMaterial)
        // Add a subtle border to separate from main content
        .overlay(Rectangle().frame(width: 1).foregroundColor(Color.white.opacity(0.1)), alignment: .leading)
    }
}

struct QueueTrackRow: View {
    let track: TrackQueueItem
    @State private var isHovered = false
    
    var body: some View {
        HStack(spacing: 16) {
            // Thumbnail
            ZStack {
                Rectangle()
                    .fill(Color.white.opacity(0.1))
                    .frame(width: 56, height: 56)
                    .cornerRadius(8)
                
                // TrackUrl in TrackQueueItem is the youtube ID. For now we just use a generic icon unless it has a thumbnail URL.
                Image(systemName: track.isCurrent == true ? "speaker.wave.3.fill" : "music.note")
                    .foregroundColor(track.isCurrent == true ? Color(red: 0.0, green: 1.0, blue: 0.7) : .white.opacity(0.6))
            }
            
            // Info
            VStack(alignment: .leading, spacing: 4) {
                Text(track.title)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(track.isCurrent == true ? Color(red: 0.0, green: 1.0, blue: 0.7) : .white)
                    .lineLimit(1)
                
                Text("Added by \(track.addedBy)")
                    .font(.system(size: 11))
                    .foregroundColor(.white.opacity(0.5))
                    .lineLimit(1)
            }
            
            Spacer()
        }
        .padding(8)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(isHovered ? Color.white.opacity(0.05) : Color.clear)
        )
        .onHover { hovering in
            isHovered = hovering
        }
    }
}
