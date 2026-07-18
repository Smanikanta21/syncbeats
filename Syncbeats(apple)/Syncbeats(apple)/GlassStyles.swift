import SwiftUI

// MARK: - Glass Card Modifier
struct GlassCard: ViewModifier {
    @Environment(\.colorScheme) var scheme
    var cornerRadius: CGFloat = Theme.Radius.card
    
    func body(content: Content) -> some View {
        content
            .background(.ultraThinMaterial)
            .cornerRadius(cornerRadius)
            .overlay(
                RoundedRectangle(cornerRadius: cornerRadius)
                    .stroke(Theme.Colors.glassBorder(for: scheme), lineWidth: 1)
            )
    }
}

extension View {
    func glassCard(cornerRadius: CGFloat = Theme.Radius.card) -> some View {
        self.modifier(GlassCard(cornerRadius: cornerRadius))
    }
}

// MARK: - Monochrome Primary Button Style
struct MonochromePrimaryButtonStyle: ButtonStyle {
    @Environment(\.colorScheme) var scheme
    var cornerRadius: CGFloat = Theme.Radius.pillBadge
    
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 13, weight: .bold, design: .rounded))
            .foregroundColor(scheme == .dark ? .black : .white)
            .padding(.vertical, 8)
            .padding(.horizontal, 16)
            .background(
                RoundedRectangle(cornerRadius: cornerRadius)
                    .fill(Theme.Colors.primaryAccent(for: scheme))
            )
            .opacity(configuration.isPressed ? 0.8 : 1.0)
            .scaleEffect(configuration.isPressed ? 0.98 : 1.0)
            .animation(.easeOut(duration: 0.1), value: configuration.isPressed)
    }
}

// MARK: - Monochrome Secondary Button Style
struct MonochromeSecondaryButtonStyle: ButtonStyle {
    @Environment(\.colorScheme) var scheme
    var cornerRadius: CGFloat = Theme.Radius.pillBadge
    
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 13, weight: .semibold, design: .rounded))
            .foregroundColor(scheme == .dark ? .white : .black)
            .padding(.vertical, 8)
            .padding(.horizontal, 16)
            .background(.thinMaterial)
            .cornerRadius(cornerRadius)
            .overlay(
                RoundedRectangle(cornerRadius: cornerRadius)
                    .stroke(Theme.Colors.glassBorder(for: scheme), lineWidth: 1)
            )
            .opacity(configuration.isPressed ? 0.8 : 1.0)
            .scaleEffect(configuration.isPressed ? 0.98 : 1.0)
            .animation(.easeOut(duration: 0.1), value: configuration.isPressed)
    }
}
