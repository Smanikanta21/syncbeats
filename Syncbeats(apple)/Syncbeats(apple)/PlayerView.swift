import SwiftUI

struct PlayerView: View {
    @ObservedObject var socket = SocketService.shared
    @ObservedObject var audio = AudioEngine.shared
    @Binding var isPresented: Bool
    
    @State private var selectedTab = 0 // 0: Queue, 1: SyncBeats Devices, 2: Chat
    @State private var chatText = ""
    @State private var isDraggingSlider = false
    @State private var dragPosition: Double = 0.0
    
    let emojis = ["❤️", "🔥", "😂", "🎉", "👍", "😮"]
    
    private func formatTime(_ seconds: Double) -> String {
        guard !seconds.isNaN && !seconds.isInfinite else { return "0:00" }
        let totalSeconds = Int(seconds)
        let m = totalSeconds / 60
        let s = totalSeconds % 60
        return String(format: "%d:%02d", m, s)
    }
    
    var body: some View {
        ZStack {
            // Ambient animated mesh background
            AmbientBackground(
                colorCyan: Color(red: 0.0, green: 1.0, blue: 0.7),
                colorPurple: Color(red: 0.48, green: 0.38, blue: 1.0),
                colorPink: Color(red: 1.0, green: 0.24, blue: 0.44)
            )
            .opacity(0.3)
            .ignoresSafeArea()
            
            HStack(spacing: 40) {
                // Left Column: Visualizer, Art, Controls
                VStack(spacing: 24) {
                    HStack {
                        Button(action: {
                            withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) {
                                isPresented = false
                            }
                        }) {
                            Image(systemName: "chevron.down")
                                .font(.system(size: 18, weight: .bold))
                                .foregroundColor(.white)
                                .padding(8)
                                .background(Color.white.opacity(0.1))
                                .clipShape(Circle())
                        }
                        .buttonStyle(.plain)
                        
                        Spacer()
                        
                        if let currentRoom = socket.currentRoom {
                            Text("Room: \(currentRoom.roomId)")
                                .font(.system(.headline, design: .monospaced))
                                .foregroundColor(Color(red: 0.0, green: 1.0, blue: 0.7))
                                .padding(.horizontal, 12)
                                .padding(.vertical, 6)
                                .background(Color(red: 0.0, green: 1.0, blue: 0.7).opacity(0.15))
                                .cornerRadius(10)
                        }
                    }
                    .padding(.top, 16)
                    
                    Spacer()
                    
                    // Rotating Vinyl Artwork with Floating Reaction Overlay
                    ZStack {
                        Circle()
                            .fill(Color.black.opacity(0.4))
                            .frame(width: 260, height: 260)
                            .overlay(
                                Circle()
                                    .stroke(LinearGradient(colors: [.cyan.opacity(0.3), .purple.opacity(0.3)], startPoint: .topLeading, endPoint: .bottomTrailing), lineWidth: 4)
                            )
                            .shadow(color: .cyan.opacity(0.2), radius: 20)
                        
                        Image(systemName: "opticaldisc")
                            .font(.system(size: 140))
                            .foregroundColor(.white.opacity(0.8))
                            .rotationEffect(.degrees(audio.isPlaying ? 360 : 0))
                            .animation(audio.isPlaying ? .linear(duration: 5.0).repeatForever(autoreverses: false) : .default, value: audio.isPlaying)
                        
                        // Floating reaction emoji
                        if let reaction = socket.activeReaction {
                            Text(reaction)
                                .font(.system(size: 72))
                                .transition(.asymmetric(
                                    insertion: .scale.combined(with: .opacity),
                                    removal: .move(edge: .top).combined(with: .opacity)
                                ))
                                .id(reaction)
                        }
                    }
                    .frame(height: 280)
                    
                    // Track Title & Artist
                    VStack(spacing: 6) {
                        let currentTrack = socket.currentRoom?.queue.first(where: { $0.isCurrent == true })?.title ?? socket.localPlaybackTitle ?? "No Track Playing"
                        Text(currentTrack)
                            .font(.system(size: 22, weight: .bold, design: .rounded))
                            .foregroundColor(.white)
                            .lineLimit(2)
                            .multilineTextAlignment(.center)
                        
                        if let room = socket.currentRoom, let currentItem = room.queue.first(where: { $0.isCurrent == true }) {
                            Text("Added by \(currentItem.addedBy)")
                                .font(.subheadline)
                                .foregroundColor(.gray)
                        } else {
                            Text("Local Playback")
                                .font(.subheadline)
                                .foregroundColor(.gray)
                        }
                    }
                    
                    // Progress Scrubber
                    if audio.duration > 0 {
                        VStack(spacing: 8) {
                            Slider(
                                value: Binding(
                                    get: { isDraggingSlider ? dragPosition : min(audio.currentPosition, audio.duration) },
                                    set: { dragPosition = $0 }
                                ),
                                in: 0...max(1, audio.duration),
                                onEditingChanged: { editing in
                                    isDraggingSlider = editing
                                    if !editing {
                                        audio.seek(to: dragPosition * 1000)
                                        socket.emitSeek(positionMs: dragPosition * 1000)
                                    }
                                }
                            )
                            .tint(Color(red: 0.0, green: 1.0, blue: 0.7))
                            
                            HStack {
                                Text(formatTime(isDraggingSlider ? dragPosition : audio.currentPosition))
                                    .font(.system(size: 11, weight: .semibold, design: .monospaced))
                                    .foregroundColor(.gray)
                                Spacer()
                                Text(formatTime(audio.duration))
                                    .font(.system(size: 11, weight: .semibold, design: .monospaced))
                                    .foregroundColor(.gray)
                            }
                        }
                        .padding(.horizontal, 16)
                    }
                    
                    // Playback Controls
                    HStack(spacing: 32) {
                        Button(action: {
                            socket.emitPrev()
                        }) {
                            Image(systemName: "backward.fill")
                                .font(.system(size: 22))
                                .foregroundColor(.white)
                        }
                        .buttonStyle(.plain)
                        
                        Button(action: {
                            if audio.isPlaying {
                                audio.pause()
                                socket.emitPause(positionMs: audio.currentPosition * 1000)
                            } else {
                                audio.play(at: audio.currentPosition * 1000)
                                socket.emitPlay(positionMs: audio.currentPosition * 1000)
                            }
                        }) {
                            Image(systemName: audio.isPlaying ? "pause.circle.fill" : "play.circle.fill")
                                .font(.system(size: 54))
                                .foregroundColor(Color(red: 0.0, green: 1.0, blue: 0.7))
                        }
                        .buttonStyle(.plain)
                        
                        Button(action: {
                            socket.emitNext()
                        }) {
                            Image(systemName: "forward.fill")
                                .font(.system(size: 22))
                                .foregroundColor(.white)
                        }
                        .buttonStyle(.plain)
                    }
                    
                    // Emoji Reactions Selector
                    HStack(spacing: 16) {
                        ForEach(emojis, id: \.self) { emoji in
                            Button(action: {
                                socket.emitReaction(emoji: emoji)
                            }) {
                                Text(emoji)
                                    .font(.system(size: 24))
                                    .padding(8)
                                    .background(Color.white.opacity(0.06))
                                    .cornerRadius(12)
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 12)
                                            .stroke(Color.white.opacity(0.1), lineWidth: 1)
                                    )
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.bottom, 24)
                    
                    Spacer()
                }
                .frame(maxWidth: .infinity)
                
                // Divider
                Rectangle()
                    .fill(Color.white.opacity(0.08))
                    .frame(width: 1)
                    .padding(.vertical, 32)
                
                // Right Column: Tabs (Queue, Listeners, Chat)
                VStack(spacing: 16) {
                    Picker("Tabs", selection: $selectedTab) {
                        Text("Queue").tag(0)
                        Text("Listeners").tag(1)
                        Text("Chat").tag(2)
                    }
                    .pickerStyle(.segmented)
                    .padding(.horizontal)
                    .padding(.top, 24)
                    
                    ZStack {
                        if selectedTab == 0 {
                            QueueTabContent()
                        } else if selectedTab == 1 {
                            ListenersTabContent()
                        } else {
                            ChatTabContent(chatText: $chatText)
                        }
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Color.white.opacity(0.03))
                    .cornerRadius(16)
                    .overlay(
                        RoundedRectangle(cornerRadius: 16)
                            .stroke(Color.white.opacity(0.06), lineWidth: 1)
                    )
                    .padding([.horizontal, .bottom], 16)
                }
                .frame(width: 380)
            }
            .padding(24)
        }
        .frame(minWidth: 850, minHeight: 600)
    }
}

// MARK: - Queue Tab View
struct QueueTabContent: View {
    @ObservedObject var socket = SocketService.shared
    
    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                if let room = socket.currentRoom, !room.queue.isEmpty {
                    ForEach(room.queue) { track in
                        HStack(spacing: 16) {
                            ZStack {
                                RoundedRectangle(cornerRadius: 8)
                                    .fill(Color.white.opacity(0.08))
                                    .frame(width: 44, height: 44)
                                Image(systemName: track.isCurrent == true ? "speaker.wave.3.fill" : "music.note")
                                    .foregroundColor(track.isCurrent == true ? Color(red: 0.0, green: 1.0, blue: 0.7) : .white.opacity(0.6))
                            }
                            
                            VStack(alignment: .leading, spacing: 4) {
                                Text(track.title)
                                    .font(.system(size: 13, weight: .semibold))
                                    .foregroundColor(track.isCurrent == true ? Color(red: 0.0, green: 1.0, blue: 0.7) : .white)
                                    .lineLimit(1)
                                
                                Text("Added by \(track.addedBy)")
                                    .font(.system(size: 10))
                                    .foregroundColor(.gray)
                            }
                            Spacer()
                        }
                        .padding(8)
                        .background(RoundedRectangle(cornerRadius: 10).fill(track.isCurrent == true ? Color.white.opacity(0.05) : Color.clear))
                    }
                } else {
                    VStack(spacing: 12) {
                        Spacer().frame(height: 120)
                        Image(systemName: "music.note.list")
                            .font(.system(size: 40))
                            .foregroundColor(.white.opacity(0.15))
                        Text("No tracks in queue")
                            .font(.headline)
                            .foregroundColor(.white.opacity(0.3))
                    }
                    .frame(maxWidth: .infinity)
                }
            }
            .padding(16)
        }
    }
}

// MARK: - Listeners Tab View
struct ListenersTabContent: View {
    @ObservedObject var socket = SocketService.shared
    
    var body: some View {
        VStack(spacing: 16) {
            ScrollView {
                VStack(spacing: 12) {
                    if let room = socket.currentRoom {
                        ForEach(room.participants) { p in
                            HStack(spacing: 16) {
                                Circle()
                                    .fill(p.isReady ? Color(red: 0.0, green: 1.0, blue: 0.7) : Color.orange)
                                    .frame(width: 8, height: 8)
                                
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(p.displayName)
                                        .font(.system(size: 13, weight: .semibold))
                                        .foregroundColor(.white)
                                    
                                    if let progress = socket.deviceSyncProgress[p.socketId], progress < 100 {
                                        Text("Syncing: \(progress)%")
                                            .font(.system(size: 10))
                                            .foregroundColor(.cyan)
                                    } else {
                                        Text(p.isReady ? "In Sync" : "Buffering")
                                            .font(.system(size: 10))
                                            .foregroundColor(.gray)
                                    }
                                }
                                
                                Spacer()
                                
                                if let latency = p.latency {
                                    Text("\(Int(latency))ms RTT")
                                        .font(.system(size: 11, design: .monospaced))
                                        .foregroundColor(.gray)
                                }
                            }
                            .padding(8)
                            .background(Color.white.opacity(0.03))
                            .cornerRadius(10)
                        }
                    } else {
                        Text("Join a room to see participants")
                            .foregroundColor(.gray)
                            .padding()
                    }
                }
                .padding(16)
            }
            
            if socket.currentRoom != nil {
                VStack(spacing: 12) {
                    Divider().background(Color.white.opacity(0.1))
                    
                    HStack {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("SyncBeats Connection")
                                .font(.caption)
                                .foregroundColor(.gray)
                            HSPingValueView()
                        }
                        Spacer()
                        
                        Button("Force Sync All") {
                            socket.triggerForceAll()
                        }
                        .buttonStyle(.bordered)
                        .tint(.cyan)
                        .controlSize(.small)
                    }
                    .padding(.horizontal, 16)
                    
                    Button("Leave Room") {
                        socket.leaveRoom()
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.red)
                    .controlSize(.large)
                    .frame(maxWidth: .infinity)
                    .padding(.horizontal, 16)
                    .padding(.bottom, 16)
                }
                .background(Color.black.opacity(0.15))
            }
        }
    }
}

// MARK: - Chat Tab View
struct ChatTabContent: View {
    @ObservedObject var socket = SocketService.shared
    @Binding var chatText: String
    
    var body: some View {
        VStack(spacing: 0) {
            ScrollViewReader { proxy in
                ScrollView {
                    VStack(alignment: .leading, spacing: 12) {
                        ForEach(socket.chatMessages) { msg in
                            VStack(alignment: .leading, spacing: 4) {
                                HStack {
                                    Text(msg.displayName)
                                        .font(.system(size: 11, weight: .bold))
                                        .foregroundColor(.cyan)
                                    Spacer()
                                    Text(formatTimestamp(msg.timestamp))
                                        .font(.system(size: 9))
                                        .foregroundColor(.gray)
                                }
                                Text(msg.message)
                                    .font(.system(size: 13))
                                    .foregroundColor(.white)
                            }
                            .padding(8)
                            .background(Color.white.opacity(0.04))
                            .cornerRadius(8)
                            .id(msg.id)
                        }
                    }
                    .padding(16)
                }
                .onChange(of: socket.chatMessages.count) {
                    if let last = socket.chatMessages.last {
                        withAnimation {
                            proxy.scrollTo(last.id, anchor: .bottom)
                        }
                    }
                }
            }
            
            Divider().background(Color.white.opacity(0.1))
            
            HStack(spacing: 12) {
                TextField("Message room...", text: $chatText)
                    .textFieldStyle(.plain)
                    .padding(8)
                    .background(Color.white.opacity(0.08))
                    .cornerRadius(8)
                    .onSubmit {
                        sendMessage()
                    }
                
                Button(action: {
                    sendMessage()
                }) {
                    Image(systemName: "paperplane.fill")
                        .foregroundColor(.cyan)
                        .padding(8)
                }
                .buttonStyle(.plain)
            }
            .padding(12)
        }
    }
    
    private func sendMessage() {
        guard !chatText.trimmingCharacters(in: .whitespaces).isEmpty else { return }
        socket.emitChat(message: chatText)
        chatText = ""
    }
    
    private func formatTimestamp(_ epoch: Double) -> String {
        let date = Date(timeIntervalSince1970: epoch / 1000.0)
        let formatter = DateFormatter()
        formatter.timeStyle = .short
        return formatter.string(from: date)
    }
}

struct HSPingValueView: View {
    @ObservedObject var socket = SocketService.shared
    
    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: "wifi")
                .foregroundColor(.cyan)
            Text("\(String(format: "%.0f", socket.serverTimeOffset))ms offset")
                .font(.system(size: 12, weight: .bold, design: .monospaced))
                .foregroundColor(.white)
        }
    }
}

