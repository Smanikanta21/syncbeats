#if os(macOS)
import AppKit
import SwiftUI

@MainActor
final class FloatingPlayerController: NSObject, NSWindowDelegate {
    private var panel: NSPanel?
    private weak var owner: NSWindow?
    private var onClose: (() -> Void)?

    func show(room: RoomSession, palette: NativePalette, onExpand: @escaping (Bool) -> Void, onClose: @escaping () -> Void) {
        self.onClose = onClose
        let window: NSPanel
        if let panel { window = panel }
        else {
            owner = NSApp.mainWindow ?? NSApp.keyWindow
            window = NSPanel(contentRect: NSRect(x: 0, y: 0, width: 420, height: 118), styleMask: [.titled, .closable, .utilityWindow, .nonactivatingPanel], backing: .buffered, defer: false)
            window.title = "SyncBeats player"
            window.isReleasedWhenClosed = false
            window.isFloatingPanel = true
            window.level = .floating
            window.hidesOnDeactivate = false
            window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
            window.isMovableByWindowBackground = true
            window.delegate = self
            window.center()
            self.panel = window
        }
        let expand: (Bool) -> Void = { [weak self] queue in
            self?.owner?.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
            onExpand(queue)
        }
        window.contentView = NSHostingView(rootView: RoomMiniPlayer(room: room, palette: palette, onExpand: { expand(false) }, onQueue: { expand(true) }, onFloat: {}, floating: true))
        window.appearance = NSAppearance(named: palette.light ? .aqua : .darkAqua)
        window.orderFrontRegardless()
    }
    func close() {
        panel?.close()
        panel = nil
        onClose = nil
    }
    func windowWillClose(_ notification: Notification) {
        panel = nil
        let callback = onClose
        onClose = nil
        callback?()
    }
}
#endif
