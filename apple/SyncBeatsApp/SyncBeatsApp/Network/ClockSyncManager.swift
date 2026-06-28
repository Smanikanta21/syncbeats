import Foundation
import Combine
import SocketIO

class ClockSyncManager: ObservableObject {
    static let shared = ClockSyncManager()
    
    @Published var isSynced = false
    private var offsets: [Double] = []
    private var pingTimer: Timer?
    private weak var socket: SocketIOClient?
    
    // Average clock offset (server time = local time + offset)
    private(set) var clockOffset: Double = 0
    
    func startSyncing(with socket: SocketIOClient) {
        self.socket = socket
        self.offsets.removeAll()
        self.isSynced = false
        
        socket.on("sync:pong") { [weak self] dataArray, _ in
            guard let self = self,
                  let data = dataArray.first as? [String: Any],
                  let t0 = data["t0"] as? Double,
                  let t1 = data["t1"] as? Double,
                  let t2 = data["t2"] as? Double else { return }
            
            let t3 = Date().timeIntervalSince1970 * 1000.0
            
            // Calculate RTT and offset
            let rtt = (t3 - t0) - (t2 - t1)
            let offset = ((t1 - t0) + (t2 - t3)) / 2.0
            
            // Only accept pings with reasonable RTT (< 500ms) to avoid massive jitter
            if rtt < 500 {
                self.offsets.append(offset)
                if self.offsets.count > 10 {
                    self.offsets.removeFirst()
                }
                
                // Use median of recent offsets for stability
                let sorted = self.offsets.sorted()
                self.clockOffset = sorted[sorted.count / 2]
                
                DispatchQueue.main.async {
                    if self.offsets.count >= 3 {
                        self.isSynced = true
                    }
                }
            }
        }
        
        // Initial burst of pings to get sync quickly
        pingBurst(count: 5)
        
        // Background slow ping to keep clock drift in check (every 10 seconds)
        pingTimer?.invalidate()
        pingTimer = Timer.scheduledTimer(withTimeInterval: 10.0, repeats: true) { [weak self] _ in
            self?.sendPing()
        }
    }
    
    func stopSyncing() {
        pingTimer?.invalidate()
        pingTimer = nil
        isSynced = false
    }
    
    private func pingBurst(count: Int) {
        var remaining = count
        Timer.scheduledTimer(withTimeInterval: 0.2, repeats: true) { [weak self] timer in
            guard let self = self else {
                timer.invalidate()
                return
            }
            self.sendPing()
            remaining -= 1
            if remaining <= 0 {
                timer.invalidate()
            }
        }
    }
    
    private func sendPing() {
        let t0 = Date().timeIntervalSince1970 * 1000.0
        socket?.emit("sync:ping", ["t0": t0])
    }
    
    // Returns the current synchronized server time in milliseconds
    func currentServerTimeMs() -> Double {
        let localTime = Date().timeIntervalSince1970 * 1000.0
        return localTime + clockOffset
    }
}
