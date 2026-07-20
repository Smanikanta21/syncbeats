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
        queue = newQueue
        index = startAt
        loadCurrent(autoPlay: true)
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

        guard let url = streamURL(for: track.id) else {
            print("[PlayerEngine] streamURL returned nil for id: \(track.id)")
            isLoading = false
            return
        }

        print("[PlayerEngine] Streaming URL: \(url.absoluteString)")
        let item = AVPlayerItem(url: url)
        observe(item)
        player.replaceCurrentItem(with: item)

        if autoPlay {
            player.play()
            isPlaying = true
            print("[PlayerEngine] player.play() called")
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
        guard !track.id.isEmpty else { return }
        guard let url = URL(string: "\(streamBase)/search/youtube/prefetch") else { return }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let token = APIClient.shared.token {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        request.httpBody = try? JSONSerialization.data(withJSONObject: ["videoId": track.id])

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
            // In a room the server owns track advancement; tell it we ended.
            RoomSocket.shared.nextTrack()
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
    private let driftHardSeekMs: Double = 120

    /// Apply a `playback:schedule` event: align to the shared timeline and start
    /// playing at the moment `startEpoch` says we should.
    func applyRoomSchedule(startEpochMs: Double, fromPositionSec: Double, trackUrl: String?, clockOffsetMs: Double) {
        roomStartEpochMs = startEpochMs
        roomIsPlaying = true
        isPlaying = true
        isLoading = false

        let serverNow = Date().timeIntervalSince1970 * 1000 + clockOffsetMs
        let expected = max(0, (serverNow - startEpochMs) / 1000)

        // If startEpoch is in the future, wait until then; otherwise start now at `expected`.
        let leadMs = startEpochMs - serverNow
        if leadMs > 0 {
            localSeek(to: fromPositionSec)
            DispatchQueue.main.asyncAfter(deadline: .now() + leadMs / 1000) { [weak self] in
                guard let self, self.roomIsPlaying else { return }
                self.player.play()
            }
        } else {
            localSeek(to: expected)
            player.play()
        }
        startDriftLoop(clockOffsetMs: clockOffsetMs)
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

    /// Apply a full `room:snapshot` / `room:stateChanged` — reconcile play state.
    func applyRoomSnapshot(_ dict: [String: Any], clockOffsetMs: Double) {
        let playing = (dict["isPlaying"] as? Bool) ?? false
        let startEpoch = (dict["startEpoch"] as? NSNumber)?.doubleValue
        let pauseOffset = (dict["pauseOffset"] as? NSNumber)?.doubleValue ?? 0

        if playing, let epoch = startEpoch {
            let trackUrl = dict["trackUrl"] as? String
            applyRoomSchedule(startEpochMs: epoch, fromPositionSec: pauseOffset, trackUrl: trackUrl, clockOffsetMs: clockOffsetMs)
        } else {
            applyRoomPause(pauseOffsetSec: pauseOffset)
        }
    }

    /// Direct local seek that does NOT round-trip through the room.
    private func localSeek(to seconds: Double) {
        let clamped = max(0, min(seconds, duration > 0 ? duration : seconds))
        let target = CMTime(seconds: clamped, preferredTimescale: 600)
        player.seek(to: target, toleranceBefore: .zero, toleranceAfter: .zero)
        currentTime = clamped
    }

    private func startDriftLoop(clockOffsetMs: Double) {
        stopDriftLoop()
        driftTimer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.correctDrift() }
        }
    }

    private func stopDriftLoop() {
        driftTimer?.invalidate()
        driftTimer = nil
    }

    /// Hard-seek back onto the shared timeline when local playback drifts too far.
    private func correctDrift() {
        guard roomIsPlaying, let epoch = roomStartEpochMs else { return }
        let serverNow = RoomSocket.shared.serverNowMs()
        if serverNow < epoch { return }               // not scheduled to have started yet
        let expected = max(0, (serverNow - epoch) / 1000)
        let actual = currentTime
        guard actual >= 0 else { return }
        let driftMs = abs(expected - actual) * 1000
        if driftMs > driftHardSeekMs {
            print("[PlayerEngine] ⏱️ drift \(Int(driftMs))ms > \(Int(driftHardSeekMs))ms — hard-seeking to \(expected)s")
            localSeek(to: expected)
        }
    }
}
