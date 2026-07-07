import Foundation
import MultipeerConnectivity
import Combine
import os

class MultipeerManager: NSObject, ObservableObject {
    private let serviceType = "syncbeats-p2p"
    
    // Apple's Multipeer Connectivity handles WiFi and Bluetooth seamlessly
    private var peerID: MCPeerID!
    private var session: MCSession!
    private var advertiser: MCNearbyServiceAdvertiser!
    private var browser: MCNearbyServiceBrowser!
    
    @Published var connectedPeers: [MCPeerID] = []
    
    let logger = Logger(subsystem: "com.syncbeats.mac", category: "MultipeerManager")
    
    override init() {
        super.init()
        
        let hostName = Host.current().localizedName ?? "Mac"
        self.peerID = MCPeerID(displayName: hostName)
        
        // Security identity can be nil for testing, but should be set in prod
        self.session = MCSession(peer: peerID, securityIdentity: nil, encryptionPreference: .required)
        self.session.delegate = self
        
        // Advertiser (makes this Mac discoverable to others)
        self.advertiser = MCNearbyServiceAdvertiser(peer: peerID, discoveryInfo: ["type": "mac"], serviceType: serviceType)
        self.advertiser.delegate = self
        
        // Browser (looks for other SyncBeats devices)
        self.browser = MCNearbyServiceBrowser(peer: peerID, serviceType: serviceType)
        self.browser.delegate = self
    }
    
    func start() {
        advertiser.startAdvertisingPeer()
        browser.startBrowsingForPeers()
        logger.info("Started Multipeer Advertising and Browsing")
    }
    
    func stop() {
        advertiser.stopAdvertisingPeer()
        browser.stopBrowsingForPeers()
        session.disconnect()
        logger.info("Stopped Multipeer")
    }
    
    func sendSyncData(_ payload: Data) {
        guard !session.connectedPeers.isEmpty else { return }
        do {
            try session.send(payload, toPeers: session.connectedPeers, with: .reliable)
        } catch {
            logger.error("Failed to send P2P data: \(error.localizedDescription)")
        }
    }
}

extension MultipeerManager: MCSessionDelegate {
    func session(_ session: MCSession, peer peerID: MCPeerID, didChange state: MCSessionState) {
        DispatchQueue.main.async {
            self.connectedPeers = session.connectedPeers
            switch state {
            case .connected:
                self.logger.info("Connected to \(peerID.displayName)")
            case .connecting:
                self.logger.info("Connecting to \(peerID.displayName)")
            case .notConnected:
                self.logger.info("Disconnected from \(peerID.displayName)")
            @unknown default:
                break
            }
        }
    }
    
    func session(_ session: MCSession, didReceive data: Data, fromPeer peerID: MCPeerID) {
        // Here we will decode the sync payload (e.g. playback position, track info)
        self.logger.info("Received data from \(peerID.displayName): \(data.count) bytes")
        // NotificationCenter.default.post(name: .didReceiveSyncData, object: data)
    }
    
    func session(_ session: MCSession, didReceive stream: InputStream, withName streamName: String, fromPeer peerID: MCPeerID) { }
    func session(_ session: MCSession, didStartReceivingResourceWithName resourceName: String, fromPeer peerID: MCPeerID, with progress: Progress) { }
    func session(_ session: MCSession, didFinishReceivingResourceWithName resourceName: String, fromPeer peerID: MCPeerID, at localURL: URL?, withError error: Error?) { }
}

extension MultipeerManager: MCNearbyServiceAdvertiserDelegate {
    func advertiser(_ advertiser: MCNearbyServiceAdvertiser, didReceiveInvitationFromPeer peerID: MCPeerID, withContext context: Data?, invitationHandler: @escaping (Bool, MCSession?) -> Void) {
        self.logger.info("Received invitation from \(peerID.displayName). Accepting.")
        // Auto-accept for now; in prod, verify room code first
        invitationHandler(true, self.session)
    }
}

extension MultipeerManager: MCNearbyServiceBrowserDelegate {
    func browser(_ browser: MCNearbyServiceBrowser, foundPeer peerID: MCPeerID, withDiscoveryInfo info: [String : String]?) {
        self.logger.info("Found peer: \(peerID.displayName). Inviting.")
        browser.invitePeer(peerID, to: self.session, withContext: nil, timeout: 10)
    }
    
    func browser(_ browser: MCNearbyServiceBrowser, lostPeer peerID: MCPeerID) {
        self.logger.info("Lost peer: \(peerID.displayName)")
    }
}
