#if os(macOS)
import AppKit

/// Uses the camera's safe area in points, never a guessed MacBook resolution.
struct NotchGeometry: Equatable {
    let centerX: CGFloat
    let topY: CGFloat
    let cameraWidth: CGFloat
    let cameraHeight: CGFloat
    let closedHeight: CGFloat
    let expandedWidth: CGFloat
    let hasCameraCutout: Bool
    // Keep larger artwork clear of the concave shoulder and camera cutout.
    static let sideWingWidth: CGFloat = 64
    static let cameraClearance: CGFloat = 6
    static let contentTopInset: CGFloat = 12
    static let contentBottomInset: CGFloat = 24
    static let contentSideInset: CGFloat = 40

    init(frame: CGRect, visibleFrame: CGRect, safeTop: CGFloat, leftArea: CGRect, rightArea: CGRect) {
        hasCameraCutout = safeTop > 0 && !leftArea.isEmpty && !rightArea.isEmpty
        cameraWidth = hasCameraCutout ? max(0, rightArea.minX - leftArea.maxX) : 92
        centerX = hasCameraCutout ? leftArea.maxX + cameraWidth / 2 : frame.midX
        topY = hasCameraCutout ? frame.maxY : visibleFrame.maxY - 8
        cameraHeight = hasCameraCutout ? safeTop : 0
        // Rest exactly against the hardware; the wings provide the click area.
        closedHeight = hasCameraCutout ? cameraHeight : 30
        expandedWidth = min(480, max(280, frame.width - 32))
    }

    var closedWidth: CGFloat { min(expandedWidth, cameraWidth + Self.cameraClearance * 2 + Self.sideWingWidth * 2) }
    var compactArtworkSize: CGFloat { min(30, closedHeight - 8) }
    static let hoverScale: CGFloat = 1.025
    static let hoverLip: CGFloat = 2
    static let shadowInset: CGFloat = 12
    static let shadowBottomInset: CGFloat = 16
    static let maximumExpansion: Double = 1.09
    // The reference expands sideways and down on the same spring trajectory.
    static func widthExpansion(_ expansion: Double) -> Double {
        let amount = min(maximumExpansion, max(0, expansion))
        return amount
    }
    var hoveredWidth: CGFloat { closedWidth * Self.hoverScale }
    var hoveredHeight: CGFloat { closedHeight * Self.hoverScale + Self.hoverLip }
    func panelFrame(expanded: Bool) -> CGRect {
        panelFrame(expansion: expanded ? 1 : 0)
    }
    func panelFrame(expansion: Double, hover: Double = 0, contentHeight: CGFloat = 256) -> CGRect {
        let amount = CGFloat(min(Self.maximumExpansion, max(0, expansion)))
        let hint = CGFloat(min(1, max(0, hover)))
        let scale = 1 + (Self.hoverScale - 1) * hint
        let width = (closedWidth + (expandedWidth - closedWidth) * CGFloat(Self.widthExpansion(expansion))) * scale
        let bodyHeight = max(0, contentHeight) + Self.contentTopInset + Self.contentBottomInset
        let height = (closedHeight + bodyHeight * amount) * scale + Self.hoverLip * hint * (1 - min(1, amount))
        return CGRect(x: centerX - width / 2, y: topY - height, width: width, height: height)
    }
    func containsPointer(_ point: CGPoint, in frame: CGRect) -> Bool {
        // Include the screen's very top edge and the hardware camera gap.
        point.x >= frame.minX && point.x <= frame.maxX && point.y >= frame.minY && point.y <= frame.maxY
    }
    static let preview = NotchGeometry(frame: CGRect(x: 0, y: 0, width: 1512, height: 982),
                                      visibleFrame: CGRect(x: 0, y: 0, width: 1512, height: 950), safeTop: 32,
                                      leftArea: CGRect(x: 0, y: 950, width: 660, height: 32),
                                      rightArea: CGRect(x: 852, y: 950, width: 660, height: 32))
}
#endif
