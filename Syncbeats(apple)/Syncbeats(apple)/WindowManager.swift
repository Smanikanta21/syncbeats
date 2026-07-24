import AppKit
import SwiftUI
import Combine

class IslandPanel: NSPanel {
    override var canBecomeKey: Bool { return false }
    override var canBecomeMain: Bool { return false }
}

class IslandWrapperView: NSView {
    override func hitTest(_ point: NSPoint) -> NSView? {
        let hit = super.hitTest(point)
        // If the hit view is just the wrapper itself, let it pass through to the OS
        return hit == self ? nil : hit
    }
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
            // width: 245, height: 51
            hitRect = NSRect(x: self.bounds.midX - 122.5, y: self.bounds.maxY - 51, width: 245, height: 51)
        case .welcome, .roomWelcome:
            // Never intercept clicks during welcome animation.
            return nil
        case .miniPlayer:
            // Match the actual dimensions of the miniPlayer so controls (like play/pause on the right)
            // are fully hoverable and clickable when active.
            hitRect = NSRect(x: self.bounds.midX - 171, y: self.bounds.maxY - 47, width: 342, height: 47)
        case .downloading:
            // width: 440, height: 89
            hitRect = NSRect(x: self.bounds.midX - 220, y: self.bounds.maxY - 89, width: 440, height: 89)
        case .player:
            // width: 700, height: 159
            hitRect = NSRect(x: self.bounds.midX - 350, y: self.bounds.maxY - 159, width: 700, height: 159)
        }
        
        if hitRect.contains(point) {
            return super.hitTest(point)
        }
        
        return nil
    }
}

@MainActor
class MouseTracker {
    var stateManager: IslandStateManager
    weak var islandPanel: IslandPanel?
    var globalMonitor: Any?
    var localMonitor: Any?
    
    init(stateManager: IslandStateManager, islandPanel: IslandPanel) {
        self.stateManager = stateManager
        self.islandPanel = islandPanel
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
    
    deinit {
        let gMon = globalMonitor
        let lMon = localMonitor
        DispatchQueue.main.async {
            if let g = gMon { NSEvent.removeMonitor(g) }
            if let l = lMon { NSEvent.removeMonitor(l) }
        }
    }
    
    private func activeHitRect(for mode: IslandMode, screen: NSScreen) -> NSRect {
        let screenMaxY = screen.frame.maxY
        let screenMidX = screen.frame.midX
        
        switch mode {
        case .hidden:
            return .zero
        case .hovered:
            return NSRect(x: screenMidX - 122.5, y: screenMaxY - 51, width: 245, height: 51)
        case .welcome, .roomWelcome:
            return .zero
        case .miniPlayer:
            return NSRect(x: screenMidX - 171, y: screenMaxY - 47, width: 342, height: 47)
        case .downloading:
            return NSRect(x: screenMidX - 220, y: screenMaxY - 89, width: 440, height: 89)
        case .player:
            return NSRect(x: screenMidX - 350, y: screenMaxY - 159, width: 700, height: 159)
        }
    }
    
    func checkMouse(point: NSPoint) {
        guard let screen = NSScreen.screens.first(where: { $0.safeAreaInsets.top > 0 }) ?? NSScreen.main else { return }
        
        let screenMaxY = screen.frame.maxY
        let screenMidX = screen.frame.midX
        
        // Define the entry trigger zone (when hidden): only the top 20pt of the screen
        let entryTriggerZone = NSRect(x: screenMidX - 150, y: screenMaxY - 20, width: 300, height: 60)
        
        // Define the leave zone (when hovered): extends down to 60pt to cover the hovered view
        let hoveredStayZone = NSRect(x: screenMidX - 150, y: screenMaxY - 60, width: 300, height: 100)
        
        let fallbackMode: IslandMode = PlayerEngine.shared.hasTrack ? .miniPlayer : .hidden
        
        // If hidden and mouse enters entry trigger zone -> bloat the island slightly and vibrate!
        if stateManager.mode == .hidden && entryTriggerZone.contains(point) {
            DispatchQueue.main.async {
                NSHapticFeedbackManager.defaultPerformer.perform(.alignment, performanceTime: .now)
                self.stateManager.mode = .hovered
            }
        }
        
        // If hovered but they don't click, and the mouse leaves the hovered stay zone -> hide again
        if stateManager.mode == .hovered && !hoveredStayZone.contains(point) {
            DispatchQueue.main.async {
                self.stateManager.mode = fallbackMode
            }
        }
        
        // If player is visible and mouse leaves the player shape -> collapse
        if stateManager.mode == .player {
            let safeZone = NSRect(x: screenMidX - 350, y: screenMaxY - 170, width: 700, height: 270)
            if !safeZone.contains(point) {
                DispatchQueue.main.async {
                    self.stateManager.mode = fallbackMode
                }
            }
        }
        
        // DYNAMIC IGNORES MOUSE EVENTS TOGGLE
        let activeRect = activeHitRect(for: stateManager.mode, screen: screen)
        let isInside = activeRect.contains(point)
        
        if isInside {
            if islandPanel?.ignoresMouseEvents == true {
                islandPanel?.ignoresMouseEvents = false
            }
        } else {
            if islandPanel?.ignoresMouseEvents == false {
                islandPanel?.ignoresMouseEvents = true
            }
        }
    }
}

@MainActor
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
        triggerWelcomeAnimation()
    }

    private func setupIslandPanel() {
        let hostingView = IslandHostingView(rootView: IslandView(state: stateManager), stateManager: stateManager)
        
        // Prevent SwiftUI from fighting with our custom window sizing, avoiding the Auto Layout infinite loop crash
        if #available(macOS 10.15, *) {
            hostingView.sizingOptions = []
        }

        islandPanel = IslandPanel(
            contentRect: .zero,
            styleMask: [.nonactivatingPanel, .borderless, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        islandPanel.titlebarAppearsTransparent = true
        
        // BULLETPROOF WORKAROUND: Wrap NSHostingView in a plain NSView so SwiftUI cannot access the NSWindow's constraints!
        let wrapperView = IslandWrapperView(frame: .zero)
        hostingView.frame = wrapperView.bounds
        hostingView.autoresizingMask = [.width, .height]
        wrapperView.addSubview(hostingView)
        islandPanel.contentView = wrapperView
        
        islandPanel.backgroundColor = .clear
        islandPanel.isOpaque = false
        islandPanel.hasShadow = false
        
        // Setup mouse tracker with panel reference
        mouseTracker = MouseTracker(stateManager: stateManager, islandPanel: islandPanel)
        
        // Dynamically update window frame and ignoresMouseEvents so the OS perfectly passes clicks and hover through
        stateManager.$mode
            .receive(on: RunLoop.main)
            .sink { [weak self] mode in
                guard let self = self else { return }
                
                switch mode {
                case .hidden, .welcome, .roomWelcome:
                    self.islandPanel.ignoresMouseEvents = true
                default:
                    self.islandPanel.ignoresMouseEvents = true // Always default to true, MouseTracker will toggle
                }
                
                self.updateWindowFrame(for: mode)
                self.mouseTracker?.checkMouse(point: NSEvent.mouseLocation)
            }.store(in: &cancellables)
            
        // Listen for successful room joins to automatically reveal the island!
        NotificationCenter.default.publisher(for: NSNotification.Name("RoomJoined"))
            .receive(on: RunLoop.main)
            .sink { [weak self] note in
                guard let self = self else { return }
                NSHapticFeedbackManager.defaultPerformer.perform(.alignment, performanceTime: .now)

                // Real room id comes from DevicesView (POST /rooms response); fall back
                // to the live RoomSocket, then to a neutral label if neither is set yet.
                let roomId = (note.userInfo?["roomId"] as? String)
                    ?? RoomSocket.shared.roomId
                    ?? "SyncBeats"
                withAnimation(.spring(response: 0.6, dampingFraction: 0.75, blendDuration: 0.1)) {
                    self.stateManager.mode = .roomWelcome(roomId)
                }
                
                // Automatically transition to miniPlayer mode after 2.5 seconds
                // (previously went to .player which blocked the entire top 700x159pt of the screen)
                DispatchQueue.main.asyncAfter(deadline: .now() + 2.5) {
                    // Only transition if we are still in the roomWelcome mode
                    if case .roomWelcome = self.stateManager.mode {
                        withAnimation(.spring(response: 0.6, dampingFraction: 0.75, blendDuration: 0.1)) {
                            self.stateManager.mode = .miniPlayer
                        }
                    }
                }
            }.store(in: &cancellables)
            
        // Listen for track playback start — expand island to show downloading/loading or miniPlayer state.
        NotificationCenter.default.publisher(for: PlayerEngine.didStartPlayingNotification)
            .receive(on: RunLoop.main)
            .sink { [weak self] _ in
                guard let self = self else { return }
                let targetMode: IslandMode = PlayerEngine.shared.isLoading ? .downloading : .miniPlayer
                print("[WindowManager] didStartPlayingNotification received — expanding to \(targetMode)")
                withAnimation(.spring(response: 0.6, dampingFraction: 0.75, blendDuration: 0.1)) {
                    self.stateManager.mode = targetMode
                }
            }.store(in: &cancellables)

        islandPanel.level = NSWindow.Level(rawValue: Int(CGWindowLevelForKey(.screenSaverWindow)))
        islandPanel.collectionBehavior = [.canJoinAllSpaces, .stationary, .ignoresCycle, .fullScreenAuxiliary]

        pinPanelToTopOfScreen()
        islandPanel.orderFrontRegardless()
    }

    private func pinPanelToTopOfScreen() {
        updateWindowFrame(for: stateManager.mode)
    }
    
    private func updateWindowFrame(for mode: IslandMode) {
        guard let screen = NSScreen.screens.first(where: { $0.safeAreaInsets.top > 0 }) ?? NSScreen.main else { return }

        // The panel is a single FIXED, top-pinned window large enough to hold the fully
        // expanded player (700x159) plus its drop shadow. It is NEVER resized per-mode.
        //
        // Only the SwiftUI island animates *inside* this window, and the island is
        // top-anchored (VStack alignment: .top + Spacer), so it always stays flush under
        // the notch and grows/shrinks straight downward when opening or expanding.
        //
        // Previously the window itself was resized per-mode (instant on expand, delayed on
        // collapse). Because the resize was dispatched a runloop hop after the SwiftUI spring
        // had already started, the window geometry and the animated content were momentarily
        // out of sync — which made the island detach and drift down from the notch mid-open.
        //
        // Click-through is unaffected: hitTest() gates hits to the precise per-mode region at
        // the top of the window, and ignoresMouseEvents is toggled by mode in the sink above.
        let newFrame = NSRect(
            x: screen.frame.midX - (panelWidth / 2),
            y: screen.frame.maxY - panelHeight, // top edge stays flush with screen top (under the notch)
            width: panelWidth,
            height: panelHeight
        )

        if islandPanel.frame != newFrame {
            islandPanel.setFrame(newFrame, display: true, animate: false)
        }
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
        // Focus the main window when opening a deep link
        if let mainWindow = NSApp.windows.first(where: { $0 !== islandPanel }) {
            mainWindow.makeKeyAndOrderFront(nil)
        }
    }
}
