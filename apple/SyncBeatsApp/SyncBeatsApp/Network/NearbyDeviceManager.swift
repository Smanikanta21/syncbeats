import Foundation
import Network
import Combine
import UIKit

class NearbyDeviceManager: NSObject, ObservableObject {
    static let shared = NearbyDeviceManager()
    
    private let serviceType = "_syncbeats-net._tcp."
    private let serviceDomain = "local."
    
    // We base the display name on the device's actual name
    private let myPeerId = UIDevice.current.name
    
    private var netService: NetService?
    private var serviceBrowser: NetServiceBrowser?
    private var resolvingServices: [NetService] = []
    
    struct DiscoveredPeer: Hashable {
        let name: String
        let ipAddress: String
        let port: Int
    }
    
    @Published var discoveredPeers: [DiscoveredPeer] = []
    
    private override init() {
        super.init()
    }
    
    func start() {
        // 1. Start local WebSocket Server
        LocalSyncServer.shared.start(port: 8080)
        
        // 2. Broadcast ourselves (mDNS)
        netService = NetService(domain: serviceDomain, type: serviceType, name: myPeerId, port: 8080)
        netService?.delegate = self
        netService?.publish()
        
        // 3. Browse for others (mDNS)
        serviceBrowser = NetServiceBrowser()
        serviceBrowser?.delegate = self
        serviceBrowser?.searchForServices(ofType: serviceType, inDomain: serviceDomain)
        
        print("Bonjour: Started advertising and browsing")
    }
    
    func stop() {
        LocalSyncServer.shared.stop()
        netService?.stop()
        serviceBrowser?.stop()
        resolvingServices.removeAll()
        discoveredPeers.removeAll()
        print("Bonjour: Stopped")
    }
}

extension NearbyDeviceManager: NetServiceDelegate {
    func netServiceDidPublish(_ sender: NetService) {
        print("Bonjour: Successfully published service \(sender.name)")
    }
    
    func netService(_ sender: NetService, didNotPublish errorDict: [String : NSNumber]) {
        print("Bonjour: Failed to publish service: \(errorDict)")
    }
    
    func netServiceDidResolveAddress(_ sender: NetService) {
        if let data = sender.addresses?.first {
            var hostname = [CChar](repeating: 0, count: Int(NI_MAXHOST))
            data.withUnsafeBytes { pointer in
                guard let sockaddr = pointer.bindMemory(to: sockaddr.self).baseAddress else { return }
                getnameinfo(sockaddr, socklen_t(data.count), &hostname, socklen_t(hostname.count), nil, 0, NI_NUMERICHOST)
            }
            let ipAddress = String(cString: hostname)
            
            DispatchQueue.main.async {
                let peer = DiscoveredPeer(name: sender.name, ipAddress: ipAddress, port: sender.port)
                if !self.discoveredPeers.contains(peer) {
                    self.discoveredPeers.append(peer)
                }
            }
            resolvingServices.removeAll { $0 === sender }
        }
    }
    
    func netService(_ sender: NetService, didNotResolve errorDict: [String : NSNumber]) {
        print("Bonjour: Failed to resolve service \(sender.name): \(errorDict)")
        resolvingServices.removeAll { $0 === sender }
    }
}

extension NearbyDeviceManager: NetServiceBrowserDelegate {
    func netServiceBrowser(_ browser: NetServiceBrowser, didFind service: NetService, moreComing: Bool) {
        print("Bonjour: Found service: \(service.name)")
        if service.name != myPeerId {
            service.delegate = self
            service.resolve(withTimeout: 5.0)
            resolvingServices.append(service)
        }
    }
    
    func netServiceBrowser(_ browser: NetServiceBrowser, didRemove service: NetService, moreComing: Bool) {
        print("Bonjour: Removed service: \(service.name)")
        DispatchQueue.main.async {
            self.discoveredPeers.removeAll(where: { $0.name == service.name })
        }
    }
}
