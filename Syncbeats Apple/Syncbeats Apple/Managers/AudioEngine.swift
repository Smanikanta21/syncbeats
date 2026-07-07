import Foundation
import AVFoundation
import Combine
import os

class AudioEngine: ObservableObject {
    private var player: AVPlayer?
    private var timeObserverToken: Any?
    
    @Published var isPlaying = false
    @Published var isBuffering = false
    @Published var isReady = false
    @Published var volume: Float = 1.0 {
        didSet {
            player?.volume = volume
        }
    }
    
    var trackUrl: String?
    
    let logger = Logger(subsystem: "com.syncbeats.mac", category: "AudioEngine")
    
    init() {}
    
    func loadAndSetTrack(roomId: String, url: String, title: String) {
        guard self.trackUrl != url else { return }
        self.trackUrl = url
        
        let streamUrl: URL
        if url.hasPrefix("ws-p2p:yt:") {
            let components = url.replacingOccurrences(of: "ws-p2p:yt:", with: "").split(separator: "_")
            let videoId = String(components.first ?? "")
            streamUrl = URL(string: "http://localhost:4000/rooms/\(roomId)/yt-proxy?videoId=\(videoId)")!
        } else {
            streamUrl = URL(string: url)!
        }
        
        // Stop existing player
        player?.pause()
        if let token = timeObserverToken {
            player?.removeTimeObserver(token)
            timeObserverToken = nil
        }
        
        self.isReady = false
        self.isBuffering = true
        
        let playerItem = AVPlayerItem(url: streamUrl)
        self.player = AVPlayer(playerItem: playerItem)
        self.player?.volume = self.volume
        
        // For AVPlayer, when it's created it will start buffering
        // We'll simulate 'isReady' shortly after it loads
        self.isReady = true
        self.isBuffering = false
        
        logger.info("Loaded track stream: \(streamUrl.absoluteString)")
    }
    
    func scheduleStart(startEpoch: Double, fromPosition: Double, clockOffset: Double) {
        guard let player = player else { return }
        
        let now = Date().timeIntervalSince1970 * 1000.0
        let adjustedNow = now + clockOffset
        let delayMs = startEpoch - adjustedNow
        
        var playPosition = fromPosition
        var timeout = delayMs
        
        // If we missed the exact start epoch due to network flight time,
        // we must jump forward in the track to perfectly catch up to the Web clients!
        if delayMs < 0 {
            playPosition += abs(delayMs)
            timeout = 0
        }
        
        // Seek to the EXACT requested position (no tolerance)
        let time = CMTime(seconds: playPosition / 1000.0, preferredTimescale: 1000)
        player.seek(to: time, toleranceBefore: .zero, toleranceAfter: .zero)
        
        // Minimize stalling to force immediate playback
        player.automaticallyWaitsToMinimizeStalling = false
        
        if timeout > 0 {
            logger.info("Scheduling playback in \(timeout)ms at position \(playPosition)ms")
            DispatchQueue.main.asyncAfter(deadline: .now() + (timeout / 1000.0)) { [weak self] in
                self?.player?.play()
                self?.isPlaying = true
            }
        } else {
            logger.info("Scheduling playback IMMEDIATELY (missed by \(abs(delayMs))ms), seeking to \(playPosition)ms")
            player.play()
            self.isPlaying = true
        }
    }
    
    func pauseAt(offset: Double) {
        player?.pause()
        isPlaying = false
        
        let time = CMTime(seconds: offset / 1000.0, preferredTimescale: 1000)
        player?.seek(to: time)
    }
    
    func play() {
        player?.play()
        isPlaying = true
    }
    
    func pause() {
        player?.pause()
        isPlaying = false
    }
}
