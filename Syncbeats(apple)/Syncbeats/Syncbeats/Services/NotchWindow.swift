#if os(macOS)
import AppKit
import SwiftUI
import Combine

extension NSScreen {
    /// Size of the camera housing, or nil on notchless displays.
    ///
    /// Derived from the *widths* of the auxiliary areas rather than their origins,
    /// so it doesn't depend on which coordinate space AppKit reports them in.
    var notchSize: CGSize? {
        guard safeAreaInsets.top > 0,
              let left = auxiliaryTopLeftArea,
              let right = auxiliaryTopRightArea
        else { return nil }
        let width = frame.width - left.width - right.width
        // A real notch is ~200pt on a 1512pt panel. Anything outside this band is
        // a display reporting something we don't understand — treat as notchless.
        guard width > 40, width < frame.width * 0.5 else { return nil }
        return CGSize(width: width, height: safeAreaInsets.top)
    }
}

/// Tracks the mouse with `.activeAlways` so hover works in a panel that is never
/// the key window. SwiftUI's `.onHover` only fires reliably in an active window.
private final class HoverView: NSView {
    var onHover: ((Bool) -> Void)?
    weak var controller: NotchController?

    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        trackingAreas.forEach(removeTrackingArea)
        
        let isExp = controller?.isExpanded == true
        let size = isExp ? controller?.expandedSize : controller?.hoverSize
        let width = size?.width ?? 200
        let height = size?.height ?? 40
        let rect = NSRect(x: bounds.midX - width / 2, y: bounds.maxY - height, width: width, height: height)
        
        addTrackingArea(NSTrackingArea(
            rect: rect,
            options: [.mouseEnteredAndExited, .activeAlways],
            owner: self
        ))
    }

    override func mouseEntered(with event: NSEvent) { onHover?(true) }
    override func mouseExited(with event: NSEvent) { onHover?(false) }
    
    override func hitTest(_ point: NSPoint) -> NSView? {
        let view = super.hitTest(point)
        guard let controller = controller else { return view }
        
        let size = controller.isExpanded ? controller.expandedSize : controller.collapsedSize
        let rect = NSRect(x: bounds.midX - size.width / 2, y: bounds.maxY - size.height, width: size.width, height: size.height)
        
        if !rect.contains(point) {
            if view == self || view?.className.contains("NSHostingView") == true {
                return nil
            }
        }
        return view
    }
}

/// Owns the floating panel that hugs the notch.
///
/// The panel is resized to match the island's state rather than kept permanently
/// large — a big transparent panel pinned over the menu bar swallows clicks meant
/// for the menu.
@MainActor
final class NotchController: ObservableObject {
    static let shared = NotchController()

    @Published private(set) var isExpanded = false
    @Published private(set) var isHovered = false

    // Note: If you change the expanded width in DynamicIslandView, you must match it here!
    let expandedSize = CGSize(width: 680, height: 196)
    private let idleLobe: CGFloat = 28
    private let playingLobe: CGFloat = 86

    private var panel: NSPanel?
    private var collapseWork: DispatchWorkItem?
    private var bag = Set<AnyCancellable>()

    private init() {}

    // MARK: - Geometry

    /// The display carrying the notch, falling back to whichever is active.
    private var targetScreen: NSScreen {
        NSScreen.screens.first { $0.notchSize != nil } ?? NSScreen.main ?? NSScreen.screens[0]
    }

    var hasNotch: Bool { targetScreen.notchSize != nil }

    /// Width to leave empty in the middle of the collapsed island: on a notched
    /// display those pixels don't exist, so content there would be invisible.
    var notchWidth: CGFloat { targetScreen.notchSize?.width ?? 0 }

    var barHeight: CGFloat {
        targetScreen.notchSize?.height ?? NSStatusBar.system.thickness
    }

    var collapsedSize: CGSize {
        let lobe: CGFloat
        if RoomManager.shared.currentTrack == nil {
            lobe = hasNotch ? 0 : idleLobe
        } else {
            lobe = playingLobe
        }
        return CGSize(width: notchWidth + lobe * 2, height: barHeight)
    }
    
    var hoverSize: CGSize {
        let size = collapsedSize
        return CGSize(width: size.width + 28, height: size.height + 4)
    }
    
    // The window frame is permanently large enough to hold the expanded island.
    // This allows SwiftUI to handle 100% of the animation perfectly, completely eliminating
    // any AppKit jitter, dropping, or tearing during resizing.
    private var windowSize: CGSize {
        return CGSize(width: 900, height: 400)
    }

    private func frame(for size: CGSize) -> NSRect {
        let screen = targetScreen
        // Notched displays: flush with the very top so the island merges into the
        // housing. Notchless: tuck under the menu bar instead of fighting it.
        let topInset: CGFloat = hasNotch ? 0 : NSStatusBar.system.thickness
        return NSRect(
            x: screen.frame.midX - size.width / 2,
            y: screen.frame.maxY - size.height - topInset,
            width: size.width,
            height: size.height
        )
    }

    // MARK: - Lifecycle

    func attach() {
        if panel == nil { build() }
        panel?.setFrame(frame(for: windowSize), display: false)
        reposition()
        panel?.orderFrontRegardless()
    }

    func detach() {
        collapseWork?.cancel()
        isExpanded = false
        panel?.orderOut(nil)
    }

    private func build() {
        let hover = HoverView()
        hover.controller = self
        hover.onHover = { [weak self] inside in
            Task { @MainActor in self?.setHovered(inside) }
        }

        let hosting = NSHostingView(
            rootView: DynamicIslandView()
                .ignoresSafeArea(.all)
                .environmentObject(RoomManager.shared)
                .environmentObject(self)
        )
        if #available(macOS 14.0, *) {
            hosting.safeAreaRegions = []
        }
        hosting.translatesAutoresizingMaskIntoConstraints = false
        hover.addSubview(hosting)
        NSLayoutConstraint.activate([
            hosting.leadingAnchor.constraint(equalTo: hover.leadingAnchor),
            hosting.trailingAnchor.constraint(equalTo: hover.trailingAnchor),
            hosting.topAnchor.constraint(equalTo: hover.topAnchor),
            hosting.bottomAnchor.constraint(equalTo: hover.bottomAnchor),
        ])

        let panel = NSPanel(
            contentRect: frame(for: windowSize),
            styleMask: [.borderless, .nonactivatingPanel, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        panel.titlebarAppearsTransparent = true
        panel.titleVisibility = .hidden
        panel.contentView = hover
        panel.isFloatingPanel = true
        panel.level = .statusBar          // above .mainMenu, so it clears the menu bar
        panel.collectionBehavior = [.canJoinAllSpaces, .stationary, .fullScreenAuxiliary, .ignoresCycle]
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = false // SwiftUI draws the shadow!
        panel.isMovableByWindowBackground = false
        panel.hidesOnDeactivate = false
        panel.animationBehavior = .none
        
        hosting.layer?.backgroundColor = NSColor.clear.cgColor
        self.panel = panel

        NotificationCenter.default
            .publisher(for: NSApplication.didChangeScreenParametersNotification)
            .sink { [weak self] _ in Task { @MainActor in self?.reposition() } }
            .store(in: &bag)

        // The collapsed island is wider once there's artwork to show.
        RoomManager.shared.$currentTrack
            .map { $0 != nil }
            .removeDuplicates()
            .sink { [weak self] _ in Task { @MainActor in self?.reposition() } }
            .store(in: &bag)
    }

    private func reposition() {
        (panel?.contentView as? HoverView)?.updateTrackingAreas()
    }

    func setHovered(_ value: Bool) {
        guard isHovered != value else { return }
        isHovered = value
        
        // Cancel any pending close
        NSObject.cancelPreviousPerformRequests(withTarget: self)
        
        if !isExpanded {
            reposition()
        }
        
        if !value && isExpanded {
            // Auto-close when mouse leaves (2ms)
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.002) { [weak self] in
                guard let self, !self.isHovered, self.isExpanded else { return }
                self.setExpanded(false)
            }
        }
    }

    func toggleExpanded() {
        setExpanded(!isExpanded)
    }

    func setExpanded(_ value: Bool) {
        guard isExpanded != value else { return }
        isExpanded = value
        reposition()
    }

    /// Bring the room window forward — the island is a remote, not a replacement.
    func focusMainWindow() {
        NSApp.activate()
        NSApp.windows.first { !($0 is NSPanel) && $0.canBecomeMain }?.makeKeyAndOrderFront(nil)
    }
}
#endif
