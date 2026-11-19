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

    init(frame: CGRect, visibleFrame: CGRect, safeTop: CGFloat, leftArea: CGRect, rightArea: CGRect) {
        hasCameraCutout = safeTop > 0 && !leftArea.isEmpty && !rightArea.isEmpty
        cameraWidth = hasCameraCutout ? max(0, rightArea.minX - leftArea.maxX) : 92
        centerX = hasCameraCutout ? leftArea.maxX + cameraWidth / 2 : frame.midX
        topY = hasCameraCutout ? frame.maxY : visibleFrame.maxY - 8
        cameraHeight = hasCameraCutout ? max(32, safeTop) : 0
        // A visible lip below the physical camera gives the center a usable click target.
        closedHeight = hasCameraCutout ? cameraHeight + 10 : 38
        expandedWidth = min(480, max(280, frame.width - 32))
    }

    var closedWidth: CGFloat { min(expandedWidth, cameraWidth + 112) }
    func panelFrame(expanded: Bool) -> CGRect {
        panelFrame(expansion: expanded ? 1 : 0)
    }
    func panelFrame(expansion: Double) -> CGRect {
        let amount = CGFloat(min(1.025, max(0, expansion)))
        let width = closedWidth + (expandedWidth - closedWidth) * amount
        let height = closedHeight + 260 * amount
        return CGRect(x: centerX - width / 2, y: topY - height, width: width, height: height)
    }
    static let preview = NotchGeometry(frame: CGRect(x: 0, y: 0, width: 1512, height: 982),
                                      visibleFrame: CGRect(x: 0, y: 0, width: 1512, height: 950), safeTop: 32,
                                      leftArea: CGRect(x: 0, y: 950, width: 660, height: 32),
                                      rightArea: CGRect(x: 852, y: 950, width: 660, height: 32))
}
#endif
