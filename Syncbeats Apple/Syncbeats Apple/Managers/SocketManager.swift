import Foundation
// Note: Requires adding 'Socket.IO-Client-Swift' via Swift Package Manager
import SocketIO
import Combine
import os

class SocketManager: ObservableObject {
    private var manager: SocketManagerSpec?
    private var socket: SocketIOClient?
    
    @Published var isConnected = false
    @Published var currentRoomId: String?
    @Published var participants: [[String: Any]] = []
    @Published var trackTitle: String = "No Track Playing"
    @Published var clockOffset: Double = 0
    private var offsetSamples: [Double] = []
    
    weak var audioEngine: AudioEngine?
    
    private var pendingRoomId: String?
    private var pingTimer: Timer?
    
    let logger = Logger(subsystem: "com.syncbeats.mac", category: "SocketManager")
    
    init() {
        // We will connect to the same Node.js server the web frontend uses
        guard let url = URL(string: "http://localhost:4000") else { return }
        
        self.manager = SocketIO.SocketManager(socketURL: url, config: [.log(false), .compress])
        self.socket = self.manager?.defaultSocket
        
        setupHandlers()
    }
    
    private func setupHandlers() {
        guard let socket = socket else { return }
        
        socket.on(clientEvent: .connect) { [weak self] data, ack in
            DispatchQueue.main.async {
                self?.isConnected = true
                self?.logger.info("Connected to Cloud Sync Server")
                
                self?.pingTimer = Timer.scheduledTimer(withTimeInterval: 2.0, repeats: true) { _ in
                    let t0 = Date().timeIntervalSince1970 * 1000.0
                    self?.socket?.emit("sync:ping", ["t0": t0, "seq": 1])
                }
            }
        }
        
        socket.on(clientEvent: .disconnect) { [weak self] data, ack in
            DispatchQueue.main.async {
                self?.isConnected = false
                self?.logger.info("Disconnected from Cloud Sync Server")
                self?.pingTimer?.invalidate()
                self?.pingTimer = nil
            }
        }
        
        socket.on("sync:pong") { [weak self] data, ack in
            guard let payload = data.first as? [String: Any],
                  let t1 = payload["t1"] as? Double,
                  let t0 = payload["t0"] as? Double else { return }
            let t3 = Date().timeIntervalSince1970 * 1000.0
            let rtt = t3 - t0
            
            // Reject ping spikes > 500ms
            if rtt < 500 {
                let offset = t1 - ((t0 + t3) / 2.0)
                
                DispatchQueue.main.async {
                    self?.offsetSamples.append(offset)
                    if self?.offsetSamples.count ?? 0 > 10 {
                        self?.offsetSamples.removeFirst()
                    }
                    
                    if let samples = self?.offsetSamples, samples.count > 3 {
                        let sorted = samples.sorted()
                        let q1 = sorted[Int(Double(sorted.count) * 0.25)]
                        let q3 = sorted[Int(Double(sorted.count) * 0.75)]
                        let filtered = sorted.filter { $0 >= q1 && $0 <= q3 }
                        let median = filtered[filtered.count / 2]
                        self?.clockOffset = median
                    } else {
                        self?.clockOffset = offset
                    }
                }
            }
        }
        
        socket.on("room:sync_progress") { [weak self] data, ack in
            guard let payload = data.first as? [String: Any] else { return }
            self?.logger.info("Received sync progress from cloud: \(payload)")
        }
        
        socket.on("room:joinApproved") { [weak self] data, ack in
            DispatchQueue.main.async {
                self?.currentRoomId = self?.pendingRoomId
                self?.logger.info("Join approved!")
            }
        }
        
        socket.on("room:joinDenied") { [weak self] data, ack in
            DispatchQueue.main.async {
                self?.currentRoomId = nil
                self?.pendingRoomId = nil
                self?.logger.info("Join denied!")
            }
        }
        
        socket.on("room:snapshot") { [weak self] data, ack in
            guard let payload = data.first as? [String: Any] else { return }
            DispatchQueue.main.async {
                self?.currentRoomId = self?.pendingRoomId
                
                if let parts = payload["participants"] as? [[String: Any]] {
                    self?.participants = parts
                }
                
                if let queue = payload["queue"] as? [[String: Any]],
                   let currentTrack = queue.first(where: { ($0["isCurrent"] as? Bool) == true }),
                   let title = currentTrack["title"] as? String {
                    self?.trackTitle = title
                } else if let trackUrl = payload["trackUrl"] as? String, !trackUrl.isEmpty {
                    self?.trackTitle = URL(string: trackUrl)?.lastPathComponent ?? "Playing Track"
                } else {
                    self?.trackTitle = "No Track Playing"
                }
                
                // Handle Track change from snapshot
                if let trackUrl = payload["trackUrl"] as? String, !trackUrl.isEmpty, let roomId = self?.currentRoomId {
                    self?.audioEngine?.loadAndSetTrack(roomId: roomId, url: trackUrl, title: self?.trackTitle ?? "Unknown Track")
                }
                
                self?.logger.info("Room snapshot received, UI transitioned.")
                
                // Immediately tell the server we are ready so we don't block playback for web clients!
                if let roomId = self?.currentRoomId {
                    self?.socket?.emit("room:clientReady", ["roomId": roomId, "isReady": true])
                }
            }
        }
        
        socket.on("playback:schedule") { [weak self] data, ack in
            guard let payload = data.first as? [String: Any],
                  let startEpoch = payload["startEpoch"] as? Double,
                  let fromPosition = payload["fromPosition"] as? Double else { return }
            
            DispatchQueue.main.async {
                let offset = self?.clockOffset ?? 0
                self?.audioEngine?.scheduleStart(startEpoch: startEpoch, fromPosition: fromPosition, clockOffset: offset)
            }
        }
        
        socket.on("playback:pause") { [weak self] data, ack in
            guard let payload = data.first as? [String: Any],
                  let pauseOffset = payload["pauseOffset"] as? Double else { return }
            
            DispatchQueue.main.async {
                self?.audioEngine?.pauseAt(offset: pauseOffset)
            }
        }
        
        socket.on("room:stateChanged") { [weak self] data, ack in
            guard let payload = data.first as? [String: Any] else { return }
            DispatchQueue.main.async {
                if let trackUrl = payload["trackUrl"] as? String, !trackUrl.isEmpty {
                    // Update trackTitle
                    if let queue = payload["queue"] as? [[String: Any]],
                       let currentTrack = queue.first(where: { ($0["isCurrent"] as? Bool) == true }),
                       let title = currentTrack["title"] as? String {
                        self?.trackTitle = title
                    }
                    if let roomId = self?.currentRoomId {
                        self?.audioEngine?.loadAndSetTrack(roomId: roomId, url: trackUrl, title: self?.trackTitle ?? "Unknown Track")
                    }
                }
            }
        }
        
        socket.on("room:participantJoined") { [weak self] data, ack in
            guard let payload = data.first as? [String: Any] else { return }
            DispatchQueue.main.async {
                if !(self?.participants.contains(where: { ($0["socketId"] as? String) == (payload["socketId"] as? String) }) ?? false) {
                    self?.participants.append(payload)
                }
            }
        }
        
        socket.on("room:participantLeft") { [weak self] data, ack in
            guard let socketId = data.first as? String else { return }
            DispatchQueue.main.async {
                self?.participants.removeAll { ($0["socketId"] as? String) == socketId }
            }
        }
        
        socket.on("room:participantUpdated") { [weak self] data, ack in
            guard let payload = data.first as? [String: Any],
                  let socketId = payload["socketId"] as? String else { return }
            DispatchQueue.main.async {
                if let index = self?.participants.firstIndex(where: { ($0["socketId"] as? String) == socketId }) {
                    var updated = self?.participants[index] ?? [:]
                    for (k, v) in payload {
                        updated[k] = v
                    }
                    self?.participants[index] = updated
                }
            }
        }
    }
    
    func connect() {
        socket?.connect()
    }
    
    func disconnect() {
        socket?.disconnect()
    }
    
    func joinRoom(roomId: String, userId: String, displayName: String) {
        pendingRoomId = roomId
        let payload: [String: Any] = [
            "roomId": roomId,
            "userId": userId,
            "displayName": displayName,
            "isReady": true
        ]
        socket?.emit("room:join", payload)
    }
    
    func leaveRoom() {
        if let roomId = currentRoomId {
            socket?.emit("room:leave", ["roomId": roomId])
        }
        currentRoomId = nil
        pendingRoomId = nil
        participants = []
        trackTitle = "No Track Playing"
    }
    
    func emitPlay() {
        if let roomId = currentRoomId {
            socket?.emit("playback:play", ["roomId": roomId])
        }
    }
    
    func emitPause() {
        if let roomId = currentRoomId {
            socket?.emit("playback:pause", ["roomId": roomId])
        }
    }
}


