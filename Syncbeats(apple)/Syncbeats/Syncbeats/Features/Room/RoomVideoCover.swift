import SwiftUI
@preconcurrency import WebKit
#if os(macOS)
import AppKit
#else
import UIKit
#endif

nonisolated enum VideoCoverDocument {
    static func canShow(videoID: String?, playing: Bool, active: Bool, reducedMotion: Bool, size: CGFloat) -> Bool {
        guard let videoID, videoID.range(of: #"^[A-Za-z0-9_-]{11}$"#, options: .regularExpression) != nil else { return false }
        return active && !reducedMotion && size >= 160
    }

    static func html(videoID: String, position: Double, playing: Bool = true) -> String? {
        guard canShow(videoID: videoID, playing: true, active: true, reducedMotion: false, size: 200) else { return nil }
        let start = position.isFinite ? max(0, position) : 0
        // The existing room audio remains authoritative. This player is always muted.
        return """
        <!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
        <meta name="referrer" content="strict-origin-when-cross-origin">
        <style>html,body,#video{margin:0;width:100%;height:100%;background:#000;overflow:hidden}</style></head>
        <body><div id="video"></div><script>
        let player; let expected = \(start); let wantsPlay = \(playing ? "true" : "false");
        const notify = state => window.webkit.messageHandlers.cover.postMessage(state);
        window.syncCover = (time, play = true) => {
          expected = Math.max(0,time); wantsPlay = play;
          if(!player || typeof player.getPlayerState !== 'function') return;
          player.mute();
          if(Math.abs(player.getCurrentTime()-expected)>0.45) player.seekTo(expected,true);
          if(play && player.getPlayerState()!==1) player.playVideo();
          if(!play && player.getPlayerState()!==2) player.pauseVideo();
        };
        function onYouTubeIframeAPIReady() {
          player = new YT.Player('video',{host:'https://www.youtube-nocookie.com',videoId:'\(videoID)',
            playerVars:{autoplay:1,mute:1,controls:0,disablekb:1,playsinline:1,
              origin:'\(AppConfiguration.website.absoluteString)',widget_referrer:'\(AppConfiguration.website.absoluteString)',rel:0},events:{
              onReady:e=>{e.target.mute();e.target.seekTo(expected,true);if(wantsPlay)e.target.playVideo();else e.target.pauseVideo()},
              onStateChange:e=>{if(e.data===1){e.target.mute();notify('playing')}else if(e.data===2)notify('paused');else if(e.data===0)notify('unavailable')},
              onError:e=>{notify('diagnostic:youtube:'+e.data);notify('unavailable')},
              onAutoplayBlocked:()=>{notify('diagnostic:autoplay');notify('unavailable')}
            }});
        }
        </script><script src="https://www.youtube.com/iframe_api" onerror="notify('unavailable')"></script></body></html>
        """
    }
}

/// Keep paused video mounted so seeking and resuming use the same player.
struct RoomVideoArtwork: View {
    @Bindable var room: RoomSession
    let palette: NativePalette
    let enabled: Bool
    let size: CGFloat
    var onColors: ([CoverColor]?) -> Void = { _ in }
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.accessibilityReduceMotion) private var reducedMotion
    @State private var unavailable = false
    @State private var playing = false
    private var videoID: String? { room.currentTrack.flatMap { YouTubeIdentity.id(in: $0.trackUrl) } }
    private var eligible: Bool {
        enabled && VideoCoverDocument.canShow(videoID: videoID, playing: room.isPlaying && !room.pendingPlay,
            active: scenePhase == .active, reducedMotion: reducedMotion, size: size)
    }

    var body: some View {
        ZStack {
            RoomArtwork(request: room.currentTrack?.artworkRequest, palette: palette)
            if eligible, !unavailable, let videoID {
                TimelineView(.periodic(from: .now, by: 1)) { context in
                    MutedYouTubeCover(videoID: videoID, position: room.position(at: context.date),
                                     shouldPlay: room.isPlaying && !room.localAudioSuspended, onState: { state in
                        playing = state == "playing" || state == "paused"
                        unavailable = state == "unavailable"
                        if unavailable { onColors(nil) }
                    }, onColors: onColors)
                }
                .id(videoID)
                .opacity(playing ? 1 : 0)
                .allowsHitTesting(false)
                .task(id: videoID) {
                    // Do not leave a black player when a network/provider never responds.
                    try? await Task.sleep(for: .seconds(15))
                    if !Task.isCancelled, !playing { unavailable = true }
                }
            }
        }
        .overlay(alignment: .bottom) {
            if eligible && unavailable {
                Text("Video unavailable · showing album artwork").font(.system(size: 11))
                    .foregroundStyle(.white).padding(8).background(.black.opacity(0.65), in: Capsule()).padding(10)
            }
        }
        .onChange(of: videoID) { _, _ in unavailable = false; playing = false; onColors(nil) }
        .onDisappear { onColors(nil) }
        .onChange(of: eligible) { _, _ in unavailable = false; playing = false; onColors(nil) }
        .accessibilityLabel(eligible && !unavailable ? "Muted YouTube video cover" : "Album artwork")
    }
}

private final class VideoCoverCoordinator: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
    var onState: (String) -> Void
    var videoID: String?
    var onColors: ([CoverColor]?) -> Void = { _ in }
    var captureTask: Task<Void, Never>?
    init(onState: @escaping (String) -> Void) { self.onState = onState }
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        if let state = message.body as? String, state.hasPrefix("diagnostic:") {
            NativeDiagnostics.info("Video cover", String(state.prefix(80)))
            return
        }
        guard let state = message.body as? String, ["playing", "paused", "unavailable"].contains(state) else { return }
        NativeDiagnostics.info("Video cover", state == "playing" ? "Muted video playing" : "Static artwork fallback")
        onState(state)
    }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { onState("unavailable") }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { onState("unavailable") }
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if action.navigationType == .linkActivated, let url = action.request.url {
            decisionHandler(.cancel)
            guard ["https", "http"].contains(url.scheme) else { return }
            #if os(macOS)
            NSWorkspace.shared.open(url)
            #else
            UIApplication.shared.open(url)
            #endif
        } else { decisionHandler(.allow) }
    }
}

private struct MutedYouTubeCover {
    let videoID: String
    let position: Double
    let shouldPlay: Bool
    let onState: (String) -> Void
    let onColors: ([CoverColor]?) -> Void
    func makeCoordinator() -> VideoCoverCoordinator { .init(onState: onState) }
    private func makeWebView(coordinator: VideoCoverCoordinator) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        configuration.mediaTypesRequiringUserActionForPlayback = []
        #if !os(macOS)
        configuration.allowsInlineMediaPlayback = true
        configuration.allowsAirPlayForMediaPlayback = false
        configuration.allowsPictureInPictureMediaPlayback = false
        #endif
        configuration.userContentController.add(coordinator, name: "cover")
        let view = WKWebView(frame: .zero, configuration: configuration)
        view.navigationDelegate = coordinator
        #if !os(macOS)
        view.scrollView.isScrollEnabled = false
        #endif
        return view
    }
    private func update(_ view: WKWebView, coordinator: VideoCoverCoordinator) {
        #if os(iOS)
        NativeDisplaySleep.allow(in: view)
        #endif
        coordinator.onState = onState
        coordinator.onColors = onColors
        if coordinator.videoID != videoID, let html = VideoCoverDocument.html(videoID: videoID, position: position, playing: shouldPlay) {
            coordinator.videoID = videoID
            view.loadHTMLString(html, baseURL: AppConfiguration.website)
        } else if position.isFinite {
            view.evaluateJavaScript("window.syncCover && window.syncCover(\(max(0, position)),\(shouldPlay ? "true" : "false"))", completionHandler: nil)
        }
        if coordinator.captureTask == nil {
            coordinator.captureTask = Task { @MainActor [weak view, weak coordinator] in
                while !Task.isCancelled {
                    try? await Task.sleep(for: .seconds(2))
                    guard !Task.isCancelled, let view, let coordinator, view.bounds.width > 0 else { continue }
                    let configuration = WKSnapshotConfiguration()
                    configuration.snapshotWidth = 48
                    guard let snapshot = try? await view.takeSnapshot(configuration: configuration) else { continue }
                    #if os(macOS)
                    guard let cgImage = snapshot.cgImage(forProposedRect: nil, context: nil, hints: nil) else { continue }
                    #else
                    guard let cgImage = snapshot.cgImage else { continue }
                    #endif
                    let colors = CoverPalette.extract(cgImage)
                    if colors.contains(where: { $0.red + $0.green + $0.blue > 0.12 }) { coordinator.onColors(colors) }
                }
            }
        }
    }
    private static func dismantle(_ view: WKWebView) {
        view.configuration.userContentController.removeScriptMessageHandler(forName: "cover")
        view.navigationDelegate = nil
        view.stopLoading()
        view.loadHTMLString("", baseURL: nil)
    }
}

#if os(macOS)
extension MutedYouTubeCover: NSViewRepresentable {
    func makeNSView(context: Context) -> WKWebView { makeWebView(coordinator: context.coordinator) }
    func updateNSView(_ view: WKWebView, context: Context) { update(view, coordinator: context.coordinator) }
    static func dismantleNSView(_ view: WKWebView, coordinator: VideoCoverCoordinator) { coordinator.captureTask?.cancel(); dismantle(view) }
}
#else
extension MutedYouTubeCover: UIViewRepresentable {
    func makeUIView(context: Context) -> WKWebView { makeWebView(coordinator: context.coordinator) }
    func updateUIView(_ view: WKWebView, context: Context) { update(view, coordinator: context.coordinator) }
    static func dismantleUIView(_ view: WKWebView, coordinator: VideoCoverCoordinator) { coordinator.captureTask?.cancel(); dismantle(view) }
}
#endif
