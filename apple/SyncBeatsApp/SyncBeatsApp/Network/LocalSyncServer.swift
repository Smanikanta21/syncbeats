import Foundation
import Network
import Combine

class LocalSyncServer: ObservableObject {
    static let shared = LocalSyncServer()
    
    private var listener: NWListener?
    private var connectedClients: [NWConnection] = []
    
    // Simplistic room state for P2P
    private var currentTrackUrl: String?
    private var isPlaying = false
    private var startEpoch: Double = 0.0
    private var pauseOffset: Double = 0.0
    private var positionMs: Double = 0.0

    func start(port: UInt16 = 8080) {
        do {
            let parameters = NWParameters.tcp
            let webSocketOptions = NWProtocolWebSocket.Options()
            webSocketOptions.autoReplyPing = true
            parameters.defaultProtocolStack.applicationProtocols.insert(webSocketOptions, at: 0)
            
            let nwPort = NWEndpoint.Port(rawValue: port)!
            listener = try NWListener(using: parameters, on: nwPort)
            
            listener?.stateUpdateHandler = { state in
                switch state {
                case .ready:
                    print("LocalSyncServer started on port \(port)")
                case .failed(let error):
                    print("LocalSyncServer failed: \(error)")
                default:
                    break
                }
            }
            
            listener?.newConnectionHandler = { [weak self] newConnection in
                self?.handleNewConnection(newConnection)
            }
            
            listener?.start(queue: .main)
        } catch {
            print("Failed to start LocalSyncServer: \(error)")
        }
    }
    
    func stop() {
        listener?.cancel()
        listener = nil
        for client in connectedClients {
            client.cancel()
        }
        connectedClients.removeAll()
    }
    
    private func handleNewConnection(_ connection: NWConnection) {
        connection.stateUpdateHandler = { [weak self] state in
            switch state {
            case .ready:
                print("LocalSyncServer: Client connected")
                self?.connectedClients.append(connection)
                self?.sendInitialSnapshot(to: connection)
                self?.receiveMessage(from: connection)
            case .failed(let error):
                print("LocalSyncServer: Client failed with error: \(error)")
                self?.removeConnection(connection)
            case .cancelled:
                print("LocalSyncServer: Client disconnected")
                self?.removeConnection(connection)
            default:
                break
            }
        }
        connection.start(queue: .main)
    }
    
    private func removeConnection(_ connection: NWConnection) {
        connectedClients.removeAll(where: { $0 === connection })
    }
    
    private func sendInitialSnapshot(to connection: NWConnection) {
        let snapshot: [String: Any] = [
            "type": "room:snapshot",
            "trackUrl": currentTrackUrl ?? NSNull(),
            "isPlaying": isPlaying,
            "startEpoch": startEpoch,
            "pauseOffset": pauseOffset,
            "positionMs": positionMs
        ]
        sendMessage(snapshot, to: connection)
    }
    
    private func receiveMessage(from connection: NWConnection) {
        connection.receiveMessage { [weak self] (data, context, isComplete, error) in
            if let error = error {
                print("LocalSyncServer receive error: \(error)")
                self?.removeConnection(connection)
                return
            }
            
            if let data = data,
               let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let event = json["event"] as? String,
               let payload = json["payload"] as? [String: Any] {
                self?.handleEvent(event, payload: payload)
            }
            
            // Continue listening
            self?.receiveMessage(from: connection)
        }
    }
    
    private func handleEvent(_ event: String, payload: [String: Any]) {
        switch event {
        case "playback:schedule":
            currentTrackUrl = payload["trackUrl"] as? String
            positionMs = payload["positionMs"] as? Double ?? 0.0
            startEpoch = payload["startTime"] as? Double ?? 0.0
            isPlaying = true
            pauseOffset = 0.0
            broadcastEvent(event: "playback:schedule", payload: payload)
            
        case "playback:pause":
            positionMs = payload["positionMs"] as? Double ?? 0.0
            pauseOffset = positionMs / 1000.0
            isPlaying = false
            broadcastEvent(event: "playback:pause", payload: payload)
            
        case "room:updateQueue":
            currentTrackUrl = payload["trackUrl"] as? String
            broadcastEvent(event: "room:updateQueue", payload: payload)
            
        default:
            break
        }
    }
    
    private func broadcastEvent(event: String, payload: [String: Any]) {
        let msg: [String: Any] = [
            "type": event,
            "payload": payload
        ]
        for client in connectedClients {
            sendMessage(msg, to: client)
        }
    }
    
    private func sendMessage(_ message: [String: Any], to connection: NWConnection) {
        guard let data = try? JSONSerialization.data(withJSONObject: message) else { return }
        let metadata = NWProtocolWebSocket.Metadata(opcode: .text)
        let context = NWConnection.ContentContext(identifier: "textContext", metadata: [metadata])
        
        connection.send(content: data, contentContext: context, isComplete: true, completion: .contentProcessed({ error in
            if let error = error {
                print("LocalSyncServer send error: \(error)")
                self.removeConnection(connection)
            }
        }))
    }
}
