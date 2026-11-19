import SwiftUI

struct NativePalette {
    let light: Bool
    var background: Color { Color(hex: light ? 0xF7F5EF : 0x171C1A) }
    var panel: Color { Color(hex: light ? 0xFFFDF8 : 0x1C211F) }
    var raised: Color { Color(hex: light ? 0xEEECE4 : 0x262C28) }
    var text: Color { Color(hex: light ? 0x272C28 : 0xF4F5EF) }
    var secondary: Color { Color(hex: light ? 0x5D665E : 0xB7BAB5) }
    var quiet: Color { Color(hex: light ? 0x626C62 : 0x929B93) }
    var gold: Color { Color(hex: light ? 0x856635 : 0xCCB184) }
    var line: Color { text.opacity(light ? 0.10 : 0.09) }
    var ready: Color { Color(hex: light ? 0x41653A : 0xA4BD9E) }
    var error: Color { Color(hex: light ? 0x9C3D27 : 0xF3B7A3) }
    var buttonText: Color { Color(hex: light ? 0xFFFDF8 : 0x252920) }
}

struct NativeButtonStyle: ButtonStyle {
    let palette: NativePalette
    var prominent = false

    func makeBody(configuration: Configuration) -> some View {
        NativeButtonSurface(configuration: configuration, palette: palette, prominent: prominent)
    }
}

private struct NativeButtonSurface: View {
    let configuration: ButtonStyleConfiguration
    let palette: NativePalette
    let prominent: Bool
    @Environment(\.isEnabled) private var enabled
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var hovered = false

    var body: some View {
        configuration.label
            .background(prominent ? palette.gold : enabled && (hovered || configuration.isPressed) ? palette.raised : .clear,
                        in: RoundedRectangle(cornerRadius: 8))
            .contentShape(RoundedRectangle(cornerRadius: 8))
            .opacity(enabled ? 1 : 0.45)
            .scaleEffect(configuration.isPressed && enabled && !reduceMotion ? 0.98 : 1)
            .onHover { hovered = $0 }
            .animation(reduceMotion ? nil : .easeOut(duration: 0.12), value: hovered)
            .animation(reduceMotion ? nil : .easeOut(duration: 0.12), value: configuration.isPressed)
    }
}

extension Color {
    init(hex: UInt32) {
        self.init(.sRGB, red: Double((hex >> 16) & 255) / 255,
                  green: Double((hex >> 8) & 255) / 255,
                  blue: Double(hex & 255) / 255, opacity: 1)
    }
}

struct GoldButton: View {
    let title: String
    let palette: NativePalette
    var working = false
    var arrow = true
    var fontSize: CGFloat = 14
    var minimumHeight: CGFloat = 40
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            HStack(spacing: 16) {
                if working { NativeLoadingSignal(size: 20, foreground: palette.buttonText, surface: palette.gold) }
                Text(title).font(.system(size: fontSize, weight: .medium))
                if arrow && !working { Image(systemName: "arrow.right").font(.system(size: 16)) }
            }
            .padding(.horizontal, 20).frame(minHeight: minimumHeight)
            .foregroundStyle(palette.buttonText)
        }
        .buttonStyle(NativeButtonStyle(palette: palette, prominent: true))
        .accessibilityLabel(title)
        .disabled(working)
    }
}

struct IntroPill: View {
    let text: String
    let palette: NativePalette
    var fontSize: CGFloat = 12
    var body: some View {
        Text(text).font(.system(size: max(12, fontSize))).foregroundStyle(palette.secondary)
            .padding(.horizontal, 12).padding(.vertical, 8)
            .background(palette.raised, in: RoundedRectangle(cornerRadius: 8))
    }
}

struct InlineStatus: View {
    let model: AppModel
    let palette: NativePalette
    var fontSize: CGFloat = 13
    var body: some View {
        if let message = model.errorMessage ?? model.notice {
            Text(message).font(.system(size: max(12, fontSize))).lineSpacing(4)
                .foregroundStyle(model.errorMessage != nil ? palette.error : palette.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(12)
                .background(palette.raised, in: RoundedRectangle(cornerRadius: 8))
                .accessibilityLabel(message)
        }
    }
}
