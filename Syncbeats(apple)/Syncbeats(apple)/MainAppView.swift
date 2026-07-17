import SwiftUI

struct MainAppView: View {
    @ObservedObject var auth = AuthManager.shared
    @StateObject private var socket = SocketService.shared
    @StateObject private var ytService = YouTubeService.shared
    
    @State private var showSyncBeatsModal = false
    @State private var showFullPlayer = false
    
    // Website Gradient Colors
    let colorCyan = Color(red: 0.0, green: 1.0, blue: 0.7)    // #00FFB2
    let colorPurple = Color(red: 0.48, green: 0.38, blue: 1.0) // #7B61FF
    let colorPink = Color(red: 1.0, green: 0.24, blue: 0.44)   // #FF3D71
    
    var body: some View {
        ZStack {
            // 1. Ambient Website Gradients Background
            AmbientBackground(colorCyan: colorCyan, colorPurple: colorPurple, colorPink: colorPink)
            
            // 2. Main Content Area: Unified Library/Home/Search (Glassmorphic)
            VStack(spacing: 0) {
                // Header with App Title and Logout
                HStack {
                    HStack(spacing: 8) {
                        Image(systemName: "waveform")
                            .font(.title2)
                            .foregroundColor(colorCyan)
                        Text("SyncBeats")
                            .font(.title2.bold())
                            .foregroundColor(.white)
                    }
                    
                    Spacer()
                    
                    Button("Logout") {
                        auth.logout()
                    }
                    .buttonStyle(.bordered)
                    .tint(.white.opacity(0.6))
                    .controlSize(.small)
                }
                .padding(.horizontal, 24)
                .padding(.top, 16)
                .padding(.bottom, 8)
                
                LibraryView(showJoinModal: $showSyncBeatsModal)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(.ultraThinMaterial)
            
            // 3. Bottom Player Bar
            VStack(spacing: 0) {
                Spacer()
                
                if socket.currentRoom != nil || AudioEngine.shared.duration > 0 {
                    BottomPlayerBar(showFullPlayer: $showFullPlayer)
                        .transition(.move(edge: .bottom))
                }
            }
        }
        .preferredColorScheme(.dark)
        .onAppear {
            socket.connect()
        }
        .sheet(isPresented: $showSyncBeatsModal) {
            SyncBeatsModal(isPresented: $showSyncBeatsModal)
        }
        .sheet(isPresented: $showFullPlayer) {
            PlayerView(isPresented: $showFullPlayer)
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
    
    @Binding var showFullPlayer: Bool
    
    private func formatTime(_ seconds: Double) -> String {
        guard !seconds.isNaN && !seconds.isInfinite else { return "0:00" }
        let totalSeconds = Int(seconds)
        let m = totalSeconds / 60
        let s = totalSeconds % 60
        return String(format: "%d:%02d", m, s)
    }
    
    var body: some View {
        HStack(spacing: 20) {
            // Clickable Album Art / Info Area
            HStack(spacing: 16) {
                // Album Art
                ZStack {
                    RoundedRectangle(cornerRadius: 8)
                        .fill(Color(white: 0.15))
                        .frame(width: 44, height: 44)
                    
                    Image(systemName: "opticaldisc")
                        .font(.system(size: 22))
                        .foregroundColor(.white.opacity(0.8))
                        .rotationEffect(.degrees(audio.isPlaying ? 360 : 0))
                        .animation(audio.isPlaying ? .linear(duration: 4.0).repeatForever(autoreverses: false) : .default, value: audio.isPlaying)
                }
                
                // Track Info
                VStack(alignment: .leading, spacing: 4) {
                    let currentTrack = socket.currentRoom?.queue.first(where: { $0.isCurrent == true })?.title ?? socket.localPlaybackTitle ?? "No Track Playing"
                    Text(currentTrack)
                        .font(.system(size: 13, weight: .bold, design: .rounded))
                        .foregroundColor(.white)
                        .lineLimit(1)
                    
                    if let roomId = socket.currentRoom?.roomId {
                        Text("SyncBeats Active: \(roomId)")
                            .font(.system(size: 10, weight: .bold))
                            .foregroundColor(Color(red: 0.0, green: 1.0, blue: 0.7))
                    } else {
                        Text("Local Playback")
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundColor(.gray)
                    }
                }
            }
            .contentShape(Rectangle())
            .onTapGesture {
                withAnimation(.spring(response: 0.45, dampingFraction: 0.82)) {
                    showFullPlayer = true
                }
            }
            .frame(width: 240, alignment: .leading)
            
            // Playback Controls
            HStack(spacing: 20) {
                Button(action: {
                    socket.emitPrev()
                }) {
                    Image(systemName: "backward.fill")
                        .font(.system(size: 15))
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
                        .font(.system(size: 30))
                        .foregroundColor(.white)
                }
                .buttonStyle(.plain)
                
                Button(action: {
                    socket.emitNext()
                }) {
                    Image(systemName: "forward.fill")
                        .font(.system(size: 15))
                        .foregroundColor(.white)
                }
                .buttonStyle(.plain)
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
            
            // Maximize Player button
            Button(action: {
                withAnimation(.spring(response: 0.45, dampingFraction: 0.82)) {
                    showFullPlayer = true
                }
            }) {
                Image(systemName: "arrow.up.left.and.arrow.down.right")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(.white)
                    .frame(width: 32, height: 32)
                    .background(Color.white.opacity(0.08))
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
