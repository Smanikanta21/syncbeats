import AppKit
import SwiftUI
import Combine

class IslandPanel: NSPanel {
    override var canBecomeKey: Bool { return false }
    override var canBecomeMain: Bool { return false }
}

class IslandHostingView<Content: View>: NSHostingView<Content> {
    var stateManager: IslandStateManager
    
    init(rootView: Content, stateManager: IslandStateManager) {
        self.stateManager = stateManager
        super.init(rootView: rootView)
    }
    
    @MainActor required dynamic init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }
    
    @MainActor required dynamic init(rootView: Content) {
        fatalError("init(rootView:) has not been implemented")
    }
    
    override func hitTest(_ point: NSPoint) -> NSView? {
        var hitRect: NSRect = .zero
        
        switch stateManager.mode {
        case .hidden:
            // Never intercept clicks when hidden. Hover is handled globally by MouseTracker.
            return nil
        case .hovered:
            // Intercept clicks on the slightly bloated hovered shape so the user can tap to expand it!
            hitRect = NSRect(x: self.bounds.midX - 137, y: self.bounds.maxY - 44, width: 274, height: 44)
        case .welcome:
            // Never intercept clicks during welcome animation.
            return nil
        case .player:
            // ONLY intercept clicks strictly inside the 700x138 player shape bounds!
            // Anything outside this exact rectangle will pass through to Safari/Main App!
            hitRect = NSRect(x: self.bounds.midX - 350, y: self.bounds.maxY - 138, width: 700, height: 138)
        }
        
        if hitRect.contains(point) {
            return super.hitTest(point)
        }
        
        return nil
    }
}

class MouseTracker {
    var stateManager: IslandStateManager
    var globalMonitor: Any?
    var localMonitor: Any?
    
    init(stateManager: IslandStateManager) {
        self.stateManager = stateManager
        startTracking()
    }
    
    func startTracking() {
        globalMonitor = NSEvent.addGlobalMonitorForEvents(matching: .mouseMoved) { [weak self] event in
            self?.checkMouse(point: NSEvent.mouseLocation)
        }
        localMonitor = NSEvent.addLocalMonitorForEvents(matching: .mouseMoved) { [weak self] event in
            self?.checkMouse(point: NSEvent.mouseLocation)
            return event
        }
    }
    
    func checkMouse(point: NSPoint) {
        guard let screen = NSScreen.screens.first(where: { $0.safeAreaInsets.top > 0 }) ?? NSScreen.main else { return }
        
        let screenMaxY = screen.frame.maxY
        let screenMidX = screen.frame.midX
        
        // Define the trigger zone: 300 wide, 100 tall (extends 40pt above screen top to catch bezel touches!)
        let triggerZone = NSRect(x: screenMidX - 150, y: screenMaxY - 60, width: 300, height: 100)
        
        // If hidden and mouse enters trigger zone -> bloat the island slightly and vibrate!
        if stateManager.mode == .hidden && triggerZone.contains(point) {
            DispatchQueue.main.async {
                NSHapticFeedbackManager.defaultPerformer.perform(.alignment, performanceTime: .now)
                self.stateManager.mode = .hovered
            }
        }
        
        // If hovered but they don't click, and the mouse leaves the trigger zone -> hide again
        if stateManager.mode == .hovered && !triggerZone.contains(point) {
            DispatchQueue.main.async {
                self.stateManager.mode = .hidden
            }
        }
        
        // If player is visible and mouse leaves the player shape -> hide player
        if stateManager.mode == .player {
            // Safe zone perfectly wraps the 700x120 player (plus a little upper buffer for the bezel)
            let safeZone = NSRect(x: screenMidX - 350, y: screenMaxY - 140, width: 700, height: 240)
            if !safeZone.contains(point) {
                DispatchQueue.main.async {
                    self.stateManager.mode = .hidden
                }
            }
        }
    }
}

class AppDelegate: NSObject, NSApplicationDelegate {
    var islandPanel: IslandPanel!
    var stateManager = IslandStateManager()
    var mouseTracker: MouseTracker!
    var cancellables = Set<AnyCancellable>()

    // Panel container must be large enough to hold the fully expanded, wide island and its drop shadow
    private let panelWidth: CGFloat = 800
    private let panelHeight: CGFloat = 350

    func applicationDidFinishLaunching(_ notification: Notification) {
        setupIslandPanel()
        mouseTracker = MouseTracker(stateManager: stateManager)
        triggerWelcomeAnimation()
    }

    private func setupIslandPanel() {
        let hostingView = IslandHostingView(rootView: IslandView(state: stateManager), stateManager: stateManager)

        islandPanel = IslandPanel(
            contentRect: .zero,
            styleMask: [.nonactivatingPanel, .borderless, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        islandPanel.titlebarAppearsTransparent = true
        islandPanel.contentView = hostingView
        islandPanel.backgroundColor = .clear
        islandPanel.isOpaque = false
        islandPanel.hasShadow = false
        
        // Dynamically shut off mouse events when hidden/welcome so the OS perfectly passes clicks through
        stateManager.$mode
            .receive(on: RunLoop.main)
            .sink { [weak self] mode in
                self?.islandPanel.ignoresMouseEvents = (mode == .hidden || mode == .welcome)
            }.store(in: &cancellables)
            
        // Listen for successful room joins to automatically reveal the island!
        NotificationCenter.default.publisher(for: NSNotification.Name("RoomJoined"))
            .receive(on: RunLoop.main)
            .sink { [weak self] _ in
                NSHapticFeedbackManager.defaultPerformer.perform(.alignment, performanceTime: .now)
                withAnimation(.spring(response: 0.6, dampingFraction: 0.75, blendDuration: 0.1)) {
                    self?.stateManager.mode = .player
                }
            }.store(in: &cancellables)

        islandPanel.level = NSWindow.Level(rawValue: Int(CGWindowLevelForKey(.screenSaverWindow)))
        islandPanel.collectionBehavior = [.canJoinAllSpaces, .stationary, .ignoresCycle, .fullScreenAuxiliary]

        pinPanelToTopOfScreen()
        islandPanel.orderFrontRegardless()
    }

    private func pinPanelToTopOfScreen() {
        let screen = NSScreen.screens.first(where: { $0.safeAreaInsets.top > 0 }) ?? NSScreen.main!

        let xPos = screen.frame.midX - panelWidth / 2
        let yPos = screen.frame.maxY - panelHeight

        islandPanel.setFrame(NSRect(x: xPos, y: yPos, width: panelWidth, height: panelHeight), display: true)
    }

    private func triggerWelcomeAnimation() {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) {
            withAnimation(.spring(response: 0.65, dampingFraction: 0.72)) {
                self.stateManager.mode = .welcome
            }
            
            DispatchQueue.main.asyncAfter(deadline: .now() + 2.5) {
                withAnimation(.spring(response: 0.55, dampingFraction: 0.82)) {
                    self.stateManager.mode = .hidden
                }
            }
        }
    }
    
    // Automatically route focus to the main app window instead of the Island
    func applicationDidBecomeActive(_ notification: Notification) {
        // Find the main SwiftUI window (which is not our IslandPanel)
        if let mainWindow = NSApp.windows.first(where: { $0 !== islandPanel }) {
            mainWindow.makeKeyAndOrderFront(nil)
        }
    }

    // Intercept custom URL scheme launches (deep links) to avoid duplicate window creation
    func application(_ application: NSApplication, open urls: [URL]) {
        if let url = urls.first {
            AuthManager.shared.handleDeepLink(url)
        }
        // Focus the main window when opening a deep link
        if let mainWindow = NSApp.windows.first(where: { $0 !== islandPanel }) {
            mainWindow.makeKeyAndOrderFront(nil)
        }
    }
}
