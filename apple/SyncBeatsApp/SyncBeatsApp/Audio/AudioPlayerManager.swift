import Foundation
import Combine
import AVFoundation


class AudioPlayerManager: ObservableObject {
    static let shared = AudioPlayerManager()
    
    private var player: AVPlayer?
    private var timeObserver: Any?
    
    @Published var isPlaying = false
    @Published var isDownloading = false
    @Published var currentTrack: TrackInfo? = nil
    @Published var currentTime: TimeInterval = 0
    @Published var duration: TimeInterval = 0
    @Published var progress: Double = 0
    
    private var isInternalSyncEvent = false
    
    private init() {
        setupAudioSession()
        setupSyncListeners()
    }
    
    private func setupAudioSession() {
        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default)
            try AVAudioSession.sharedInstance().setActive(true)
        } catch {
            print("Failed to set up audio session: \(error)")
        }
    }
    
    private func setupSyncListeners() {
        NotificationCenter.default.addObserver(self, selector: #selector(handleSyncPlaybackSchedule), name: NSNotification.Name("SyncPlaybackSchedule"), object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(handleSyncPlaybackPause), name: NSNotification.Name("SyncPlaybackPause"), object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(handleSyncTrackSet), name: NSNotification.Name("SyncTrackSet"), object: nil)
    }
    
    @objc private func handleSyncPlaybackSchedule(notification: Notification) {
        guard let userInfo = notification.userInfo,
              let trackUrl = userInfo["trackUrl"] as? String,
              let positionMs = userInfo["positionMs"] as? Double,
              let startTime = userInfo["startTime"] as? Double,
              let senderId = userInfo["senderId"] as? String else { return }
        
        // Ignore events sent by ourselves
        if senderId == SessionManager.shared.deviceId { return }
        
        // We might not have the track yet. If it's a new track, we need to fetch it.
        // For now, we will handle play and seeking.
        isInternalSyncEvent = true
        
        let currentServerTime = ClockSyncManager.shared.currentServerTimeMs()
        let timeUntilStart = startTime - currentServerTime
        
        if timeUntilStart > 0 {
            seek(to: positionMs / 1000.0)
            DispatchQueue.main.asyncAfter(deadline: .now() + (timeUntilStart / 1000.0)) { [weak self] in
                self?.player?.play()
                self?.isPlaying = true
                self?.isInternalSyncEvent = false
            }
        } else {
            let missedTime = currentServerTime - startTime
            let targetPositionMs = positionMs + missedTime
            seek(to: targetPositionMs / 1000.0)
            player?.play()
            isPlaying = true
            isInternalSyncEvent = false
        }
    }
    
    @objc private func handleSyncPlaybackPause(notification: Notification) {
        guard let userInfo = notification.userInfo,
              let positionMs = userInfo["positionMs"] as? Double,
              let senderId = userInfo["senderId"] as? String else { return }
        
        if senderId == SessionManager.shared.deviceId { return }
        
        isInternalSyncEvent = true
        seek(to: positionMs / 1000.0)
        player?.pause()
        isPlaying = false
        isInternalSyncEvent = false
    }
    
    @objc private func handleSyncTrackSet(notification: Notification) {
        guard let userInfo = notification.userInfo,
              let trackDict = userInfo["track"] as? [String: Any],
              let id = trackDict["id"] as? String,
              let title = trackDict["title"] as? String,
              let artist = trackDict["artist"] as? String,
              let thumbnailURL = trackDict["thumbnailURL"] as? String,
              let duration = trackDict["duration"] as? Double,
              let urlString = trackDict["url"] as? String,
              let senderId = userInfo["senderId"] as? String else { return }
        
        if senderId == SessionManager.shared.deviceId { return }
        
        let track = TrackInfo(id: id, title: title, artist: artist, thumbnailURL: thumbnailURL, duration: duration, url: urlString)
        if let audioURL = URL(string: urlString) {
            isInternalSyncEvent = true
            play(url: audioURL, track: track)
            isInternalSyncEvent = false
        }
    }
    
    func play(url: URL, track: TrackInfo) {
        // Stop current
        stop()
        
        currentTrack = track
        
        if !isInternalSyncEvent {
            SocketManager.shared.emitTrackSet(track: track)
        }
        
        // 1. Check local cache
        if let localURL = LocalCacheManager.shared.getLocalURL(for: track.id) {
            startPlayback(with: localURL)
            return
        }
        
        // 2. Download from remote if not cached
        isDownloading = true
        LocalCacheManager.shared.downloadTrack(id: track.id, remoteURL: url) { [weak self] result in
            guard let self = self else { return }
            self.isDownloading = false
            
            switch result {
            case .success(let localURL):
                // Save to library
                if let track = self.currentTrack, track.id == track.id {
                    LibraryManager.shared.saveDownloadedTrack(track)
                }
                
                // Make sure the user didn't start playing a different track while downloading
                if self.currentTrack?.id == track.id {
                    self.startPlayback(with: localURL)
                }
            case .failure(let error):
                print("Failed to download track: \(error)")
                // Fallback to streaming if download fails
                if self.currentTrack?.id == track.id {
                    self.startPlayback(with: url)
                }
            }
        }
    }
    
    private func startPlayback(with url: URL) {
        if player == nil {
            player = AVPlayer(url: url)
        } else {
            let playerItem = AVPlayerItem(url: url)
            player?.replaceCurrentItem(with: playerItem)
        }
        
        // Observe time
        let interval = CMTime(seconds: 0.5, preferredTimescale: CMTimeScale(NSEC_PER_SEC))
        timeObserver = player?.addPeriodicTimeObserver(forInterval: interval, queue: .main) { [weak self] time in
            guard let self = self else { return }
            self.currentTime = time.seconds
            if let dur = self.player?.currentItem?.duration.seconds, dur.isFinite {
                self.duration = dur
                self.progress = dur > 0 ? time.seconds / dur : 0
            }
        }
        
        // Observe when track finishes
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(playerDidFinishPlaying),
            name: .AVPlayerItemDidPlayToEndTime,
            object: player?.currentItem
        )
        
        player?.play()
        isPlaying = true
    }
    
    func pause() {
        player?.pause()
        isPlaying = false
    }
    
    func stop() {
        if let observer = timeObserver, let player = player {
            player.removeTimeObserver(observer)
            timeObserver = nil
        }
        player?.pause()
        player = nil
        isPlaying = false
        isDownloading = false
        currentTrack = nil
        currentTime = 0
        duration = 0
        progress = 0
    }
    
    func togglePlayPause() {
        if isPlaying {
            player?.pause()
            if !isInternalSyncEvent {
                SocketManager.shared.emitPlaybackPause(positionMs: currentTime * 1000.0)
            }
            isPlaying = false
        } else {
            if !isInternalSyncEvent && SocketManager.shared.isSyncBeatMode {
                let delayMs = 300.0
                let serverTime = ClockSyncManager.shared.currentServerTimeMs()
                let futureStartTime = serverTime + delayMs
                let position = currentTime * 1000.0
                
                SocketManager.shared.emitPlaybackSchedule(trackUrl: currentTrack?.id ?? "", positionMs: position, startTime: futureStartTime)
                
                isInternalSyncEvent = true
                DispatchQueue.main.asyncAfter(deadline: .now() + (delayMs / 1000.0)) { [weak self] in
                    self?.player?.play()
                    self?.isPlaying = true
                    self?.isInternalSyncEvent = false
                }
            } else {
                player?.play()
                isPlaying = true
            }
        }
    }
    
    func seek(to time: TimeInterval) {
        let cmTime = CMTime(seconds: time, preferredTimescale: 1000)
        player?.seek(to: cmTime, toleranceBefore: .zero, toleranceAfter: .zero)
        
        if !isInternalSyncEvent && isPlaying {
            let serverTime = ClockSyncManager.shared.currentServerTimeMs()
            SocketManager.shared.emitPlaybackSchedule(trackUrl: currentTrack?.id ?? "", positionMs: time * 1000.0, startTime: serverTime)
        }
    }
    
    func seekRelative(by seconds: TimeInterval) {
        let newTime = max(0, min(currentTime + seconds, duration))
        seek(to: newTime)
    }
    
    @objc private func playerDidFinishPlaying() {
        isPlaying = false
        progress = 1.0
    }
    
    /// Format seconds into M:SS
    static func formatTime(_ seconds: TimeInterval) -> String {
        guard seconds.isFinite && seconds >= 0 else { return "0:00" }
        let mins = Int(seconds) / 60
        let secs = Int(seconds) % 60
        return "\(mins):\(String(format: "%02d", secs))"
    }
}
