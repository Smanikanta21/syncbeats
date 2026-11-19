import AppKit
import SwiftUI

/// Exercises the real panel and display-link animation without a session or playback commands.
@main
struct NotchWindowVerification {
    @MainActor static func main() throws {
        NSApplication.shared.setActivationPolicy(.prohibited)
        let room = RoomSession()
        room.apply(try RoomFixtures.snapshot())
        let controller = NotchWindowController()
        var checks = 0
        func check(_ condition: @autoclosure () -> Bool, _ message: String) {
            precondition(condition(), message)
            checks += 1
            print("PASS: \(message)")
        }
        func tick(_ seconds: Double) { RunLoop.main.run(until: Date().addingTimeInterval(seconds)) }
        func panel() -> NSWindow? {
            NSApplication.shared.windows.first {
                $0.identifier?.rawValue == "syncbeats.notch" && $0.isVisible
            }
        }
        func panelFrame() -> CGRect? { panel()?.frame }
        func clickCap() {
            guard let window = panel() else { preconditionFailure("Missing notch window") }
            let point = CGPoint(x: window.frame.width / 2,
                                y: window.frame.height - controller.geometry.cameraHeight - 5)
            for type in [NSEvent.EventType.leftMouseDown, .leftMouseUp] {
                let event = NSEvent.mouseEvent(with: type, location: point, modifierFlags: [],
                                              timestamp: ProcessInfo.processInfo.systemUptime,
                                              windowNumber: window.windowNumber, context: nil,
                                              eventNumber: 1, clickCount: 1, pressure: 1)!
                window.sendEvent(event)
            }
        }
        var openedRoom = false
        controller.show(room: room) { openedRoom = true }
        check(panel()?.level.rawValue == NSWindow.Level.statusBar.rawValue + 1,
              "Notch stays above the menu bar after floating-panel setup")
        check(!controller.geometry.hasCameraCutout || controller.geometry.closedHeight > controller.geometry.cameraHeight,
              "Resting island exposes a visible click area beneath the camera")
        check(panelFrame()?.width == controller.geometry.closedWidth, "Real panel starts at compact width")
        clickCap()
        tick(0.9)
        check(controller.expanded && controller.expansion == 1, "Mouse click in the center lip opens the island through its display link")
        check(panelFrame()?.width == controller.geometry.expandedWidth, "AppKit frame reaches the expanded SwiftUI width")
        clickCap()
        tick(0.9)
        check(!controller.expanded && controller.expansion == 0, "Second cap click closes the island instead of merely changing its pin")
        check(panelFrame()?.height == controller.geometry.closedHeight, "Closing restores the hardware-safe panel height")
        clickCap()
        tick(0.05)
        controller.collapse()
        tick(0.9)
        check(controller.expansion == 0, "Quick reversal cancels opening without leaving a stuck panel")
        clickCap()
        controller.openRoom()
        tick(0.9)
        check(openedRoom && controller.expansion == 0, "Open room invokes its action and closes the overlay")
        controller.hide()
        check(panelFrame() == nil && controller.expansion == 0, "Hide removes the panel and resets presentation")
        controller.show(room: room) { }
        clickCap()
        tick(0.9)
        check(controller.expansion == 1, "Island can reopen after being hidden")
        let inside = CGPoint(x: panel()!.frame.midX, y: panel()!.frame.midY)
        let outside = CGPoint(x: panel()!.frame.minX - 30, y: panel()!.frame.midY)
        controller.pointerMoved(to: inside)
        controller.pointerMoved(to: outside)
        tick(0.1)
        controller.pointerMoved(to: inside)
        tick(0.5)
        check(controller.expanded && controller.expansion == 1, "Re-entering cancels the pending hover-exit close")
        controller.pointerMoved(to: outside)
        tick(0.9)
        check(!controller.expanded && controller.expansion == 0, "Leaving the expanded island closes it automatically")
        clickCap()
        tick(0.9)
        NotificationCenter.default.post(name: NSWindow.didResignKeyNotification, object: panel()!)
        tick(0.9)
        check(!controller.expanded && controller.expansion == 0, "Losing panel keyboard focus closes the island")
        clickCap()
        tick(0.9)
        NotificationCenter.default.post(name: NSApplication.didResignActiveNotification, object: NSApplication.shared)
        tick(0.9)
        check(!controller.expanded && controller.expansion == 0, "Switching away from the app closes the island")
        if let otherApp = NSWorkspace.shared.runningApplications.first(where: {
            $0.processIdentifier != ProcessInfo.processInfo.processIdentifier && $0.activationPolicy == .regular
        }) {
            clickCap()
            tick(0.9)
            NSWorkspace.shared.notificationCenter.post(name: NSWorkspace.didActivateApplicationNotification,
                                                       object: NSWorkspace.shared,
                                                       userInfo: [NSWorkspace.applicationUserInfoKey: otherApp])
            tick(0.9)
            check(!controller.expanded && controller.expansion == 0, "Foreground app changes dismiss a nonactivating island")
        }
        controller.hide()
        print("\(checks) native notch window checks passed")
    }
}
