import Foundation
import Combine
#if canImport(UIKit)
import UIKit
#endif
import SocketIO

 class SocketManager: ObservableObject {
    static let shared = SocketManager()
    @Published var incomingPing: String? = nil
    @Published var isConnected = false
    
    private var manager: SocketManagerSpec?
    private var socket: SocketIOClient?
    
    private init() {}
    
    func connect() {
        if socket?.status == .connected { return }
        let token = UserDefaults.standard.string(forKey: "auth_token") ?? ""
        let url = URL(string: "http://192.168.29.61:4000")!
        manager = SocketIO.SocketManager(socketURL: url, config: [.log(true), .compress])
        socket = manager?.defaultSocket
        
        socket?.on(clientEvent: .connect) { [weak self] data, ack in
            print("Socket connected")
            DispatchQueue.main.async {
                self?.isConnected = true
            }
            self?.registerDevice()
            
            // If they were in a personal room before dropping connection, rejoin
            if self?.isSyncBeatMode == true {
                self?.joinPersonalRoom()
            }
        }
        socket?.on(clientEvent: .disconnect) { [weak self] data, ack in
            print("Socket disconnected")
            DispatchQueue.main.async {
                self?.isConnected = false
            }
            ClockSyncManager.shared.stopSyncing()
        }
        socket?.on("room:updateQueue") { [weak self] dataArray, _ in
            print("[SocketManager] Received room:updateQueue: \(dataArray)")
            guard let data = dataArray.first as? [String: Any],
                  let senderId = data["senderId"] as? String,
                  let trackData = data["track"] as? [String: Any] else { return }
            
            NotificationCenter.default.post(name: NSNotification.Name("SyncTrackSet"), object: nil, userInfo: [
                "track": trackData,
                "senderId": senderId
            ])
        }
        
        socket?.on("sync:forceEnable") { [weak self] _, _ in
            DispatchQueue.main.async {
                if self?.isSyncBeatMode == false {
                    self?.isSyncBeatMode = true
                    self?.joinPersonalRoom()
                }
            }
        }
        
        socket?.on("device:ping") { [weak self] dataArray, ack in
            if let data = dataArray.first as? [String: Any], let message = data["message"] as? String {
                DispatchQueue.main.async { self?.incomingPing = message }
            }
        }
        socket?.connect()
    }
    
    private func handleRoomStateUpdate(_ data: [String: Any]) {
        if let pending = data["pendingPlay"] as? Bool {
            DispatchQueue.main.async { self.isPendingPlay = pending }
        }
        
        guard let trackUrl = data["trackUrl"] as? String, !trackUrl.isEmpty else { return }
        
        let queue = data["queue"] as? [[String: Any]] ?? []
        let currentTrack = queue.first(where: { ($0["trackUrl"] as? String) == trackUrl })
        
        var trackData = currentTrack ?? [:]
        trackData["id"] = trackData["id"] ?? trackUrl
        trackData["trackUrl"] = trackData["trackUrl"] ?? trackUrl
        trackData["title"] = trackData["title"] ?? "Synced Audio"
        
        NotificationCenter.default.post(name: NSNotification.Name("SyncTrackSet"), object: nil, userInfo: [
            "track": trackData,
            "senderId": "server"
        ])
        
        if let state = data["state"] as? String, state == "PLAYING",
           let position = data["position"] as? Double,
           let startEpoch = data["startEpoch"] as? Double {
            NotificationCenter.default.post(name: NSNotification.Name("SyncPlaybackSchedule"), object: nil, userInfo: [
                "trackUrl": trackUrl,
                "positionMs": position,
                "startTime": startEpoch,
                "senderId": "server"
            ])
        }
    }
    
    func registerDevice() {
        var payload: [String: Any] = ["deviceKey": SessionManager.shared.deviceId]
        if let user = SessionManager.shared.user {
            payload["userId"] = user.id
        }
        socket?.emit("device:register", payload)
    }
    
    func pingDevice(targetDeviceKey: String) {
        #if os(iOS)
        let deviceModel = UIDevice.current.model
        #else
        let deviceModel = "Mac"
        #endif
        let payload: [String: Any] = [
            "targetDeviceKey": targetDeviceKey,
            "message": "Ping from \(deviceModel)!"
        ]
        socket?.emit("device:ping", payload)
    }
    
    // MARK: - SyncBeat Mode (Personal Room)
    
    @Published var isSyncBeatMode = false
    @Published var isPendingPlay = false
    
    func toggleSyncBeatMode() {
        if isSyncBeatMode {
            leavePersonalRoom()
        } else {
            joinPersonalRoom()
            socket?.emit("sync:forceAll")
        }
    }
    
    private func joinPersonalRoom() {
        guard let user = SessionManager.shared.user, let socket = socket else { return }
        
        isSyncBeatMode = true
        let roomId = "personal_room_\(user.id)"
        
        let payload: [String: Any] = [
            "roomId": roomId,
            "userId": user.id,
            "displayName": user.name
        ]
        
        socket.emit("room:join", payload)
        ClockSyncManager.shared.startSyncing(with: socket)
        
        // Listen for playback events
        setupPlaybackListeners()
    }
    
    private func leavePersonalRoom() {
        isSyncBeatMode = false
        if let user = SessionManager.shared.user {
            let roomId = "personal_room_\(user.id)"
            socket?.emit("room:leave", ["roomId": roomId])
        } else {
            socket?.emit("room:leave")
        }
        ClockSyncManager.shared.stopSyncing()
        removePlaybackListeners()
    }
    
    private func setupPlaybackListeners() {
        socket?.on("playback:schedule") { dataArray, _ in
            guard let data = dataArray.first as? [String: Any] else { return }
            NotificationCenter.default.post(name: NSNotification.Name("SyncPlaybackSchedule"), object: nil, userInfo: data)
        }
        socket?.on("playback:pause") { dataArray, _ in
            guard let data = dataArray.first as? [String: Any] else { return }
            NotificationCenter.default.post(name: NSNotification.Name("SyncPlaybackPause"), object: nil, userInfo: data)
        }
        socket?.on("room:trackSet") { dataArray, _ in
            guard let data = dataArray.first as? [String: Any] else { return }
            NotificationCenter.default.post(name: NSNotification.Name("SyncTrackSet"), object: nil, userInfo: data)
        }
        socket?.on("room:snapshot") { [weak self] dataArray, _ in
            guard let data = dataArray.first as? [String: Any] else { return }
            self?.handleRoomStateUpdate(data)
        }
        socket?.on("room:stateChanged") { [weak self] dataArray, _ in
            guard let data = dataArray.first as? [String: Any] else { return }
            self?.handleRoomStateUpdate(data)
        }
    }
    
    private func removePlaybackListeners() {
        socket?.off("playback:schedule")
        socket?.off("playback:pause")
        socket?.off("room:trackSet")
        socket?.off("room:snapshot")
        socket?.off("room:stateChanged")
    }
    
    // Helper to emit playback events
    func emitClientReady(isReady: Bool) {
        guard isSyncBeatMode, let user = SessionManager.shared.user else { return }
        let payload: [String: Any] = [
            "roomId": "personal_room_\(user.id)",
            "isReady": isReady
        ]
        print("[SocketManager] Emitting room:clientReady: \(payload)")
        socket?.emit("room:clientReady", payload)
    }

    func emitPlaybackPlay() {
        guard isSyncBeatMode, let user = SessionManager.shared.user else { return }
        let payload: [String: Any] = [
            "roomId": "personal_room_\(user.id)",
            "senderId": SessionManager.shared.deviceId
        ]
        print("[SocketManager] Emitting playback:play: \(payload)")
        socket?.emit("playback:play", payload)
    }

    func emitPlaybackSchedule(trackUrl: String, positionMs: Double, startTime: Double) {
        guard isSyncBeatMode, let user = SessionManager.shared.user else { return }
        let payload: [String: Any] = [
            "roomId": "personal_room_\(user.id)",
            "trackUrl": trackUrl,
            "positionMs": positionMs,
            "startTime": startTime,
            "senderId": SessionManager.shared.deviceId
        ]
        print("[SocketManager] Emitting playback:schedule: \(payload)")
        socket?.emit("playback:schedule", payload)
    }
    
    func emitPlaybackPause(positionMs: Double) {
        guard isSyncBeatMode, let user = SessionManager.shared.user else { return }
        let payload: [String: Any] = [
            "roomId": "personal_room_\(user.id)",
            "positionMs": positionMs,
            "senderId": SessionManager.shared.deviceId
        ]
        print("[SocketManager] Emitting playback:pause: \(payload)")
        socket?.emit("playback:pause", payload)
    }
    
    func emitTrackSet(track: TrackInfo) {
        guard isSyncBeatMode, let user = SessionManager.shared.user else { return }
        let payload: [String: Any] = [
            "roomId": "personal_room_\(user.id)",
            "track": [
                "id": track.id,
                "title": track.title,
                "artist": track.artist,
                "thumbnailURL": track.thumbnailURL,
                "duration": track.duration,
                "url": track.url
            ],
            "senderId": SessionManager.shared.deviceId
        ]
        print("[SocketManager] Emitting room:updateQueue: \(payload)")
        socket?.emit("room:updateQueue", payload)
    }
    
    func emitForceSyncAll() {
        print("[SocketManager] Emitting sync:forceAll")
        socket?.emit("sync:forceAll")
    }
    
    func disconnect() {
        socket?.disconnect()
        DispatchQueue.main.async {
            self.isConnected = false
        }
    }
}
protocol SocketManagerSpec {
    var defaultSocket: SocketIOClient { get }
}
extension SocketIO.SocketManager: SocketManagerSpec {}
