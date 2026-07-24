import SwiftUI
import Combine

enum IslandMode: Equatable {
    case hidden
    case hovered
    case welcome
    case roomWelcome(String)
    case miniPlayer
    case player
    case downloading
}

// MARK: - State Manager
class IslandStateManager: ObservableObject {
    @Published var mode: IslandMode = .hidden
}

// MARK: - Island View
struct IslandView: View {
    @ObservedObject var state: IslandStateManager
    @State private var showPlayerContent: Bool = false
    @State private var isHoveringMiniPlayerControl = false
    
    @State private var engine = PlayerEngine.shared
    @State private var room = RoomSocket.shared
    @State private var showDevicePicker = false

    // Widths
    private let collapsedWidth: CGFloat = 239
    private let hoveredWidth: CGFloat = 252
    private let welcomeWidth: CGFloat = 320
    private let miniPlayerWidth: CGFloat = 330
    private let playerWidth: CGFloat = 700
    private let downloadingWidth: CGFloat = 440
    
    // Heights
    private let notchRegion: CGFloat = 39
    private let hoveredDropHeight: CGFloat = 8
    private let welcomeDropHeight: CGFloat = 36
    private let miniPlayerDropHeight: CGFloat = 0
    private let playerDropHeight: CGFloat = 120
    private let downloadingDropHeight: CGFloat = 50

    private var currentWidth: CGFloat {
        switch state.mode {
        case .hidden: return collapsedWidth
        case .hovered: return hoveredWidth
        case .welcome, .roomWelcome: return welcomeWidth
        case .miniPlayer: return miniPlayerWidth + (isHoveringMiniPlayerControl ? 12 : 0)
        case .player: return playerWidth
        case .downloading: return downloadingWidth
        }
    }

    private var currentHeight: CGFloat {
        switch state.mode {
        case .hidden: return notchRegion
        case .hovered: return notchRegion + hoveredDropHeight
        case .welcome, .roomWelcome: return notchRegion + welcomeDropHeight
        case .miniPlayer: return notchRegion + (isHoveringMiniPlayerControl ? 8 : 0)
        case .player: return notchRegion + playerDropHeight
        case .downloading: return notchRegion + downloadingDropHeight
        }
    }

    private var currentBottomRadius: CGFloat {
        switch state.mode {
        case .hidden, .hovered, .miniPlayer: return 18
        case .welcome, .roomWelcome, .downloading: return 24
        case .player: return 44
        }
    }

    private var currentTopConcaveRadius: CGFloat {
        return 8
    }

    private var shadowColor: Color {
        switch state.mode {
        case .hidden:
            return .clear
        case .hovered:
            return Color.black.opacity(0.4)
        case .miniPlayer:
            return Color.black.opacity(isHoveringMiniPlayerControl ? 0.4 : 0.15)
        case .player, .welcome, .roomWelcome, .downloading:
            return Color.black.opacity(0.45)
        }
    }
    
    private var shadowRadius: CGFloat {
        switch state.mode {
        case .hidden: return 0
        case .hovered: return 12
        case .miniPlayer: return isHoveringMiniPlayerControl ? 12 : 4
        case .player: return 20
        case .welcome, .roomWelcome, .downloading: return 14
        }
    }

    private var shadowY: CGFloat {
        switch state.mode {
        case .hidden: return 0
        case .hovered: return 5
        case .miniPlayer: return isHoveringMiniPlayerControl ? 5 : 2
        case .player: return 8
        case .welcome, .roomWelcome, .downloading: return 6
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            ZStack(alignment: .top) {
                // Raw Black Notch Shape
                ExtrudedIslandShape(
                    bottomCornerRadius: currentBottomRadius,
                    topConcaveRadius: currentTopConcaveRadius
                )
                .fill(Color.black)
                .frame(width: currentWidth, height: currentHeight)
                .overlay(alignment: .bottom) {
                    if state.mode == .welcome {
                        Text("WELCOME")
                            .font(.system(size: 11, weight: .bold, design: .rounded))
                            .foregroundColor(.white)
                            .padding(.bottom, 10)
                    } else if case let .roomWelcome(roomId) = state.mode {
                        Text("ROOM: \(roomId)")
                            .font(.system(size: 11, weight: .bold, design: .rounded))
                            .foregroundColor(.white)
                            .padding(.bottom, 10)
                    }
                }
                .overlay(alignment: .top) {
                    if state.mode == .miniPlayer {
                        miniPlayerView
                    }
                }
                .overlay(alignment: .bottom) {
                    if state.mode == .downloading {
                        downloadingView
                            .padding(.bottom, 6)
                    }
                }
                .overlay(alignment: .bottom) {
                    if showPlayerContent {
                        expandedPlayerView
                            .padding(.bottom, 8)
                    }
                }
                .onTapGesture {
                    if state.mode == .hovered || state.mode == .miniPlayer {
                        NSHapticFeedbackManager.defaultPerformer.perform(.alignment, performanceTime: .now)
                        state.mode = .player
                    }
                }
            }
            .shadow(color: shadowColor, radius: shadowRadius, x: 0, y: shadowY)
            .animation(
                .spring(response: 0.6, dampingFraction: 0.75, blendDuration: 0.1),
                value: state.mode
            )
            .onChange(of: state.mode) { oldMode, newMode in
                print("[IslandView] mode changed: \(oldMode) → \(newMode)")
                if newMode == .player {
                    withAnimation(.easeIn(duration: 0.15)) {
                        showPlayerContent = true
                    }
                } else {
                    withAnimation(.easeOut(duration: 0.05)) {
                        showPlayerContent = false
                    }
                }
            }
            .onChange(of: engine.isLoading) { _, isLoading in
                if isLoading {
                    state.mode = .downloading
                } else if state.mode == .downloading {
                    withAnimation(.spring(response: 0.6, dampingFraction: 0.75, blendDuration: 0.1)) {
                        state.mode = .miniPlayer
                    }
                }
            }
            
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .ignoresSafeArea()
    }

    /// User requested: keep notch height (30pt), expand horizontally, show visualizer left and play right. No song title.
    private var miniPlayerView: some View {
        HStack(spacing: 0) {
            // Left Side: Album Art
            ZStack {
                if let track = engine.current {
                    if let url = track.artworkURL {
                        AsyncImage(url: url) { image in
                            image.resizable().aspectRatio(contentMode: .fill)
                        } placeholder: {
                            Color.white.opacity(0.1)
                        }
                    } else {
                        Color.white.opacity(0.1)
                            .overlay(Image(systemName: "music.note").font(.system(size: 10)).foregroundColor(.white.opacity(0.6)))
                    }
                }
            }
            .frame(width: 24, height: 24)
            .clipShape(RoundedRectangle(cornerRadius: 6))
            .padding(.leading, 12)
            
            Spacer()
            
            // Right Side: Visualiser (Default) OR Play/Pause (On Hover)
            ZStack {
                if isHoveringMiniPlayerControl {
                    Button(action: {
                        engine.togglePlayPause()
                    }) {
                        if engine.isLoading || engine.isBuffering {
                            ProgressView().controlSize(.small)
                        } else {
                            Image(systemName: engine.isPlaying ? "pause.fill" : "play.fill")
                                .font(.system(size: 14))
                                .foregroundColor(.white)
                        }
                    }
                    .buttonStyle(.plain)
                } else {
                    MiniVisualizerView(isPlaying: engine.isPlaying)
                }
            }
            .frame(width: 40, height: 24)
            .padding(.trailing, 12)
        }
        .frame(width: miniPlayerWidth, height: notchRegion)
        .onHover { hovering in
            withAnimation(.easeInOut(duration: 0.15)) {
                isHoveringMiniPlayerControl = hovering
            }
        }
    }

    /// Shown in .downloading mode (expanding sideways and slightly down) while resolving or downloading.
    private var downloadingView: some View {
        HStack(spacing: 12) {
            if let track = engine.current {
                // Compact artwork
                ZStack {
                    if let url = track.artworkURL {
                        AsyncImage(url: url) { image in
                            image.resizable().aspectRatio(contentMode: .fill)
                        } placeholder: {
                            Color.white.opacity(0.1)
                        }
                    } else {
                        Color.white.opacity(0.1)
                            .overlay(Image(systemName: "music.note").foregroundColor(.white.opacity(0.4)))
                    }
                }
                .frame(width: 32, height: 32)
                .cornerRadius(6)
                
                VStack(alignment: .leading, spacing: 5) {
                    HStack(spacing: 6) {
                        Text(engine.current?.id == "" ? "Resolving..." : "Downloading...")
                            .font(.system(size: 10, weight: .bold, design: .rounded))
                            .foregroundColor(Color.blue)
                        
                        Text(track.title)
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(.white)
                            .lineLimit(1)
                    }
                    
                    // Shimmer progress bar
                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            Capsule()
                                .fill(Color.white.opacity(0.12))
                                .frame(height: 3)
                            IslandLoadingBar()
                                .frame(height: 3)
                        }
                    }
                    .frame(height: 3)
                }
            }
        }
        .padding(.horizontal, 16)
        .frame(height: 48)
    }

    private var expandedPlayerView: some View {
        HStack(spacing: 16) {
            if let track = engine.current {
                // Left: Large Art
                ZStack {
                    if let url = track.artworkURL {
                        AsyncImage(url: url) { image in
                            image.resizable().aspectRatio(contentMode: .fill)
                        } placeholder: {
                            Color.white.opacity(0.1)
                        }
                    } else {
                        Color.white.opacity(0.1)
                            .overlay(Image(systemName: "music.note").font(.system(size: 30)).foregroundColor(.white.opacity(0.3)))
                    }
                }
                .frame(width: 90, height: 90)
                .cornerRadius(12)
                .shadow(color: .black.opacity(0.3), radius: 8, y: 4)

                // Middle: Info & Scrubber
                VStack(alignment: .leading, spacing: 6) {
                    Text(track.title)
                        .font(.system(size: 18, weight: .bold))
                        .foregroundColor(.white)
                        .lineLimit(1)
                    
                    Text(track.artist)
                        .font(.system(size: 14))
                        .foregroundColor(.white.opacity(0.6))
                        .lineLimit(1)
                    
                    Spacer().frame(height: 12)
                    
                    // Scrubber
                    HStack(spacing: 8) {
                        Text(formatTime(engine.currentTime))
                            .font(.system(size: 10, weight: .medium, design: .monospaced))
                            .foregroundColor(.white.opacity(0.5))
                        
                        GeometryReader { geo in
                            ZStack(alignment: .leading) {
                                Capsule().fill(Color.white.opacity(0.15))
                                Capsule()
                                    .fill(Color.white)
                                    .frame(width: max(0, geo.size.width * CGFloat(engine.progress)))
                            }
                        }
                        .frame(height: 4)
                        
                        Text(formatTime(engine.duration))
                            .font(.system(size: 10, weight: .medium, design: .monospaced))
                            .foregroundColor(.white.opacity(0.5))
                    }
                }
                .padding(.vertical, 8)
                
                Spacer()

                // Right: Controls
                VStack(spacing: 20) {
                    HStack(spacing: 24) {
                        Button(action: { engine.prev() }) {
                            Image(systemName: "backward.fill").font(.system(size: 16))
                        }
                        .buttonStyle(.plain)

                        Button(action: { engine.togglePlayPause() }) {
                            ZStack {
                                if engine.isLoading || engine.isBuffering {
                                    ProgressView().controlSize(.small)
                                } else {
                                    Image(systemName: engine.isPlaying ? "pause.fill" : "play.fill")
                                        .font(.system(size: 24))
                                }
                            }
                            .frame(width: 28, height: 28)
                        }
                        .buttonStyle(.plain)

                        Button(action: { engine.next() }) {
                            Image(systemName: "forward.fill").font(.system(size: 16))
                        }
                        .buttonStyle(.plain)
                    }
                    
                    // Toggle Device Picker — shows real devices synced in the room.
                    Button(action: { showDevicePicker.toggle() }) {
                        Image(systemName: "speaker.wave.2.fill")
                            .foregroundColor(showDevicePicker ? .blue : .white)
                    }
                    .buttonStyle(.plain)
                    .popover(isPresented: $showDevicePicker, arrowEdge: .bottom) {
                        VStack(alignment: .leading, spacing: 8) {
                            Text(room.isInRoom ? "Synced Devices" : "Output Device")
                                .font(.system(size: 11, weight: .bold))
                                .padding(.bottom, 4)

                            if room.isInRoom {
                                if room.participants.isEmpty {
                                    Text("Waiting for devices…")
                                        .font(.system(size: 12))
                                        .foregroundColor(.secondary)
                                } else {
                                    ForEach(room.participants) { participant in
                                        HStack {
                                            Image(systemName: participant.socketId == room.currentSocketId ? "desktopcomputer" : "iphone")
                                            Text(participant.displayName
                                                 + (participant.socketId == room.currentSocketId ? " (This Mac)" : ""))
                                            Spacer()
                                            Circle()
                                                .fill(participant.isReady ? Color.green : Color.orange)
                                                .frame(width: 6, height: 6)
                                        }
                                        .font(.system(size: 12))
                                    }
                                }
                            } else {
                                HStack {
                                    Image(systemName: "laptopcomputer")
                                    Text("This Mac")
                                    Spacer()
                                    Image(systemName: "checkmark")
                                }
                                .font(.system(size: 12))
                            }
                        }
                        .padding()
                        .frame(width: 200)
                    }
                }
                .foregroundColor(.white)
                .frame(width: 160, alignment: .trailing)
            } else {
                // No track loaded — show a calm placeholder instead of an empty black void
                // (the island can reach .player mode before any song is playing, e.g. the
                // RoomJoined auto-transition or a tap-to-expand with nothing queued).
                HStack(spacing: 12) {
                    Image(systemName: "music.note")
                        .font(.system(size: 22))
                        .foregroundColor(.white.opacity(0.35))
                    Text("Nothing playing")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundColor(.white.opacity(0.5))
                }
                .frame(maxWidth: .infinity)
            }
        }
        .padding(.horizontal, 24)
        .frame(height: 120)
    }

    private func formatTime(_ seconds: Double) -> String {
        guard seconds.isFinite && seconds > 0 else { return "0:00" }
        let mins = Int(seconds) / 60
        let secs = Int(seconds) % 60
        return String(format: "%d:%02d", mins, secs)
    }
}

// MARK: - Extruded Island Shape
struct ExtrudedIslandShape: Shape {
    var bottomCornerRadius: CGFloat
    var topConcaveRadius: CGFloat

    var animatableData: AnimatablePair<CGFloat, CGFloat> {
        get { AnimatablePair(bottomCornerRadius, topConcaveRadius) }
        set {
            bottomCornerRadius = newValue.first
            topConcaveRadius = newValue.second
        }
    }

    func path(in rect: CGRect) -> Path {
        var path = Path()
        let r = bottomCornerRadius
        let cr = topConcaveRadius
        
        let safeCr = min(cr, rect.width / 4)
        let safeR = min(r, rect.width / 4)

        path.move(to: CGPoint(x: 0, y: 0))
        path.addLine(to: CGPoint(x: rect.maxX, y: 0))
        path.addQuadCurve(
            to: CGPoint(x: rect.maxX - safeCr, y: safeCr),
            control: CGPoint(x: rect.maxX - safeCr, y: 0)
        )
        path.addLine(to: CGPoint(x: rect.maxX - safeCr, y: rect.maxY - safeR))
        path.addArc(
            center: CGPoint(x: rect.maxX - safeCr - safeR, y: rect.maxY - safeR),
            radius: safeR,
            startAngle: .degrees(0),
            endAngle: .degrees(90),
            clockwise: false
        )
        path.addLine(to: CGPoint(x: safeCr + safeR, y: rect.maxY))
        path.addArc(
            center: CGPoint(x: safeCr + safeR, y: rect.maxY - safeR),
            radius: safeR,
            startAngle: .degrees(90),
            endAngle: .degrees(180),
            clockwise: false
        )
        path.addLine(to: CGPoint(x: safeCr, y: safeCr))
        path.addQuadCurve(
            to: CGPoint(x: 0, y: 0),
            control: CGPoint(x: safeCr, y: 0)
        )
        path.closeSubpath()
        return path
    }
}

// MARK: - Shimmer loading bar used in the downloading state
struct IslandLoadingBar: View {
    @State private var offset: CGFloat = -1

    var body: some View {
        GeometryReader { geo in
            let barW = geo.size.width * 0.35
            Capsule()
                .fill(
                    LinearGradient(
                        colors: [Color.white.opacity(0.05), Color.white.opacity(0.7), Color.white.opacity(0.05)],
                        startPoint: .leading,
                        endPoint: .trailing
                    )
                )
                .frame(width: barW, height: geo.size.height)
                .offset(x: (geo.size.width + barW) * offset)
                .onAppear {
                    withAnimation(.linear(duration: 1.4).repeatForever(autoreverses: false)) {
                        offset = 1
                    }
                }
        }
    }
}

// MARK: - Mini Visualizer
struct MiniVisualizerView: View {
    let isPlaying: Bool
    @State private var isAnimating = false
    
    var body: some View {
        HStack(spacing: 3) {
            ForEach(0..<4) { index in
                Capsule()
                    .fill(Color.white)
                    .frame(width: 3, height: isPlaying ? (isAnimating ? .random(in: 8...14) : 4) : 3)
                    .animation(
                        isPlaying 
                        ? Animation.easeInOut(duration: Double.random(in: 0.2...0.4))
                            .repeatForever(autoreverses: true)
                            .delay(Double(index) * 0.1)
                        : .easeOut(duration: 0.2),
                        value: isAnimating
                    )
            }
        }
        .frame(height: 14)
        .onChange(of: isPlaying) { _, playing in
            isAnimating = playing
        }
        .onAppear {
            if isPlaying { isAnimating = true }
        }
    }
}
