import Foundation
import AVFoundation
import Observation

/// A single track the engine can play. Kept lightweight so any view
/// (Songs, Playlist, Island) can build one from what it already has.
struct PlayableTrack: Identifiable, Equatable {
    let id: String            // youtubeId — also the stream key
    let title: String
    let artist: String
    let artworkURL: URL?
    let queueItemId: String?

    init(id: String, title: String, artist: String, artworkURL: URL?, queueItemId: String? = nil) {
        self.id = id
        self.title = title
        self.artist = artist
        self.artworkURL = artworkURL
        self.queueItemId = queueItemId
    }

    static func == (lhs: PlayableTrack, rhs: PlayableTrack) -> Bool { lhs.id == rhs.id }
}

/// Shared audio engine. One AVPlayer instance drives BOTH the in-window
/// NowPlayingBar and the Dynamic Island mini/full player, so they always
/// reflect the same state — tap play anywhere, both surfaces update.
///
/// Audio source: the backend's `GET /search/youtube/download?videoId=<id>`
/// endpoint, which yt-dlp's into a cached, range-streamable .m4a.
@MainActor
@Observable
final class PlayerEngine {
    static let shared = PlayerEngine()

    // Emitted the first time a track starts, so the AppKit island can reveal itself.
    static let didStartPlayingNotification = Notification.Name("PlayerEngineDidStartPlaying")

    // MARK: - Observable state (views read these directly)
    private(set) var current: PlayableTrack?
    private(set) var isPlaying = false
    private(set) var isLoading = false
    private(set) var currentTime: Double = 0     // seconds
    private(set) var duration: Double = 0        // seconds

    /// The active queue and where we are in it (drives next/prev + auto-advance).
    private(set) var queue: [PlayableTrack] = []
    private(set) var index: Int = 0

    /// 0...1 output volume, shared by every surface (NowPlayingBar + Island).
    var volume: Double = 0.8 {
        didSet { player.volume = Float(min(max(volume, 0), 1)) }
    }

    var hasTrack: Bool { current != nil }

    /// Returns true if the engine or current room is buffering, loading, or waiting for room readiness.
    var isBuffering: Bool {
        if isLoading { return true }
        if let item = player.currentItem {
            if item.isPlaybackBufferEmpty && !item.isPlaybackLikelyToKeepUp {
                return true
            }
        }
        if RoomSocket.shared.isInRoom {
            let hasUnreadyParticipants = RoomSocket.shared.participants.contains { !$0.isReady }
            if hasUnreadyParticipants { return true }
            if let epoch = roomStartEpochMs {
                let now = Date().timeIntervalSince1970 * 1000 + (RoomSocket.shared.clockOffset)
                if epoch > now { return true }
            }
        }
        return false
    }

    /// 0...1 fraction for seek sliders; safe when duration is unknown.
    var progress: Double {
        get { duration > 0 ? min(max(currentTime / duration, 0), 1) : 0 }
        set { seek(toFraction: newValue) }
    }

    var canGoNext: Bool { index + 1 < queue.count }
    var canGoPrev: Bool { index > 0 || currentTime > 3 }

    // MARK: - AVPlayer internals
    private let player = AVPlayer()
    private var timeObserver: Any?
    private var endObserver: NSObjectProtocol?
    private var statusObservation: NSKeyValueObservation?

    /// Base URL for the stream endpoint. Mirrors APIClient so a prod switch is one line.
    private var streamBase: String { APIClient.shared.baseURL }

    private init() {
        player.automaticallyWaitsToMinimizeStalling = true
        player.volume = Float(volume)
        addPeriodicObserver()
    }

    // MARK: - Public transport

    /// Play a single track, replacing the queue with just that track.
    func play(_ track: PlayableTrack) {
        play(queue: [track], startAt: 0)
    }

    /// Sets the engine to a loading state with metadata for resolving a track.
    func setPlaceholderLoading(title: String, artist: String, artworkURL: URL?) {
        print("[PlayerEngine] setPlaceholderLoading for: \(title)")
        current = PlayableTrack(id: "", title: title, artist: artist, artworkURL: artworkURL)
        currentTime = 0
        duration = 0
        isLoading = true
        isPlaying = false
        NotificationCenter.default.post(name: Self.didStartPlayingNotification, object: nil)
    }

    /// Clears the resolve placeholder loading state if we failed to resolve.
    func clearPlaceholderLoading() {
        if isLoading && current?.id == "" {
            print("[PlayerEngine] clearPlaceholderLoading")
            isLoading = false
            current = nil
        }
    }

    /// Play a list starting at `startAt`. This is what "Play All" / row taps use.
    func play(queue newQueue: [PlayableTrack], startAt: Int) {
        print("[PlayerEngine] play(queue:startAt:) called — queue size: \(newQueue.count), startAt: \(startAt)")
        guard !newQueue.isEmpty, startAt >= 0, startAt < newQueue.count else {
            print("[PlayerEngine] Guard failed — newQueue.isEmpty=\(newQueue.isEmpty), startAt=\(startAt), count=\(newQueue.count)")
            return
        }
        if RoomSocket.shared.isInRoom {
            let track = newQueue[startAt]
            if let queueItemId = track.queueItemId {
                print("[PlayerEngine] In room mode — jumping to queue item: \(queueItemId)")
                RoomSocket.shared.jumpToQueueItem(trackId: queueItemId)
            } else {
                print("[PlayerEngine] In room mode — scheduling playback for: \(track.title)")
                let thumb = track.artworkURL?.absoluteString ?? "https://i.ytimg.com/vi/\(track.id)/hqdefault.jpg"
                RoomSocket.shared.schedulePlayback(
                    trackUrl: "youtube:\(track.id)",
                    title: track.title,
                    artist: track.artist,
                    thumbnail: thumb
                )
            }
            return
        }
        queue = newQueue
        index = startAt
        loadCurrent(autoPlay: true)
    }

    func removeFromLocalQueue(trackId: String) {
        self.queue.removeAll { $0.id == trackId }
        if self.current?.id == trackId {
            if !self.queue.isEmpty {
                self.current = self.queue[0]
                loadCurrent(autoPlay: isPlaying)
            } else {
                self.current = nil
                player.pause()
                isPlaying = false
            }
        }
    }

    func togglePlayPause() {
        guard hasTrack else { return }
        isPlaying ? pause() : resume()
    }

    func resume() {
        guard hasTrack else { print("[PlayerEngine] resume() — no track loaded"); return }
        // In a room, transport round-trips through the server: emit the command and
        // wait for the authoritative playback:schedule to actually start audio.
        if RoomSocket.shared.isInRoom {
            RoomSocket.shared.play()
            return
        }
        print("[PlayerEngine] resume")
        player.play()
        isPlaying = true
    }

    func pause() {
        if RoomSocket.shared.isInRoom {
            RoomSocket.shared.pause(positionMs: Int(currentTime * 1000))
            return
        }
        print("[PlayerEngine] pause")
        player.pause()
        isPlaying = false
    }

    /// Stops playback and wipes all track/queue state. Called when a room:reset event arrives.
    func resetForRoom() {
        print("[PlayerEngine] resetForRoom — clearing all state")
        player.pause()
        player.replaceCurrentItem(with: nil)
        queue        = []
        index        = 0
        current      = nil
        isPlaying    = false
        isLoading    = false
        currentTime  = 0
        duration     = 0
        didPrefetchNext = false
    }

    func next() {
        if RoomSocket.shared.isInRoom {
            RoomSocket.shared.nextTrack()
            return
        }
        guard canGoNext else { return }
        index += 1
        loadCurrent(autoPlay: true)
    }

    /// Prev restarts the current track if we're >3s in (standard player UX),
    /// otherwise steps back one.
    func prev() {
        if RoomSocket.shared.isInRoom {
            RoomSocket.shared.prevTrack()
            return
        }
        if currentTime > 3 {
            seek(to: 0)
            return
        }
        guard index > 0 else { seek(to: 0); return }
        index -= 1
        loadCurrent(autoPlay: true)
    }

    func seek(toFraction f: Double) {
        guard duration > 0 else { return }
        seek(to: f * duration)
    }

    func seek(to seconds: Double) {
        let clamped = max(0, min(seconds, duration > 0 ? duration : seconds))
        if RoomSocket.shared.isInRoom {
            // Seek is authoritative on the server; emit and let playback:schedule apply it.
            RoomSocket.shared.seek(positionMs: Int(clamped * 1000))
            return
        }
        let target = CMTime(seconds: clamped, preferredTimescale: 600)
        player.seek(to: target, toleranceBefore: .zero, toleranceAfter: .zero)
        currentTime = clamped
    }

    // MARK: - Loading

    private func loadCurrent(autoPlay: Bool) {
        guard index >= 0, index < queue.count else {
            print("[PlayerEngine] loadCurrent — index \(index) out of bounds (queue: \(queue.count))")
            return
        }
        let track = queue[index]
        print("[PlayerEngine] loadCurrent — '\(track.title)' by \(track.artist) [youtubeId: \(track.id)]")
        current = track
        currentTime = 0
        duration = 0
        isLoading = true
        didPrefetchNext = false

        guard let url = resolveAudioURL(from: track.id) else {
            print("[PlayerEngine] resolveAudioURL returned nil for id: \(track.id)")
            isLoading = false
            return
        }

        // Enrich track with local artwork and metadata if available on Mac disk
        let localArt = findLocalArtwork(for: track.id)
        let (localTitle, localArtist) = (url.isFileURL ? extractEmbeddedMetadata(from: url) : (nil, nil))
        let finalTitle = localTitle ?? track.title
        let finalArtist = localArtist ?? track.artist
        let finalArt = localArt ?? track.artworkURL
        current = PlayableTrack(id: track.id, title: finalTitle, artist: finalArtist, artworkURL: finalArt)

        print("[PlayerEngine] Streaming URL: \(url.absoluteString)")
        let item = AVPlayerItem(url: url)
        observe(item)
        currentLoadedURL = url   // mark as loaded so applyRoomSchedule skips re-loading
        player.replaceCurrentItem(with: item)

        if RoomSocket.shared.isInRoom {
            // Send canonical youtube:ID format — not the raw HTTP streaming URL —
            // so all web/mobile clients can match it against queue items for the correct title.
            let canonicalTrackUrl = "youtube:\(track.id)"
            let thumb = finalArt?.absoluteString ?? "https://i.ytimg.com/vi/\(track.id)/hqdefault.jpg"
            print("[PlayerEngine] In room — scheduling playback via RoomSocket for trackUrl: \(canonicalTrackUrl)")
            RoomSocket.shared.schedulePlayback(
                trackUrl: canonicalTrackUrl,
                title: finalTitle,
                artist: finalArtist,
                thumbnail: thumb
            )
        } else if autoPlay {
            player.play()
            isPlaying = true
            print("[PlayerEngine] player.play() called locally")
        }

        print("[PlayerEngine] posting didStartPlayingNotification")
        NotificationCenter.default.post(name: Self.didStartPlayingNotification, object: nil)
    }

    private func streamURL(for videoId: String) -> URL? {
        guard let encoded = videoId.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) else {
            return nil
        }
        return URL(string: "\(streamBase)/search/youtube/download?videoId=\(encoded)")
    }

    // MARK: - Observation

    private func observe(_ item: AVPlayerItem) {
        item.audioTimePitchAlgorithm = .timeDomain
        statusObservation?.invalidate()
        statusObservation = item.observe(\.status, options: [.new]) { [weak self] item, _ in
            Task { @MainActor in
                guard let self else { return }
                switch item.status {
                case .readyToPlay:
                    let d = item.duration.seconds
                    print("[PlayerEngine] AVPlayerItem.readyToPlay — duration: \(d)s")
                    if d.isFinite, d > 0 { self.duration = d }
                    self.isLoading = false
                    RoomSocket.shared.setReady(true)
                case .failed:
                    print("[PlayerEngine] AVPlayerItem.failed — error: \(item.error?.localizedDescription ?? "unknown")")
                    self.isLoading = false
                    self.isPlaying = false
                case .unknown:
                    print("[PlayerEngine] AVPlayerItem.unknown status")
                @unknown default:
                    break
                }
            }
        }

        if let endObserver { NotificationCenter.default.removeObserver(endObserver) }
        endObserver = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime,
            object: item,
            queue: .main
        ) { [weak self] _ in
            print("[PlayerEngine] Track ended")
            Task { @MainActor in self?.handleTrackEnded() }
        }
    }

    // Track whether we already triggered prefetch for the current track
    private var didPrefetchNext = false

    private func addPeriodicObserver() {
        let interval = CMTime(seconds: 0.25, preferredTimescale: 600)
        timeObserver = player.addPeriodicTimeObserver(forInterval: interval, queue: .main) { [weak self] time in
            Task { @MainActor in
                guard let self else { return }
                let t = time.seconds
                if t.isFinite { self.currentTime = t }
                // Duration can arrive late for streamed items; keep it fresh.
                if self.duration == 0, let d = self.player.currentItem?.duration.seconds,
                   d.isFinite, d > 0 {
                    self.duration = d
                }

                // Smart prefetch: when ~30s remain, pre-download the next song
                if self.duration > 0, !self.didPrefetchNext, self.canGoNext {
                    let remaining = self.duration - self.currentTime
                    if remaining < 30 && remaining > 0 {
                        self.didPrefetchNext = true
                        let nextTrack = self.queue[self.index + 1]
                        print("[PlayerEngine] Prefetching next track: '\(nextTrack.title)'")
                        self.prefetchTrack(nextTrack)
                    }
                }
            }
        }
    }

    /// Fire-and-forget prefetch request to the server so it starts downloading
    /// the next song's audio file in the background.
    private func prefetchTrack(_ track: PlayableTrack) {
        let cleanId = extractIdFromTrackUrl(track.id)
        guard !cleanId.isEmpty && cleanId.count >= 11 else { return }
        guard let url = URL(string: "\(streamBase)/search/youtube/prefetch") else { return }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let token = APIClient.shared.token {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        request.httpBody = try? JSONSerialization.data(withJSONObject: ["videoId": cleanId])

        URLSession.shared.dataTask(with: request) { _, _, error in
            if let error {
                print("[PlayerEngine] Prefetch request failed: \(error.localizedDescription)")
            } else {
                print("[PlayerEngine] Prefetch request sent for \(track.id)")
            }
        }.resume()
    }

    private func handleTrackEnded() {
        print("[PlayerEngine] handleTrackEnded — canGoNext: \(canGoNext)")
        if RoomSocket.shared.isInRoom {
            // In a room the server owns track advancement; notify it that this track ended.
            let canonicalUrl = current.map { "youtube:\($0.id)" } ?? ""
            RoomSocket.shared.notifyTrackEnded(trackUrl: canonicalUrl)
            return
        }
        if canGoNext {
            next()
        } else {
            isPlaying = false
            seek(to: 0)
            pause()
        }
    }

    // MARK: - Room sync (server-authoritative timeline)
    //
    // These are called by RoomSocket when the server broadcasts timeline events.
    // They drive the AVPlayer *directly* — bypassing the room-routing guards in
    // resume()/pause()/seek() — because they are applying decisions the server
    // already made, not originating new commands.

    /// Server-derived timeline for the active track. Position is computed as
    /// `expected = (serverNow - startEpoch) / 1000` while `isPlaying`.
    private var roomStartEpochMs: Double? = nil
    private var roomIsPlaying = false
    private var driftTimer: Timer?

    /// Threshold beyond which we hard-seek to re-align with the server timeline.
    private let driftHardSeekMs: Double = 3000
    private var lastHardSeekTime: Date = .distantPast

    private var currentLoadedURL: URL? = nil

    private func extractIdFromTrackUrl(_ urlString: String) -> String {
        let decoded = urlString.removingPercentEncoding ?? urlString
        
        // 1. If it contains a youtube watch URL
        if decoded.contains("youtube.com/watch") {
            if let url = URL(string: decoded.hasPrefix("http") ? decoded : "https://\(decoded)"),
               let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
               let videoId = components.queryItems?.first(where: { $0.name == "v" })?.value {
                return videoId.components(separatedBy: "_").first ?? videoId
            }
        } else if decoded.contains("youtu.be/") {
            let parts = decoded.components(separatedBy: "youtu.be/")
            if parts.count > 1, let firstSegment = parts[1].components(separatedBy: "/").first?.components(separatedBy: "?").first {
                if firstSegment.count >= 11 {
                    return String(firstSegment.prefix(11))
                }
                return firstSegment
            }
        }

        var clean = decoded.components(separatedBy: "?").first?.components(separatedBy: "&").first ?? decoded
        
        let prefixes = ["youtube:", "spotify-lazy:", "ws-p2p:yt:", "ws-p2p:"]
        for prefix in prefixes {
            if clean.hasPrefix(prefix) {
                clean = String(clean.dropFirst(prefix.count))
                break
            }
        }
        
        // Clean could be a 11-character YouTube ID optionally followed by _TIMESTAMP
        if clean.count >= 11 {
            let possibleYtId = String(clean.prefix(11))
            let allowed = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_")
            if CharacterSet(charactersIn: possibleYtId).isSubset(of: allowed) {
                let remainder = String(clean.dropFirst(11))
                if remainder.isEmpty || remainder.hasPrefix("_") {
                    return possibleYtId
                }
            }
        }

        // Fallback: strip timestamp if present
        if clean.contains("_") {
            let parts = clean.components(separatedBy: "_")
            if parts.count > 1, let last = parts.last, last.count >= 9, Int64(last) != nil {
                clean = clean.components(separatedBy: "_\(last)").first ?? clean
            }
        }
        
        return clean.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func resolveAudioURL(from trackUrl: String) -> URL? {
        let cleanId = extractIdFromTrackUrl(trackUrl)

        // 1. Check if locally downloaded file exists on Mac filesystem
        if !cleanId.isEmpty {
            let fileManager = FileManager.default
            let possiblePaths: [URL] = [
                fileManager.urls(for: .cachesDirectory, in: .userDomainMask).first?.appendingPathComponent("Syncbeats/\(cleanId).m4a"),
                fileManager.urls(for: .downloadsDirectory, in: .userDomainMask).first?.appendingPathComponent("Syncbeats/\(cleanId).m4a"),
                fileManager.urls(for: .documentDirectory, in: .userDomainMask).first?.appendingPathComponent("Syncbeats/\(cleanId).m4a")
            ].compactMap { $0 }

            for localURL in possiblePaths {
                if fileManager.fileExists(atPath: localURL.path) {
                    print("[PlayerEngine] Found locally downloaded file on Mac: \(localURL.path)")
                    return localURL
                }
            }
        }

        // 2. Direct HTTP/HTTPS URLs
        if trackUrl.hasPrefix("http://") || trackUrl.hasPrefix("https://") {
            return URL(string: trackUrl)
        }

        // 3. Fallback to server audio streaming & DB download endpoint
        if !cleanId.isEmpty && cleanId.count >= 11 {
            guard let encoded = cleanId.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) else {
                return nil
            }
            return URL(string: "\(streamBase)/search/youtube/download?videoId=\(encoded)")
        }

        return URL(string: trackUrl)
    }

    /// Check if a local artwork file exists on disk, or extract embedded artwork from a local audio file.
    func findLocalArtwork(for cleanId: String) -> URL? {
        guard !cleanId.isEmpty else { return nil }
        let fileManager = FileManager.default
        let searchDirs: [URL] = [
            fileManager.urls(for: .cachesDirectory, in: .userDomainMask).first?.appendingPathComponent("Syncbeats"),
            fileManager.urls(for: .downloadsDirectory, in: .userDomainMask).first?.appendingPathComponent("Syncbeats"),
            fileManager.urls(for: .documentDirectory, in: .userDomainMask).first?.appendingPathComponent("Syncbeats")
        ].compactMap { $0 }

        for dir in searchDirs {
            // 1. Check for standalone image files (cleanId.jpg, cleanId.png, etc.)
            let extensions = ["jpg", "jpeg", "png", "webp"]
            for ext in extensions {
                let imgURL = dir.appendingPathComponent("\(cleanId).\(ext)")
                if fileManager.fileExists(atPath: imgURL.path) {
                    return imgURL
                }
                let altImgURL = dir.appendingPathComponent("\(cleanId)_artwork.\(ext)")
                if fileManager.fileExists(atPath: altImgURL.path) {
                    return altImgURL
                }
            }

            // 2. If audio file exists, extract embedded artwork from AVAsset metadata
            let audioURL = dir.appendingPathComponent("\(cleanId).m4a")
            if fileManager.fileExists(atPath: audioURL.path) {
                let targetImgURL = dir.appendingPathComponent("\(cleanId).jpg")
                if fileManager.fileExists(atPath: targetImgURL.path) {
                    return targetImgURL
                }
                if let extractedURL = extractEmbeddedArtwork(from: audioURL, saveTo: targetImgURL) {
                    return extractedURL
                }
            }
        }
        return nil
    }

    private func extractEmbeddedArtwork(from audioURL: URL, saveTo targetImgURL: URL) -> URL? {
        let asset = AVAsset(url: audioURL)
        for item in asset.metadata {
            if let commonKey = item.commonKey?.rawValue,
               commonKey == AVMetadataKey.commonKeyArtwork.rawValue,
               let data = item.dataValue {
                do {
                    try data.write(to: targetImgURL)
                    print("[PlayerEngine] Extracted embedded artwork from local m4a: \(targetImgURL.path)")
                    return targetImgURL
                } catch {
                    print("[PlayerEngine] Failed to write extracted artwork: \(error)")
                }
            }
        }
        return nil
    }

    private func extractEmbeddedMetadata(from audioURL: URL) -> (title: String?, artist: String?) {
        let asset = AVAsset(url: audioURL)
        var title: String? = nil
        var artist: String? = nil
        for item in asset.metadata {
            if let commonKey = item.commonKey?.rawValue {
                if commonKey == AVMetadataKey.commonKeyTitle.rawValue {
                    title = item.stringValue
                } else if commonKey == AVMetadataKey.commonKeyArtist.rawValue {
                    artist = item.stringValue
                }
            }
        }
        return (title, artist)
    }

    /// Apply a `playback:schedule` event: align to the shared timeline and start
    /// playing at the moment `startEpoch` says we should.
    func applyRoomSchedule(startEpochMs: Double, fromPositionSec: Double, trackUrl: String?, clockOffsetMs: Double, title: String? = nil, artist: String? = nil, thumbnail: String? = nil) {
        roomStartEpochMs = startEpochMs
        roomIsPlaying = true
        isPlaying = true
        isLoading = false

        let cleanId = trackUrl != nil ? extractIdFromTrackUrl(trackUrl!) : ""

        // Resolve artwork URL: prioritize local artwork first, then server-provided thumbnail, then existing
        let artworkURL: URL? = {
            if let localArt = self.findLocalArtwork(for: cleanId) { return localArt }
            if let thumb = thumbnail, let url = URL(string: thumb) { return url }
            if let match = self.queue.first(where: { $0.id == cleanId }), let art = match.artworkURL { return art }
            if let existing = self.current?.artworkURL { return existing }
            if !cleanId.isEmpty && cleanId.count >= 11 {
                return URL(string: "https://i.ytimg.com/vi/\(cleanId)/hqdefault.jpg")
            }
            return nil
        }()

        // Update current track metadata (with local metadata enrichment if local file exists)
        if let trackUrl {
            var finalTitle = title
            var finalArtist = artist
            if let localURL = resolveAudioURL(from: trackUrl), localURL.isFileURL {
                let (metaTitle, metaArtist) = extractEmbeddedMetadata(from: localURL)
                if let mt = metaTitle, !mt.isEmpty, (finalTitle == nil || finalTitle == "Room Audio" || finalTitle == "Unknown Track") {
                    finalTitle = mt
                }
                if let ma = metaArtist, !ma.isEmpty, (finalArtist == nil || finalArtist == "SyncBeats Room" || finalArtist == "Unknown Artist") {
                    finalArtist = ma
                }
            }

            // If the passed title/artist is placeholder or generic, try to find a better match in the queue
            let isTitlePlaceholder = finalTitle == nil || finalTitle == "Room Audio" || finalTitle == "Unknown Track" || finalTitle == "Track"
            let isArtistPlaceholder = finalArtist == nil || finalArtist == "SyncBeats Room" || finalArtist == "Unknown Artist" || finalArtist == ""
            if (isTitlePlaceholder || isArtistPlaceholder), let match = self.queue.first(where: { $0.id == cleanId }) {
                if isTitlePlaceholder { finalTitle = match.title }
                if isArtistPlaceholder { finalArtist = match.artist }
            }

            if let t = finalTitle, let a = finalArtist {
                self.current = PlayableTrack(id: cleanId, title: t, artist: a, artworkURL: artworkURL)
            } else if let match = self.queue.first(where: { $0.id == cleanId }) {
                self.current = PlayableTrack(id: cleanId, title: match.title, artist: match.artist, artworkURL: artworkURL ?? match.artworkURL)
            } else if self.current?.id != cleanId {
                self.current = PlayableTrack(id: cleanId, title: "Room Audio", artist: "SyncBeats Room", artworkURL: artworkURL)
            }
        }

        // Load new audio item if trackUrl changed or isn't loaded yet
        if let trackUrl, let resolvedURL = resolveAudioURL(from: trackUrl), resolvedURL != currentLoadedURL {
            print("[PlayerEngine] applyRoomSchedule — loading resolved URL: \(resolvedURL.absoluteString)")
            isLoading = true
            currentLoadedURL = resolvedURL
            let item = AVPlayerItem(url: resolvedURL)
            observe(item)
            player.replaceCurrentItem(with: item)
        }

        let serverNow = Date().timeIntervalSince1970 * 1000 + clockOffsetMs
        let expected = max(0, (serverNow - startEpochMs) / 1000)

        // If startEpoch is in the future, wait until then; otherwise start now at `expected`.
        let leadMs = startEpochMs - serverNow
        if leadMs > 0 {
            localSeek(to: fromPositionSec)
            player.pause()
            DispatchQueue.main.asyncAfter(deadline: .now() + leadMs / 1000) { [weak self] in
                guard let self, self.roomIsPlaying else { return }
                print("[PlayerEngine] Scheduled epoch arrived — calling player.play()")
                self.player.play()
            }
        } else {
            localSeek(to: expected)
            player.play()
        }
        startDriftLoop(clockOffsetMs: clockOffsetMs)

        // Post notification so WindowManager expands the island
        NotificationCenter.default.post(name: Self.didStartPlayingNotification, object: nil)
    }

    /// Apply a `playback:pause` event.
    func applyRoomPause(pauseOffsetSec: Double) {
        roomStartEpochMs = nil
        roomIsPlaying = false
        isPlaying = false
        stopDriftLoop()
        localSeek(to: pauseOffsetSec)
        player.pause()
    }

    /// Reconcile and update the queue array from a list of raw queue items
    func updateRoomQueue(_ rawQueue: [[String: Any]]) {
        var roomQueue: [PlayableTrack] = []
        for item in rawQueue {
            let itemUrl = (item["trackUrl"] as? String) ?? ""
            let cleanId = extractIdFromTrackUrl(itemUrl)
            let title = (item["title"] as? String) ?? "Unknown Track"
            let artist = (item["artist"] as? String) ?? "Unknown Artist"
            let thumbStr = item["thumbnail"] as? String
            let queueItemId = item["id"] as? String
            
            // Prioritize local artwork if available on Mac disk
            let localArt = findLocalArtwork(for: cleanId)
            let thumbURL = localArt ?? (thumbStr != nil ? URL(string: thumbStr!) : nil)
            
            roomQueue.append(PlayableTrack(id: cleanId, title: title, artist: artist, artworkURL: thumbURL, queueItemId: queueItemId))
        }
        self.queue = roomQueue
    }

    /// Apply a full `room:snapshot` / `room:stateChanged` — reconcile play state and room track info.
    func applyRoomSnapshot(_ dict: [String: Any], clockOffsetMs: Double) {
        let playing = (dict["isPlaying"] as? Bool) ?? false
        let startEpoch = (dict["startEpoch"] as? NSNumber)?.doubleValue
        let pauseOffset = (dict["pauseOffset"] as? NSNumber)?.doubleValue ?? 0
        let trackUrl = dict["trackUrl"] as? String

        // Reconcile room queue if present in snapshot
        if let rawQueue = dict["queue"] as? [[String: Any]], !rawQueue.isEmpty {
            updateRoomQueue(rawQueue)

            // Find current track in queue
            if let curItem = rawQueue.first(where: { ($0["isCurrent"] as? Bool) == true }) ?? rawQueue.first {
                let curUrl = (curItem["trackUrl"] as? String) ?? ""
                let cleanId = extractIdFromTrackUrl(curUrl)
                var title = (curItem["title"] as? String) ?? "Unknown Track"
                var artist = (curItem["artist"] as? String) ?? "Unknown Artist"
                let queueItemId = curItem["id"] as? String

                // If rawQueue has generic placeholder title/artist, preserve existing valid metadata
                let isTitlePlaceholder = title == "Unknown Track" || title == "Track" || title == "Room Audio"
                let isArtistPlaceholder = artist == "Unknown Artist" || artist == "SyncBeats Room" || artist == ""
                if isTitlePlaceholder, let curTitle = self.current?.title, curTitle != "Unknown Track" && curTitle != "Track" {
                    title = curTitle
                }
                if isArtistPlaceholder, let curArtist = self.current?.artist, curArtist != "Unknown Artist" {
                    artist = curArtist
                }
                
                // Prioritize local artwork first, then thumbnail string, then current artwork, then YouTube fallback
                let localArt = findLocalArtwork(for: cleanId)
                let thumbStr = curItem["thumbnail"] as? String
                let thumbURL = localArt
                    ?? (thumbStr != nil ? URL(string: thumbStr!) : nil)
                    ?? self.current?.artworkURL
                    ?? (!cleanId.isEmpty && cleanId.count >= 11 ? URL(string: "https://i.ytimg.com/vi/\(cleanId)/hqdefault.jpg") : nil)
                
                self.current = PlayableTrack(id: cleanId, title: title, artist: artist, artworkURL: thumbURL, queueItemId: queueItemId)
            }
        }

        if playing, let epoch = startEpoch {
            applyRoomSchedule(
                startEpochMs: epoch,
                fromPositionSec: pauseOffset,
                trackUrl: trackUrl,
                clockOffsetMs: clockOffsetMs,
                title: self.current?.title,
                artist: self.current?.artist,
                thumbnail: self.current?.artworkURL?.absoluteString
            )
        } else if trackUrl == nil && self.current != nil && !self.current!.id.isEmpty {
            // Room is fresh/empty, but Mac was ALREADY playing a track locally.
            // Publish local track to the room so all room members immediately sync up!
            let currentTrack = self.current!
            let canonicalUrl = "youtube:\(currentTrack.id)"
            let thumb = currentTrack.artworkURL?.absoluteString ?? "https://i.ytimg.com/vi/\(currentTrack.id)/hqdefault.jpg"
            print("[PlayerEngine] Joined empty room while playing locally — scheduling track for room: '\(currentTrack.title)'")
            RoomSocket.shared.schedulePlayback(
                trackUrl: canonicalUrl,
                positionMs: Int(self.currentTime * 1000),
                title: currentTrack.title,
                artist: currentTrack.artist,
                thumbnail: thumb
            )
        } else {
            if let trackUrl, let resolvedURL = resolveAudioURL(from: trackUrl), resolvedURL != currentLoadedURL {
                print("[PlayerEngine] applyRoomSnapshot (paused/idle) — loading resolved URL: \(resolvedURL.absoluteString)")
                currentLoadedURL = resolvedURL
                let item = AVPlayerItem(url: resolvedURL)
                observe(item)
                player.replaceCurrentItem(with: item)
            }
            applyRoomPause(pauseOffsetSec: pauseOffset)
        }
    }

    /// Direct local seek that does NOT round-trip through the room.
    private func localSeek(to seconds: Double) {
        let clamped = max(0, min(seconds, duration > 0 ? duration : seconds))
        let target = CMTime(seconds: clamped, preferredTimescale: 600)
        let tol = CMTime(seconds: 0.1, preferredTimescale: 600)
        player.seek(to: target, toleranceBefore: tol, toleranceAfter: tol)
        currentTime = clamped
    }

    private func startDriftLoop(clockOffsetMs: Double) {
        stopDriftLoop()
        driftTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.correctDrift() }
        }
    }

    private func stopDriftLoop() {
        driftTimer?.invalidate()
        driftTimer = nil
        player.rate = isPlaying ? 1.0 : 0.0
    }

    /// Smoothly correct playback drift to match server timeline without jarring seeks.
    private func correctDrift() {
        guard roomIsPlaying, let epoch = roomStartEpochMs else { return }
        let serverNow = RoomSocket.shared.serverNowMs()
        if serverNow < epoch { return }               // not scheduled to have started yet
        let expected = max(0, (serverNow - epoch) / 1000)
        let actual = currentTime
        guard actual >= 0 else { return }
        let diffSec = expected - actual
        let driftMs = abs(diffSec) * 1000

        if driftMs > driftHardSeekMs {
            print("[PlayerEngine] ⏱️ Large drift \(Int(driftMs))ms > \(Int(driftHardSeekMs))ms — hard-seeking to \(expected)s")
            localSeek(to: expected)
            if isPlaying { player.rate = 1.0 }
            return
        }

        // Soft drift correction: rate micro-adjustments for drift between 150ms and 1500ms
        if driftMs > 150 && isPlaying {
            let targetRate: Float = diffSec > 0 ? 1.02 : 0.98
            if player.rate != targetRate {
                player.rate = targetRate
            }
        } else if isPlaying {
            if player.rate != 1.0 {
                player.rate = 1.0
            }
        }
    }
}
