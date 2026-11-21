import SwiftUI

struct EqualizerResponseGraph: View {
    @Bindable var audio: NativeRoomAudio
    private let inset: CGFloat = 12
    var body: some View {
        GeometryReader { geometry in
            let width = max(1, geometry.size.width - 2 * inset)
            let height = max(1, geometry.size.height - 28)
            ZStack(alignment: .topLeading) {
                AudioSpectrumView(audio: audio).padding(.horizontal, inset).frame(height: height).opacity(0.35)
                    .allowsHitTesting(false)
                Canvas { context, _ in
                    for gain in [-12.0, 0, 12] {
                        let y = height * CGFloat((12 - gain) / 24)
                        var grid = Path(); grid.move(to: CGPoint(x: inset, y: y)); grid.addLine(to: CGPoint(x: inset + width, y: y))
                        context.stroke(grid, with: .color(.secondary.opacity(0.18)), style: StrokeStyle(lineWidth: 1, dash: gain == 0 ? [] : [3, 5]))
                    }
                    var curve = Path()
                    for index in audio.equalizer.gains.indices {
                        let point = CGPoint(x: x(index, width: width), y: y(index, height: height))
                        if index == 0 { curve.move(to: point) } else {
                            let previous = CGPoint(x: x(index - 1, width: width), y: y(index - 1, height: height))
                            let middle = (previous.x + point.x) / 2
                            curve.addCurve(to: point, control1: CGPoint(x: middle, y: previous.y), control2: CGPoint(x: middle, y: point.y))
                        }
                    }
                    context.stroke(curve, with: .color(.accentColor.opacity(audio.equalizer.enabled ? 1 : 0.4)), style: StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))
                }.allowsHitTesting(false)
                ForEach(NativeEqualizer.frequencies.indices, id: \.self) { index in
                    bandPoint(index, width: width, height: height)
                    Text(NativeEqualizer.labels[index].replacingOccurrences(of: " Hz", with: "").replacingOccurrences(of: " kHz", with: "k"))
                        .font(.system(size: 10)).foregroundStyle(.secondary)
                        .position(x: x(index, width: width), y: height + 18)
                }
            }.coordinateSpace(name: "equalizerGraph")
        }
    }
    private func x(_ index: Int, width: CGFloat) -> CGFloat {
        let fraction = log(Double(NativeEqualizer.frequencies[index] / 60)) / log(200)
        return inset + width * fraction
    }
    private func y(_ index: Int, height: CGFloat) -> CGFloat {
        height * CGFloat((12 - audio.equalizer.gains[index]) / 24)
    }
    private func bandPoint(_ index: Int, width: CGFloat, height: CGFloat) -> some View {
        Circle().fill(audio.equalizer.enabled ? Color.accentColor : Color.secondary)
            .frame(width: 12, height: 12).padding(10).contentShape(Circle())
            .position(x: x(index, width: width), y: y(index, height: height))
            .gesture(DragGesture(minimumDistance: 0, coordinateSpace: .named("equalizerGraph")).onChanged { value in
                // A stable drag origin avoids compounding every pointer event.
                if dragBand != index { dragBand = index; dragGain = Double(audio.equalizer.gains[index]) }
                audio.setEqualizerGain(dragGain - Double(value.translation.height / height) * 24, band: index)
            }.onEnded { _ in dragBand = nil })
            .disabled(!audio.equalizer.enabled)
            .help("\(NativeEqualizer.labels[index]) · \(audio.equalizer.gains[index].formatted()) dB")
            .focusable()
            .onKeyPress(.upArrow) { audio.setEqualizerGain(Double(audio.equalizer.gains[index]) + 0.5, band: index); return .handled }
            .onKeyPress(.downArrow) { audio.setEqualizerGain(Double(audio.equalizer.gains[index]) - 0.5, band: index); return .handled }
            .accessibilityElement().accessibilityLabel("Equalizer \(NativeEqualizer.labels[index])")
            .accessibilityValue("\(audio.equalizer.gains[index].formatted()) decibels")
            .accessibilityAdjustableAction { direction in
                switch direction {
                case .increment: audio.setEqualizerGain(Double(audio.equalizer.gains[index]) + 0.5, band: index)
                case .decrement: audio.setEqualizerGain(Double(audio.equalizer.gains[index]) - 0.5, band: index)
                @unknown default: break
                }
            }
    }
    @State private var dragBand: Int?
    @State private var dragGain = 0.0
}
