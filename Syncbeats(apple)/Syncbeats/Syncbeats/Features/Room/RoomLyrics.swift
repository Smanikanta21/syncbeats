import Foundation
import Observation

nonisolated struct NativeLyricLine: Identifiable, Equatable, Sendable {
    let id: Int
    let time: Double
    let text: String
}

nonisolated enum NativeLRC {
    // LRCLIB supplies line timing. Character timing is a visual estimate between lines.
    static func fillProgress(line: NativeLyricLine, nextTime: Double?, position: Double, duration: Double?) -> Double {
        guard !line.text.isEmpty, position.isFinite else { return 0 }
        let end = nextTime ?? duration ?? (line.time + 5)
        guard end > line.time else { return position >= line.time ? 1 : 0 }
        return min(1, max(0, (position - line.time) / (end - line.time)))
    }
    static func parse(_ source: String) -> [NativeLyricLine] {
        let pattern = try! NSRegularExpression(pattern: #"\[(\d+):(\d+(?:\.\d+)?)\]"#)
        let offsetPattern = try! NSRegularExpression(pattern: #"\[offset:([+-]?\d+)\]"#, options: .caseInsensitive)
        let fullRange = NSRange(source.startIndex..., in: source)
        let offset = offsetPattern.firstMatch(in: source, range: fullRange).flatMap {
            Range($0.range(at: 1), in: source).flatMap { Double(source[$0]) }
        }.map { $0 / 1000 } ?? 0
        var rows: [(Double, String)] = []
        for raw in source.components(separatedBy: .newlines) {
            let matches = pattern.matches(in: raw, range: NSRange(raw.startIndex..., in: raw))
            guard let last = matches.last, let end = Range(last.range, in: raw)?.upperBound else { continue }
            let text = raw[end...].trimmingCharacters(in: .whitespacesAndNewlines)
            for match in matches {
                guard let minuteRange = Range(match.range(at: 1), in: raw), let secondRange = Range(match.range(at: 2), in: raw),
                      let minutes = Double(raw[minuteRange]), let seconds = Double(raw[secondRange]) else { continue }
                rows.append((max(0, minutes * 60 + seconds + offset), text))
            }
        }
        return rows.sorted { $0.0 < $1.0 }.enumerated().map { NativeLyricLine(id: $0.offset, time: $0.element.0, text: $0.element.1) }
    }
}

nonisolated struct NativeLyricsResult: Decodable, Sendable {
    let trackName: String?
    let artistName: String?
    let duration: Double?
    let instrumental: Bool?
    let plainLyrics: String?
    let syncedLyrics: String?
}

nonisolated enum NativeLyricsChoice {
    private static func words(_ value: String) -> Set<String> {
        Set(value.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: .current)
            .components(separatedBy: CharacterSet.alphanumerics.inverted).filter { !$0.isEmpty })
    }
    static func best(_ results: [NativeLyricsResult], title: String, artist: String, duration: Double?) -> NativeLyricsResult? {
        let titleWords = words(title), artistWords = words(artist)
        guard !titleWords.isEmpty else { return nil }
        return results.compactMap { result -> (NativeLyricsResult, Double)? in
            let candidate = words(result.trackName ?? "")
            let titleScore = Double(titleWords.intersection(candidate).count) / Double(max(titleWords.count, candidate.count, 1))
            guard titleScore >= 0.65 else { return nil }
            let candidateArtist = words(result.artistName ?? "")
            let artistScore = artistWords.isEmpty ? 1 : Double(artistWords.intersection(candidateArtist).count) / Double(max(artistWords.count, 1))
            guard artistScore >= 0.5 else { return nil }
            let delta = duration.flatMap { d in result.duration.map { abs(d - $0) } } ?? 0
            guard delta <= 30 else { return nil }
            return (result, titleScore * 5 + artistScore * 3 - delta / 30 + ((result.syncedLyrics?.isEmpty == false) ? 0.5 : 0))
        }.max { $0.1 < $1.1 }?.0
    }
}

@MainActor @Observable final class RoomLyrics {
    enum State { case loading, synced, plain, instrumental, unavailable, failed }
    private(set) var state: State = .unavailable
    private(set) var lines: [NativeLyricLine] = []
    private(set) var plain = ""
    private(set) var resolvedArtist = ""
    @ObservationIgnored private let session: URLSession
    @ObservationIgnored private var generation = UUID()
    init(session: URLSession = .shared) { self.session = session }

    func load(track: RoomTrack?, duration: Double?) async {
        let id = UUID(); generation = id; lines = []; plain = ""; resolvedArtist = ""
        guard let track else { state = .unavailable; return }
        state = .loading
        var identity = track.artworkRequest
        if let enriched = await AlbumArtworkResolver.shared.resolvedIdentity(for: identity) { identity = enriched }
        guard generation == id, !Task.isCancelled else { return }
        let title = AlbumArtworkRequest.cleanTitle(identity.title)
        let artist = identity.artist.replacingOccurrences(of: " - Topic", with: "", options: .caseInsensitive)
        resolvedArtist = artist
        var url = URLComponents(string: "https://lrclib.net/api/search")!
        url.queryItems = [URLQueryItem(name: "q", value: [artist, title].filter { !$0.isEmpty }.joined(separator: " "))]
        var request = URLRequest(url: url.url!); request.timeoutInterval = 15
        request.setValue("SyncBeats macOS", forHTTPHeaderField: "User-Agent")
        do {
            let (data, response) = try await session.data(for: request)
            guard generation == id, !Task.isCancelled else { return }
            guard let response = response as? HTTPURLResponse, (200..<300).contains(response.statusCode) else { state = .failed; return }
            let results = try JSONDecoder().decode([NativeLyricsResult].self, from: data)
            guard let best = NativeLyricsChoice.best(results, title: title, artist: artist, duration: duration) else { state = .unavailable; return }
            if best.instrumental == true { state = .instrumental; return }
            lines = NativeLRC.parse(best.syncedLyrics ?? "")
            if !lines.isEmpty { state = .synced }
            else if let text = best.plainLyrics, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { plain = text; state = .plain }
            else { state = .unavailable }
        } catch {
            if generation == id, !Task.isCancelled { state = .failed }
        }
    }
}
