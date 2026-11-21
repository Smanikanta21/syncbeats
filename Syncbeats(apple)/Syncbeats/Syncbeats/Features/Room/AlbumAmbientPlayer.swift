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
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var colors = CoverPalette.fallback
    var body: some View {
        AlbumAmbientBackground(colors: colors, meter: room.audio.meter, playing: room.audio.rendering, light: light)
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
/// Cover the physical display, including the menu-bar strip on a notched Mac.
/// AppKit normally constrains borderless windows to the desktop's visible frame.
@MainActor final class FullScreenPlayerWindow: NSWindow {
    override func constrainFrameRect(_ frameRect: NSRect, to screen: NSScreen?) -> NSRect { frameRect }
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { true }
}

@MainActor final class FullScreenPlayerController: NSObject, NSWindowDelegate {
    private var window: NSWindow?
    private var savedPresentationOptions: NSApplication.PresentationOptions?
    private var observers: [NSObjectProtocol] = []

    func show(room: RoomSession) {
        if let window { window.makeKeyAndOrderFront(nil); return }
        let screen = NSApp.keyWindow?.screen ?? NSScreen.main
        let frame = screen?.frame ?? NSRect(x: 0, y: 0, width: 1100, height: 760)
        let window = FullScreenPlayerWindow(contentRect: frame, styleMask: [.borderless], backing: .buffered, defer: false)
        window.title = "SyncBeats full-screen player"
        window.identifier = NSUserInterfaceItemIdentifier("syncbeats.full-screen-player")
        window.isReleasedWhenClosed = false
        window.backgroundColor = .black
        window.hasShadow = false
        window.collectionBehavior = [.managed, .fullScreenAuxiliary]
        window.delegate = self
        let host = NSHostingView(rootView: FullScreenRoomPlayer(room: room, onClose: { [weak self] in self?.close() },
                                                              cameraTopInset: screen?.safeAreaInsets.top ?? 0)
            .ignoresSafeArea(.container, edges: .all))
        window.contentView = host
        window.setFrame(frame, display: false)
        self.window = window
        observePresentation()
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        applyPresentation()
    }

    private func observePresentation() {
        let center = NotificationCenter.default
        for name in [NSApplication.didBecomeActiveNotification, NSApplication.didResignActiveNotification,
                     NSWindow.didBecomeKeyNotification, NSApplication.didChangeScreenParametersNotification] {
            observers.append(center.addObserver(forName: name, object: nil, queue: .main) { [weak self] notification in
                MainActor.assumeIsolated {
                    guard let self else { return }
                    if notification.name == NSApplication.didChangeScreenParametersNotification,
                       let window = self.window, let screen = window.screen ?? NSScreen.main {
                        window.setFrame(screen.frame, display: true)
                    }
                    self.applyPresentation()
                }
            })
        }
    }

    private func applyPresentation() {
        guard let window, window.isVisible, NSApp.isActive,
              NSApp.keyWindow === window || NSApp.keyWindow is IslandPanel else {
            restorePresentation()
            return
        }
        if savedPresentationOptions == nil { savedPresentationOptions = NSApp.presentationOptions }
        NSApp.presentationOptions = Self.playerPresentationOptions(from: NSApp.presentationOptions)
    }

    static func playerPresentationOptions(from baseline: NSApplication.PresentationOptions) -> NSApplication.PresentationOptions {
        var options = baseline
        options.subtract([.autoHideMenuBar, .autoHideDock])
        options.formUnion([.hideMenuBar, .hideDock])
        return options
    }

    private func restorePresentation() {
        if let savedPresentationOptions {
            NSApp.presentationOptions = savedPresentationOptions
            self.savedPresentationOptions = nil
        }
    }

    func close() {
        window?.orderOut(nil)
        window?.close()
        finishClosing()
    }
    func windowWillClose(_ notification: Notification) { finishClosing() }
    private func finishClosing() {
        window = nil
        for observer in observers { NotificationCenter.default.removeObserver(observer) }
        observers.removeAll()
        restorePresentation()
    }
}

#endif
