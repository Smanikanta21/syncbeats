import Foundation
import Observation
import SocketIO

@MainActor @Observable final class NativeAccountUpdates {
    private(set) var connected = false
    @ObservationIgnored private var manager: SocketManager?
    @ObservationIgnored private var credentials: RoomCredentials?
    @ObservationIgnored private var generation = UUID()
    @ObservationIgnored private var pendingKinds: Set<String> = []
    @ObservationIgnored private var pending: Task<Void, Never>?

    func connect(_ incoming: RoomCredentials?, onChange: @escaping @MainActor (String) -> Void) {
        if let incoming, let current = credentials, incoming.userID == current.userID, incoming.token == current.token, incoming.baseURL == current.baseURL { return }
        disconnect()
        guard let incoming else { return }
        credentials = incoming
        let active = generation
        let manager = SocketManager(socketURL: incoming.baseURL, config: [.log(false), .forceWebsockets(true), .reconnects(true), .reconnectAttempts(-1), .reconnectWait(2), .handleQueue(.main), .extraHeaders(["Authorization": "Bearer " + incoming.token, "x-device-id": incoming.deviceID])])
        self.manager = manager
        let socket = manager.defaultSocket
        socket.on(clientEvent: .connect) { [weak self, weak socket] _, _ in
            guard let self, self.generation == active else { return }
            socket?.emitWithAck("account:subscribe", [:] as [String: String]).timingOut(after: 8) { [weak self] response in
                guard let self, self.generation == active else { return }
                self.connected = (response.first as? [String: Any])?["ok"] as? Bool == true
                if self.connected { onChange("all") }
            }
        }
        socket.on("account:changed") { [weak self] data, _ in
            guard let self, self.generation == active, let kind = (data.first as? [String: Any])?["kind"] as? String else { return }
            self.pending?.cancel()
            self.pendingKinds.insert(kind)
            self.pending = Task { [weak self] in
                try? await Task.sleep(for: .milliseconds(250))
                guard !Task.isCancelled, let self, self.generation == active else { return }
                let update = self.pendingKinds.count == 1 ? self.pendingKinds.first! : "all"
                self.pendingKinds.removeAll()
                onChange(update)
            }
        }
        socket.on(clientEvent: .disconnect) { [weak self] _, _ in if self?.generation == active { self?.connected = false } }
        socket.on("account:expired") { [weak self] _, _ in if self?.generation == active { self?.connected = false } }
        socket.connect()
    }
    func disconnect() {
        generation = UUID(); pending?.cancel(); pending = nil; pendingKinds.removeAll(); connected = false; credentials = nil
        manager?.defaultSocket.removeAllHandlers(); manager?.disconnect(); manager = nil
    }
}
