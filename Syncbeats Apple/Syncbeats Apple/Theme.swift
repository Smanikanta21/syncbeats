import SwiftUI

struct Theme {
    static let background = Color(red: 0.035, green: 0.035, blue: 0.043) // #09090b
    static let foreground = Color.white
    
    // Glassmorphism properties
    static let glassBackground = Color.white.opacity(0.08)
    static let glassBorder = Color.white.opacity(0.15)
    
    static let accent = Color.blue
}

struct GlassPanelModifier: ViewModifier {
    func body(content: Content) -> some View {
        content
            .background(.ultraThinMaterial)
            .background(Theme.glassBackground)
            .cornerRadius(16)
            .overlay(
                RoundedRectangle(cornerRadius: 16)
                    .stroke(Theme.glassBorder, lineWidth: 1)
            )
            .shadow(color: Color.black.opacity(0.4), radius: 30, x: 0, y: 15)
    }
}

extension View {
    func glassPanel() -> some View {
        self.modifier(GlassPanelModifier())
    }
}
