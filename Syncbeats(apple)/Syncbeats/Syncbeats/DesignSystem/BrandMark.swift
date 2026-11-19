import SwiftUI

struct LinkedPlayLoop: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: 19, y: 15.5))
        p.addCurve(to: CGPoint(x: 13, y: 18.9), control1: CGPoint(x: 16.3, y: 13.9), control2: CGPoint(x: 13, y: 15.8))
        p.addLine(to: CGPoint(x: 13, y: 39.1))
        p.addCurve(to: CGPoint(x: 19, y: 42.5), control1: CGPoint(x: 13, y: 42.2), control2: CGPoint(x: 16.3, y: 44.1))
        p.addLine(to: CGPoint(x: 36.5, y: 32.4))
        p.addCurve(to: CGPoint(x: 36.5, y: 25.4), control1: CGPoint(x: 39.2, y: 30.8), control2: CGPoint(x: 39.2, y: 27))
        p.closeSubpath()
        return p.applying(CGAffineTransform(scaleX: rect.width / 64, y: rect.height / 64))
    }
}

/// Vector equivalent of the retained Linked Play asset, with independently drawn loops.
struct BrandMark: View {
    var progress: CGFloat = 1
    var secondProgress: CGFloat = 1
    var body: some View {
        GeometryReader { geometry in
            let size = min(geometry.size.width, geometry.size.height)
            let background = Color(hex: 0x171C1A)
            ZStack {
                RoundedRectangle(cornerRadius: size * 15 / 64).fill(background)
                LinkedPlayLoop().trim(from: 0, to: progress)
                    .stroke(Color(hex: 0xF4F5EF), style: StrokeStyle(lineWidth: size * 5.5 / 64, lineJoin: .round))
                LinkedPlayLoop().stroke(background, style: StrokeStyle(lineWidth: size * 10 / 64, lineJoin: .round))
                    .offset(x: size * 12 / 64, y: size * 7 / 64)
                LinkedPlayLoop().trim(from: 0, to: secondProgress)
                    .stroke(Color(hex: 0xB7BAB5), style: StrokeStyle(lineWidth: size * 5.5 / 64, lineJoin: .round))
                    .offset(x: size * 12 / 64, y: size * 7 / 64)
            }
            .frame(width: size, height: size)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
        }
        .aspectRatio(1, contentMode: .fit)
        .accessibilityHidden(true)
    }
}
