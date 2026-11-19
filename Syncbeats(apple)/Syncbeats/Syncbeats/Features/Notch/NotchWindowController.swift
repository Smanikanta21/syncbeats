#if os(macOS)
import AppKit
import SwiftUI
import Observation
import QuartzCore

private final class IslandPanel: NSPanel {
    var capHeight: CGFloat = 0
    var onCapClick: (() -> Void)?
    private var pressedCap = false

    override func sendEvent(_ event: NSEvent) {
        let point = event.locationInWindow
        let cap = CGRect(x: 0, y: frame.height - capHeight, width: frame.width, height: capHeight)
        if event.type == .leftMouseDown, cap.contains(point) {
            // Handle the whole cap in AppKit, including its transparent camera gap.
            // This also makes the first click work while the app is inactive.
            pressedCap = true
            return
        }
        if event.type == .leftMouseUp, pressedCap {
            pressedCap = false
            if cap.contains(point) { onCapClick?() }
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
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
}

@MainActor @Observable
final class NotchWindowController: NSObject {
    private(set) var expanded = false
    private(set) var expansion: Double = 0
    private(set) var hoverExpansion: Double = 0
    private(set) var pointerInside = false
    var equalizerPresented = false
    private(set) var geometry = NotchGeometry.preview
    @ObservationIgnored private var panel: IslandPanel?
    @ObservationIgnored private var screenObserver: NSObjectProtocol?
    @ObservationIgnored private var panelFocusObserver: NSObjectProtocol?
    @ObservationIgnored private var appFocusObserver: NSObjectProtocol?
    @ObservationIgnored private var workspaceFocusObserver: NSObjectProtocol?
    @ObservationIgnored private var hoverTask: Task<Void, Never>?
    @ObservationIgnored private var openRoomAction: (() -> Void)?
    @ObservationIgnored private var motion = NotchMotion()
    @ObservationIgnored private var hoverMotion = NotchMotion()
    @ObservationIgnored private var displayLink: CADisplayLink?
    @ObservationIgnored private var lastFrameTime: CFTimeInterval = 0
    @ObservationIgnored private var screen: NSScreen?
    @ObservationIgnored private var globalPointerMonitor: Any?
    @ObservationIgnored private var localPointerMonitor: Any?

    func show(room: RoomSession, openRoom: @escaping () -> Void) {
        openRoomAction = openRoom
        if let panel { updateScreen(); panel.orderFrontRegardless(); return }
        updateScreen()
        let panel = IslandPanel(contentRect: geometry.panelFrame(expanded: expanded),
                                styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        panel.capHeight = geometry.closedHeight
        panel.onCapClick = { [weak self] in self?.toggleFromClick() }
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
        host.sizingOptions = []
        // Reserve the camera gap ourselves; don't apply the system inset a second time.
        host.safeAreaRegions = []
        panel.contentView = host
        self.panel = panel
        panel.orderFrontRegardless()
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
        panel?.close()
        panel = nil
        openRoomAction = nil
        expanded = false
        motion.move(to: 0, immediately: true)
        expansion = 0
    }

    func hover(_ inside: Bool) {
        // SwiftUI tracking rectangles can change while the panel grows. Use the
        // physical panel bounds, including the otherwise untrackable camera gap.
        updatePointer()
    }

    private func updatePointer() { pointerMoved(to: NSEvent.mouseLocation) }

    func pointerMoved(to location: CGPoint) {
        guard let panel, panel.isVisible else { return }
        let inside = panel.frame.contains(location)
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

    func toggleFromClick() {
        if expanded { collapse(); return }
        hoverTask?.cancel()
        setExpanded(true)
        panel?.makeKey()
    }

    private func pointerEvent(_ event: NSEvent) {
        let location = NSEvent.mouseLocation
        pointerMoved(to: location)
        if [.leftMouseDown, .rightMouseDown, .otherMouseDown].contains(event.type),
           expanded, !equalizerPresented, let panel, !panel.frame.contains(location) {
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
        scheduleHover(panel?.frame.contains(NSEvent.mouseLocation) ?? false)
    }

    func openRoom() { openRoomAction?(); collapse() }

    private func setExpanded(_ value: Bool) {
        guard expanded != value else { return }
        expanded = value
        let reduceMotion = NSWorkspace.shared.accessibilityDisplayShouldReduceMotion
        motion.move(to: value ? 1 : 0, immediately: reduceMotion || panel == nil)
        if motion.isSettled {
            stopAnimation()
            applyPresentation()
            return
        }
        startAnimation()
    }

    private func startAnimation() {
        guard displayLink == nil, let screen else { return }
        lastFrameTime = CACurrentMediaTime()
        let link = screen.displayLink(target: self, selector: #selector(advanceAnimation(_:)))
        link.add(to: .main, forMode: .common)
        displayLink = link
    }

    @objc private func advanceAnimation(_ link: CADisplayLink) {
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
            panel?.capHeight = geometry.closedHeight + (geometry.hoveredHeight - geometry.closedHeight) * CGFloat(hoverExpansion) * CGFloat(1 - min(1, expansion))
            panel?.setFrame(geometry.panelFrame(expansion: expansion, hover: hoverExpansion), display: true)
        }
    }

    private func stopAnimation() {
        displayLink?.invalidate()
        displayLink = nil
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
