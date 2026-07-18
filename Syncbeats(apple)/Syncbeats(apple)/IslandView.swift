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
        return 8
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
                .overlay {
                    if state.mode == .miniPlayer {
                        Text("Mini Player Placeholder")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundColor(.white.opacity(0.8))
                            .padding(.top, 4)
                    }
                }
                .overlay(alignment: .center) {
                    if showPlayerContent {
                        Text("Expanded Player Canvas")
                            .font(.system(size: 16, weight: .bold))
                            .foregroundColor(.white)
                            .padding(.top, notchRegion)
                    }
                }
                .onTapGesture {
                    if state.mode == .hovered || state.mode == .miniPlayer {
                        NSHapticFeedbackManager.defaultPerformer.perform(.alignment, performanceTime: .now)
                        state.mode = .player
                    }
                }
            }
            .animation(
                .spring(response: 0.6, dampingFraction: 0.75, blendDuration: 0.1),
                value: state.mode
            )
            .onChange(of: state.mode) { oldMode, newMode in
                if newMode == .player {
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
                        if state.mode == .player {
                            withAnimation(.easeIn(duration: 0.15)) {
                                showPlayerContent = true
                            }
                        }
                    }
                } else {
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
