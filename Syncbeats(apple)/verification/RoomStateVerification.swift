import AppKit
import Foundation
import SwiftUI

@main
struct RoomStateVerification {
    @MainActor static func main() throws {
        var checks = 0
        func check(_ value: @autoclosure () -> Bool, _ message: String) {
            precondition(value(), message)
            checks += 1
            print("PASS: \(message)")
        }
        let room = RoomSession()
        room.apply(try RoomFixtures.snapshot())
        check(room.currentTrack?.id == "one", "Server current-track selection")
        check(room.upcoming.map(\.id) == ["two", "three"], "Upcoming excludes current and previous tracks")
        check(room.position() == 42, "Snapshot milliseconds become display seconds")
        check(room.position(at: Date().addingTimeInterval(30)) == 42, "Paused timeline remains still")
        room.togglePlayback()
        check(!room.isPlaying, "Playback command never changes server state optimistically")
        room.apply(try RoomFixtures.snapshot(playing: true))
        check(room.position(at: Date().addingTimeInterval(5)) >= 47, "Playing display timeline advances")
        check(room.position(at: Date().addingTimeInterval(1000)) == 218, "Timeline clamps to known duration")
        let epoch = Date().timeIntervalSince1970 * 1000 + 1500
        let scheduled = RoomSnapshot(roomId: "123456", roomInstanceId: "fixture", trackUrl: room.currentTrackURL,
            position: 0, state: "playing", timestamp: Date().timeIntervalSince1970 * 1000,
            participants: [], queue: room.queue, isPlaying: true, pendingPlay: false,
            timeline: RoomTimeline(startEpoch: epoch, pauseOffset: 0, isPlaying: true), scheduledStartEpoch: epoch,
            shuffle: false, repeatMode: "off")
        room.apply(scheduled)
        check(room.position() == 0 && room.secondsUntilStart > 1, "Scheduled start keeps UI position at zero before server epoch")
        check(room.position(at: Date().addingTimeInterval(2)) > 0.4, "UI advances from the authoritative start epoch")
        let resumed = RoomSnapshot(roomId: "123456", roomInstanceId: "fixture", trackUrl: room.currentTrackURL,
            position: 42_000, state: "playing", timestamp: Date().timeIntervalSince1970 * 1000,
            participants: [], queue: room.queue, isPlaying: true, pendingPlay: false,
            timeline: RoomTimeline(startEpoch: epoch - 42_000, pauseOffset: 42, isPlaying: true), scheduledStartEpoch: epoch - 42_000,
            shuffle: false, repeatMode: "off")
        room.apply(resumed)
        check(room.position() == 42 && room.secondsUntilStart > 1, "Pause offset preserves the future scheduled resume")

        room.disconnect()
        check(room.queue.isEmpty && room.participants.isEmpty && room.roomID == nil && !room.isPlaying, "Sign-out cleanup clears room data")
        room.apply(try RoomFixtures.snapshot(empty: true))
        check(room.currentTrack == nil && room.upcoming.isEmpty, "Empty room has no fabricated track")

        check(RoomLayout.devices(width: 879) == .summary, "Narrow windows show a device summary")
        check(RoomLayout.devices(width: 880) == .drawer, "Device drawer starts at 880 points")
        check(RoomLayout.devices(width: 1099) == .drawer, "Device drawer overlays the feed below 1100 points")
        check(RoomLayout.devices(width: 1100) == .docked, "Wide windows dock the device rail")
        check(!RoomLayout.showsQueueAlongside(width: 879) && RoomLayout.showsQueueAlongside(width: 880), "Player queue switches at the content boundary")
        check(YouTubeIdentity.id(in: "youtube:A1b2C3d4E5f?thumb=test") == "A1b2C3d4E5f", "Lazy YouTube queue identities match discovery results")
        check(YouTubeIdentity.id(in: "ws-p2p:yt:A1b2C3d4E5f_1700000000000") == "A1b2C3d4E5f", "Resolved YouTube queue identities remain stable")
        check(YouTubeIdentity.id(in: "https://example.test/files/upload.m4a") == nil, "Uploaded files are not mistaken for YouTube tracks")
        let named = RoomParticipant(socketId: "long-name", displayName: "Abhinay’s MacBook Pro", isReady: true, isBlocked: false, userId: nil, outputDeviceName: nil)
        check(named.shortDeviceName == "MacBook Pro", "Device names omit the owner in compact chips")
        let longNamed = RoomParticipant(socketId: "long-output", displayName: "Speaker", isReady: true, isBlocked: false, userId: nil, outputDeviceName: "Living room stereo speakers")
        check(longNamed.shortDeviceName.count == 14 && longNamed.shortDeviceName.hasSuffix("…"), "Long output names have a bounded compact label")

        let notch = NotchGeometry.preview
        check(notch.cameraWidth == 192, "Camera gap derived from unobscured screen areas")
        check(notch.closedWidth == 304 && notch.closedHeight == 42, "Compact island extends past the camera with a clickable bottom lip")
        check(notch.panelFrame(expanded: false).maxY == notch.panelFrame(expanded: true).maxY, "Expansion stays anchored to screen top")
        let external = NotchGeometry(frame: CGRect(x: -1920, y: 0, width: 1920, height: 1080),
                                     visibleFrame: CGRect(x: -1920, y: 24, width: 1920, height: 1032),
                                     safeTop: 0, leftArea: .zero, rightArea: .zero)
        check(!external.hasCameraCutout && external.centerX == -960, "Non-notched secondary screen uses its own coordinates")
        check(external.panelFrame(expanded: true).maxY == 1048, "Fallback island stays below menu bar")
        check(playbackTime(.nan) == "0:00" && playbackTime(-2) == "0:00" && playbackTime(218) == "3:38", "Invalid and normal duration formatting")

        var opening = NotchMotion()
        opening.move(to: 1)
        opening.advance(by: 1.0 / 60)
        check(opening.value > 0 && opening.value < 0.2, "Opening starts progressively rather than jumping")
        let startingValue = opening.value
        let startingVelocity = opening.velocity
        opening.move(to: 0)
        check(opening.value == startingValue && opening.velocity == startingVelocity, "Mid-animation reversal preserves position and velocity")
        for _ in 0..<240 { opening.advance(by: 1.0 / 120) }
        check(opening.isSettled && opening.value == 0, "Interrupted opening settles fully closed")
        opening.move(to: 1)
        var peak: Double = 0
        for _ in 0..<240 { opening.advance(by: 1.0 / 120); peak = max(peak, opening.value) }
        check(opening.isSettled && opening.value == 1 && peak <= 1.025, "Opening spring settles with bounded overshoot")
        opening.move(to: 0)
        var previous = opening.value
        var closesMonotonically = true
        for _ in 0..<120 {
            opening.advance(by: 1.0 / 60)
            closesMonotonically = closesMonotonically && opening.value <= previous && opening.value >= 0
            previous = opening.value
        }
        check(closesMonotonically && opening.isSettled, "Closing eases into the hardware notch without undershoot")
        opening.move(to: 1, immediately: true)
        check(opening.isSettled && opening.value == 1, "Reduced-motion mode immediately reaches the target")
        for progress in [0.0, 0.25, 0.5, 0.75, 1.0, 1.01] {
            let frame = notch.panelFrame(expansion: progress)
            check(abs(frame.midX - notch.centerX) < 0.001 && abs(frame.maxY - notch.topY) < 0.001,
                  "Animation keeps the notch anchored at progress \(progress)")
        }
        let rect = CGRect(x: 0, y: 0, width: 304, height: 32)
        let shape = IslandShape(attached: true, expansion: 0).path(in: rect)
        check(shape.contains(CGPoint(x: 8, y: 1)) && !shape.contains(CGPoint(x: 8, y: 12)), "Top-left shoulder flares outward into the screen edge")
        check(shape.contains(CGPoint(x: 296, y: 1)) && !shape.contains(CGPoint(x: 296, y: 12)), "Top-right shoulder mirrors the outward curve")
        check(shape.contains(CGPoint(x: 152, y: 1)) && shape.contains(CGPoint(x: 152, y: 31)), "Black surface continuously covers the camera center")
        NSApplication.shared.setActivationPolicy(.prohibited)
        let floating = FloatingPlayerController()
        var closeCount = 0
        floating.show(room: room, palette: NativePalette(light: false), onExpand: { _ in }, onClose: { closeCount += 1 })
        let firstPanel = NSApp.windows.first { $0.title == "SyncBeats player" && $0.isVisible }
        check(firstPanel != nil && firstPanel!.level == .floating, "Floating player stays above ordinary windows")
        check(!(firstPanel as? NSPanel)!.hidesOnDeactivate, "Floating player remains visible outside the app")
        floating.show(room: room, palette: NativePalette(light: true), onExpand: { _ in }, onClose: { closeCount += 1 })
        let panels = NSApp.windows.filter { $0.title == "SyncBeats player" && $0.isVisible }
        check(panels.count == 1 && panels.first === firstPanel, "Theme updates reuse the same floating panel")
        floating.close()
        check(closeCount == 1 && !firstPanel!.isVisible, "Closing the floating player restores its owning view once")
        print("\(checks) room and notch checks passed")
    }
}
