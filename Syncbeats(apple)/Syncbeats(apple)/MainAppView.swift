import SwiftUI

struct MainAppView: View {
    @ObservedObject var auth = AuthManager.shared
    @StateObject private var socket = SocketService.shared
    @StateObject private var ytService = YouTubeService.shared
    
    @State private var showSyncBeatsModal = false
    @State private var showQueue = false
    @State private var selection: String? = "home"
    
    // Website Gradient Colors
    let colorCyan = Color(red: 0.0, green: 1.0, blue: 0.7)    // #00FFB2
    let colorPurple = Color(red: 0.48, green: 0.38, blue: 1.0) // #7B61FF
    let colorPink = Color(red: 1.0, green: 0.24, blue: 0.44)   // #FF3D71
    
    var body: some View {
        NavigationSplitView {
            // Sidebar
            List(selection: $selection) {
                NavigationLink(value: "home") {
                    Label("Home", systemImage: "house")
                }
                NavigationLink(value: "library") {
                    Label("Library", systemImage: "music.note.list")
                }
            }
            .navigationTitle("SyncBeats")
            .toolbar {
                ToolbarItem(placement: .automatic) {
                    Button("Logout") {
                        auth.logout()
                    }
                }
            }
        } detail: {
            ZStack {
                // 1. Ambient Website Gradients Background
                AmbientBackground(colorCyan: colorCyan, colorPurple: colorPurple, colorPink: colorPink)
                
                // 2. Main Content Area (Glassmorphic)
                VStack {
                    if selection == "home" {
                        HomeView()
                    } else if selection == "library" {
                        LibraryView(showJoinModal: $showSyncBeatsModal)
                    } else {
                        HomeView()
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(.ultraThinMaterial)
                
                // Overlay Queue Panel
                if showQueue {
                    HStack {
                        Spacer()
                        QueueView(isPresented: $showQueue)
                            .transition(.move(edge: .trailing))
                    }
                    .zIndex(10)
                }
                
                // 3. Bottom Player & FAB
                VStack(spacing: 0) {
                    Spacer()
                    
                    HStack {
                        Spacer()
                        Button(action: {
                            showSyncBeatsModal = true
                        }) {
                            Image(systemName: "opticaldisc")
                                .font(.system(size: 28, weight: .bold))
                                .foregroundColor(.white)
                                .frame(width: 64, height: 64)
                                .background(.ultraThinMaterial)
                                .clipShape(Circle())
                                .overlay(Circle().stroke(Color.white.opacity(0.2), lineWidth: 1))
                                .shadow(color: .black.opacity(0.4), radius: 12, x: 0, y: 6)
                        }
                        .buttonStyle(.plain)
                        .padding(32)
                        // Breathing animation for the button
                        .scaleEffect(socket.isConnected ? 1.0 : 0.95)
                        .animation(.easeInOut(duration: 2.0).repeatForever(autoreverses: true), value: socket.isConnected)
                    }
                    
                    if socket.currentRoom != nil || AudioEngine.shared.duration > 0 {
                        BottomPlayerBar(showQueue: $showQueue)
                            .transition(.move(edge: .bottom))
                    }
                }
            }
            // Force Dark Mode for the premium glass aesthetic
            .preferredColorScheme(.dark)
        }
        .onAppear {
            socket.connect()
        }
        .sheet(isPresented: $showSyncBeatsModal) {
            SyncBeatsModal(isPresented: $showSyncBeatsModal)
        }
    }
}

// Replicates the Next.js Ambient Blob Background
struct AmbientBackground: View {
    let colorCyan: Color
    let colorPurple: Color
    let colorPink: Color
    
    @State private var animate = false
    
    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            
            Circle()
                .fill(colorPurple.opacity(0.3))
                .blur(radius: 120)
                .frame(width: 500, height: 500)
                .offset(x: animate ? -200 : 200, y: animate ? -200 : 200)
            
            Circle()
                .fill(colorCyan.opacity(0.2))
                .blur(radius: 120)
                .frame(width: 600, height: 600)
                .offset(x: animate ? 300 : -300, y: animate ? 200 : -200)
            
            Circle()
                .fill(colorPink.opacity(0.2))
                .blur(radius: 100)
                .frame(width: 400, height: 400)
                .offset(x: 0, y: animate ? 300 : -300)
        }
        .onAppear {
            withAnimation(.easeInOut(duration: 10).repeatForever(autoreverses: true)) {
                animate = true
            }
        }
    }
}

// MARK: - Bottom Player Bar
struct BottomPlayerBar: View {
    @ObservedObject var socket = SocketService.shared
    @ObservedObject var audio = AudioEngine.shared
    
    @State private var isDraggingSlider = false
    @State private var dragPosition: Double = 0.0
    
    @Binding var showQueue: Bool
    
    private func formatTime(_ seconds: Double) -> String {
        guard !seconds.isNaN && !seconds.isInfinite else { return "0:00" }
        let totalSeconds = Int(seconds)
        let m = totalSeconds / 60
        let s = totalSeconds % 60
        return String(format: "%d:%02d", m, s)
    }
    
    var body: some View {
        HStack(spacing: 20) {
            // Album Art
            ZStack {
                RoundedRectangle(cornerRadius: 8)
                    .fill(Color(white: 0.15))
                    .frame(width: 48, height: 48)
                
                Image(systemName: "opticaldisc")
                    .font(.system(size: 24))
                    .foregroundColor(.white.opacity(0.8))
                    .rotationEffect(.degrees(audio.isPlaying ? 360 : 0))
                    .animation(audio.isPlaying ? .linear(duration: 4.0).repeatForever(autoreverses: false) : .default, value: audio.isPlaying)
            }
            
            // Track Info
            VStack(alignment: .leading, spacing: 4) {
                let currentTrack = socket.currentRoom?.queue.first(where: { $0.isCurrent == true })?.title ?? socket.localPlaybackTitle ?? "No Track Playing"
                Text(currentTrack)
                    .font(.system(size: 14, weight: .bold, design: .rounded))
                    .foregroundColor(.white)
                    .lineLimit(1)
                
                Text(socket.currentRoom?.roomId ?? "No Active Room")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(Color(red: 0.0, green: 1.0, blue: 0.7))
            }
            .frame(width: 200, alignment: .leading)
            
            // Controls
            HStack(spacing: 24) {
                Image(systemName: "backward.fill")
                    .font(.system(size: 16))
                    .foregroundColor(.white)
                    
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
                        .font(.system(size: 32))
                        .foregroundColor(.white)
                }
                .buttonStyle(PlainButtonStyle())
                
                Image(systemName: "forward.fill")
                    .font(.system(size: 16))
                    .foregroundColor(.white)
            }
            
            Spacer()
            
            // Scrubber
            if audio.duration > 0 {
                HStack(spacing: 8) {
                    Text(formatTime(isDraggingSlider ? dragPosition : audio.currentPosition))
                        .font(.system(size: 10, weight: .bold, design: .monospaced))
                        .foregroundColor(.gray)
                        .frame(width: 32, alignment: .trailing)
                    
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
                    .frame(width: 200)
                    
                    Text(formatTime(audio.duration))
                        .font(.system(size: 10, weight: .bold, design: .monospaced))
                        .foregroundColor(.gray)
                        .frame(width: 32, alignment: .leading)
                }
            }
            
            // Queue Toggle Button
            Button(action: {
                withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
                    showQueue.toggle()
                }
            }) {
                Image(systemName: "list.bullet")
                    .font(.system(size: 16))
                    .foregroundColor(showQueue ? Color(red: 0.0, green: 1.0, blue: 0.7) : .white)
                    .frame(width: 32, height: 32)
                    .background(showQueue ? Color(red: 0.0, green: 1.0, blue: 0.7).opacity(0.2) : Color.clear)
                    .cornerRadius(8)
            }
            .buttonStyle(.plain)
            .padding(.leading, 8)
        }
        .padding(.horizontal, 24)
        .padding(.vertical, 16)
        .background(.ultraThinMaterial)
        .overlay(Rectangle().frame(height: 1).foregroundColor(Color.white.opacity(0.1)), alignment: .top)
    }
}
