import AppKit
import SwiftUI
import ImageIO

nonisolated private struct LayoutDisk: NativeLibraryPersisting {
    func read(key: String) throws -> NativeImportedLibrary { .init() }
    func write(_ library: NativeImportedLibrary, key: String) throws { }
}

@MainActor private final class LayoutLibrary: NativeLibraryServing {
    var requested: [Int] = []
    var active = 0
    var maximumActive = 0
    func playlists() async throws -> [NativeLibraryPlaylist] { [] }
    func save(_ result: RoomSearchResult) async throws { }
    func resolve(_ song: NativeLibrarySong) async throws -> String { "fixture" }
    func rename(_ playlist: NativeLibraryPlaylist, to name: String) async throws { }
    func addSongs(_ songs: [NativeLibrarySong], to playlist: NativeLibraryPlaylist) async throws -> NativeLibraryPlaylist { playlist }
    func delete(_ playlist: NativeLibraryPlaylist, songs: NativePlaylistSongDisposition) async throws -> NativeLibraryPlaylist? { nil }
    func catalogPage(_ section: NativeLibrarySection, cursor: String?, query: String, filter: NativeLibraryGroupFilter?) async throws -> NativeLibraryCatalogPage {
        let page = Int(cursor ?? "0") ?? 0
        requested.append(page); active += 1; maximumActive = max(maximumActive, active)
        defer { active -= 1 }
        // Ensure the request survives the sentinel changing to its loading state.
        try await Task.sleep(for: .milliseconds(180))
        let songs: [NativeLibrarySong] = (page * 12 ..< (page + 1) * 12).map { index in
            let title = ["After the rain", "Evening drive", "A little closer", "Golden hour"][index % 4]
            return NativeLibrarySong(id: "review:\(index)", title: title,
                              artist: ["Room Sessions", "Northbound"][index % 2], album: "Evening collection \(index / 6)",
                              artwork: nil, thumbnail: nil, duration: 180 + Double(index), youtubeID: nil, source: "APPLE_MUSIC")
        }
        return .init(songs: songs, groups: [], nextCursor: page < 3 ? String(page + 1) : nil, total: 48)
    }
}

private struct LayoutLibraryView: View {
    let store: NativeLibraryStore
    let room: RoomSession
    @State private var section = NativeLibrarySection.songs
    var body: some View {
        NativeLibraryPage(section: $section, library: store, room: room, palette: NativePalette(light: false))
            .background(NativePalette(light: false).background).preferredColorScheme(.dark)
    }
}

@MainActor private final class LayoutChecks: NSObject, NSApplicationDelegate {
    private var windows: [NSWindow] = []
    private let output = URL(fileURLWithPath: ProcessInfo.processInfo.environment["SYNCBEATS_LAYOUT_OUTPUT"] ?? "/tmp/syncbeats-native-layout")
    private var failures = 0

    func applicationDidFinishLaunching(_ notification: Notification) {
        Task { await run() }
    }
    private func check(_ valid: Bool, _ message: String) {
        print("\(valid ? "PASS" : "FAIL"): \(message)")
        if !valid { failures += 1 }
    }
    private func host<V: View>(_ view: V, size: CGSize) -> NSWindow {
        let window = NSWindow(contentRect: NSRect(origin: .zero, size: size), styleMask: [.titled, .resizable], backing: .buffered, defer: false)
        window.isReleasedWhenClosed = false
        window.contentView = NSHostingView(rootView: view.environment(\.scenePhase, .active))
        window.makeKeyAndOrderFront(nil); windows.append(window)
        return window
    }
    private func capture(_ window: NSWindow, name: String) {
        guard let view = window.contentView, let bitmap = view.bitmapImageRepForCachingDisplay(in: view.bounds) else {
            check(false, "Capture \(name)"); return
        }
        view.layoutSubtreeIfNeeded(); view.cacheDisplay(in: view.bounds, to: bitmap)
        guard let data = bitmap.representation(using: .png, properties: [:]) else { check(false, "Encode \(name)"); return }
        do { try data.write(to: output.appendingPathComponent(name + ".png")) }
        catch { check(false, "Write \(name): \(error)") }
        check(view.bounds.width.isFinite && view.bounds.height.isFinite, "Finite native layout: \(name)")
    }
    private func scrollViews(_ view: NSView) -> [NSScrollView] {
        (view as? NSScrollView).map { [$0] } ?? view.subviews.flatMap(scrollViews)
    }
    private func run() async {
        try? FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)
        let api = LayoutLibrary()
        let library = NativeLibraryStore(disk: LayoutDisk(), factory: { _ in api })
        await library.load(for: .init(roomID: "123456", userID: "review", displayName: "Layout review", token: "fixture",
                                     baseURL: URL(string: "http://127.0.0.1:1")!, deviceID: "review"))
        let room = RoomSession()
        try? room.apply(RoomFixtures.snapshot())
        let collection = host(LayoutLibraryView(store: library, room: room), size: CGSize(width: 390, height: 760))
        try? await Task.sleep(for: .milliseconds(600))
        capture(collection, name: "library-phone-width")
        check(library.songs.count >= 12, "Library first page renders")
        check(api.requested.count <= 2, "Offscreen pages stay lazy")
        print("Scroll views: \(collection.contentView.map { scrollViews($0).map { String(describing: type(of: $0)) } } ?? [])")
        // Move the real AppKit scroll viewport to its bottom repeatedly.
        // No application pagination command or button is called here.
        for _ in 0..<8 where library.hasMore {
            if let view = collection.contentView {
                for scroll in scrollViews(view) {
                    guard let document = scroll.documentView else { continue }
                    let bottom = max(0, document.bounds.height - scroll.contentView.bounds.height)
                    scroll.contentView.scroll(to: CGPoint(x: 0, y: document.isFlipped ? bottom : 0))
                    scroll.reflectScrolledClipView(scroll.contentView)
                }
            }
            try? await Task.sleep(for: .milliseconds(400))
        }
        check(library.songs.count == 48 && !library.hasMore, "Actual scroll viewport automatically loads all 48 songs")
        print("Observed pagination requests: \(api.requested), songs: \(library.songs.count), more: \(library.hasMore)")
        check(api.requested == [0, 1, 2, 3], "Pages fetched once, in cursor order")
        check(api.maximumActive == 1, "No overlapping pagination requests")
        capture(collection, name: "library-phone-width-last-page")
        for (name, size) in [("library-small-phone-width", CGSize(width: 320, height: 568)),
                             ("library-ipad-width", CGSize(width: 820, height: 1024)),
                             ("library-mac-width", CGSize(width: 1200, height: 760))] {
            collection.setContentSize(size)
            try? await Task.sleep(for: .milliseconds(220))
            capture(collection, name: name)
        }
        collection.orderOut(nil)
        let player = host(FullScreenRoomPlayer(room: room, onClose: { }), size: CGSize(width: 1200, height: 760))
        for (name, size) in [("player-mac-width", CGSize(width: 1200, height: 760)),
                             ("player-ipad-width", CGSize(width: 820, height: 1024)),
                             ("player-phone-width", CGSize(width: 390, height: 760)),
                             ("player-landscape-width", CGSize(width: 844, height: 350))] {
            player.setContentSize(size)
            try? await Task.sleep(for: .milliseconds(400))
            capture(player, name: name)
        }
        player.orderOut(nil)
        let loading = host(NativeLoader(title: "Loading your library", detail: "Getting your saved playlists", palette: NativePalette(light: false))
            .frame(maxWidth: .infinity, maxHeight: .infinity).background(NativePalette(light: false).background), size: CGSize(width: 390, height: 760))
        try? await Task.sleep(for: .milliseconds(220))
        capture(loading, name: "syncbeats-loader")
        for window in windows { window.orderOut(nil) }
        check(RoomArtworkCache.pixelSize(for: 450, scale: 3) == 1536, "Retina player artwork keeps full screen resolution")
        check(RoomArtworkCache.pixelSize(for: 44, scale: 3) == 256, "Dock artwork decodes a bounded thumbnail")
        check(RoomArtworkCache.decode(Data([0, 1, 2]), pixels: 128) == nil, "Malformed artwork fails safely")
        print("Layout review completed with \(failures) failures. Screenshots use macOS SwiftUI; iOS touch/layout QA remains separate.")
        exit(failures == 0 ? 0 : 1)
    }
}

@main private enum NativeLayoutVerification {
    @MainActor static func main() {
        let app = NSApplication.shared
        let checks = LayoutChecks()
        app.delegate = checks; app.setActivationPolicy(.accessory)
        app.run()
    }
}
