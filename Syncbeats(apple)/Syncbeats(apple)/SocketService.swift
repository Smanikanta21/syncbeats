import Foundation
import SocketIO
import Combine

class SocketService: ObservableObject {
    static let shared = SocketService()
    
    private var manager: SocketManager!
    private var socket: SocketIOClient!
    
    @Published var isConnected: Bool = false
    @Published var currentRoom: RoomSnapshot? = nil
    @Published var chatMessages: [ChatMessage] = []
    
    // Audio Chunk Buffering
    private var chunkBuffer: [Int: Data] = [:]
    private var totalChunksExpected: Int = 0
    private var currentDownloadTrackUrl: String? = nil
    @Published var downloadProgress: Double = 0.0
    @Published var isReady: Bool = false
    
    // NTP timing offset (milliseconds)
    @Published var serverTimeOffset: Double = 0.0
    
    private init() {
        // Setup SocketManager
        let url = URL(string: Config.backendURL)!
        // We use .compress for performance, and .log(false) to prevent Xcode console spam
        manager = SocketManager(socketURL: url, config: [.log(false), .compress])
        socket = manager.defaultSocket
        
        setupListeners()
    }
    
    func connect() {
        guard !isConnected else { return }
        
        // Pass the app token for authentication if available
        if let token = AuthManager.shared.appToken {
            manager.config = [.log(false), .compress, .extraHeaders(["Authorization": "Bearer \(token)"])]
        }
        
        socket.connect()
    }
    
    func disconnect() {
        socket.disconnect()
    }
    
    private func setupListeners() {
        socket.on(clientEvent: .connect) { [weak self] data, ack in
            DispatchQueue.main.async {
                self?.isConnected = true
                print("SocketService: Connected to server!")
                // Initiate NTP burst upon connection to calculate micro-drift latency
                self?.performNTPBurst()
                
                // Reconnect to the room if we were in one!
                if let roomId = self?.currentRoom?.roomId {
                    self?.joinRoom(roomId: roomId)
                }
            }
        }
        
        socket.on(clientEvent: .disconnect) { [weak self] data, ack in
            DispatchQueue.main.async {
                self?.isConnected = false
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
                    
                    self?.currentRoom = snapshot
                    print("SocketService: Room snapshot updated for \(snapshot.roomId)")
                    
                    if wasNotInRoom {
                        NotificationCenter.default.post(name: NSNotification.Name("RoomJoined"), object: nil)
                    }
                    
                    // If track changed, request it from peers!
                    if let newTrack = snapshot.trackUrl, newTrack != previousTrack {
                        self?.isReady = false
                        self?.requestTrackFile(trackUrl: newTrack)
                    }
                    
                    // If the track is the SAME, but the state changed to PLAYING and we are ready, play it!
                    if snapshot.state == "PLAYING" && snapshot.trackUrl == previousTrack && self?.currentDownloadTrackUrl == nil {
                        AudioEngine.shared.play(at: snapshot.position)
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
            
            // The binary payload is usually passed as `Data` in socket.io-client-swift
            guard let chunkData = dict["data"] as? Data else {
                print("SocketService: Failed to parse chunk data for \(trackUrl)")
                return
            }
            
            if self.currentDownloadTrackUrl != trackUrl {
                // New track download started
                self.chunkBuffer.removeAll()
                self.currentDownloadTrackUrl = trackUrl
                self.totalChunksExpected = totalChunks
                self.downloadProgress = 0.0
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
                self.assembleAndPlayTrack(trackUrl: trackUrl)
            }
        }
    }
    
    // MARK: - Actions
    
    func joinRoom(roomId: String) {
        let userName = AuthManager.shared.userName ?? "Anonymous"
        let payload: [String: Any] = [
            "roomId": roomId,
            "displayName": "\(userName)::Mac", 
            "userId": AuthManager.shared.userId ?? "anonymous_mac",
            "isReady": self.isReady
        ]
        socket.emit("room:join", payload)
    }
    
    private func performNTPBurst() {
        let seq = 1
        let payload: [String: Any] = [
            "t0": Date().timeIntervalSince1970 * 1000,
            "seq": seq
        ]
        socket.emit("sync:ping", payload)
    }
    
    func triggerForceAll() {
        socket.emit("sync:forceAll")
    }
    
    func emitPlay(positionMs: Double) {
        guard let roomId = currentRoom?.roomId, let trackUrl = currentRoom?.trackUrl else { return }
        let startTime = Date().timeIntervalSince1970 * 1000 + 800
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
        let tempDir = FileManager.default.temporaryDirectory
        let fileUrl = tempDir.appendingPathComponent("syncbeats_stream_\(UUID().uuidString).m4a")
        
        do {
            try completeData.write(to: fileUrl)
            print("SocketService: Successfully wrote P2P audio stream to disk at \(fileUrl)")
            
            // Feed it into the AudioEngine!
            AudioEngine.shared.loadFile(url: fileUrl)
            
            // Tell the backend we are fully buffered and ready to play!
            socket.emit("room:clientReady", ["roomId": currentRoom?.roomId, "isReady": true])
            
            // If the room is already playing, start playback immediately!
            if let room = currentRoom, room.state == "PLAYING" {
                AudioEngine.shared.play(at: room.position)
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
    }
}
