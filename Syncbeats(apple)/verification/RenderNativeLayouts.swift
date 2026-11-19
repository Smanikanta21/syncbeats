import AppKit
import SwiftUI
import AVFoundation

private struct EmptySessionStore: SessionPersisting {
    func read() throws -> String? { nil }
    func save(_ token: String) throws { }
    func clear() throws { }
}

/// Generates local layout artifacts from the actual SwiftUI views, without accounts or UI automation.
@main
struct RenderNativeLayouts {
    @MainActor static func main() throws {
        if CommandLine.arguments.contains("--verify-ambient") {
            NSApplication.shared.setActivationPolicy(.accessory)
            verifyAmbient(); return
        }
        if CommandLine.arguments.contains("--equalizer-only") {
            NSApplication.shared.setActivationPolicy(.prohibited)
            let output = URL(fileURLWithPath: "/tmp/syncbeats-native-layouts", isDirectory: true)
            try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)
            let audio = NativeRoomAudio()
            try render(RoomEqualizerView(audio: audio), name: "equalizer-spectrum", width: 390, height: 380, output: output)
            return
        }
        if CommandLine.arguments.contains("--fullscreen-only") {
            NSApplication.shared.setActivationPolicy(.prohibited)
            let output = URL(fileURLWithPath: "/tmp/syncbeats-native-layouts", isDirectory: true)
            try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)
            for (width, height) in [(720,560),(960,720),(1512,982),(2560,1440)] {
                let session = RoomSession(); session.apply(try RoomFixtures.snapshot(playing: false, originalArtwork: true))
                try render(FullScreenRoomPlayer(room: session, onClose: {}),
                           name: "fullscreen-native-\(width)-\(height)", width: CGFloat(width), height: CGFloat(height), output: output)
            }
            return
        }
        NSApplication.shared.setActivationPolicy(.prohibited)
        let output = URL(fileURLWithPath: "/tmp/syncbeats-native-layouts", isDirectory: true)
        try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)
        let suite = "SyncBeats.LayoutReview." + UUID().uuidString
        let preferences = UserDefaults(suiteName: suite)!
        defer { preferences.removePersistentDomain(forName: suite) }
        if CommandLine.arguments.contains("--queue-only") {
            let room = RoomSession()
            room.apply(try RoomFixtures.snapshot(originalArtwork: true))
            for light in [false, true] {
                let palette = NativePalette(light: light)
                for (width, height, queue) in [(CGFloat(720), CGFloat(560), false), (720, 560, true),
                                              (880, 560, false), (960, 720, false), (1512, 982, false), (2560, 1440, false)] {
                    let view = RoomExpandedPlayer(room: room, palette: palette, showsQueue: .constant(queue), onClose: {}, onFloat: {})
                    try render(view, name: "glass-queue-\(Int(width))x\(Int(height))-\(queue ? "queue" : "player")-\(light ? "light" : "dark")",
                               width: width, height: height, output: output)
                }
                let view = RoomExpandedPlayer(room: room, palette: palette, showsQueue: .constant(false), onClose: {}, onFloat: {})
                    .environment(\.queueReviewOpaque, true)
                try render(view, name: "glass-queue-accessibility-\(light ? "light" : "dark")", width: 960, height: 720, output: output)
            }
            let empty = RoomSession()
            empty.apply(try RoomFixtures.snapshot(empty: true))
            try render(RoomExpandedPlayer(room: empty, palette: NativePalette(light: false), showsQueue: .constant(true), onClose: {}, onFloat: {}),
                       name: "glass-queue-empty", width: 720, height: 560, output: output)
            let long = RoomSession()
            long.apply(try RoomFixtures.snapshot(originalArtwork: true, queueCount: 24))
            try render(RoomExpandedPlayer(room: long, palette: NativePalette(light: false), showsQueue: .constant(false), onClose: {}, onFloat: {}),
                       name: "glass-queue-long", width: 960, height: 720, output: output)
            return
        }
        if CommandLine.arguments.contains("--loader-only") {
            for light in [false, true] {
                let palette = NativePalette(light: light)
                let theme = light ? "light" : "dark"
                try render(NativeLoader(title: "Opening your room", detail: "Getting your shared queue ready", palette: palette).frame(maxWidth: .infinity, maxHeight: .infinity).background(palette.background), name: "loader-section-" + theme, width: 720, height: 480, output: output)
                try render(NativeLoader(title: "Loading your history", palette: palette, compact: true).frame(maxWidth: .infinity, maxHeight: .infinity).background(palette.background), name: "loader-inline-" + theme, width: 360, height: 120, output: output)
                try render(NativeLoader(title: "Preparing this track", palette: palette, progress: 37).frame(maxWidth: .infinity, maxHeight: .infinity).background(palette.background), name: "loader-progress-" + theme, width: 360, height: 300, output: output)
                try render(NativeLoader(title: "Finding music", palette: palette, animates: false).frame(maxWidth: .infinity, maxHeight: .infinity).background(palette.background), name: "loader-reduced-motion-" + theme, width: 360, height: 300, output: output)
                try render(GoldButton(title: "Signing in", palette: palette, working: true, action: {}).frame(maxWidth: .infinity, maxHeight: .infinity).background(palette.background), name: "loader-button-" + theme, width: 280, height: 100, output: output)
            }
            return
        }
        if CommandLine.arguments.contains("--interests-only") {
            struct Fixture: Decodable { let catalog: MusicCatalog; let starter: MusicFeed; let personalized: MusicFeed }
            let fixtureURL = URL(fileURLWithPath: ProcessInfo.processInfo.environment["SYNCBEATS_TASTE_FIXTURES"] ?? "/tmp/syncbeats-recommendations-layouts.json")
            let fixture = try JSONDecoder().decode(Fixture.self, from: Data(contentsOf: fixtureURL))
            for light in [false, true] {
                let palette = NativePalette(light: light)
                let theme = light ? "light" : "dark"
                for starter in [true, false] {
                    let room = RoomSession()
                    room.applyMusicLayoutReview(fixture.catalog, feed: starter ? fixture.starter : fixture.personalized)
                    if starter {
                        for stage in 1...2 {
                            try render(MusicInterestsModal(room: room, palette: palette, initialStage: stage), name: "music-modal-\(stage == 1 ? "artists" : "listening")-\(theme)", width: 640, height: 500, output: output)
                        }
                    }
                    for (width, height) in [(CGFloat(720), CGFloat(560)), (1000, 800)] {
                        let content = Group {
                            if starter { MusicInterestsModal(room: room, palette: palette) }
                            else { ScrollView { MusicInterestsView(room: room, palette: palette, onSearch: { _ in }).padding(24) } }
                        }.frame(maxWidth: .infinity, maxHeight: .infinity).background(palette.background)
                        try render(content, name: "music-\(starter ? "interests" : "feed")-\(Int(width))x\(Int(height))-\(theme)", width: width, height: height, output: output)
                    }
                }
            }
            return
        }
        let scenarios: [(String, CGFloat, CGFloat, EntryPhase, AccountMode, String, Int)] = [
            ("intro-small", 720, 560, .introduction, .login, "dark", 0),
            ("intro-default", 960, 720, .introduction, .login, "dark", 1),
            ("intro-large-light", 1600, 900, .introduction, .login, "light", 2),
            ("login-small", 720, 560, .authentication, .login, "dark", 0),
            ("login-narrow", 480, 760, .authentication, .login, "light", 0),
            ("login-default", 960, 720, .authentication, .login, "dark", 0),
            ("login-wide", 1920, 1080, .authentication, .login, "dark", 0),
            ("login-fullscreen-mac", 1512, 982, .authentication, .login, "light", 0),
            ("login-fullscreen-large", 2560, 1440, .authentication, .login, "dark", 0),
            ("signup-fullscreen", 1920, 1080, .authentication, .signup, "light", 0),
            ("intro-fullscreen", 1920, 1080, .introduction, .login, "dark", 0),
            ("signup-light", 960, 720, .authentication, .signup, "light", 0),
            ("room-small", 720, 560, .signedIn, .login, "dark", 0),
            ("room-small-light", 720, 560, .signedIn, .login, "light", 0),
            ("room-drawer", 1099, 660, .signedIn, .login, "dark", 0),
            ("room-wide-short", 1512, 560, .signedIn, .login, "dark", 0),
            ("room-dock-boundary", 1100, 720, .signedIn, .login, "dark", 0),
            ("room-default", 960, 720, .signedIn, .login, "dark", 0),
            ("room-fullscreen", 1512, 982, .signedIn, .login, "dark", 0),
            ("room-fullscreen-light", 1920, 1080, .signedIn, .login, "light", 0),
            ("room-empty", 1512, 982, .signedIn, .login, "dark", 0)
        ]
        for (name, width, height, phase, mode, appearance, intro) in scenarios {
            let model = AppModel(api: AuthAPI(baseURL: URL(string: "http://127.0.0.1:5169/auth-service")!, deviceID: "layout-review"),
                                 store: EmptySessionStore(), preferences: preferences)
            model.phase = phase
            model.accountMode = mode
            model.appearance = appearance
            model.introIndex = intro
            let room = RoomSession()
            if phase == .signedIn {
                model.roomID = "123456"
                model.account = Account(id: "review", name: "Studio listener", email: "review@example.test", emailVerifiedAt: nil)
                room.apply(try RoomFixtures.snapshot(empty: name == "room-empty", originalArtwork: true))
                if name != "room-empty" { room.applyLayoutReview(try RoomFixtures.originalSongs()) }
            }
            // ImageRenderer omits AppKit-backed scroll views and text fields.
            // Render an owned offscreen hosting window to include those controls.
            let bounds = NSRect(x: 0, y: 0, width: width, height: height)
            let host = NSHostingView(rootView: NativeEntryView(model: model, room: room, runsLifecycle: false).frame(width: width, height: height))
            host.frame = bounds
            let window = NSWindow(contentRect: NSRect(x: -10000, y: -10000, width: width, height: height),
                                  styleMask: .borderless, backing: .buffered, defer: false)
            window.isReleasedWhenClosed = false
            window.contentView = host
            window.orderFront(nil)
            host.layoutSubtreeIfNeeded()
            RunLoop.current.run(until: Date().addingTimeInterval(1.0))
            guard let bitmap = host.bitmapImageRepForCachingDisplay(in: bounds) else {
                throw AuthFailure.invalidInput("Could not render " + name)
            }
            host.cacheDisplay(in: bounds, to: bitmap)
            guard let data = bitmap.representation(using: .png, properties: [:]) else {
                throw AuthFailure.invalidInput("Could not encode " + name)
            }
            let file = output.appendingPathComponent(name + ".png")
            try data.write(to: file)
            window.close()
            print(file.path)
        }
        let room = RoomSession()
        room.apply(try RoomFixtures.snapshot(originalArtwork: true))
        for (width, height) in [(CGFloat(720), CGFloat(560)), (960, 720), (1512, 982), (2560, 1440)] {
            try render(FullScreenRoomPlayer(room: room, onClose: {}), name: "ambient-player-\(Int(width))x\(Int(height))", width: width, height: height, output: output)
        }
        for light in [false, true] {
            let palette = NativePalette(light: light)
            for (width, height, queue) in [(CGFloat(720), CGFloat(560), false), (720, 560, true), (960, 720, false), (1512, 560, false)] {
                let view = RoomExpandedPlayer(room: room, palette: palette, showsQueue: .constant(queue), onClose: {}, onFloat: {})
                try render(view, name: "player-\(Int(width))-\(Int(height))-\(queue ? "queue" : "artwork")-\(light ? "light" : "dark")", width: width, height: height, output: output)
            }
            let mini = RoomMiniPlayer(room: room, palette: palette, onExpand: {}, onQueue: {}, onFloat: {}, floating: true)
            try render(mini, name: "floating-\(light ? "light" : "dark")", width: 450, height: 126, output: output)
        }
        let controller = NotchWindowController()
        for expanded in [false, true] {
            if expanded { controller.toggleFromClick() }
            let frame = controller.geometry.panelFrame(expanded: expanded)
            let bounds = CGRect(origin: .zero, size: frame.size)
            let host = NSHostingView(rootView: NotchIslandView(room: room, controller: controller).frame(width: frame.width, height: frame.height))
            host.frame = bounds
            let window = NSWindow(contentRect: CGRect(x: -10000, y: -10000, width: frame.width, height: frame.height), styleMask: .borderless, backing: .buffered, defer: false)
            window.isReleasedWhenClosed = false
            window.contentView = host
            window.orderFront(nil)
            host.layoutSubtreeIfNeeded()
            RunLoop.current.run(until: Date().addingTimeInterval(0.3))
            let bitmap = host.bitmapImageRepForCachingDisplay(in: bounds)!
            host.cacheDisplay(in: bounds, to: bitmap)
            let file = output.appendingPathComponent(expanded ? "notch-expanded.png" : "notch-compact.png")
            try bitmap.representation(using: .png, properties: [:])!.write(to: file)
            window.close()
            print(file.path)
        }
    }

    @MainActor private static func verifyAmbient() {
        let meter = AudioEnergyMeter()
        let bounds = NSRect(x: 0, y: 0, width: 640, height: 480)
        let host = NSHostingView(rootView: AlbumAmbientBackground(colors: CoverPalette.fallback, meter: meter, playing: true))
        host.frame = bounds
        let window = NSWindow(contentRect: bounds, styleMask: [.borderless], backing: .buffered, defer: false)
        window.isReleasedWhenClosed = false; window.contentView = host; window.orderFront(nil)
        func pixels() -> [UInt8] {
            host.layoutSubtreeIfNeeded()
            let bitmap = host.bitmapImageRepForCachingDisplay(in: bounds)!
            host.cacheDisplay(in: bounds, to: bitmap)
            return Array(UnsafeBufferPointer(start: bitmap.bitmapData!, count: bitmap.bytesPerRow * bitmap.pixelsHigh))
        }
        func difference(_ a: [UInt8], _ b: [UInt8]) -> Double {
            zip(a, b).reduce(0.0) { $0 + Double(abs(Int($1.0) - Int($1.1))) } / Double(a.count)
        }
        RunLoop.current.run(until: Date().addingTimeInterval(0.5))
        let initial = pixels()
        RunLoop.current.run(until: Date().addingTimeInterval(2))
        let moving = pixels(), flow = difference(initial, moving)
        precondition(flow > 0.2, "Ambient animation must change actual rendered pixels")
        print("PASS: Flow changes rendered pixels (mean delta \(flow))")
        let format = AVAudioFormat(standardFormatWithSampleRate: 44100, channels: 2)!
        let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 2048)!
        buffer.frameLength = 2048
        for channel in 0..<2 { for sample in 0..<2048 { buffer.floatChannelData![channel][sample] = Float(sin(Double(sample) * 2 * .pi * 100 / 44100)) * 0.2 } }
        for _ in 0..<8 { meter.consume(buffer) }
        RunLoop.current.run(until: Date().addingTimeInterval(0.1))
        let music = pixels(), response = difference(moving, music)
        precondition(response > 0.2, "Audio must visibly change rendered shapes")
        print("PASS: Audio energy changes rendered pixels (mean delta \(response))")
        host.rootView = AlbumAmbientBackground(colors: CoverPalette.fallback, meter: meter, playing: false)
        RunLoop.current.run(until: Date().addingTimeInterval(0.2))
        let paused = pixels()
        RunLoop.current.run(until: Date().addingTimeInterval(0.5))
        precondition(difference(paused, pixels()) < 0.05, "Paused ambient must stay still")
        print("PASS: Paused ambient remains still")
        window.close()
    }

    @MainActor private static func render<V: View>(_ view: V, name: String, width: CGFloat, height: CGFloat, output: URL) throws {
        let bounds = NSRect(x: 0, y: 0, width: width, height: height)
        let host = NSHostingView(rootView: view.frame(width: width, height: height))
        host.frame = bounds
        let window = NSWindow(contentRect: NSRect(x: -10000, y: -10000, width: width, height: height), styleMask: .borderless, backing: .buffered, defer: false)
        window.isReleasedWhenClosed = false; window.contentView = host; window.orderFront(nil)
        host.layoutSubtreeIfNeeded(); RunLoop.current.run(until: Date().addingTimeInterval(1))
        let bitmap = host.bitmapImageRepForCachingDisplay(in: bounds)!
        host.cacheDisplay(in: bounds, to: bitmap)
        let file = output.appendingPathComponent(name + ".png")
        try bitmap.representation(using: .png, properties: [:])!.write(to: file)
        window.close(); print(file.path)
    }
}
