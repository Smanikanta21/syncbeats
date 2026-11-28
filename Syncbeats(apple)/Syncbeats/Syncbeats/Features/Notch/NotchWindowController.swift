#if os(macOS)
import AppKit
import SwiftUI
import Observation
import QuartzCore

final class IslandPanel: NSPanel {
    var capFrame: CGRect = .zero
    var playbackFrame: CGRect = .zero
    var onCapClick: (() -> Void)?
    var onPlaybackClick: (() -> Void)?
    private enum CapAction { case open, playback }
    private var pressedCap: CapAction?

    override func sendEvent(_ event: NSEvent) {
        let point = event.locationInWindow
        let cap = capFrame
        if event.type == .leftMouseDown, cap.contains(point) {
            // Handle the whole cap in AppKit, including its transparent camera gap.
            // This also makes the first click work while the app is inactive.
            pressedCap = playbackFrame.contains(point) ? .playback : .open
            return
        }
        if event.type == .leftMouseUp, let action = pressedCap {
            pressedCap = nil
            if cap.contains(point) {
                if action == .playback, playbackFrame.contains(point) { onPlaybackClick?() }
                if action == .open, !playbackFrame.contains(point) { onCapClick?() }
            }
            return
        }
        super.sendEvent(event)
    }

    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { false }
    // A normal window is constrained below the menu bar. This overlay is deliberately
    // positioned against the physical screen edge by NotchGeometry instead.
    override func constrainFrameRect(_ frameRect: NSRect, to screen: NSScreen?) -> NSRect { frameRect }
}

private final class IslandHostingView<Content: View>: NSHostingView<Content> {
    var onPointerMove: ((CGPoint) -> Void)?
    private var islandTrackingArea: NSTrackingArea?
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }

    override func updateTrackingAreas() {
        if let islandTrackingArea { removeTrackingArea(islandTrackingArea) }
        let area = NSTrackingArea(rect: .zero,
                                 options: [.activeAlways, .mouseEnteredAndExited, .mouseMoved, .inVisibleRect, .enabledDuringMouseDrag],
                                 owner: self, userInfo: nil)
        addTrackingArea(area)
        islandTrackingArea = area
        super.updateTrackingAreas()
    }
    override func mouseEntered(with event: NSEvent) { onPointerMove?(NSEvent.mouseLocation) }
    override func mouseExited(with event: NSEvent) { onPointerMove?(NSEvent.mouseLocation) }
    override func mouseMoved(with event: NSEvent) { onPointerMove?(NSEvent.mouseLocation) }
}

@MainActor @Observable
final class NotchWindowController: NSObject, NSWindowDelegate {
    private(set) var panelVisible = false
    private(set) var expanded = false
    private(set) var expansion: Double = 0
    private(set) var hoverExpansion: Double = 0
    private(set) var pointerInside = false
    var equalizerPresented = false
    private(set) var geometry = NotchGeometry.preview
    private(set) var expandedContentHeight: CGFloat = 256
    var presentationScale: CGFloat { 1 + (NotchGeometry.hoverScale - 1) * CGFloat(hoverExpansion) }
    var restingFrame: CGRect {
        geometry.panelFrame(expansion: expansion, contentHeight: expandedContentHeight)
    }
    var presentationFrame: CGRect {
        geometry.panelFrame(expansion: expansion, hover: hoverExpansion, contentHeight: expandedContentHeight)
    }
    var windowFrame: CGRect {
        let maximum = geometry.panelFrame(expansion: expansion, hover: 1, contentHeight: expandedContentHeight)
        // AppKit rounds resized windows to whole points. Keep a symmetric, fixed
        // hover viewport so only the SwiftUI silhouette changes on hover ticks.
        let width = ceil(maximum.width / 2) * 2 + NotchGeometry.shadowInset * 2
        let height = ceil(maximum.height) + NotchGeometry.shadowBottomInset
        return CGRect(x: geometry.centerX - width / 2, y: geometry.topY - height, width: width, height: height)
    }
    @ObservationIgnored private var panel: IslandPanel?
    @ObservationIgnored private var screenObserver: NSObjectProtocol?
    @ObservationIgnored private var panelFocusObserver: NSObjectProtocol?
    @ObservationIgnored private var appFocusObserver: NSObjectProtocol?
    @ObservationIgnored private var workspaceFocusObserver: NSObjectProtocol?
    @ObservationIgnored private var hoverTask: Task<Void, Never>?
    @ObservationIgnored private var openRoomAction: (() -> Void)?
    @ObservationIgnored private weak var playbackRoom: RoomSession?
    @ObservationIgnored private var motion = NotchMotion()
    @ObservationIgnored private var hoverMotion = NotchMotion(openingDamping: 1, openingFrequency: 21, closingFrequency: 26)
    @ObservationIgnored private var displayLink: CADisplayLink?
    @ObservationIgnored private var animationWatchdog: Timer?
    @ObservationIgnored private var lastFrameTime: CFTimeInterval = 0
    @ObservationIgnored private var lastDisplayFrameTime: CFTimeInterval = 0
    @ObservationIgnored private var screen: NSScreen?
    @ObservationIgnored private var globalPointerMonitor: Any?
    @ObservationIgnored private var localPointerMonitor: Any?
    @ObservationIgnored private let pointerLocation: () -> CGPoint

    init(pointerLocation: @escaping () -> CGPoint = { NSEvent.mouseLocation }) {
        self.pointerLocation = pointerLocation
        super.init()
    }

    func show(room: RoomSession, openRoom: @escaping () -> Void) {
        openRoomAction = openRoom
        playbackRoom = room
        if let panel { updateScreen(); panel.orderFrontRegardless(); return }
        updateScreen()
        let panel = IslandPanel(contentRect: windowFrame,
                                styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        panel.capFrame = CGRect(x: (windowFrame.width - presentationFrame.width) / 2,
                                y: windowFrame.height - geometry.closedHeight,
                                width: presentationFrame.width, height: geometry.closedHeight)
        panel.onCapClick = { [weak self] in self?.toggleFromClick() }
        panel.onPlaybackClick = { [weak self] in self?.togglePlayback() }
        updateCapFrames(panel, viewport: windowFrame)
        panel.title = "SyncBeats notch"
        panel.identifier = NSUserInterfaceItemIdentifier("syncbeats.notch")
        panel.isReleasedWhenClosed = false
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = false
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]
        panel.hidesOnDeactivate = false
        panel.isMovable = false
        panel.isFloatingPanel = true
        // isFloatingPanel resets the level to .floating (3). Assign the overlay
        // level afterward, or the system menu bar intercepts cap clicks.
        panel.level = NSWindow.Level(rawValue: NSWindow.Level.statusBar.rawValue + 1)
        panel.ignoresMouseEvents = false
        panel.becomesKeyOnlyIfNeeded = true
        panel.acceptsMouseMovedEvents = true
        let host = IslandHostingView(rootView: NotchIslandView(room: room, controller: self))
        // Use one pointer source for tracking areas, event monitors, and animation
        // frames so delayed AppKit events cannot disagree with current hit testing.
        host.onPointerMove = { [weak self] _ in self?.updatePointer() }
        host.sizingOptions = []
        // Reserve the camera gap ourselves; don't apply the system inset a second time.
        host.safeAreaRegions = []
        panel.contentView = host
        self.panel = panel
        panel.delegate = self
        panel.orderFrontRegardless()
        panelVisible = panel.occlusionState.contains(.visible)
        installPointerMonitors()
        panelFocusObserver = NotificationCenter.default.addObserver(forName: NSWindow.didResignKeyNotification,
                                                                    object: panel, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.focusLost() }
        }
        appFocusObserver = NotificationCenter.default.addObserver(forName: NSApplication.didResignActiveNotification,
                                                                  object: NSApplication.shared, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.focusLost() }
        }
        // A nonactivating panel can have keyboard focus while another app is active.
        // Watch foreground-app changes as well as our own key/active notifications.
        workspaceFocusObserver = NSWorkspace.shared.notificationCenter.addObserver(forName: NSWorkspace.didActivateApplicationNotification,
                                                                                   object: nil, queue: .main) { [weak self] notification in
            MainActor.assumeIsolated {
                guard let application = notification.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication,
                      application.processIdentifier != ProcessInfo.processInfo.processIdentifier else { return }
                self?.focusLost()
            }
        }
        #if DEBUG
        NSLog("SyncBeats notch window %ld visible=%d frame=%@ cameraWidth=%.0f", panel.windowNumber, panel.isVisible,
              NSStringFromRect(panel.frame), geometry.cameraWidth)
        #endif
        screenObserver = NotificationCenter.default.addObserver(forName: NSApplication.didChangeScreenParametersNotification,
                                                                 object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor [weak self] in self?.updateScreen() }
        }
    }

    func windowDidChangeOcclusionState(_ notification: Notification) {
        panelVisible = panel?.occlusionState.contains(.visible) == true
    }

    func hide() {
        removePointerMonitors()
        if let panelFocusObserver { NotificationCenter.default.removeObserver(panelFocusObserver) }
        if let appFocusObserver { NotificationCenter.default.removeObserver(appFocusObserver) }
        panelFocusObserver = nil
        appFocusObserver = nil
        if let workspaceFocusObserver { NSWorkspace.shared.notificationCenter.removeObserver(workspaceFocusObserver) }
        workspaceFocusObserver = nil
        pointerInside = false
        stopAnimation()
        hoverTask?.cancel()
        hoverTask = nil
        if let screenObserver { NotificationCenter.default.removeObserver(screenObserver) }
        screenObserver = nil
        panel?.onCapClick = nil
        panel?.onPlaybackClick = nil
        panel?.delegate = nil
        panel?.close()
        panel = nil
        panelVisible = false
        openRoomAction = nil
        playbackRoom = nil
        expanded = false
        motion.move(to: 0, immediately: true)
        expansion = 0
        hoverMotion.move(to: 0, immediately: true)
        hoverExpansion = 0
    }

    func updateContentHeight(_ height: CGFloat) {
        guard height.isFinite, height > 0 else { return }
        let height = ceil(height)
        guard height != expandedContentHeight else { return }
        expandedContentHeight = height
        applyPresentation()
    }

    func hover(_ inside: Bool) {
        // Tracking rectangles include transparent corners. Resolve the physical
        // pointer against the visible outline, including the hardware camera gap.
        updatePointer()
    }

    private func updatePointer() { pointerMoved(to: pointerLocation()) }

    func containsPointer(_ location: CGPoint) -> Bool {
        let frame = presentationFrame
        guard geometry.containsPointer(location, in: frame) else { return false }
        let point = CGPoint(x: location.x - frame.minX, y: frame.maxY - location.y)
        // The attached shape spans the entire screen edge. Path containment alone
        // can exclude that boundary, where the pointer crosses the camera gap.
        if geometry.hasCameraCutout && point.y == 0 { return true }
        // Resolve against the same scaled path that SwiftUI draws, so enlarged
        // bottom corners and controls share one hover boundary.
        let unscaled = CGPoint(x: point.x / presentationScale, y: point.y / presentationScale)
        let bounds = CGRect(x: 0, y: 0, width: restingFrame.width, height: frame.height / presentationScale)
        return IslandShape(attached: geometry.hasCameraCutout, expansion: expansion)
            .path(in: bounds).contains(unscaled)
    }

    func pointerMoved(to location: CGPoint) {
        guard let panel, panel.isVisible else { return }
        let inside = containsPointer(location)
        let wasInside = pointerInside
        if inside != pointerInside {
            pointerInside = inside
            hoverMotion.move(to: inside ? 1 : 0, immediately: NSWorkspace.shared.accessibilityDisplayShouldReduceMotion)
            if NSWorkspace.shared.accessibilityDisplayShouldReduceMotion { applyPresentation() }
            else { startAnimation() }
        }
        guard wasInside != inside else { return }
        scheduleHover(inside)
    }

    private func scheduleHover(_ inside: Bool) {
        hoverTask?.cancel()
        // A short exit delay lets the pointer cross into the expanding player.
        // Re-entering cancels the pending close; hover alone never opens it.
        guard !inside, expanded, !equalizerPresented else { return }
        hoverTask = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(240))
            guard !Task.isCancelled else { return }
            self?.collapse()
        }
    }

    private func installPointerMonitors() {
        guard globalPointerMonitor == nil, localPointerMonitor == nil else { return }
        let events: NSEvent.EventTypeMask = [.mouseMoved, .leftMouseDragged, .rightMouseDragged,
                                            .leftMouseDown, .rightMouseDown, .otherMouseDown]
        globalPointerMonitor = NSEvent.addGlobalMonitorForEvents(matching: events) { [weak self] event in
            MainActor.assumeIsolated { self?.pointerEvent(event) }
        }
        localPointerMonitor = NSEvent.addLocalMonitorForEvents(matching: events) { [weak self] event in
            MainActor.assumeIsolated { self?.pointerEvent(event) }
            return event
        }
        updatePointer()
    }

    private func removePointerMonitors() {
        if let globalPointerMonitor { NSEvent.removeMonitor(globalPointerMonitor) }
        if let localPointerMonitor { NSEvent.removeMonitor(localPointerMonitor) }
        globalPointerMonitor = nil
        localPointerMonitor = nil
    }

    func togglePlayback() {
        guard let room = playbackRoom, room.currentTrack != nil else { return }
        room.togglePlayback()
    }

    func toggleFromClick() {
        if expanded { collapse(); return }
        hoverTask?.cancel()
        setExpanded(true)
        panel?.makeKey()
    }

    private func pointerEvent(_ event: NSEvent) {
        let location = pointerLocation()
        pointerMoved(to: location)
        if [.leftMouseDown, .rightMouseDown, .otherMouseDown].contains(event.type),
           expanded, !equalizerPresented, !containsPointer(location) {
            collapse()
        }
    }

    private func focusLost() {
        guard expanded, !equalizerPresented else { return }
        collapse()
    }

    func collapse() {
        hoverTask?.cancel()
        setExpanded(false)
        panel?.resignKey()
    }
    func equalizerDismissed() {
        equalizerPresented = false
        scheduleHover(panel != nil && containsPointer(pointerLocation()))
    }

    func openRoom() { openRoomAction?(); collapse() }

    private func setExpanded(_ value: Bool) {
        guard expanded != value else { return }
        expanded = value
        let reduceMotion = NSWorkspace.shared.accessibilityDisplayShouldReduceMotion
        motion.move(to: value ? 1 : 0, immediately: reduceMotion || panel == nil)
        if motion.isSettled && hoverMotion.isSettled {
            stopAnimation()
            applyPresentation()
            return
        }
        startAnimation()
    }

    private func startAnimation() {
        guard displayLink == nil, let screen else { return }
        lastFrameTime = CACurrentMediaTime()
        lastDisplayFrameTime = lastFrameTime
        let link = screen.displayLink(target: self, selector: #selector(advanceAnimation(_:)))
        link.add(to: .main, forMode: .common)
        displayLink = link
        // Display links can suspend while the app is inactive or its surface is
        // occluded. Keep this background-accessible panel responsive in that case.
        // The watchdog advances only when display frames have stopped arriving.
        let watchdog = Timer(timeInterval: 1.0 / 60, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self, CACurrentMediaTime() - self.lastDisplayFrameTime > 0.1 else { return }
                self.advanceAnimationFrame()
            }
        }
        RunLoop.main.add(watchdog, forMode: .common)
        animationWatchdog = watchdog
    }

    @objc private func advanceAnimation(_ link: CADisplayLink) {
        lastDisplayFrameTime = CACurrentMediaTime()
        advanceAnimationFrame()
    }

    private func advanceAnimationFrame() {
        let now = CACurrentMediaTime()
        if NSWorkspace.shared.accessibilityDisplayShouldReduceMotion {
            motion.move(to: expanded ? 1 : 0, immediately: true)
            hoverMotion.move(to: pointerInside ? 1 : 0, immediately: true)
        } else {
            motion.advance(by: now - lastFrameTime)
            hoverMotion.advance(by: now - lastFrameTime)
        }
        lastFrameTime = now
        applyPresentation()
        updatePointer()
        if motion.isSettled && hoverMotion.isSettled { stopAnimation() }
    }

    private func applyPresentation() {
        // No second implicit SwiftUI or NSWindow animation: both use this frame's value.
        var transaction = Transaction()
        transaction.disablesAnimations = true
        withTransaction(transaction) {
            expansion = motion.value
            hoverExpansion = min(1, hoverMotion.value)
            let viewport = windowFrame
            if let panel { updateCapFrames(panel, viewport: viewport) }
            if panel?.frame != viewport { panel?.setFrame(viewport, display: true) }
        }
    }

    private func updateCapFrames(_ panel: IslandPanel, viewport: CGRect) {
        let capHeight = geometry.closedHeight * presentationScale
            + NotchGeometry.hoverLip * CGFloat(hoverExpansion) * CGFloat(1 - min(1, expansion))
        panel.capFrame = CGRect(x: (viewport.width - presentationFrame.width) / 2,
                               y: viewport.height - capHeight, width: presentationFrame.width, height: capHeight)
        // Compact content disappears before the body appears; the expanded cap
        // continues to close the island and never retains an invisible transport.
        if expansion < 0.22 {
            let wing = NotchGeometry.sideWingWidth * presentationScale
            let right = viewport.width / 2 + geometry.closedWidth * presentationScale / 2
            panel.playbackFrame = CGRect(x: right - wing, y: viewport.height - capHeight,
                                         width: wing, height: capHeight)
        } else {
            panel.playbackFrame = .zero
        }
    }

    private func stopAnimation() {
        displayLink?.invalidate()
        displayLink = nil
        animationWatchdog?.invalidate()
        animationWatchdog = nil
    }

    private func updateScreen() {
        guard let screen = NSScreen.screens.first(where: { $0.safeAreaInsets.top > 0 }) ?? NSScreen.main ?? NSScreen.screens.first else { return }
        let wasAnimating = displayLink != nil
        stopAnimation()
        self.screen = screen
        geometry = NotchGeometry(frame: screen.frame, visibleFrame: screen.visibleFrame, safeTop: screen.safeAreaInsets.top,
                                 leftArea: screen.auxiliaryTopLeftArea ?? .zero, rightArea: screen.auxiliaryTopRightArea ?? .zero)
        applyPresentation()
        if wasAnimating { startAnimation() }
    }
}

/// Attached only to the production scene. Offscreen layout rendering never opens an island.
struct NotchLifecycle: View {
    let model: AppModel
    let room: RoomSession
    @State private var controller = NotchWindowController()
    @Environment(\.openWindow) private var openWindow
    var body: some View {
        Color.clear.frame(width: 0, height: 0)
            .onChange(of: model.phase == .signedIn && model.notchEnabled, initial: true) { _, visible in
                if visible {
                    controller.show(room: room) {
                        openWindow(id: "main")
                        NSApplication.shared.activate(ignoringOtherApps: true)
                    }
                } else { controller.hide() }
            }
            .onChange(of: model.phase) { _, phase in if phase != .signedIn { room.disconnect() } }
            .onReceive(NotificationCenter.default.publisher(for: NSApplication.willTerminateNotification)) { _ in
                controller.hide()
                room.disconnect()
            }
    }
}
#endif
