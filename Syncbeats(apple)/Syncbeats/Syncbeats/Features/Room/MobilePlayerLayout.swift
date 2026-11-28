import Foundation

/// Budgets artwork after reserving room for touch controls and safe-area content.
nonisolated struct MobilePlayerLayout {
    let wide: Bool
    let compressed: Bool
    let wideDock: Bool
    let portraitDetails: Bool
    let coverSize: CGFloat
    let reservedHeight: CGFloat
    init(size: CGSize) {
        wide = size.width >= 850 || (size.width >= 650 && size.height < 580)
        compressed = size.height < 500
        portraitDetails = !wide && !compressed
        wideDock = size.width >= 1000
        let dock: CGFloat = wideDock ? 96 : compressed ? 104 : size.width < 400 ? 200 : 156
        let metadata: CGFloat = compressed ? 56 : 148
        let bodyPadding: CGFloat = compressed ? 20 : 48
        reservedHeight = 56 + dock + metadata + bodyPadding + (wide || compressed ? 0 : 64)
        coverSize = max(44, min(wide ? min(size.width * 0.31, 450) : size.width * 0.72,
                                size.height - reservedHeight))
    }
}
