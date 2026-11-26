import AppKit
import SwiftUI

/// Exercises the real panel and display-link animation without a session or playback commands.
@main
struct NotchWindowVerification {
    @MainActor static func main() throws {
        NSApplication.shared.setActivationPolicy(.prohibited)
        NSApplication.shared.finishLaunching()
        setbuf(stdout, nil)
        let room = RoomSession()
        room.apply(try RoomFixtures.snapshot())
        var pointer = CGPoint(x: -10000, y: -10000)
        let controller = NotchWindowController(pointerLocation: { pointer })
        var checks = 0
        func check(_ condition: @autoclosure () -> Bool, _ message: String) {
            let passed = condition()
            if !passed {
                print("Notch state: pointer=\(pointer), inside=\(controller.pointerInside), hover=\(controller.hoverExpansion), expansion=\(controller.expansion), frame=\(controller.presentationFrame)")
            }
            precondition(passed, message)
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
        func capColoredPixels() -> Int {
            guard let host = panel()?.contentView,
                  let bitmap = host.bitmapImageRepForCachingDisplay(in: host.bounds) else {
                preconditionFailure("Missing native notch rendering")
            }
            host.layoutSubtreeIfNeeded()
            host.cacheDisplay(in: host.bounds, to: bitmap)
            let scaleY = CGFloat(bitmap.pixelsHigh) / host.bounds.height
            var count = 0
            for y in 0..<min(bitmap.pixelsHigh, Int(controller.geometry.closedHeight * scaleY)) {
                for x in 0..<bitmap.pixelsWide {
                    if let color = bitmap.colorAt(x: x, y: y)?.usingColorSpace(.deviceRGB),
                       color.alphaComponent > 0.1,
                       max(color.redComponent, color.greenComponent, color.blueComponent) > 0.08 { count += 1 }
                }
            }
            return count
        }
        func transportPixels() -> Int {
            guard let host = panel()?.contentView,
                  let bitmap = host.bitmapImageRepForCachingDisplay(in: host.bounds) else { return 0 }
            host.layoutSubtreeIfNeeded()
            host.cacheDisplay(in: host.bounds, to: bitmap)
            let sx = CGFloat(bitmap.pixelsWide) / host.bounds.width
            let sy = CGFloat(bitmap.pixelsHigh) / host.bounds.height
            let right = host.bounds.width / 2 + controller.geometry.closedWidth * controller.presentationScale / 2
            let left = right - NotchGeometry.sideWingWidth * controller.presentationScale
            var count = 0
            for y in 0..<Int(controller.geometry.closedHeight * controller.presentationScale * sy) {
                for x in Int(left * sx)..<Int(right * sx) {
                    if let color = bitmap.colorAt(x: x, y: y)?.usingColorSpace(.deviceRGB),
                       color.alphaComponent > 0.3, color.redComponent > 0.2 { count += 1 }
                }
            }
            return count
        }
        func clickCap(playback: Bool = false) {
            guard let window = panel() else { preconditionFailure("Missing notch window") }
            let point = CGPoint(x: playback ? window.frame.width / 2 + controller.geometry.closedWidth * controller.presentationScale / 2 - NotchGeometry.sideWingWidth * controller.presentationScale / 2 : window.frame.width / 2,
                                y: window.frame.height - controller.geometry.closedHeight / 2)
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
        let routingPanel = IslandPanel(contentRect: CGRect(x: 0, y: 0, width: 300, height: 40),
                                       styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        routingPanel.capFrame = CGRect(x: 0, y: 0, width: 300, height: 40)
        routingPanel.playbackFrame = CGRect(x: 250, y: 0, width: 50, height: 40)
        var capClicks = 0, transportClicks = 0
        routingPanel.onCapClick = { capClicks += 1 }
        routingPanel.onPlaybackClick = { transportClicks += 1 }
        func routedClick(from start: CGFloat, to end: CGFloat) {
            for (type, x) in [(NSEvent.EventType.leftMouseDown, start), (.leftMouseUp, end)] {
                routingPanel.sendEvent(NSEvent.mouseEvent(with: type, location: CGPoint(x: x, y: 20),
                    modifierFlags: [], timestamp: ProcessInfo.processInfo.systemUptime,
                    windowNumber: routingPanel.windowNumber, context: nil, eventNumber: 1, clickCount: 1, pressure: 1)!)
            }
        }
        routedClick(from: 275, to: 275)
        check(transportClicks == 1 && capClicks == 0, "Right-wing click invokes playback exactly once without opening")
        routedClick(from: 25, to: 25)
        routedClick(from: 150, to: 150)
        check(capClicks == 2 && transportClicks == 1, "Artwork and camera-gap clicks open independently of playback")
        routedClick(from: 275, to: 150)
        routedClick(from: 150, to: 275)
        routedClick(from: 275, to: 350)
        check(capClicks == 2 && transportClicks == 1, "Dragging between controls or outside cancels the click")
        routingPanel.playbackFrame = .zero
        routedClick(from: 275, to: 275)
        check(capClicks == 3 && transportClicks == 1, "Expanded cap contains no invisible compact playback target")
        check(controller.windowFrame.width > controller.presentationFrame.width + 20 && controller.windowFrame.height > controller.presentationFrame.height + 12,
              "Panel provides clear margins for the subtle shadow")
        let priorPlaying = room.isPlaying
        clickCap(playback: true)
        check(!controller.expanded && room.isPlaying == priorPlaying, "Compact transport click preserves collapsed state and authoritative playback state")
        check(panel()?.level.rawValue == NSWindow.Level.statusBar.rawValue + 1,
              "Notch stays above the menu bar after floating-panel setup")
        check(!controller.geometry.hasCameraCutout || controller.geometry.closedHeight == controller.geometry.cameraHeight,
              "Resting island fits the hardware height exactly, with clickable side wings")
        check(controller.presentationFrame.width == controller.geometry.closedWidth, "Visible island starts at the exact compact width")
        let restingFrame = panelFrame()!
        let restingIsland = controller.presentationFrame
        for x in [controller.presentationFrame.minX - 20, controller.presentationFrame.maxX + 20,
                  controller.geometry.centerX - controller.geometry.expandedWidth,
                  controller.geometry.centerX + controller.geometry.expandedWidth] {
            let barPoint = CGPoint(x: x, y: controller.geometry.topY - 1)
            pointer = barPoint; controller.pointerMoved(to: pointer)
            check(!controller.pointerInside && !controller.containsPointer(barPoint),
                  "Menu bar outside the island never activates notch hover at x \(x)")
        }
        check(capColoredPixels() > 0, "Compact island renders its artwork and music indicator")
        pointer = CGPoint(x: restingIsland.minX + 1, y: restingIsland.maxY - controller.geometry.closedHeight / 2)
        controller.pointerMoved(to: pointer)
        tick(0.7)
        check(!controller.pointerInside && controller.hoverExpansion == 0,
              "Transparent shoulder space does not trigger hover")
        for point in [CGPoint(x: restingIsland.minX + NotchGeometry.sideWingWidth / 2, y: restingFrame.maxY - controller.geometry.closedHeight / 2),
                      CGPoint(x: restingFrame.midX, y: restingFrame.maxY),
                      CGPoint(x: restingIsland.maxX - NotchGeometry.sideWingWidth / 2, y: restingFrame.maxY - controller.geometry.closedHeight / 2)] {
            pointer = point
            controller.pointerMoved(to: pointer)
            tick(0.7)
            check(controller.pointerInside && controller.hoverExpansion == 1,
                  "Hover tracks the left wing, camera top edge, and right wing: \(point)")
            check(!controller.expanded && panelFrame()! == restingFrame,
                  "Compact hover never resizes or moves the native window")
            check(controller.presentationFrame.minY < restingIsland.minY - 2,
                  "Compact hover visibly extends below the hardware notch")
        }
        pointer = CGPoint(x: -10000, y: -10000)
        controller.pointerMoved(to: pointer)
        tick(0.7)
        check(controller.hoverExpansion == 0 && panelFrame() == restingFrame, "Leaving restores the exact resting notch")
        pointer = CGPoint(x: -10000, y: -10000); controller.pointerMoved(to: pointer)
        room.apply(try RoomFixtures.snapshot(playing: true))
        tick(0.9)
        let silentBars = transportPixels()
        pointer = CGPoint(x: controller.geometry.centerX, y: controller.geometry.topY)
        controller.pointerMoved(to: pointer); tick(0.9)
        let pauseGlyph = transportPixels()
        check(silentBars > 0 && pauseGlyph > silentBars, "Playing cap renders compact bars and replaces them with pause on whole-notch hover")
        room.apply(try RoomFixtures.snapshot(playing: false)); tick(0.2)
        check(transportPixels() > 0 && !room.isPlaying, "Paused cap renders play while hovered")
        pointer = CGPoint(x: -10000, y: -10000); controller.pointerMoved(to: pointer); tick(0.9)
        check(transportPixels() > silentBars, "Paused cap retains play after the pointer exits")
        clickCap()
        tick(0.9)
        check(controller.expanded && controller.expansion == 1, "Mouse click in a side wing opens the island through its display link")
        check(controller.presentationFrame.width == controller.geometry.expandedWidth, "Visible island reaches the expanded SwiftUI width")
        check(capColoredPixels() == 0, "Expanded header replaces the compact artwork and indicator without a duplicate notch row")
        let openFrame = panelFrame()!
        let openIsland = controller.presentationFrame
        pointer = CGPoint(x: openFrame.midX, y: openFrame.midY)
        controller.pointerMoved(to: pointer)
        tick(0.7)
        check(abs(controller.presentationFrame.width / openIsland.width - 1.025) < 0.0001,
              "Expanded island receives the same gentle hover feedback")
        check(abs(controller.presentationFrame.height / openIsland.height - 1.025) < 0.0001,
              "Expanded island zooms downward as well as sideways")
        check(controller.presentationScale == 1.025,
              "Hover applies the same zoom to artwork, text, and controls")
        check(panelFrame()! == openFrame,
              "Expanded hover never resizes or moves the native window")
        check(capColoredPixels() == 0, "Hovering the expanded island never restores the compact row")
        pointer = CGPoint(x: -10000, y: -10000)
        // Click close before the delayed hover dismissal; this also resets feedback.
        clickCap()
        tick(0.9)
        check(!controller.expanded && controller.expansion == 0, "Second cap click closes the island instead of merely changing its pin")
        check(controller.presentationFrame.height == controller.geometry.closedHeight, "Closing restores the exact visible hardware height")
        check(capColoredPixels() > 0, "Closing restores the compact artwork and indicator")
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
        let corner = CGPoint(x: controller.presentationFrame.minX + 1, y: controller.presentationFrame.minY + 1)
        check(!controller.containsPointer(corner), "Transparent expanded bottom corners are outside the hover area")
        pointer = inside; controller.pointerMoved(to: pointer)
        pointer = outside; controller.pointerMoved(to: pointer)
        tick(0.1)
        pointer = inside; controller.pointerMoved(to: pointer)
        tick(0.9)
        check(controller.expanded && controller.expansion == 1, "Re-entering cancels the pending hover-exit close")
        pointer = outside; controller.pointerMoved(to: pointer)
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
