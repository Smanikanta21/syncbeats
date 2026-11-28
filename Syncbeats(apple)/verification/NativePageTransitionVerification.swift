import AppKit
import SwiftUI

// Exercise SwiftUI's actual layout engine: compilation cannot catch the
// invalid view origin caused by interrupting zero-duration keyframes.
private struct TransitionFixture: View {
    @State private var page = false
    let window: NSWindow
    let resize: Bool
    let finished: () -> Void

    var body: some View {
        GeometryReader { _ in
            VStack(spacing: 0) {
                Text("SyncBeats").frame(height: 60)
                Group {
                    if page {
                        GeometryReader { _ in
                            Text("Library").frame(maxWidth: .infinity, maxHeight: .infinity)
                        }
                    } else {
                        GeometryReader { _ in
                            Text("Home").frame(maxWidth: .infinity, maxHeight: .infinity)
                        }
                    }
                }
                .nativePageTransition(value: page)
                .clipped()
            }
        }
        .task {
            // Interrupt transitions and resize through compact and wide layouts.
            for index in 0..<32 {
                page.toggle()
                if resize {
                    window.setContentSize(index.isMultiple(of: 2)
                        ? NSSize(width: 520, height: 420)
                        : NSSize(width: 960, height: 561))
                }
                try? await Task.sleep(for: .milliseconds(25))
            }
            try? await Task.sleep(for: .milliseconds(400))
            finished()
        }
    }
}

@MainActor
private final class TransitionChecks: NSObject, NSApplicationDelegate {
    private var windows: [NSWindow] = []
    private var completed = 0

    func applicationDidFinishLaunching(_ notification: Notification) {
        for resize in [false, true] {
            let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 960, height: 561),
                                  styleMask: [.titled, .resizable], backing: .buffered, defer: false)
            window.isReleasedWhenClosed = false
            window.contentView = NSHostingView(rootView:
                TransitionFixture(window: window, resize: resize) { [weak self] in
                    print("PASS: rapid page changes; concurrent resizing = \(resize)")
                    self?.completed += 1
                    if self?.completed == 2 {
                        NSApplication.shared.terminate(nil)
                    }
                })
            windows.append(window)
            window.orderFront(nil)
        }
        Task {
            try? await Task.sleep(for: .seconds(10))
            if completed < 2 {
                print("FAIL: page transition checks timed out")
                exit(1)
            }
        }
    }
}

@main
private enum NativePageTransitionVerification {
    @MainActor static func main() {
        let app = NSApplication.shared
        let checks = TransitionChecks()
        app.delegate = checks
        app.setActivationPolicy(.accessory)
        withExtendedLifetime(checks) { app.run() }
    }
}
