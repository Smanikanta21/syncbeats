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
        return playing && active && !reducedMotion && size >= 200
    }

    static func html(videoID: String, position: Double) -> String? {
        guard canShow(videoID: videoID, playing: true, active: true, reducedMotion: false, size: 200) else { return nil }
        let start = position.isFinite ? max(0, position) : 0
        // The existing room audio remains authoritative. This player is always muted.
        return """
        <!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
        <meta name="referrer" content="strict-origin-when-cross-origin">
        <style>html,body,#video{margin:0;width:100%;height:100%;background:#000;overflow:hidden}</style></head>
        <body><div id="video"></div><script>
        let player; let expected = \(start);
        const notify = state => window.webkit.messageHandlers.cover.postMessage(state);
        window.syncCover = time => { expected = time; if(player && player.getPlayerState() === 1) {
          player.mute(); if(Math.abs(player.getCurrentTime()-time)>2) player.seekTo(time,true);
        }};
        function onYouTubeIframeAPIReady() {
          player = new YT.Player('video',{host:'https://www.youtube-nocookie.com',videoId:'\(videoID)',
            playerVars:{autoplay:1,mute:1,controls:0,disablekb:1,playsinline:1,
              origin:'https://syncbeats.in',rel:0},events:{
              onReady:e=>{e.target.mute();e.target.seekTo(expected,true);e.target.playVideo()},
              onStateChange:e=>{if(e.data===1){e.target.mute();notify('playing')}else if(e.data===0)notify('unavailable')},
              onError:()=>notify('unavailable'),onAutoplayBlocked:()=>notify('unavailable')
            }});
        }
        </script><script src="https://www.youtube.com/iframe_api" onerror="notify('unavailable')"></script></body></html>
        """
    }
}

/// Only the expanded artwork area hosts video. Pausing or leaving the app destroys it.
struct RoomVideoArtwork: View {
    @Bindable var room: RoomSession
    let palette: NativePalette
    let enabled: Bool
    let size: CGFloat
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
                    MutedYouTubeCover(videoID: videoID, position: room.position(at: context.date)) { state in
                        playing = state == "playing"
                        unavailable = state == "unavailable"
                    }
                }
                .id(videoID)
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
        .onChange(of: videoID) { _, _ in unavailable = false; playing = false }
        .onChange(of: eligible) { _, _ in unavailable = false; playing = false }
        .accessibilityLabel(eligible && !unavailable ? "Muted YouTube video cover" : "Album artwork")
    }
}

private final class VideoCoverCoordinator: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
    var onState: (String) -> Void
    var videoID: String?
    init(onState: @escaping (String) -> Void) { self.onState = onState }
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let state = message.body as? String, ["playing", "unavailable"].contains(state) else { return }
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
    let onState: (String) -> Void
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
        coordinator.onState = onState
        if coordinator.videoID != videoID, let html = VideoCoverDocument.html(videoID: videoID, position: position) {
            coordinator.videoID = videoID
            view.loadHTMLString(html, baseURL: AppConfiguration.website)
        } else if position.isFinite {
            view.evaluateJavaScript("window.syncCover && window.syncCover(\(max(0, position)))", completionHandler: nil)
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
    static func dismantleNSView(_ view: WKWebView, coordinator: VideoCoverCoordinator) { dismantle(view) }
}
#else
extension MutedYouTubeCover: UIViewRepresentable {
    func makeUIView(context: Context) -> WKWebView { makeWebView(coordinator: context.coordinator) }
    func updateUIView(_ view: WKWebView, context: Context) { update(view, coordinator: context.coordinator) }
    static func dismantleUIView(_ view: WKWebView, coordinator: VideoCoverCoordinator) { dismantle(view) }
}
#endif
