import AVFoundation
import Foundation

/// Release-mode component timings, not an FPS, battery, or device sync test.
@main struct NativePerformanceVerification {
    @MainActor static func main() throws {
        var results: [[String: Any]] = []
        var checksum = 0.0
        func measure(_ name: String, iterations: Int, operation: () -> Double) {
            var milliseconds: [Double] = []
            for _ in 0..<3 { checksum += operation() }
            for _ in 0..<iterations {
                let start = DispatchTime.now().uptimeNanoseconds
                checksum += operation()
                milliseconds.append(Double(DispatchTime.now().uptimeNanoseconds - start) / 1_000_000)
            }
            milliseconds.sort()
            results.append([
                "operation": name, "iterations": iterations,
                "median_ms": milliseconds[milliseconds.count / 2],
                "p95_ms": milliseconds[min(milliseconds.count - 1, Int(ceil(Double(milliseconds.count) * 0.95)) - 1)],
                "max_ms": milliseconds.last!,
                "mean_ms": milliseconds.reduce(0, +) / Double(milliseconds.count)
            ])
        }

        for rate in [44_100.0, 48_000.0, 96_000.0] {
            let format = AVAudioFormat(standardFormatWithSampleRate: rate, channels: 2)!
            let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 2048)!
            buffer.frameLength = 2048
            for channel in 0..<2 {
                for frame in 0..<2048 {
                    buffer.floatChannelData![channel][frame] = Float(0.2 * sin(2 * .pi * 3000 * Double(frame) / rate))
                }
            }
            let meter = AudioEnergyMeter()
            for _ in 0..<100 { meter.consume(buffer) }
            measure("audio_meter_2048_stereo_\(Int(rate))hz", iterations: 2000) {
                meter.consume(buffer)
                return meter.read().level
            }
            results[results.count - 1]["buffer_duration_ms"] = 2048 / rate * 1000
        }

        for count in [100, 1000, 10_000] {
            let songs = (0..<count).map { index in
                NativeLibrarySong(id: "apple:\(index)", title: "Song \(count - index)", artist: "Artist \(index % 100)",
                                  album: "Album \(index % 500)", source: "APPLE_MUSIC")
            }
            measure("library_deduplicate_\(count)", iterations: 15) {
                Double(NativeLibraryCollection.songs(playlists: [], imported: songs + songs).count)
            }
            measure("library_title_sort_\(count)", iterations: 15) {
                Double(songs.sorted { $0.title.localizedStandardCompare($1.title) == .orderedAscending }.first!.title.count)
            }
            measure("library_album_groups_\(count)", iterations: 15) {
                Double(NativeLibraryCollection.albums(songs).count)
            }
            measure("library_artist_groups_\(count)", iterations: 15) {
                Double(NativeLibraryCollection.artists(songs).count)
            }
            measure("library_import_merge_\(count)", iterations: 5) {
                var library = NativeImportedLibrary()
                library.merge(songs: songs, playlists: [])
                return Double(library.songs.count)
            }
        }
        let payload: [String: Any] = [
            "scope": "macOS optimized component benchmark; synthetic audio and library data",
            "checksum": checksum, "results": results
        ]
        let data = try JSONSerialization.data(withJSONObject: payload, options: [.prettyPrinted, .sortedKeys])
        FileHandle.standardOutput.write(data)
        FileHandle.standardOutput.write(Data("\n".utf8))
    }
}
