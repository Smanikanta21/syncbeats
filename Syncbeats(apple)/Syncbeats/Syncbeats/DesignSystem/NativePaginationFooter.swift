import SwiftUI

/// A viewport sentinel fetches the next page; only a failed request needs a retry.
struct NativePaginationFooter: View {
    let identity: String
    let cursor: String?
    let loading: Bool
    var busy = false
    var error: String?
    let title: String
    let palette: NativePalette
    let load: () async -> Void
    @State private var visible = false
    @Environment(\.scenePhase) private var scenePhase
    private struct Request: Equatable {
        let identity: String; let cursor: String?; let visible: Bool; let busy: Bool; let failed: Bool; let active: Bool
    }
    var body: some View {
        Group {
            if cursor != nil || loading {
                VStack(spacing: 8) {
                    if let error {
                        Text(error).font(.system(size: 12)).foregroundStyle(palette.secondary).lineLimit(3)
                        Button("Retry") { Task { await load() } }.disabled(busy || loading)
                    } else {
                        NativeLoader(title: title, palette: palette, compact: true, animates: loading)
                            .opacity(loading ? 1 : 0)
                            .accessibilityHidden(!loading)
                    }
                }.frame(maxWidth: .infinity, minHeight: 56)
                    .onScrollVisibilityChange(threshold: 0.1) { visible = $0 }
                    .onDisappear { visible = false }
                    .task(id: Request(identity: identity, cursor: cursor, visible: visible, busy: busy || loading,
                                      failed: error != nil, active: scenePhase == .active)) {
                        guard visible, cursor != nil, !busy, !loading, error == nil, scenePhase == .active else { return }
                        try? await Task.sleep(for: .milliseconds(100))
                        guard !Task.isCancelled else { return }
                        // The paging flag changes this task's identity. Own the
                        // request separately so that change cannot cancel itself.
                        Task { await load() }
                    }
            }
        }.accessibilityIdentifier("native-pagination-sentinel")
    }
}
