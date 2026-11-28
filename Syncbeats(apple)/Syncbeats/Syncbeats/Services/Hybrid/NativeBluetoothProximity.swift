import Foundation
import CoreBluetooth
import Observation

/// RSSI is a rough hint, never a distance measurement or a transport selector.
@MainActor @Observable
final class NativeBluetoothProximity: NSObject, @preconcurrency CBCentralManagerDelegate, @preconcurrency CBPeripheralManagerDelegate {
    struct Signal {
        var rssi: Double
        var samples: Int
        var nearby: Bool
        var seen: Date
    }
    var enabled = UserDefaults.standard.bool(forKey: "nativeNearbyHints") {
        didSet {
            UserDefaults.standard.set(enabled, forKey: "nativeNearbyHints")
            refresh()
        }
    }
    private(set) var availability = "Bluetooth hints are off"
    private(set) var signals: [String: Signal] = [:]
    @ObservationIgnored private var central: CBCentralManager?
    @ObservationIgnored private var peripheral: CBPeripheralManager?
    @ObservationIgnored private var scanTask: Task<Void, Never>?
    @ObservationIgnored private var tag: String?
    @ObservationIgnored private var ownID = ""
    @ObservationIgnored private var services: [CBUUID: String] = [:]

    func configure(tag: String?, ownID: String, memberIDs: Set<String>) {
        let services = Dictionary(uniqueKeysWithValues: memberIDs.filter { $0 != ownID }.prefix(32).map {
            (CBUUID(nsuuid: NativePeerProtocol.bluetoothID(tag: tag ?? "", socketID: $0)), $0)
        })
        guard self.tag != tag || self.ownID != ownID || self.services != services else { return }
        self.tag = tag; self.ownID = ownID; self.services = services
        signals = signals.filter { memberIDs.contains($0.key) }
        refresh()
    }
    func hint(for socketID: String) -> String? {
        guard enabled, let signal = signals[socketID], Date().timeIntervalSince(signal.seen) < 45,
              signal.samples >= 3 else { return nil }
        return signal.nearby ? "Nearby" : "Bluetooth signal detected"
    }
    private func refresh() {
        scanTask?.cancel(); scanTask = nil
        central?.stopScan(); peripheral?.stopAdvertising()
        guard enabled else {
            signals = [:]
            availability = "Bluetooth hints are off"
            return
        }
        guard !services.isEmpty else {
            signals = [:]
            availability = "No other device has joined this room"
            return
        }
        guard tag != nil else {
            signals = [:]
            availability = "Waiting for server authorization for local discovery"
            return
        }
        // Creating managers is deferred until the user enables this optional hint.
        if central == nil { central = CBCentralManager(delegate: self, queue: .main) }
        if peripheral == nil { peripheral = CBPeripheralManager(delegate: self, queue: .main) }
        if peripheral?.state == .poweredOn, let tag {
            peripheral?.startAdvertising([CBAdvertisementDataServiceUUIDsKey:
                [CBUUID(nsuuid: NativePeerProtocol.bluetoothID(tag: tag, socketID: ownID))]])
        }
        guard central?.state == .poweredOn else {
            switch central?.state {
            case .unauthorized: availability = "Bluetooth permission is off"
            case .poweredOff: availability = "Bluetooth is off"
            case .unsupported: availability = "Bluetooth hints are unavailable"
            default: availability = "Checking Bluetooth"
            }
            return
        }
        availability = "Looking for nearby room devices"
        scanTask = Task { [weak self] in
            while !Task.isCancelled {
                guard let self, self.enabled, self.tag != nil else { return }
                self.central?.scanForPeripherals(withServices: Array(self.services.keys),
                    options: [CBCentralManagerScanOptionAllowDuplicatesKey: true])
                try? await Task.sleep(for: .seconds(3))
                self.central?.stopScan()
                guard !Task.isCancelled else { return }
                self.signals = self.signals.filter { Date().timeIntervalSince($0.value.seen) < 45 }
                try? await Task.sleep(for: .seconds(12))
            }
        }
    }
    func centralManagerDidUpdateState(_ central: CBCentralManager) { refresh() }
    func peripheralManagerDidUpdateState(_ peripheral: CBPeripheralManager) { refresh() }
    func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral,
                        advertisementData: [String: Any], rssi RSSI: NSNumber) {
        let rssi = RSSI.doubleValue
        guard rssi < 0, rssi >= -100 else { return } // 127 means unavailable.
        let advertised = (advertisementData[CBAdvertisementDataServiceUUIDsKey] as? [CBUUID] ?? []) +
            (advertisementData[CBAdvertisementDataOverflowServiceUUIDsKey] as? [CBUUID] ?? [])
        for service in advertised {
            guard let id = services[service] else { continue }
            var signal = signals[id] ?? Signal(rssi: rssi, samples: 0, nearby: false, seen: Date())
            signal.rssi = signal.rssi * 0.7 + rssi * 0.3
            signal.samples += 1; signal.seen = Date()
            if signal.samples >= 3 {
                if signal.rssi > -65 { signal.nearby = true }
                else if signal.rssi < -78 { signal.nearby = false }
            }
            signals[id] = signal
        }
    }
}
