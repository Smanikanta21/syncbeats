import Foundation
import Network
import CoreBluetooth
import Combine
class ProximityScanner: NSObject, ObservableObject, CBPeripheralManagerDelegate {
    static let shared = ProximityScanner()
    
    // Bonjour listener (NWListener)
    private var listener: NWListener?
    
    // BLE peripheral
    private var peripheralManager: CBPeripheralManager?
    
    override private init() {
        super.init()
    }
    
    func startBroadcasting() {
        startBonjour()
        startBLE()
    }
    
    func stopBroadcasting() {
        listener?.cancel()
        listener = nil
        peripheralManager?.stopAdvertising()
        peripheralManager = nil
    }
    
    private func startBonjour() {
        do {
            let parameters = NWParameters.tcp
            listener = try NWListener(using: parameters)
            listener?.service = NWListener.Service(name: Endpoint.deviceName, type: "_syncbeats._tcp")
            
            listener?.stateUpdateHandler = { state in
                print("[ProximityScanner] Bonjour State: \(state)")
            }
            
            listener?.start(queue: .main)
        } catch {
            print("[ProximityScanner] Failed to start Bonjour: \(error)")
        }
    }
    
    private func startBLE() {
        if peripheralManager == nil {
            peripheralManager = CBPeripheralManager(delegate: self, queue: nil)
        }
    }
    
    func peripheralManagerDidUpdateState(_ peripheral: CBPeripheralManager) {
        if peripheral.state == .poweredOn {
            // A random UUID generated for SyncBeats local discovery
            let serviceUUID = CBUUID(string: "2B5458CB-A57E-46DE-9A6B-9F7A23419DB2")
            let advertisementData: [String: Any] = [
                CBAdvertisementDataLocalNameKey: Endpoint.deviceName,
                CBAdvertisementDataServiceUUIDsKey: [serviceUUID]
            ]
            peripheralManager?.startAdvertising(advertisementData)
            print("[ProximityScanner] BLE Broadcasting started")
        } else {
            print("[ProximityScanner] BLE State changed to: \(peripheral.state.rawValue)")
        }
    }
}
