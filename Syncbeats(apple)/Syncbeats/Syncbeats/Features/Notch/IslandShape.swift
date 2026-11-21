#if os(macOS)
import SwiftUI

/// The top shoulders flare outward into the screen edge; the bottom corners
/// curve inward around the content. An ordinary rounded rectangle cannot do both.
struct IslandShape: Shape {
    var attached: Bool
    var expansion: Double

    var animatableData: Double {
        get { expansion }
        set { expansion = newValue }
    }

    func path(in rect: CGRect) -> Path {
        let amount = CGFloat(min(1, max(0, expansion)))
        guard attached else {
            let radius = 19 + amount * 9
            return RoundedRectangle(cornerRadius: radius, style: .continuous).path(in: rect)
        }
        let shoulder = min(10 + amount * 12, rect.height / 2, rect.width / 4)
        let bottom = min(11 + amount * 17, rect.height / 2, (rect.width - shoulder * 2) / 2)
        let k: CGFloat = 0.5522847498
        let left = rect.minX + shoulder
        let right = rect.maxX - shoulder
        var path = Path()
        path.move(to: CGPoint(x: rect.minX, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.minY))
        // Concave quarter circle: tangent to the screen, then to the right side.
        path.addCurve(to: CGPoint(x: right, y: rect.minY + shoulder),
                      control1: CGPoint(x: rect.maxX - shoulder * k, y: rect.minY),
                      control2: CGPoint(x: right, y: rect.minY + shoulder * (1 - k)))
        path.addLine(to: CGPoint(x: right, y: rect.maxY - bottom))
        path.addCurve(to: CGPoint(x: right - bottom, y: rect.maxY),
                      control1: CGPoint(x: right, y: rect.maxY - bottom * (1 - k)),
                      control2: CGPoint(x: right - bottom * (1 - k), y: rect.maxY))
        path.addLine(to: CGPoint(x: left + bottom, y: rect.maxY))
        path.addCurve(to: CGPoint(x: left, y: rect.maxY - bottom),
                      control1: CGPoint(x: left + bottom * (1 - k), y: rect.maxY),
                      control2: CGPoint(x: left, y: rect.maxY - bottom * (1 - k)))
        path.addLine(to: CGPoint(x: left, y: rect.minY + shoulder))
        path.addCurve(to: CGPoint(x: rect.minX, y: rect.minY),
                      control1: CGPoint(x: left, y: rect.minY + shoulder * (1 - k)),
                      control2: CGPoint(x: rect.minX + shoulder * k, y: rect.minY))
        path.closeSubpath()
        return path
    }
}
#endif
