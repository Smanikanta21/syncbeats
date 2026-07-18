import SwiftUI

struct Theme {
    // MARK: - Spacing & Padding
    struct Spacing {
        static let base: CGFloat = 4
        static let rowGap: CGFloat = 12
        static let containerPadding: CGFloat = 24
        static let sectionGap: CGFloat = 32
    }
    
    // MARK: - Corner Radius
    struct Radius {
        static let card: CGFloat = 14
        static let largePanel: CGFloat = 20
        static let pillBadge: CGFloat = 8
    }
    
    // MARK: - Color Palette
    struct Colors {
        static func background(for scheme: ColorScheme) -> Color {
            scheme == .dark ? Color.black : Color.white
        }
        
        static func primaryAccent(for scheme: ColorScheme) -> Color {
            scheme == .dark ? Color.white : Color.black
        }
        
        static func secondaryAccent(for scheme: ColorScheme) -> Color {
            scheme == .dark ? Color(white: 0.9) : Color(white: 0.1)
        }
        
        static func glassBorder(for scheme: ColorScheme) -> Color {
            scheme == .dark ? Color.white.opacity(0.12) : Color.black.opacity(0.10)
        }
        
        static func textMuted(for scheme: ColorScheme) -> Color {
            scheme == .dark ? Color(white: 0.6) : Color(white: 0.4)
        }
    }
    
    // MARK: - Fonts
    struct Fonts {
        static func headline(size: CGFloat) -> Font {
            .system(size: size, weight: .bold, design: .rounded)
        }
        
        static func body(size: CGFloat = 13) -> Font {
            .system(size: size, weight: .regular, design: .default)
        }
        
        static func mono(size: CGFloat = 11) -> Font {
            .system(size: size, weight: .medium, design: .monospaced)
        }
    }
}
