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
    
    // NTP timing offset (milliseconds)
    @Published var serverTimeOffset: Double = 0.0
    
    private init() {
        // Setup SocketManager
        let url = URL(string: "https://dev-api.syncbeats.app")!
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
            }
        }
        
        socket.on(clientEvent: .disconnect) { [weak self] data, ack in
            DispatchQueue.main.async {
                self?.isConnected = false
                print("SocketService: Disconnected from server.")
            }
        }
        
        // Room snapshot listener
        socket.on("room:snapshot") { [weak self] data, ack in
            guard let dict = data.first as? [String: Any],
                  let jsonData = try? JSONSerialization.data(withJSONObject: dict),
                  let snapshot = try? JSONDecoder().decode(RoomSnapshot.self, from: jsonData) else { return }
            
            DispatchQueue.main.async {
                let previousTrack = self?.currentRoom?.trackUrl
                self?.currentRoom = snapshot
                print("SocketService: Room snapshot updated for \(snapshot.roomId)")
                
                // If track changed, request it from peers!
                if let newTrack = snapshot.trackUrl, newTrack != previousTrack {
                    self?.requestTrackFile(trackUrl: newTrack)
                }
            }
        }
        
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
            }
            
            self.chunkBuffer[chunkIndex] = chunkData
            
            // Check if we have all chunks
            if self.chunkBuffer.count == self.totalChunksExpected {
                print("SocketService: Fully received \(self.totalChunksExpected) chunks for track!")
                self.assembleAndPlayTrack(trackUrl: trackUrl)
            }
        }
    }
    
    // MARK: - Actions
    
    func joinRoom(roomId: String) {
        let payload: [String: Any] = [
            "roomId": roomId,
            "displayName": "MacBook Client", // We will pull this from Auth later
            "userId": AuthManager.shared.appToken ?? "anonymous_mac",
            "isReady": true
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
            
            // If the room is already playing, start playback immediately!
            if let room = currentRoom, room.state == "PLAYING" {
                AudioEngine.shared.play(at: room.position)
            }
        } catch {
            print("SocketService: Failed to write assembled track to disk: \(error)")
        }
        
        // Clear buffer
        chunkBuffer.removeAll()
        currentDownloadTrackUrl = nil
    }
}
