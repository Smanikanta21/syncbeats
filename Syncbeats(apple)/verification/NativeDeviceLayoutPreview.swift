import SwiftUI
import UIKit

private struct PreviewDisk: NativeLibraryPersisting {
    func read(key: String) throws -> NativeImportedLibrary { .init() }
    func write(_ library: NativeImportedLibrary, key: String) throws { }
}
private struct PreviewLibrary: NativeLibraryServing {
    let entries: [NativeLibraryPlaylist]
    func playlists() async throws -> [NativeLibraryPlaylist] { entries }
    func save(_ result: RoomSearchResult) async throws { }
    func resolve(_ song: NativeLibrarySong) async throws -> String { "abcdefghijk" }
    func rename(_ playlist: NativeLibraryPlaylist, to name: String) async throws { }
    func addSongs(_ songs: [NativeLibrarySong], to playlist: NativeLibraryPlaylist) async throws -> NativeLibraryPlaylist { playlist }
    func delete(_ playlist: NativeLibraryPlaylist, songs: NativePlaylistSongDisposition) async throws -> NativeLibraryPlaylist? { nil }
}

/// Compiled into a separate, temporary review app, never the user's SyncBeats app.
@main struct NativeDeviceLayoutPreview: App {
    @State private var room = RoomSession()
    @State private var section = NativeLibrarySection.songs
    @State private var mode = 0
    @State private var library: NativeLibraryStore
    private let palette = NativePalette(light: false)
    init() {
        let songs = (0..<80).map { index in
            NativeLibrarySong(id: "preview:\(index)", title: index == 0 ? "A long song title that should stay readable on a small phone" : "After the rain \(index + 1)",
                              artist: "Studio Sessions", album: "Evening collection \(index % 8 + 1)", source: "APPLE_MUSIC")
        }
        let service = PreviewLibrary(entries: [.init(id: "preview:playlist", name: "Evening collection", source: "APPLE_MUSIC", songs: songs)])
        _library = State(initialValue: NativeLibraryStore(disk: PreviewDisk(), factory: { _ in service }))
    }
    var body: some Scene {
        WindowGroup {
            Group {
                if mode == 0 { FullScreenRoomPlayer(room: room, onClose: { }) }
                else if mode == 1 { NativeLibraryPage(section: $section, library: library, room: room, palette: palette) }
                else { NativeLoader(title: "Loading your library", detail: "Getting your saved playlists", palette: palette).frame(maxWidth: .infinity, maxHeight: .infinity) }
            }.background(palette.background).foregroundStyle(palette.text).preferredColorScheme(.dark)
                .task {
                    room.apply(try! RoomFixtures.snapshot())
                    await library.load(for: .init(roomID: "123456", userID: "preview", displayName: "Layout review", token: "fixture",
                        baseURL: URL(string: "http://127.0.0.1:1")!, deviceID: "preview"))
                    try? await Task.sleep(for: .seconds(2))
                    capture("player")
                    mode = 1
                    try? await Task.sleep(for: .seconds(2))
                    capture("library-songs")
                    section = .albums
                    try? await Task.sleep(for: .seconds(2))
                    capture("library-albums")
                    mode = 2
                    try? await Task.sleep(for: .seconds(2))
                    capture("loader")
                    let result: [String: Any] = ["idleTimerDisabled": UIApplication.shared.isIdleTimerDisabled,
                        "screenWidth": UIScreen.main.bounds.width, "screenHeight": UIScreen.main.bounds.height,
                        "device": UIDevice.current.model]
                    let data = try! JSONSerialization.data(withJSONObject: result, options: [.prettyPrinted])
                    try! data.write(to: FileManager.default.temporaryDirectory.appendingPathComponent("review.json"))
                }
        }
    }
    @MainActor private func capture(_ name: String) {
        guard let scene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first,
              let window = scene.windows.first(where: \.isKeyWindow) else { return }
        let renderer = UIGraphicsImageRenderer(bounds: window.bounds)
        let image = renderer.image { _ in window.drawHierarchy(in: window.bounds, afterScreenUpdates: true) }
        if let png = image.pngData() {
            try? png.write(to: FileManager.default.temporaryDirectory.appendingPathComponent(name + ".png"))
        }
    }
}
