import SwiftUI

// Draw shaped glyphs in place: wrapping, ligatures and bidirectional text remain native.
struct LyricInkRenderer: TextRenderer {
    var progress: Double
    var active: Bool
    var animatableData: Double {
        get { progress }
        set { progress = newValue }
    }
    func draw(layout: Text.Layout, in context: inout GraphicsContext) {
        let slices = layout.flatMap { $0 }.flatMap { $0 }
        let filled = min(1, max(0, progress)) * Double(slices.count)
        for (index, slice) in slices.enumerated() {
            var ink = context
            let amount = min(1, max(0, filled - Double(index)))
            ink.opacity = active ? 0.44 + 0.56 * amount : 0.3
            ink.draw(slice)
        }
    }
}
