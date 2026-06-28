import SwiftUI

/// The main in-app Dynamic Island container
/// Adapts shape to device type: Dynamic Island pill, notch-hugging, or floating pill
struct DynamicIslandView: View {
    @StateObject private var audioPlayer = AudioPlayerManager.shared
    @State private var isExpanded = false
    @State private var dragOffset: CGFloat = 0
    
    private let deviceType = DeviceHelper.deviceType
    
    // MARK: - Layout constants per device type
    
    /// Compact pill dimensions
    private var compactWidth: CGFloat {
        switch deviceType {
        case .dynamicIsland: return 210
        case .notch: return 210
        case .homeButton: return 200
        }
    }
    
    private var compactHeight: CGFloat {
        switch deviceType {
        case .dynamicIsland: return 40
        case .notch: return 80          // 20 (offscreen) + 24 (notch depth) + 36 (content)
        case .homeButton: return 42
        }
    }
    
    /// Expanded dimensions
    private var expandedWidth: CGFloat {
        UIScreen.main.bounds.width - 26
    }
    
    private var expandedHeight: CGFloat { 340 }
    
    /// Top offset from screen edge
    private var topOffset: CGFloat {
        switch deviceType {
        case .dynamicIsland: return 11  // Aligns with hardware Dynamic Island
        case .notch: return -20         // Push up to hide top rounded corners
        case .homeButton: return 8      // Floating at the top
        }
    }
    
    /// Corner radius
    private var cornerRadius: CGFloat {
        isExpanded ? 38 : (compactHeight / 2)
    }
    
    // MARK: - Body
    
    var body: some View {
        let currentWidth = isExpanded ? expandedWidth : compactWidth
        let currentHeight = isExpanded ? expandedHeight : compactHeight
        
        ZStack {
            // Background overlay when expanded (tap to dismiss)
            if isExpanded {
                Color.black.opacity(0.3)
                    .ignoresSafeArea()
                    .onTapGesture { collapse() }
                    .transition(.opacity)
                    .zIndex(0)
            }
            
            // The island itself
            VStack {
                ZStack {
                    // Background
                    RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                        .fill(Color.black)
                        .shadow(color: .black.opacity(isExpanded ? 0.4 : 0.2), radius: isExpanded ? 20 : 8, y: isExpanded ? 8 : 4)
                        .overlay(
                            RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                                .stroke(Color.white.opacity(isExpanded ? 0.08 : 0.05), lineWidth: 0.5)
                        )
                    
                    // Compact content
                    if !isExpanded {
                        IslandCompactView(
                            audioPlayer: audioPlayer,
                            isExpanded: isExpanded,
                            deviceType: deviceType
                        )
                        .padding(.bottom, deviceType == .notch ? 7 : 0) // Center perfectly in the 34pt space below the physical notch
                        .frame(height: compactHeight, alignment: deviceType == .notch ? .bottom : .center)
                        .frame(maxWidth: .infinity)
                        .allowsHitTesting(false) // Let taps pass through to the island container
                    }
                    
                    // Expanded content
                    if isExpanded {
                        IslandExpandedView(
                            audioPlayer: audioPlayer,
                            isExpanded: isExpanded,
                            deviceType: deviceType
                        )
                        .padding(.top, deviceType == .notch ? 40 : 0) // Push down slightly below the notch
                    }
                }
                .frame(width: currentWidth, height: currentHeight + dragOffset)
                .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
                .contentShape(Rectangle()) // Make entire area tappable
                .onTapGesture {
                    if !isExpanded { expand() }
                }
                .highPriorityGesture(
                    isExpanded ?
                    DragGesture()
                        .onChanged { value in
                            if value.translation.height < 0 {
                                dragOffset = value.translation.height * 0.3
                            }
                        }
                        .onEnded { value in
                            if value.translation.height < -50 {
                                collapse()
                            }
                            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                                dragOffset = 0
                            }
                        }
                    : nil
                )
                .animation(.spring(response: 0.35, dampingFraction: 0.75, blendDuration: 0), value: isExpanded)
                .animation(.spring(response: 0.35, dampingFraction: 0.75, blendDuration: 0), value: currentWidth)
                .animation(.spring(response: 0.35, dampingFraction: 0.75, blendDuration: 0), value: currentHeight)
                
                Spacer()
            }
            .padding(.top, topOffset)
            .zIndex(1)
        }
        .ignoresSafeArea(edges: .top)
    }
    
    // MARK: - Actions
    
    private func expand() {
        let impactFeedback = UIImpactFeedbackGenerator(style: .medium)
        impactFeedback.impactOccurred()
        withAnimation(.spring(response: 0.35, dampingFraction: 0.75, blendDuration: 0)) {
            isExpanded = true
        }
    }
    
    private func collapse() {
        let impactFeedback = UIImpactFeedbackGenerator(style: .light)
        impactFeedback.impactOccurred()
        withAnimation(.spring(response: 0.3, dampingFraction: 0.8, blendDuration: 0)) {
            isExpanded = false
        }
    }
}

#Preview {
    ZStack {
        Color.white.ignoresSafeArea()
        VStack {
            DynamicIslandView()
            Spacer()
        }
    }
}
