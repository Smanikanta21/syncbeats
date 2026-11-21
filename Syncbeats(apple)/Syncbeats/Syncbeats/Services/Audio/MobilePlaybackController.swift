#if os(iOS)
import AVFoundation
import MediaPlayer
import Observation
import UIKit

/// System controls issue room commands; they never invent a separate local timeline.
@MainActor @Observable final class MobilePlaybackController {
    @ObservationIgnored private var observers: [NSObjectProtocol] = []
    @ObservationIgnored private var commands: [(MPRemoteCommand, Any)] = []
    @ObservationIgnored private var artworkTask: Task<Void, Never>?
    @ObservationIgnored private var artworkRequest: AlbumArtworkRequest?
    @ObservationIgnored private var artwork: MPMediaItemArtwork?
    @ObservationIgnored private var running = false
    @ObservationIgnored private var lifetimeTask: Task<Void, Never>?
    @ObservationIgnored private var interruptedRoomID: String?
    @ObservationIgnored private var resumesAfterInterruption = false

    /// Shared across iPad scenes; closing one window must not remove system controls.
    func start(room: RoomSession) {
        guard lifetimeTask == nil else { return }
        lifetimeTask = Task { [weak self, weak room] in
            guard let self, let room else { return }
            await run(room: room)
        }
    }
    private func run(room: RoomSession) async {
        guard !running else { return }
        running = true
        installCommands(room: room)
        observeSession(room: room)
        defer { stop() }
        while !Task.isCancelled {
            publish(room: room)
            try? await Task.sleep(for: .seconds(1))
        }
    }

    private func installCommands(room: RoomSession) {
        let center = MPRemoteCommandCenter.shared()
        bind(center.playCommand) { [weak room] in room?.play() }
        bind(center.pauseCommand) { [weak room] in room?.pause() }
        bind(center.togglePlayPauseCommand) { [weak room] in room?.togglePlayback() }
        bind(center.nextTrackCommand) { [weak room] in room?.next() }
        bind(center.previousTrackCommand) { [weak room] in room?.previous() }
        let target = center.changePlaybackPositionCommand.addTarget { [weak room] event in
            guard let event = event as? MPChangePlaybackPositionCommandEvent else { return .commandFailed }
            let seconds = event.positionTime
            Task { @MainActor [weak room] in room?.seek(to: seconds) }
            return .success
        }
        commands.append((center.changePlaybackPositionCommand, target))
    }
    private func bind(_ command: MPRemoteCommand, action: @escaping @MainActor @Sendable () -> Void) {
        let target = command.addTarget { _ in
            Task { @MainActor in action() }
            return .success
        }
        commands.append((command, target))
    }

    private func observeSession(room: RoomSession) {
        let center = NotificationCenter.default
        observers.append(center.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) { [weak self, weak room] notification in
            let type = (notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? NSNumber)?.uintValue
            let options = (notification.userInfo?[AVAudioSessionInterruptionOptionKey] as? NSNumber)?.uintValue ?? 0
            Task { @MainActor [weak self, weak room] in
                guard let self, let room else { return }
                if type == AVAudioSession.InterruptionType.began.rawValue {
                    self.interruptedRoomID = room.roomID
                    self.resumesAfterInterruption = room.isPlaying && !room.localAudioSuspended
                    room.suspendLocalAudio()
                } else if type == AVAudioSession.InterruptionType.ended.rawValue {
                    if self.resumesAfterInterruption, room.isPlaying, self.interruptedRoomID == room.roomID,
                       options & AVAudioSession.InterruptionOptions.shouldResume.rawValue != 0 {
                        room.resumeLocalAudio()
                    }
                    self.resumesAfterInterruption = false
                }
            }
        })
        observers.append(center.addObserver(forName: AVAudioSession.routeChangeNotification, object: nil, queue: .main) { [weak room] notification in
            let reason = (notification.userInfo?[AVAudioSessionRouteChangeReasonKey] as? NSNumber)?.uintValue
            Task { @MainActor [weak room] in
                guard let room, room.currentTrack != nil else { return }
                if reason == AVAudioSession.RouteChangeReason.oldDeviceUnavailable.rawValue {
                    room.suspendLocalAudio()
                    room.statusMessage = "Audio output disconnected. Tap Play to resume on this device."
                } else if reason == AVAudioSession.RouteChangeReason.newDeviceAvailable.rawValue || reason == AVAudioSession.RouteChangeReason.override.rawValue {
                    room.recoverAudioOutput() // A new output may have a different sample rate.
                }
            }
        })
        observers.append(center.addObserver(forName: AVAudioSession.mediaServicesWereResetNotification, object: nil, queue: .main) { [weak room] _ in
            Task { @MainActor [weak room] in room?.recoverAudioOutput() }
        })
    }

    private func publish(room: RoomSession) {
        #if DEBUG
        room.recordPlaybackState()
        #endif
        let enabled = room.canControl && room.currentTrack != nil
        for (command, _) in commands { command.isEnabled = enabled }
        MPRemoteCommandCenter.shared().changePlaybackPositionCommand.isEnabled = enabled && room.duration != nil
        guard let track = room.currentTrack, room.roomID != nil else {
            artworkTask?.cancel(); artworkTask = nil; artworkRequest = nil; artwork = nil
            MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
            return
        }
        if artworkRequest != track.artworkRequest {
            artworkTask?.cancel(); artworkRequest = track.artworkRequest; artwork = nil
            let request = track.artworkRequest
            artworkTask = Task { [weak self] in
                guard let data = await AlbumArtworkResolver.shared.imageData(for: request),
                      !Task.isCancelled, let image = UIImage(data: data), self?.artworkRequest == request else { return }
                self?.artwork = MPMediaItemArtwork(boundsSize: image.size) { _ in image }
            }
        }
        var info: [String: Any] = [
            MPMediaItemPropertyTitle: track.title,
            MPMediaItemPropertyArtist: track.artistLabel,
            MPNowPlayingInfoPropertyElapsedPlaybackTime: room.position(),
            MPNowPlayingInfoPropertyPlaybackRate: room.isPlaying && !room.pendingPlay && !room.localAudioSuspended && room.audio.rendering ? 1.0 : 0.0,
            MPNowPlayingInfoPropertyDefaultPlaybackRate: 1.0,
            MPNowPlayingInfoPropertyIsLiveStream: false
        ]
        if let duration = room.duration { info[MPMediaItemPropertyPlaybackDuration] = duration }
        if let artwork { info[MPMediaItemPropertyArtwork] = artwork }
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }
    private func stop() {
        observers.forEach { NotificationCenter.default.removeObserver($0) }; observers = []
        for (command, target) in commands { command.removeTarget(target) }
        commands = []; artworkTask?.cancel(); artworkTask = nil
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
        running = false
    }
}
#endif
