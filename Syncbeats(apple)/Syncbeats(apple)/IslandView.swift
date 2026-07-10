import SwiftUI
import Combine

enum IslandMode {
    case hidden
    case hovered
    case welcome
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
    private let playerWidth: CGFloat = 700
    
    // Heights
    private let notchRegion: CGFloat = 30
    private let hoveredDropHeight: CGFloat = 12
    private let welcomeDropHeight: CGFloat = 36
    private let playerDropHeight: CGFloat = 120

    private var currentWidth: CGFloat {
        switch state.mode {
        case .hidden: return collapsedWidth
        case .hovered: return hoveredWidth
        case .welcome: return welcomeWidth
        case .player: return playerWidth
        }
    }

    private var currentHeight: CGFloat {
        switch state.mode {
        case .hidden: return notchRegion
        case .hovered: return notchRegion + hoveredDropHeight
        case .welcome: return notchRegion + welcomeDropHeight
        case .player: return notchRegion + playerDropHeight
        }
    }

    private var currentBottomRadius: CGFloat {
        switch state.mode {
        case .hidden: return 14
        case .hovered: return 14
        case .welcome: return 24
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
                .onTapGesture {
                    if state.mode == .hovered {
                        NSHapticFeedbackManager.defaultPerformer.perform(.alignment, performanceTime: .now)
                        state.mode = .player
                    }
                }
                // Permanent shadow makes the notch always look like it's floating
                .shadow(color: Color.black.opacity(0.4), radius: 24, y: 12)
            }
            .animation(
                .spring(response: 0.6, dampingFraction: 0.75, blendDuration: 0.1),
                value: state.mode
            )
            .onChange(of: state.mode) { oldMode, newMode in
                if newMode == .player {
                    // Smooth wait (0.4s) before showing player content to match the slower spring
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
                        // Double check we are still in player mode before showing
                        if state.mode == .player {
                            withAnimation(.easeIn(duration: 0.2)) {
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
    
    // MARK: - Player UI Mockup
    @ViewBuilder
    private var playerContent: some View {
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

            // Player controls
            HStack(spacing: 24) {
                // Album Art
                RoundedRectangle(cornerRadius: 12)
                    .fill(Color(white: 0.15))
                    .frame(width: 54, height: 54)
                    .overlay(
                        Image(systemName: "opticaldisc")
                            .font(.system(size: 24))
                            .foregroundColor(.white.opacity(0.8))
                    )

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
                            .font(.system(size: 15, weight: .bold, design: .rounded))
                            .foregroundColor(.white)
                            .lineLimit(1)
                            
                        if audio.duration > 0 {
                            HStack(spacing: 6) {
                                Text(formatTime(isDraggingSlider ? dragPosition : audio.currentPosition))
                                    .font(.system(size: 10, weight: .bold, design: .monospaced))
                                    .foregroundColor(.white.opacity(0.5))
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
                                
                                Text(formatTime(audio.duration))
                                    .font(.system(size: 10, weight: .bold, design: .monospaced))
                                    .foregroundColor(.white.opacity(0.5))
                                    .frame(width: 32, alignment: .leading)
                            }
                            .padding(.top, 2)
                        }
                    }
                }
                .frame(maxWidth: 200)

                Spacer()

                // Controls
                HStack(spacing: 20) {
                    // Earbud Sync Hardware Latency Slider
                    VStack {
                        Text("Earbud Sync: \(Int(earbudLatencyMs))ms")
                            .font(.system(size: 8))
                            .foregroundColor(.gray)
                        Slider(value: $earbudLatencyMs, in: -200...200)
                            .frame(width: 80)
                            .onChange(of: earbudLatencyMs) { newValue in
                                // Here we would adjust the AudioEngine's manual latency offset!
                            }
                    }
                    
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
                            .font(.system(size: 42))
                            .foregroundColor(.white)
                    }
                    .buttonStyle(PlainButtonStyle())
                    
                    Image(systemName: "forward.fill")
                        .font(.system(size: 18))
                        .foregroundColor(.white)
                }
            }
            .padding(.horizontal, 36)
            .padding(.bottom, 32)
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
