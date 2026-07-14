import SwiftUI
import Combine

enum IslandMode: Equatable {
    case hidden
    case hovered
    case welcome
    case roomWelcome(String)
    case miniPlayer
    case player
}

// MARK: - State Manager
class IslandStateManager: ObservableObject {
    @Published var mode: IslandMode = .hidden
}

// MARK: - Island View
struct IslandView: View {
    @ObservedObject var state: IslandStateManager
    @State private var showPlayerContent: Bool = false
    
    @ObservedObject var socket = SocketService.shared
    @ObservedObject var audio = AudioEngine.shared
    
    @State private var earbudLatencyMs: Double = 0.0
    @State private var isDraggingSlider = false
    @State private var dragPosition: Double = 0.0

    // Widths
    private let collapsedWidth: CGFloat = 220
    private let hoveredWidth: CGFloat = 244
    private let welcomeWidth: CGFloat = 320
    private let miniPlayerWidth: CGFloat = 380
    private let playerWidth: CGFloat = 700
    
    // Heights
    private let notchRegion: CGFloat = 30
    private let hoveredDropHeight: CGFloat = 12
    private let welcomeDropHeight: CGFloat = 36
    private let miniPlayerDropHeight: CGFloat = 16
    private let playerDropHeight: CGFloat = 120

    private var currentWidth: CGFloat {
        switch state.mode {
        case .hidden: return collapsedWidth
        case .hovered: return hoveredWidth
        case .welcome, .roomWelcome: return welcomeWidth
        case .miniPlayer: return miniPlayerWidth
        case .player: return playerWidth
        }
    }

    private var currentHeight: CGFloat {
        switch state.mode {
        case .hidden: return notchRegion
        case .hovered: return notchRegion + hoveredDropHeight
        case .welcome, .roomWelcome: return notchRegion + welcomeDropHeight
        case .miniPlayer: return notchRegion + miniPlayerDropHeight
        case .player: return notchRegion + playerDropHeight
        }
    }

    private var currentBottomRadius: CGFloat {
        switch state.mode {
        case .hidden, .hovered: return 14
        case .miniPlayer: return 18
        case .welcome, .roomWelcome: return 24
        case .player: return 44
        }
    }

    private var currentTopConcaveRadius: CGFloat {
        // The physical MacBook notch has a very sharp 8pt concave curve at the bezel
        return 8
    }

    private func formatTime(_ seconds: Double) -> String {
        guard !seconds.isNaN && !seconds.isInfinite else { return "0:00" }
        let totalSeconds = Int(seconds)
        let m = totalSeconds / 60
        let s = totalSeconds % 60
        return String(format: "%d:%02d", m, s)
    }

    var body: some View {
        VStack(spacing: 0) {
            ZStack(alignment: .top) {

                // The shape
                ExtrudedIslandShape(
                    bottomCornerRadius: currentBottomRadius,
                    topConcaveRadius: currentTopConcaveRadius
                )
                .fill(Color.black)
                .frame(width: currentWidth, height: currentHeight)
                .overlay(alignment: .bottom) {
                    if state.mode == .welcome {
                        Text("SYNCBEATS WELCOMES YOU")
                            .font(.system(size: 11, weight: .black, design: .rounded))
                            .tracking(2)
                            .foregroundColor(.white)
                            .padding(.bottom, 16)
                            .transition(.opacity.combined(with: .scale(scale: 0.85, anchor: .center)))
                    } else if case let .roomWelcome(roomId) = state.mode {
                        Text("You have joined room \(roomId). Enjoy the sync!")
                            .font(.system(size: 12, weight: .bold, design: .rounded))
                            .foregroundColor(Color(red: 0.0, green: 1.0, blue: 0.7)) // Cyan glowing text
                            .shadow(color: Color(red: 0.0, green: 1.0, blue: 0.7).opacity(0.8), radius: 4)
                            .padding(.bottom, 16)
                            .transition(.opacity.combined(with: .scale(scale: 0.85, anchor: .center)))
                    }
                }
                .overlay {
                    if state.mode == .miniPlayer {
                        miniPlayerContent
                            .transition(.opacity)
                    }
                }
                .overlay(alignment: .top) {
                    if showPlayerContent {
                        playerContent
                            .transition(.opacity)
                    }
                }
                // Clip all overlays strictly to the physical shape so they NEVER spill during animations
                .clipShape(
                    ExtrudedIslandShape(
                        bottomCornerRadius: currentBottomRadius,
                        topConcaveRadius: currentTopConcaveRadius + 2
                    )
                )
                .contentShape(
                    ExtrudedIslandShape(
                        bottomCornerRadius: currentBottomRadius,
                        topConcaveRadius: currentTopConcaveRadius + 2
                    )
                )
                .onTapGesture {
                    if state.mode == .hovered || state.mode == .miniPlayer {
                        NSHapticFeedbackManager.defaultPerformer.perform(.alignment, performanceTime: .now)
                        state.mode = .player
                    }
                }
                .compositingGroup()
                // Permanent shadow makes the notch always look like it's floating
                .shadow(color: Color.black.opacity(0.4), radius: 24, y: 12)
            }
            .animation(
                .spring(response: 0.6, dampingFraction: 0.75, blendDuration: 0.1),
                value: state.mode
            )
            .onChange(of: state.mode) { oldMode, newMode in
                if newMode == .player {
                    // Smooth wait before showing player content to match the slower spring
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
                        // Double check we are still in player mode before showing
                        if state.mode == .player {
                            withAnimation(.easeIn(duration: 0.15)) {
                                showPlayerContent = true
                            }
                        }
                    }
                } else {
                    // Hide the content instantly before the shape begins shrinking
                    withAnimation(.easeOut(duration: 0.05)) {
                        showPlayerContent = false
                    }
                }
            }
            
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .ignoresSafeArea()
    }
    
    // MARK: - Mini Player UI (Left: Album Art, Right: Visualizer)
    @ViewBuilder
    private var miniPlayerContent: some View {
        HStack {
            // Album Art
            Image(systemName: "opticaldisc")
                .font(.system(size: 20))
                .foregroundColor(.white)
                .rotationEffect(.degrees(audio.isPlaying ? 360 : 0))
                .animation(audio.isPlaying ? .linear(duration: 4.0).repeatForever(autoreverses: false) : .default, value: audio.isPlaying)
                .padding(.leading, 32)
                .padding(.top, 4)
            
            Spacer()
            
            // Audio Visualizer
            HStack(spacing: 3) {
                ForEach(0..<5) { index in
                    RoundedRectangle(cornerRadius: 1)
                        .fill(Color(red: 0.0, green: 1.0, blue: 0.7))
                        .frame(width: 3, height: audio.isPlaying ? CGFloat.random(in: 4...16) : 4)
                        .animation(audio.isPlaying ? .linear(duration: 0.2).repeatForever(autoreverses: true).delay(Double(index) * 0.1) : .default, value: audio.isPlaying)
                }
            }
            .padding(.trailing, 32)
            .padding(.top, 4)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
    
    // MARK: - Player UI Mockup
    @ViewBuilder
    private var playerContent: some View {
        ZStack {
            // Ambient glowing mesh background
            if audio.isPlaying {
                MeshGradientBackground()
                    .opacity(0.3)
                    .mask(RoundedRectangle(cornerRadius: 44))
            }
            
            VStack(spacing: 0) {
                // Top bar
                HStack {
                    HStack(spacing: 8) {
                        Image(systemName: "waveform")
                            .foregroundStyle(.cyan)
                        Text("SyncBeats")
                            .font(.system(size: 13, weight: .bold, design: .rounded))
                            .foregroundColor(.white)
                    }
                    Spacer()
                    Image(systemName: "gearshape.fill")
                        .foregroundColor(.gray)
                        .font(.system(size: 15))
                }
                .padding(.horizontal, 36)
                .padding(.top, 46)

                Spacer()

                // Player Info & Controls
                HStack(spacing: 24) {
                    // Spinning Vinyl Album Art
                    ZStack {
                        Circle()
                            .fill(Color.black)
                            .frame(width: 54, height: 54)
                            .overlay(Circle().stroke(Color.gray.opacity(0.3), lineWidth: 1))
                        
                        Image(systemName: "opticaldisc")
                            .font(.system(size: 24))
                            .foregroundColor(.white.opacity(0.8))
                    }
                    .rotationEffect(.degrees(audio.isPlaying ? 360 : 0))
                    .animation(audio.isPlaying ? .linear(duration: 4.0).repeatForever(autoreverses: false) : .default, value: audio.isPlaying)

                    // Track Info
                    VStack(alignment: .leading, spacing: 4) {
                        Text(socket.currentRoom?.roomId ?? "No Active Room")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundColor(.gray)
                        
                        if socket.downloadProgress > 0.0 && socket.downloadProgress < 1.0 {
                            Text("Peering... \(Int(socket.downloadProgress * 100))%")
                                .font(.system(size: 15, weight: .bold, design: .rounded))
                                .foregroundColor(Color(red: 0.0, green: 1.0, blue: 0.7)) // Cyan
                                .lineLimit(1)
                                
                            ProgressView(value: socket.downloadProgress, total: 1.0)
                                .progressViewStyle(.linear)
                                .tint(Color(red: 0.0, green: 1.0, blue: 0.7))
                                .frame(height: 4)
                                .padding(.top, 4)
                        } else {
                            let currentTrack = socket.currentRoom?.queue.first(where: { $0.isCurrent == true })?.title ?? socket.localPlaybackTitle ?? "No Track Playing"
                            
                            Text(currentTrack)
                                .font(.system(size: 16, weight: .heavy, design: .rounded))
                                .foregroundColor(.white)
                                .lineLimit(1)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)

                    // Controls
                    HStack(spacing: 24) {
                        Image(systemName: "backward.fill")
                            .font(.system(size: 18))
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
                                .font(.system(size: 44))
                                .foregroundColor(Color(red: 0.0, green: 1.0, blue: 0.7))
                        }
                        .buttonStyle(PlainButtonStyle())
                        
                        Image(systemName: "forward.fill")
                            .font(.system(size: 18))
                            .foregroundColor(.white)
                    }
                }
                .padding(.horizontal, 36)
                
                Spacer()

                // Bottom Scrub Bar
                if audio.duration > 0 {
                    HStack(spacing: 12) {
                        Text(formatTime(isDraggingSlider ? dragPosition : audio.currentPosition))
                            .font(.system(size: 11, weight: .bold, design: .monospaced))
                            .foregroundColor(.cyan)
                            .frame(width: 36, alignment: .trailing)
                        
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
                        
                        Text(formatTime(audio.duration))
                            .font(.system(size: 11, weight: .bold, design: .monospaced))
                            .foregroundColor(.gray)
                            .frame(width: 36, alignment: .leading)
                    }
                    .padding(.horizontal, 36)
                    .padding(.bottom, 24)
                }
            }
        }
        .frame(width: playerWidth)
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

        // Top-left flare tip (flushed 0px against the top bezel)
        path.move(to: CGPoint(x: 0, y: 0))
        
        // Top edge: perfectly flat, spanning the full width
        path.addLine(to: CGPoint(x: rect.maxX, y: 0))
        
        // Right flare: concave inward curve
        path.addQuadCurve(
            to: CGPoint(x: rect.maxX - safeCr, y: safeCr),
            control: CGPoint(x: rect.maxX - safeCr, y: 0)
        )
        
        // Right side
        path.addLine(to: CGPoint(x: rect.maxX - safeCr, y: rect.maxY - safeR))
        
        // Bottom-right convex corner
        path.addArc(
            center: CGPoint(x: rect.maxX - safeCr - safeR, y: rect.maxY - safeR),
            radius: safeR,
            startAngle: .degrees(0),
            endAngle: .degrees(90),
            clockwise: false
        )
        
        // Bottom edge
        path.addLine(to: CGPoint(x: safeCr + safeR, y: rect.maxY))
        
        // Bottom-left convex corner
        path.addArc(
            center: CGPoint(x: safeCr + safeR, y: rect.maxY - safeR),
            radius: safeR,
            startAngle: .degrees(90),
            endAngle: .degrees(180),
            clockwise: false
        )
        
        // Left side
        path.addLine(to: CGPoint(x: safeCr, y: safeCr))
        
        // Left flare: concave outward curve back to top-left tip
        path.addQuadCurve(
            to: CGPoint(x: 0, y: 0),
            control: CGPoint(x: safeCr, y: 0)
        )
        
        path.closeSubpath()
        return path
    }
}

// MARK: - Mesh Gradient Background
struct MeshGradientBackground: View {
    @State private var animate = false
    
    let colorCyan = Color(red: 0.0, green: 1.0, blue: 0.7)
    let colorPurple = Color(red: 0.48, green: 0.38, blue: 1.0)
    let colorPink = Color(red: 1.0, green: 0.24, blue: 0.44)
    
    var body: some View {
        ZStack {
            Color.black
            
            Circle()
                .fill(colorPurple.opacity(0.6))
                .blur(radius: 60)
                .frame(width: 300, height: 300)
                .offset(x: animate ? -100 : 100, y: animate ? -50 : 50)
            
            Circle()
                .fill(colorCyan.opacity(0.5))
                .blur(radius: 80)
                .frame(width: 400, height: 400)
                .offset(x: animate ? 150 : -150, y: animate ? 50 : -50)
        }
        .onAppear {
            withAnimation(.easeInOut(duration: 4.0).repeatForever(autoreverses: true)) {
                animate = true
            }
        }
    }
}
