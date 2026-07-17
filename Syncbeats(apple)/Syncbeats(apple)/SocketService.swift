import Foundation
import SocketIO
import Combine

class SocketService: ObservableObject {
    static let shared = SocketService()
    
    private var manager: SocketManager!
    private var socket: SocketIOClient!
    
    @Published var isConnected: Bool = false
    @Published var currentRoom: RoomSnapshot? = nil
    
    private var pendingJoinRoomId: String? = nil
    @Published var chatMessages: [ChatMessage] = []
    @Published var deviceSyncProgress: [String: Int] = [:]
    @Published var activeReaction: String? = nil
    
    // Audio Chunk Buffering
    private var chunkBuffer: [Int: Data] = [:]
    private var totalChunksExpected: Int = 0
    private var currentDownloadTrackUrl: String? = nil
    @Published var downloadProgress: Double = 0.0
    @Published var isReady: Bool = false
    @Published var localPlaybackTitle: String? = nil
    
    // NTP timing offset (milliseconds)
    @Published var serverTimeOffset: Double = 0.0
    
    // Track the currently downloaded temp file so we can delete it later and avoid disk space leaks
    private var currentStreamFileUrl: URL? = nil
    
    // Timers
    private var missingChunkTimer: Timer? = nil
    private var driftSyncTimer: Timer? = nil
    private var ntpTimer: Timer? = nil
    
    private init() {
        // Setup SocketManager
        let url = URL(string: Config.backendURL)!
        manager = SocketManager(socketURL: url, config: [.log(false), .compress])
        socket = manager.defaultSocket
        
        setupListeners()
    }
    
    func connect() {
        guard !isConnected else { return }
        
        if let token = AuthManager.shared.appToken {
            manager.config = [.log(false), .compress, .extraHeaders(["Authorization": "Bearer \(token)"])]
        }
        
        socket.connect()
    }
    
    func disconnect() {
        socket.disconnect()
        stopNtpTimer()
        stopDriftSyncTimer()
    }
    
    private func setupListeners() {
        socket.on(clientEvent: .connect) { [weak self] data, ack in
            DispatchQueue.main.async {
                self?.isConnected = true
                print("SocketService: Connected to server!")
                self?.performNTPBurst()
                self?.startNtpTimer()
                
                // Reconnect to the room if we were in one!
                if let roomId = self?.currentRoom?.roomId {
                    self?.joinRoom(roomId: roomId)
                }
            }
        }
        
        socket.on(clientEvent: .disconnect) { [weak self] data, ack in
            DispatchQueue.main.async {
                self?.isConnected = false
                self?.stopNtpTimer()
                self?.stopDriftSyncTimer()
                print("SocketService: Disconnected from server.")
            }
        }
        
        let handleRoomUpdate: ([Any], SocketAckEmitter) -> Void = { [weak self] data, ack in
            guard let dict = data.first as? [String: Any],
                  let jsonData = try? JSONSerialization.data(withJSONObject: dict) else { return }
            
            do {
                let snapshot = try JSONDecoder().decode(RoomSnapshot.self, from: jsonData)
                
                DispatchQueue.main.async {
                    let previousTrack = self?.currentRoom?.trackUrl
                    let wasNotInRoom = self?.currentRoom == nil
                    let roomChanged = self?.currentRoom?.roomId != snapshot.roomId
                    let wasPendingJoin = self?.pendingJoinRoomId == snapshot.roomId
                    
                    self?.currentRoom = snapshot
                    print("SocketService: Room snapshot updated for \(snapshot.roomId)")
                    
                    if wasNotInRoom || roomChanged || wasPendingJoin {
                        NotificationCenter.default.post(name: NSNotification.Name("RoomJoined"), object: nil)
                        self?.pendingJoinRoomId = nil
                    }
                    
                    // Start or stop drift correction timer based on playback state
                    if snapshot.state == "PLAYING" {
                        self?.startDriftSyncTimer()
                    } else {
                        self?.stopDriftSyncTimer()
                    }
                    
                    // If track changed, request it from peers!
                    if let newTrack = snapshot.trackUrl, newTrack != previousTrack {
                        self?.isReady = false
                        self?.requestTrackFile(trackUrl: newTrack)
                    }
                    
                    // If the track is the SAME, but the state changed to PLAYING and we are ready, play it!
                    if snapshot.state == "PLAYING" && snapshot.trackUrl == previousTrack && self?.currentDownloadTrackUrl == nil {
                        let nowServerTime = (Date().timeIntervalSince1970 * 1000) + (self?.serverTimeOffset ?? 0)
                        let elapsed = nowServerTime - (snapshot.startEpoch ?? nowServerTime)
                        let actualPosition = snapshot.position + elapsed
                        AudioEngine.shared.play(at: actualPosition)
                    }
                }
            } catch let DecodingError.dataCorrupted(context) {
                print("SocketService: Decoding corrupted: \(context)")
            } catch let DecodingError.keyNotFound(key, context) {
                print("SocketService: Key '\(key.stringValue)' not found: \(context.debugDescription)")
            } catch let DecodingError.valueNotFound(value, context) {
                print("SocketService: Value '\(value)' not found: \(context.debugDescription)")
            } catch let DecodingError.typeMismatch(type, context) {
                print("SocketService: Type '\(type)' mismatch: \(context.debugDescription)")
            } catch {
                print("SocketService: Room decoding failed: \(error)")
            }
        }
        
        // Listen to BOTH initial snapshots and continuous state changes
        socket.on("room:snapshot", callback: handleRoomUpdate)
        socket.on("room:stateChanged", callback: handleRoomUpdate)
        
        // Chat listener
        socket.on("room:chat") { [weak self] data, ack in
            guard let dict = data.first as? [String: Any],
                  let jsonData = try? JSONSerialization.data(withJSONObject: dict),
                  let message = try? JSONDecoder().decode(ChatMessage.self, from: jsonData) else { return }
            
            DispatchQueue.main.async {
                self?.chatMessages.append(message)
            }
        }
        
        // Reaction listener
        socket.on("room:reaction") { [weak self] data, ack in
            guard let dict = data.first as? [String: Any],
                  let emoji = dict["emoji"] as? String else { return }
            
            DispatchQueue.main.async {
                self?.activeReaction = emoji
                // Clear reaction after 2.5 seconds
                DispatchQueue.main.asyncAfter(deadline: .now() + 2.5) {
                    if self?.activeReaction == emoji {
                        self?.activeReaction = nil
                    }
                }
            }
        }
        
        // Device sync progress listener
        socket.on("room:deviceSyncProgress") { [weak self] data, ack in
            guard let dict = data.first as? [String: Any],
                  let socketId = dict["socketId"] as? String,
                  let progress = dict["progress"] as? Int else { return }
            
            DispatchQueue.main.async {
                self?.deviceSyncProgress[socketId] = progress
            }
        }
        
        // NTP sync pong listener (calculates latency and clock drift)
        socket.on("sync:pong") { [weak self] data, ack in
            guard let dict = data.first as? [String: Any],
                  let t0 = dict["t0"] as? Double,
                  let t1 = dict["t1"] as? Double,
                  let t2 = dict["t2"] as? Double else { return }
            
            let t3 = Date().timeIntervalSince1970 * 1000
            let rtt = (t3 - t0) - (t2 - t1)
            let offset = ((t1 - t0) + (t2 - t3)) / 2
            
            DispatchQueue.main.async {
                self?.serverTimeOffset = offset
                // Report stats to server
                if let roomId = self?.currentRoom?.roomId {
                    self?.socket.emit("sync:stats", ["roomId": roomId, "latency": rtt, "jitter": 0.0])
                }
                print("SocketService: NTP Offset calculated: \(String(format: "%.2f", offset))ms (RTT: \(String(format: "%.2f", rtt))ms)")
            }
        }
        
        // P2P Audio Streaming Receiver
        socket.on("track:receive_chunk") { [weak self] data, ack in
            guard let self = self,
                  let dict = data.first as? [String: Any],
                  let trackUrl = dict["trackUrl"] as? String,
                  let chunkIndex = dict["chunkIndex"] as? Int,
                  let totalChunks = dict["totalChunks"] as? Int else { return }
            
            guard let chunkData = dict["data"] as? Data else {
                print("SocketService: Failed to parse chunk data for \(trackUrl)")
                return
            }
            
            DispatchQueue.main.async {
                if self.currentDownloadTrackUrl != trackUrl {
                    // New track download started
                    self.chunkBuffer.removeAll()
                    self.currentDownloadTrackUrl = trackUrl
                    self.totalChunksExpected = totalChunks
                    self.downloadProgress = 0.0
                    self.startMissingChunkTimer(trackUrl: trackUrl)
                }
                
                self.chunkBuffer[chunkIndex] = chunkData
                
                let currentProgress = Double(self.chunkBuffer.count) / Double(self.totalChunksExpected)
                self.downloadProgress = currentProgress
                
                if let roomId = self.currentRoom?.roomId {
                    self.socket.emit("room:sync_progress", ["roomId": roomId, "progress": Int(currentProgress * 100)])
                }
                
                // Check if we have all chunks
                if self.chunkBuffer.count == self.totalChunksExpected {
                    print("SocketService: Fully received \(self.totalChunksExpected) chunks for track!")
                    self.downloadProgress = 0.0 // reset for next track
                    self.isReady = true
                    self.missingChunkTimer?.invalidate() // Stop asking for chunks!
                    self.assembleAndPlayTrack(trackUrl: trackUrl)
                }
            }
        }
    }
    
    // MARK: - Actions
    
    func leaveRoom() {
        if let roomId = currentRoom?.roomId {
            socket.emit("room:leave", ["roomId": roomId])
            DispatchQueue.main.async {
                self.currentRoom = nil
                self.chatMessages.removeAll()
                self.deviceSyncProgress.removeAll()
                self.stopDriftSyncTimer()
                AudioEngine.shared.pause()
            }
        }
    }
    
    func joinRoom(roomId: String) {
        self.pendingJoinRoomId = roomId
        let userName = AuthManager.shared.userName ?? "Anonymous"
        let payload: [String: Any] = [
            "roomId": roomId,
            "displayName": "\(userName)::Mac", 
            "userId": AuthManager.shared.userId ?? "anonymous_mac",
            "isReady": self.isReady
        ]
        socket.emit("room:join", payload)
    }
    
    private func startNtpTimer() {
        ntpTimer?.invalidate()
        ntpTimer = Timer.scheduledTimer(withTimeInterval: 10.0, repeats: true) { [weak self] _ in
            self?.performNTPBurst()
        }
    }
    
    private func stopNtpTimer() {
        ntpTimer?.invalidate()
        ntpTimer = nil
    }
    
    private func startDriftSyncTimer() {
        guard driftSyncTimer == nil else { return }
        driftSyncTimer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in
            self?.checkAndCorrectDrift()
        }
    }
    
    private func stopDriftSyncTimer() {
        driftSyncTimer?.invalidate()
        driftSyncTimer = nil
    }
    
    private func checkAndCorrectDrift() {
        guard let room = currentRoom, room.state == "PLAYING", let startEpoch = room.startEpoch else {
            stopDriftSyncTimer()
            return
        }
        
        // Skip if downloading/peering
        guard currentDownloadTrackUrl == nil else { return }
        
        let nowServerTime = (Date().timeIntervalSince1970 * 1000) + serverTimeOffset
        let expected = (nowServerTime - startEpoch) / 1000.0
        let actual = AudioEngine.shared.currentPosition
        
        guard expected >= 0 && actual >= 0 else { return }
        
        let drift = expected - actual
        let driftMs = abs(drift) * 1000
        
        if driftMs > 150 {
            print("[Sync] Correcting drift of \(String(format: "%.1f", driftMs))ms. Seeking to \(expected)s")
            AudioEngine.shared.seek(to: expected * 1000.0)
        }
    }
    
    private func performNTPBurst() {
        let seq = 1
        let payload: [String: Any] = [
            "t0": Date().timeIntervalSince1970 * 1000,
            "seq": seq
        ]
        socket.emit("sync:ping", payload)
    }
    
    func emitNext() {
        guard let roomId = currentRoom?.roomId else { return }
        socket.emit("playback:next", ["roomId": roomId])
    }
    
    func emitPrev() {
        guard let roomId = currentRoom?.roomId else { return }
        socket.emit("playback:prev", ["roomId": roomId])
    }
    
    func emitChat(message: String) {
        guard let roomId = currentRoom?.roomId else { return }
        socket.emit("room:chat", ["roomId": roomId, "message": message])
    }
    
    func emitReaction(emoji: String) {
        guard let roomId = currentRoom?.roomId else { return }
        socket.emit("room:reaction", ["roomId": roomId, "emoji": emoji])
        
        // Show locally instantly
        DispatchQueue.main.async {
            self.activeReaction = emoji
            DispatchQueue.main.asyncAfter(deadline: .now() + 2.5) {
                if self.activeReaction == emoji {
                    self.activeReaction = nil
                }
            }
        }
    }
    
    func triggerForceAll() {
        socket.emit("sync:forceAll")
    }
    
    func emitPlay(positionMs: Double) {
        guard let roomId = currentRoom?.roomId, let trackUrl = currentRoom?.trackUrl else { return }
        let syncedNow = (Date().timeIntervalSince1970 * 1000) + serverTimeOffset
        let startTime = syncedNow + 800 // schedule playback 800ms in the future
        let payload: [String: Any] = [
            "roomId": roomId,
            "trackUrl": trackUrl,
            "positionMs": positionMs,
            "startTime": startTime
        ]
        socket.emit("playback:schedule", payload)
    }

    
    func emitPause(positionMs: Double) {
        guard let roomId = currentRoom?.roomId else { return }
        socket.emit("playback:pause", ["roomId": roomId, "positionMs": positionMs])
    }
    
    func emitSeek(positionMs: Double) {
        guard let roomId = currentRoom?.roomId else { return }
        socket.emit("playback:seek", ["roomId": roomId, "position": positionMs])
    }
    
    // MARK: - Direct Playback
    
    func playTrackDirectly(videoId: String, title: String) {
        guard let url = URL(string: "\(Config.backendURL)/rooms/local/yt-proxy?videoId=\(videoId)") else { return }
        
        DispatchQueue.main.async {
            self.localPlaybackTitle = "Loading: \(title)..."
        }
        print("SocketService: Downloading track \(videoId) directly...")
        
        // SWIFT CONCEPT: Memory Management & Retain Cycles ([weak self])
        // URLSession keeps this closure alive in memory until the download finishes. 
        // If we just wrote `self.localPlaybackTitle = ...`, the closure would strongly hold onto `SocketService`, 
        // preventing it from ever being deleted from memory (a "Retain Cycle" memory leak). 
        // Using `[weak self]` safely tells Swift it's okay to destroy this class if needed.
        let task = URLSession.shared.downloadTask(with: url) { [weak self] localURL, response, error in
            guard let localURL = localURL, error == nil else {
                print("SocketService: Download failed: \(String(describing: error))")
                return
            }
            
            let tempDir = FileManager.default.temporaryDirectory
            let destinationURL = tempDir.appendingPathComponent("syncbeats_local_\(videoId).m4a")
            
            try? FileManager.default.removeItem(at: destinationURL)
            do {
                try FileManager.default.copyItem(at: localURL, to: destinationURL)
                DispatchQueue.main.async {
                    self?.localPlaybackTitle = title
                    AudioEngine.shared.loadFile(url: destinationURL)
                    AudioEngine.shared.play()
                }
            } catch {
                DispatchQueue.main.async {
                    self?.localPlaybackTitle = "Failed to load"
                }
                print("SocketService: Failed to copy downloaded track: \(error)")
            }
        }
        task.resume()
    }
    
    // MARK: - P2P Audio Handling
    
    private func requestTrackFile(trackUrl: String) {
        guard let roomId = currentRoom?.roomId else { return }
        print("SocketService: Requesting P2P track file: \(trackUrl)")
        socket.emit("track:request_file", ["roomId": roomId, "trackUrl": trackUrl])
    }
    
    private func assembleAndPlayTrack(trackUrl: String) {
        // Concatenate all chunks in order
        var completeData = Data()
        for i in 0..<totalChunksExpected {
            if let chunk = chunkBuffer[i] {
                completeData.append(chunk)
            }
        }
        
        // Write to temporary file
        // SWIFT CONCEPT: Disk Space Leak Prevention
        // Previously, every P2P stream created a new file and they were never deleted!
        // This would quickly fill up the user's hard drive. We must manually delete the old one first.
        if let previousFile = self.currentStreamFileUrl {
            try? FileManager.default.removeItem(at: previousFile)
        }
        
        let tempDir = FileManager.default.temporaryDirectory
        let fileUrl = tempDir.appendingPathComponent("syncbeats_stream_\(UUID().uuidString).m4a")
        self.currentStreamFileUrl = fileUrl // Keep track so we can delete it next time!
        
        do {
            try completeData.write(to: fileUrl)
            print("SocketService: Successfully wrote P2P audio stream to disk at \(fileUrl)")
            
            // Feed it into the AudioEngine!
            AudioEngine.shared.loadFile(url: fileUrl)
            
            // SWIFT CONCEPT: Optional Chaining (?.)
            // `currentRoom` is an Optional, meaning we might not be in a room.
            guard let roomId = currentRoom?.roomId else { return }
            socket.emit("room:clientReady", ["roomId": roomId, "isReady": true])
            
            // If the room is already playing, start playback immediately!
            if let room = currentRoom, room.state == "PLAYING" {
                // Adjust position for NTP drift to be perfectly in sync!
                let nowServerTime = (Date().timeIntervalSince1970 * 1000) + serverTimeOffset
                let elapsed = nowServerTime - (room.startEpoch ?? nowServerTime)
                let actualPosition = room.position + elapsed
                AudioEngine.shared.play(at: actualPosition)
            }
        } catch {
            print("SocketService: Failed to write assembled track to disk: \(error)")
        }
        
        self.resetDownloadState()
    }
    
    private func resetDownloadState() {
        self.totalChunksExpected = 0
        self.downloadProgress = 0.0
        // Clear buffer
        chunkBuffer.removeAll()
        currentDownloadTrackUrl = nil
        missingChunkTimer?.invalidate()
        missingChunkTimer = nil
    }
    
    // SWIFT CONCEPT: Missing Chunk Retry Mechanism (Timers)
    // If our WebSockets drop a chunk of data, the buffer hangs forever. 
    // This timer checks every 2 seconds if we are still waiting on chunks.
    private func startMissingChunkTimer(trackUrl: String) {
        missingChunkTimer?.invalidate()
        // Run a block of code every 2.0 seconds
        missingChunkTimer = Timer.scheduledTimer(withTimeInterval: 2.0, repeats: true) { [weak self] _ in
            guard let self = self, 
                  let roomId = self.currentRoom?.roomId,
                  self.currentDownloadTrackUrl == trackUrl, 
                  self.totalChunksExpected > 0 else { return }
            
            // Loop through all expected indexes (0 to totalChunksExpected - 1)
            for i in 0..<self.totalChunksExpected {
                if self.chunkBuffer[i] == nil {
                    // We found a hole in our buffer! Ask the server to resend this specific piece.
                    print("SocketService: Chunk \(i) is missing! Requesting retry...")
                    self.socket.emit("track:request_missing_chunk", [
                        "roomId": roomId, 
                        "trackUrl": trackUrl, 
                        "chunkIndex": i
                    ])
                    break // Only ask for one missing chunk at a time to prevent spam
                }
            }
        }
    }
}
