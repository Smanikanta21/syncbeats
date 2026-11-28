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
        for size in [CGSize(width: 320, height: 320), CGSize(width: 320, height: 480),
                     CGSize(width: 375, height: 568), CGSize(width: 390, height: 780),
                     CGSize(width: 600, height: 600), CGSize(width: 650, height: 320),
                     CGSize(width: 744, height: 1000), CGSize(width: 1024, height: 700),
                     CGSize(width: 1194, height: 320)] {
            let layout = MobilePlayerLayout(size: size)
            check(layout.coverSize + layout.reservedHeight <= size.height,
                  "Mobile artwork and control budget fits \(Int(size.width)) × \(Int(size.height))")
            check(layout.coverSize >= 44 && layout.coverSize <= size.width * 0.72,
                  "Mobile artwork remains visible without overflowing \(Int(size.width))pt window")
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
        let ipad = try JSONDecoder().decode(RoomParticipant.self, from: Data(#"{"socketId":"ipad","displayName":"Abhinay Siraparapu · iPad","isReady":true,"outputDeviceType":"speakers"}"#.utf8))
        check(ipad.deviceSymbol == "ipad", "A generic speaker output does not override the connected iPad identity")
        var renamedTablet = longNamed
        renamedTablet.outputDeviceType = " TABLET "
        check(renamedTablet.deviceSymbol == "ipad", "A renamed tablet keeps its iPad icon from server metadata")
        let legacyIPad = RoomParticipant(socketId: "old-ipad", displayName: "Abhinay · iPad", isReady: true, isBlocked: false, userId: nil, outputDeviceName: nil)
        check(legacyIPad.deviceSymbol == "ipad", "Legacy native iPad clients are recognized without device-type metadata")
        check(longNamed.deviceSymbol == "hifispeaker.fill", "An unidentified speaker keeps its speaker icon")
        for name in ["Android", "Pixel 8", "Samsung Galaxy S24", "SM-S918B", "OnePlus 12", "Redmi Note 13"] {
            let phone = RoomParticipant(socketId: "android", displayName: "Abhinay", isReady: true, isBlocked: false, userId: nil, outputDeviceName: name, outputDeviceType: "speakers")
            check(phone.deviceSymbol == "smartphone", "Android device name \(name) overrides generic speaker metadata")
        }
        let renamedPhone = RoomParticipant(socketId: "renamed", displayName: "Abhinay", isReady: true, isBlocked: false, userId: nil, outputDeviceName: "My phone", outputDeviceType: "mobile")
        check(renamedPhone.deviceSymbol == "smartphone", "Mobile metadata identifies a phone with a custom name")

        let notch = NotchGeometry.preview
        check(notch.cameraWidth == 192, "Camera gap derived from unobscured screen areas")
        check(notch.closedWidth == 332 && notch.closedHeight == 32, "Resting island hugs the hardware height with roomier camera-safe content wings")
        check(notch.closedWidth == notch.cameraWidth + NotchGeometry.cameraClearance * 2 + NotchGeometry.sideWingWidth * 2,
              "Artwork and bars occupy separate wings outside the camera clearance")
        for safeTop in [28.0, 32.0, 38.0] {
            let fitted = NotchGeometry(frame: CGRect(x: 0, y: 0, width: 1512, height: 982),
                                       visibleFrame: CGRect(x: 0, y: 0, width: 1512, height: 982 - safeTop), safeTop: safeTop,
                                       leftArea: CGRect(x: 0, y: 982 - safeTop, width: 660, height: safeTop),
                                       rightArea: CGRect(x: 852, y: 982 - safeTop, width: 660, height: safeTop))
            let size = fitted.compactArtworkSize
            let artwork = CGRect(x: (NotchGeometry.sideWingWidth - size) / 2,
                                 y: (fitted.closedHeight - size) / 2, width: size, height: size)
            let outline = IslandShape(attached: true, expansion: 0).path(in: CGRect(x: 0, y: 0, width: fitted.closedWidth, height: fitted.closedHeight))
            let corners = [CGPoint(x: artwork.minX, y: artwork.minY), CGPoint(x: artwork.maxX, y: artwork.minY),
                           CGPoint(x: artwork.minX, y: artwork.maxY), CGPoint(x: artwork.maxX, y: artwork.maxY)]
            check(corners.allSatisfy { outline.contains($0) } && artwork.minY >= 4,
                  "Album cover clears both island curves with vertical padding at camera height \(safeTop)")
            check(NotchGeometry.sideWingWidth + NotchGeometry.cameraClearance - artwork.maxX >= 20,
                  "Album cover has breathing room before the hardware camera at height \(safeTop)")
        }
        let hovered = notch.panelFrame(expansion: 0, hover: 1)
        check(abs(hovered.width / notch.closedWidth - 1.025) < 0.0001 && abs(hovered.height - (notch.closedHeight * 1.025 + 2)) < 0.0001, "Hover zooms sideways and reveals a small lip below the camera")
        check(hovered.maxY == notch.panelFrame(expanded: false).maxY && hovered.midX == notch.centerX, "Hover grows symmetrically below the menu bar")
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
        let halfway = notch.panelFrame(expansion: 0.5, contentHeight: 256)
        check(abs((halfway.width - notch.closedWidth) / (notch.expandedWidth - notch.closedWidth) - 0.5) < 0.0001,
              "Opening grows sideways in step with its downward expansion")
        check(halfway.midX == notch.centerX && halfway.maxY == notch.topY && halfway.height > notch.closedHeight,
              "Opening grows down and out while remaining attached to the camera")
        opening.move(to: 0)
        check(opening.value == startingValue && opening.velocity == startingVelocity, "Mid-animation reversal preserves position and velocity")
        for _ in 0..<240 { opening.advance(by: 1.0 / 120) }
        check(opening.isSettled && opening.value == 0, "Interrupted opening settles fully closed")
        opening.move(to: 1)
        var peak: Double = 0, peakTime: Double = 0
        for frame in 0..<240 {
            opening.advance(by: 1.0 / 120)
            if opening.value > peak { peak = opening.value; peakTime = Double(frame + 1) / 120 }
        }
        check((0.25...0.32).contains(peakTime), "Opening bounce peaks near the reference recording's 0.3-second mark")
        check(opening.isSettled && opening.value == 1 && peak > 1.06 && peak <= NotchGeometry.maximumExpansion, "Opening spring matches the recorded bounce and settles with bounded overshoot")
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
        var hoverMotion = NotchMotion(openingDamping: 1, openingFrequency: 21, closingFrequency: 26)
        hoverMotion.move(to: 1)
        var hoverPrevious = 0.0
        var hoversMonotonically = true
        for _ in 0..<120 {
            hoverMotion.advance(by: 1.0 / 120)
            hoversMonotonically = hoversMonotonically && hoverMotion.value >= hoverPrevious && hoverMotion.value <= 1
            hoverPrevious = hoverMotion.value
        }
        check(hoversMonotonically && hoverMotion.isSettled, "Hover approaches its tiny zoom smoothly without bounce or overshoot")
        for progress in [0.0, 0.25, 0.5, 0.75, 1.0, 1.01] {
            let frame = notch.panelFrame(expansion: progress)
            check(abs(frame.midX - notch.centerX) < 0.001 && abs(frame.maxY - notch.topY) < 0.001,
                  "Animation keeps the notch anchored at progress \(progress)")
        }
        check(PlayerGestures.dismisses(translation: .init(width: 8, height: 120), predicted: .init(width: 8, height: 140)), "Downward player drag dismisses")
        check(PlayerGestures.dismisses(translation: .init(width: 4, height: 30), predicted: .init(width: 4, height: 200)), "Deliberate downward flick dismisses")
        check(!PlayerGestures.dismisses(translation: .init(width: 140, height: 110), predicted: .init(width: 140, height: 220)) && !PlayerGestures.dismisses(translation: .init(width: 0, height: 12), predicted: .init(width: 0, height: 220)), "Horizontal and tiny accidental gestures cannot dismiss")
        check(PlayerGestures.expands(translation: .init(width: 4, height: -70), predicted: .init(width: 4, height: -100)) && !PlayerGestures.expands(translation: .init(width: 100, height: -70), predicted: .init(width: 100, height: -160)), "Mini-player expansion requires an upward gesture")
        check(PlayerGestures.goesBack(startX: 20, translation: .init(width: 100, height: 4), predicted: .init(width: 120, height: 4)) && !PlayerGestures.goesBack(startX: 120, translation: .init(width: 100, height: 4), predicted: .init(width: 120, height: 4)) && !PlayerGestures.goesBack(startX: 20, translation: .init(width: 100, height: 120), predicted: .init(width: 120, height: 140)), "Collection back requires a horizontal gesture beginning at the left edge")
        let presentation = FullScreenPlayerController.playerPresentationOptions(from: [.autoHideMenuBar, .autoHideDock])
        check(presentation.contains(.hideMenuBar) && presentation.contains(.hideDock)
              && !presentation.contains(.autoHideMenuBar) && !presentation.contains(.autoHideDock),
              "Full-screen player hides system bars instead of revealing them on notch hover")
        let coveringWindow = FullScreenPlayerWindow(contentRect: .zero, styleMask: .borderless, backing: .buffered, defer: false)
        for display in [CGRect(x: 0, y: 0, width: 1800, height: 1169), CGRect(x: -1920, y: 0, width: 1920, height: 1080)] {
            check(coveringWindow.constrainFrameRect(display, to: nil) == display,
                  "Player window covers the physical display without a menu-bar gap at origin \(display.origin)")
        }
        check(coveringWindow.canBecomeKey && coveringWindow.canBecomeMain,
              "Borderless full-screen player receives keyboard focus for Escape and transport")
        let rect = CGRect(x: 0, y: 0, width: 304, height: 32)
        let shape = IslandShape(attached: true, expansion: 0).path(in: rect)
        check(shape.contains(CGPoint(x: 8, y: 1)) && !shape.contains(CGPoint(x: 8, y: 12)), "Top-left shoulder flares outward into the screen edge")
        check(shape.contains(CGPoint(x: 296, y: 1)) && !shape.contains(CGPoint(x: 296, y: 12)), "Top-right shoulder mirrors the outward curve")
        check(shape.contains(CGPoint(x: 152, y: 1)) && shape.contains(CGPoint(x: 152, y: 31)), "Black surface continuously covers the camera center")
        NSApplication.shared.setActivationPolicy(.prohibited)
        let floating = FloatingPlayerController()
        var closeCount = 0
        floating.show(room: room, palette: NativePalette(light: false), onExpand: { _ in }, onClose: { closeCount += 1 })
        let player = FullScreenPlayerController()
        let originalPresentation = NSApp.presentationOptions
        player.show(room: room)
        let playerWindow = NSApp.windows.first { $0.identifier?.rawValue == "syncbeats.full-screen-player" && $0.isVisible }
        check(playerWindow != nil && playerWindow?.frame == playerWindow?.screen?.frame,
              "Opened full-screen player fills its screen frame including the top menu strip")
        check(playerWindow?.styleMask == .borderless && playerWindow?.hasShadow == false,
              "Full-screen player has no title bar or desktop frame around the content")
        player.close()
        check(playerWindow?.isVisible == false && NSApp.presentationOptions == originalPresentation,
              "Closing full-screen player restores the previous system-bar presentation")
        let firstPanel = NSApp.windows.first { $0.title == "SyncBeats player" && $0.isVisible }
        check(firstPanel != nil && firstPanel!.level == .floating, "Floating player stays above ordinary windows")
        check(!(firstPanel as? NSPanel)!.hidesOnDeactivate, "Floating player remains visible outside the app")
        floating.show(room: room, palette: NativePalette(light: true), onExpand: { _ in }, onClose: { closeCount += 1 })
        let panels = NSApp.windows.filter { $0.title == "SyncBeats player" && $0.isVisible }
        check(panels.count == 1 && panels.first === firstPanel, "Theme updates reuse the same floating panel")
        floating.close()
        check(closeCount == 1 && !firstPanel!.isVisible, "Closing the floating player restores its owning view once")
        let parsed = NativeLRC.parse("[offset:-100]\n[00:12.50][00:34.750]One line\n[00:40.00]\n[ar:Artist]")
        let fillLine = NativeLyricLine(id: 0, time: 10, text: "Live ink")
        check(NativeLRC.fillProgress(line: fillLine, nextTime: 20, position: 15, duration: nil) == 0.5, "Lyric fill uses room timeline between line timestamps")
        check(NativeLRC.fillProgress(line: fillLine, nextTime: 20, position: 0, duration: nil) == 0 && NativeLRC.fillProgress(line: fillLine, nextTime: 20, position: 30, duration: nil) == 1, "Lyric fill clamps across seeks")
        check(NativeLRC.fillProgress(line: fillLine, nextTime: nil, position: 15, duration: 20) == 0.5, "Final lyric uses measured duration")
        check(parsed.count == 3 && abs(parsed[0].time - 12.4) < 0.001 && parsed[1].time == 34.65, "Lyrics parse multiple timestamps and signed offsets")
        check(parsed[2].text.isEmpty, "Timed instrumental passages remain in lyrics")
        let exact = NativeLyricsResult(trackName: "F1", artistName: "Hans Zimmer", duration: 194, instrumental: true, plainLyrics: nil, syncedLyrics: nil)
        let unrelated = NativeLyricsResult(trackName: "Another Track", artistName: "Other Artist", duration: 194, instrumental: false, plainLyrics: "wrong", syncedLyrics: "[00:00]wrong")
        let wrongVersion = NativeLyricsResult(trackName: "F1", artistName: "Hans Zimmer", duration: 634, instrumental: true, plainLyrics: nil, syncedLyrics: nil)
        check(NativeLyricsChoice.best([unrelated, wrongVersion, exact], title: "F1", artist: "Hans Zimmer", duration: 193.65)?.instrumental == true, "Lyrics match track identity and duration instead of the first search result")
        check(NativeLyricsChoice.best([unrelated, wrongVersion], title: "F1", artist: "Hans Zimmer", duration: 193.65) == nil, "Lyrics reject wrong artists and different versions")
        print("\(checks) room and notch checks passed")
    }
}
