import SwiftUI

/// Expands the entry composition only when both width and height have room.
/// A wide, short window keeps its compact controls and scrolling behavior.
struct EntryLayout {
    let size: CGSize
    var expansion: CGFloat {
        min(max(min((size.width - 1080) / 520, (size.height - 660) / 300), 0), 1)
    }
    func scaled(_ compact: CGFloat, _ spacious: CGFloat) -> CGFloat {
        compact + (spacious - compact) * expansion
    }
    var margin: CGFloat { size.width < 900 ? 20 : scaled(36, 68) }
    var contentWidth: CGFloat { min(max(size.width - margin * 2, 0), scaled(1080, 1480)) }
    var formWidth: CGFloat { scaled(420, 470) }
    var storyFraction: CGFloat { scaled(0.50, 0.54) }
    var minimumPanelHeight: CGFloat { expansion * min(max(size.height * 0.70, 640), 800) }
}
