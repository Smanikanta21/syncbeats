import SwiftUI
import CoreGraphics
#if os(macOS)
import AppKit
#else
import UIKit
#endif

nonisolated struct CoverColor: Sendable, Equatable {
    let red: Double
    let green: Double
    let blue: Double
    var color: Color { Color(red: red, green: green, blue: blue) }
}

nonisolated enum CoverPalette {
    static let fallback = [CoverColor(red: 0.24, green: 0.29, blue: 0.27), CoverColor(red: 0.38, green: 0.33, blue: 0.25), CoverColor(red: 0.19, green: 0.23, blue: 0.24)]
    /// Downsample in sRGB, then cluster the actual cover rather than choosing brand colors.
    static func extract(_ image: CGImage) -> [CoverColor] {
        let side = 40
        var pixels = [UInt8](repeating: 0, count: side * side * 4)
        let drew = pixels.withUnsafeMutableBytes { bytes -> Bool in
            guard let context = CGContext(data: bytes.baseAddress, width: side, height: side, bitsPerComponent: 8,
                                          bytesPerRow: side * 4, space: CGColorSpace(name: CGColorSpace.sRGB)!,
                                          bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return false }
            context.draw(image, in: CGRect(x: 0, y: 0, width: side, height: side)); return true
        }
        guard drew else { return fallback }
        var samples: [CoverColor] = []
        for i in stride(from: 0, to: pixels.count, by: 4) where pixels[i + 3] > 200 {
            let r = Double(pixels[i]) / 255, g = Double(pixels[i + 1]) / 255, b = Double(pixels[i + 2]) / 255
            let luminance = r * 0.2126 + g * 0.7152 + b * 0.0722
            if luminance > 0.05 && luminance < 0.94 { samples.append(.init(red: r, green: g, blue: b)) }
        }
        guard !samples.isEmpty else { return fallback }
        func distance(_ a: CoverColor, _ b: CoverColor) -> Double { pow(a.red-b.red,2)+pow(a.green-b.green,2)+pow(a.blue-b.blue,2) }
        var centers = [samples[samples.count / 2]]
        for _ in 1..<4 { centers.append(samples.max { a,b in centers.map { distance(a,$0) }.min()! < centers.map { distance(b,$0) }.min()! }!) }
        var groups = [[CoverColor]](repeating: [], count: centers.count)
        for _ in 0..<6 {
            groups = [[CoverColor]](repeating: [], count: centers.count)
            for sample in samples {
                let index = centers.indices.min { distance(sample, centers[$0]) < distance(sample, centers[$1]) }!
                groups[index].append(sample)
            }
            for index in centers.indices where !groups[index].isEmpty {
                let group = groups[index], n = Double(group.count)
                centers[index] = .init(red: group.map(\.red).reduce(0,+)/n, green: group.map(\.green).reduce(0,+)/n, blue: group.map(\.blue).reduce(0,+)/n)
            }
        }
        return centers.indices.sorted { groups[$0].count > groups[$1].count }.prefix(4).map { index in
            let color = centers[index], gray = color.red * 0.2126 + color.green * 0.7152 + color.blue * 0.0722
            // Preserve hue while removing harsh saturation; foreground protection is separate.
            return CoverColor(red: color.red*0.72+gray*0.28, green: color.green*0.72+gray*0.28, blue: color.blue*0.72+gray*0.28)
        }
    }
}

/// Shared by the expanded and full-screen player; artwork fetching is deduplicated
/// with the cover itself, and stale track tasks cannot apply a previous palette.
struct RoomAlbumAmbient: View {
    @Bindable var room: RoomSession
    var light = false
    var videoColors: [CoverColor]? = nil
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase
    @State private var colors = CoverPalette.fallback
    var body: some View {
        AlbumAmbientBackground(colors: videoColors ?? colors, meter: room.audio.meter, playing: room.audio.rendering && scenePhase != .background, light: light)
            .task(id: room.currentTrack?.artworkRequest) {
                guard let request = room.currentTrack?.artworkRequest,
                      let data = await AlbumArtworkResolver.shared.imageData(for: request) else { return }
                #if os(macOS)
                guard let image = NSImage(data: data)?.cgImage(forProposedRect: nil, context: nil, hints: nil) else { return }
                #else
                guard let image = UIImage(data: data)?.cgImage else { return }
                #endif
                let sampled = await Task.detached(priority: .utility) { CoverPalette.extract(image) }.value
                guard !Task.isCancelled else { return }
                withAnimation(.easeInOut(duration: reduceMotion ? 0 : 1.4)) { colors = sampled }
            }
    }
}

nonisolated enum AmbientGeometry {
    static func blob(index: Int, size: CGSize, time: Double, energy: AudioEnergy) -> Path {
        let phase = Double(index) * 1.73
        let x = size.width * (0.5 + sin(time * 0.23 + phase) * 0.37)
        let y = size.height * (0.48 + cos(time * 0.19 + phase) * 0.36)
        let response = 1 + energy.bass * 0.18 + energy.transient * 0.035
        let rx = size.width * (0.36 + Double(index % 2) * 0.08) * response
        let ry = size.height * (0.36 + Double((index + 1) % 2) * 0.07) * (1 + energy.level * 0.13)
        let count = 12
        let points = (0..<count).map { point -> CGPoint in
            let angle = Double(point) * Double.pi * 2 / Double(count)
            let wave = 1 + sin(angle * 3 + time * 0.45 + phase) * 0.09 + cos(angle * 2 - time * 0.3) * 0.06
            return CGPoint(x: x + cos(angle) * rx * wave, y: y + sin(angle) * ry * wave)
        }
        var path = Path()
        path.move(to: points[0])
        for point in 0..<count {
            let p0 = points[(point + count - 1) % count], p1 = points[point]
            let p2 = points[(point + 1) % count], p3 = points[(point + 2) % count]
            path.addCurve(to: p2,
                control1: CGPoint(x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6),
                control2: CGPoint(x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6))
        }
        path.closeSubpath(); return path
    }
}

struct AlbumAmbientBackground: View {
    let colors: [CoverColor]
    let meter: AudioEnergyMeter
    let playing: Bool
    var light = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var elapsed = 0.0
    @State private var tick: Date?
    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30, paused: reduceMotion || !playing)) { timeline in
            let energy = playing && !reduceMotion ? meter.read() : AudioEnergy()
            let t = reduceMotion ? 0 : elapsed
            Canvas { context, size in
                let tones = colors.isEmpty ? CoverPalette.fallback : colors
                context.fill(Path(CGRect(origin: .zero, size: size)), with: .color(light ? Color(white: 0.92) : Color(white: 0.07)))
                context.drawLayer { layer in
                    layer.addFilter(.blur(radius: min(size.width, size.height) * 0.095))
                    for index in 0..<5 {
                        layer.fill(AmbientGeometry.blob(index: index, size: size, time: t, energy: energy),
                                   with: .color(tones[index % tones.count].color.opacity(light ? 0.48 : 0.88)))
                    }
                }
            }
            .onChange(of: timeline.date) { _, date in
                if let tick, playing && !reduceMotion { elapsed += min(0.1, max(0, date.timeIntervalSince(tick))) }
                tick = date
            }
        }
        .onChange(of: playing) { _, _ in tick = nil }
        .overlay(LinearGradient(colors: light ? [.white.opacity(0.08), .white.opacity(0.5)] : [.black.opacity(0.06), .black.opacity(0.38)], startPoint: .top, endPoint: .bottom))
        .allowsHitTesting(false).accessibilityHidden(true)
    }
}

#if os(macOS)
@MainActor final class FullScreenPlayerController: NSObject, NSWindowDelegate {
    private var window: NSWindow?
    private weak var sourceWindow: NSWindow?
    private var pendingPlayer: (room: RoomSession, light: Bool)?
    private var sourceFullScreenTask: Task<Void, Never>?
    private var transitioning = false
    private var closeRequested = false

    func show(room: RoomSession, light: Bool) {
        if let window { window.makeKeyAndOrderFront(nil); return }
        guard pendingPlayer == nil else { return }
        let sourceWindow = NSApp.mainWindow ?? NSApp.windows.first { $0.isVisible && $0.canBecomeMain }
        self.sourceWindow = sourceWindow
        guard let sourceWindow, !sourceWindow.styleMask.contains(.fullScreen) else {
            openPlayer(room: room, light: light)
            return
        }

        pendingPlayer = (room, light)
        NotificationCenter.default.addObserver(self, selector: #selector(sourceDidEnterFullScreen(_:)),
                                               name: NSWindow.didEnterFullScreenNotification, object: sourceWindow)
        // AppKit only reports a failed entry to the window's delegate, which SwiftUI owns.
        sourceFullScreenTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(5))
            guard !Task.isCancelled else { return }
            self?.cancelPendingOpen()
        }
        NSApp.activate()
        sourceWindow.makeKeyAndOrderFront(nil)
        sourceWindow.toggleFullScreen(nil)
    }

    @objc private func sourceDidEnterFullScreen(_ notification: Notification) {
        sourceFullScreenTask?.cancel()
        // Start the player's Space transition after AppKit finishes handling the main window's.
        sourceFullScreenTask = Task { [weak self] in
            guard !Task.isCancelled, let self, let pendingPlayer else { return }
            cancelPendingOpen()
            openPlayer(room: pendingPlayer.room, light: pendingPlayer.light)
        }
    }

    private func cancelPendingOpen() {
        guard pendingPlayer != nil else { return }
        NotificationCenter.default.removeObserver(self, name: NSWindow.didEnterFullScreenNotification, object: sourceWindow)
        sourceFullScreenTask?.cancel()
        sourceFullScreenTask = nil
        pendingPlayer = nil
    }

    private func openPlayer(room: RoomSession, light: Bool) {
        let screen = sourceWindow?.screen ?? NSScreen.main
        let frame = sourceWindow?.frame ?? screen?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1100, height: 760)
        // A primary, resizable window enters its own macOS full-screen Space.
        // A borderless auxiliary window only covers the desktop.
        let window = NSWindow(contentRect: frame,
                              styleMask: [.titled, .closable, .resizable, .fullSizeContentView],
                              backing: .buffered, defer: false, screen: screen)
        window.title = "SyncBeats full-screen player"
        window.identifier = NSUserInterfaceItemIdentifier("syncbeats.full-screen-player")
        window.titleVisibility = .hidden
        window.titlebarAppearsTransparent = true
        window.toolbar = nil
        for button in [NSWindow.ButtonType.closeButton, .miniaturizeButton, .zoomButton] {
            window.standardWindowButton(button)?.isHidden = true
        }
        window.isReleasedWhenClosed = false
        window.isOpaque = true
        window.backgroundColor = .black
        window.hasShadow = false
        window.tabbingMode = .disallowed
        window.collectionBehavior = [.managed, .fullScreenPrimary]
        window.delegate = self
        window.contentView = NSHostingView(rootView: FullScreenRoomPlayer(room: room, onClose: { [weak self] in self?.close() })
            .preferredColorScheme(light ? .light : .dark))
        self.window = window
        closeRequested = false
        NSApp.activate()
        window.makeKeyAndOrderFront(nil)
        // AppKit may already put a newly shown window in full screen.
        guard !transitioning, !window.styleMask.contains(.fullScreen) else { return }
        transitioning = true
        window.toggleFullScreen(nil)
    }

    func window(_ window: NSWindow,
                willUseFullScreenPresentationOptions proposedOptions: NSApplication.PresentationOptions) -> NSApplication.PresentationOptions {
        var options = proposedOptions
        options.subtract([.hideMenuBar, .autoHideDock])
        options.formUnion([.fullScreen, .hideDock, .autoHideToolbar])
        return options
    }

    func windowWillEnterFullScreen(_ notification: Notification) { transitioning = true }
    func windowDidEnterFullScreen(_ notification: Notification) {
        transitioning = false
        if closeRequested { close() }
    }
    func windowWillExitFullScreen(_ notification: Notification) { transitioning = true }
    func windowDidExitFullScreen(_ notification: Notification) {
        // Also return to the workspace when macOS's Exit Full Screen command is used.
        transitioning = false
        finishClosing()
    }
    func windowDidFailToEnterFullScreen(_ window: NSWindow) {
        transitioning = false
        finishClosing()
    }
    func windowDidFailToExitFullScreen(_ window: NSWindow) {
        transitioning = false
        closeRequested = false
    }

    func close() {
        cancelPendingOpen()
        guard let window else { return }
        closeRequested = true
        // Let AppKit finish its animation before requesting the opposite transition.
        guard !transitioning else { return }
        if window.styleMask.contains(.fullScreen) {
            transitioning = true
            window.toggleFullScreen(nil)
        } else {
            finishClosing()
        }
    }
    func windowShouldClose(_ sender: NSWindow) -> Bool { close(); return false }
    func windowWillClose(_ notification: Notification) { finishClosing() }
    private func finishClosing() {
        guard let window else { return }
        self.window = nil
        transitioning = false
        closeRequested = false
        window.delegate = nil
        window.orderOut(nil)
        window.close()
        if let sourceWindow, sourceWindow.isVisible { sourceWindow.makeKeyAndOrderFront(nil) }
        sourceWindow = nil
    }
}
#endif
