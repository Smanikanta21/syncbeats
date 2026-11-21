from pathlib import Path
import subprocess
import tempfile
import shutil
import os
import sys

verification = Path(__file__).resolve().parent
sources = verification.parent / "Syncbeats" / "Syncbeats"
products = Path(os.environ.get("SYNCBEATS_BUILD_PRODUCTS", "/tmp/syncbeats-personal-team-build/Build/Products/Debug"))
package_objects = [products / "SocketIO.o", products / "Starscream.o"]
if not all(p.exists() for p in package_objects):
    raise SystemExit("Build the Debug app first, or set SYNCBEATS_BUILD_PRODUCTS to its products folder.")
# Copy only the shared entry view so the production App's @main does not conflict.
entry = (sources / "App" / "SyncBeatsApp.swift").read_text()
with tempfile.TemporaryDirectory(prefix="syncbeats-layout-render-") as directory:
    derived = Path(directory) / "NativeEntryView.swift"
    derived.write_text("import SwiftUI\nstruct NativeEntryView" + entry.split("struct NativeEntryView", 1)[1])
    # The fixture adapter exists only in this temporary verification compilation.
    session = Path(directory) / "RoomSession.swift"
    session_source = (sources / "Features/Room/RoomSession.swift").read_text()
    session_source = session_source.replace("    var currentTrack:", """    func applyLayoutReview(_ songs: [RoomSearchResult]) {
        recommendations = songs
        listeningHistory = Array(songs.prefix(2))
    }
    func applyMusicLayoutReview(_ catalog: MusicCatalog, feed: MusicFeed) {
        musicCatalog = catalog; musicFeed = feed
    }
    var currentTrack:""")
    session.write_text(session_source)
    # System accessibility values are read-only. A verification-only environment
    # switch exercises the same solid queue branch without changing user settings.
    player = Path(directory) / "RoomPlayerViews.swift"
    player_source = (sources / "Features/Room/RoomPlayerViews.swift").read_text()
    player_source = player_source.replace("    private var shape: RoundedRectangle", "    @Environment(\\.queueReviewOpaque) private var reviewOpaque\n    private var shape: RoundedRectangle")
    player_source = player_source.replace("if reduceTransparency || contrast == .increased {", "if reduceTransparency || contrast == .increased || reviewOpaque {")
    player_source += """
private struct QueueReviewOpaqueKey: EnvironmentKey { static let defaultValue = false }
extension EnvironmentValues {
    var queueReviewOpaque: Bool {
        get { self[QueueReviewOpaqueKey.self] }
        set { self[QueueReviewOpaqueKey.self] = newValue }
    }
}
"""
    player.write_text(player_source)
    files = [*sorted(p for p in sources.rglob("*.swift") if p.name not in ["SyncBeatsApp.swift", "RoomSession.swift", "RoomPlayerViews.swift"]), session, player]
    contents = Path(directory) / "LayoutReview.app" / "Contents"
    binary = contents / "MacOS" / "render-native-layouts"
    binary.parent.mkdir(parents=True)
    resources = contents / "Resources"
    resources.mkdir()
    assets = products / "Syncbeats.app/Contents/Resources/Assets.car"
    if assets.exists():
        shutil.copy2(assets, resources / "Assets.car")
    subprocess.run(["swiftc", "-swift-version", "5", "-default-isolation", "MainActor", "-I", str(products),
                    *map(str, files), str(derived), str(verification / "RenderNativeLayouts.swift"),
                    str(verification / "RoomFixtures.swift"), *map(str, package_objects), "-lz",
                    "-o", str(binary)], check=True)
    environment = dict(os.environ, SYNCBEATS_COVER_FIXTURES=str(verification / "cover-fixtures.json"))
    subprocess.run([str(binary), *sys.argv[1:]], env=environment, check=True)
