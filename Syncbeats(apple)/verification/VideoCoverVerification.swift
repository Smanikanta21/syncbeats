import AppKit
import Foundation
@preconcurrency import WebKit

private final class VideoCoverProbe: NSObject, WKScriptMessageHandler {
    var states: [String] = []
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        if let state = message.body as? String { states.append(state) }
    }
}

@main
struct VideoCoverVerification {
    static func main() async throws {
        let live = CommandLine.arguments.contains("--live")
        let videoID = "4NRXx6U8ABQ"
        precondition(VideoCoverDocument.html(videoID: "';alert(1)//", position: 0) == nil)
        precondition(!VideoCoverDocument.canShow(videoID: videoID, playing: false, active: true, reducedMotion: false, size: 340))
        precondition(!VideoCoverDocument.canShow(videoID: videoID, playing: true, active: false, reducedMotion: false, size: 340))
        precondition(!VideoCoverDocument.canShow(videoID: videoID, playing: true, active: true, reducedMotion: true, size: 340))
        precondition(!VideoCoverDocument.canShow(videoID: videoID, playing: true, active: true, reducedMotion: false, size: 180))
        print("PASS: Video is ineligible while paused, inactive, reduced-motion or below the embed minimum")
        let app = NSApplication.shared
        app.setActivationPolicy(.accessory)
        let probe = VideoCoverProbe()
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        configuration.mediaTypesRequiringUserActionForPlayback = []
        configuration.userContentController.add(probe, name: "cover")
        let view = WKWebView(frame: NSRect(x: 0, y: 0, width: 340, height: 340), configuration: configuration)
        let window = NSWindow(contentRect: view.frame, styleMask: [.titled, .closable], backing: .buffered, defer: false)
        window.title = "SyncBeats muted video check"; window.contentView = view
        if live { window.center(); window.orderFront(nil) }
        defer { configuration.userContentController.removeScriptMessageHandler(forName: "cover"); view.stopLoading(); view.loadHTMLString("", baseURL: nil); window.close() }
        var html = VideoCoverDocument.html(videoID: videoID, position: 30)!
        if live {
            html = html.replacingOccurrences(of: "onError:()=>notify('unavailable')", with: "onError:e=>notify('error:'+e.data)")
        } else {
            let script = """
            <script>window.calls=[];window.YT={Player:class{
              constructor(id,options){this.options=options;this.time=0;this.state=1;queueMicrotask(()=>options.events.onReady({target:this}))}
              mute(){calls.push('mute')} seekTo(time){this.time=time;calls.push('seek:'+time)}
              playVideo(){calls.push('play');this.options.events.onStateChange({data:1,target:this})}
              getCurrentTime(){return this.time} getPlayerState(){return this.state}
            }};onYouTubeIframeAPIReady();</script>
            """
            html = html.replacingOccurrences(of: "<script src=\"https://www.youtube.com/iframe_api\" onerror=\"notify('unavailable')\"></script>", with: script)
        }
        view.loadHTMLString(html, baseURL: AppConfiguration.website)
        for _ in 0..<(live ? 150 : 50) {
            if !probe.states.isEmpty { break }
            try await Task.sleep(for: .milliseconds(200))
        }
        precondition(probe.states.contains("playing"), "Video did not start: \(probe.states)")
        if live {
            let muted = try await view.evaluateJavaScript("player.isMuted()") as? Bool
            precondition(muted == true, "The visual player must stay muted")
            print("PASS: Live YouTube iframe played a public test video muted")
        } else {
            let initial = try await view.evaluateJavaScript("window.calls") as! [String]
            precondition(initial == ["mute", "seek:30", "play", "mute"], "Expected mute before playback: \(initial)")
            _ = try await view.evaluateJavaScript("syncCover(60); true")
            let corrected = try await view.evaluateJavaScript("window.calls") as! [String]
            precondition(corrected.suffix(2) == ["mute", "seek:60"])
            _ = try await view.evaluateJavaScript("player.options.events.onError({data:150}); true")
            for _ in 0..<20 {
                if probe.states.last == "unavailable" { break }
                try await Task.sleep(for: .milliseconds(50))
            }
            precondition(probe.states.last == "unavailable", "Provider error must activate the static-cover fallback")
            print("PASS: Real WebKit execution mutes before playing, corrects timeline drift and reports provider failures")
        }
    }
}
