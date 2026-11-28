#if os(iOS)
import AVFoundation
import UIKit

/// Music and its visual cover must follow the user's system Auto-Lock setting.
@MainActor enum NativeDisplaySleep {
    /// Apply at the app root as well as the player, including retained/hidden views.
    static func allowForApplication() {
        allow()
        UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows).forEach { allowLayers(in: $0) }
    }
    static func allow(in view: UIView? = nil) {
        if UIApplication.shared.isIdleTimerDisabled { UIApplication.shared.isIdleTimerDisabled = false }
        if let view { allowLayers(in: view) }
    }
    private static func allowLayers(in view: UIView) {
        allow(layer: view.layer); view.subviews.forEach { allowLayers(in: $0) }
    }
    private static func allow(layer: CALayer) {
        if let player = layer as? AVPlayerLayer, player.player?.preventsDisplaySleepDuringVideoPlayback == true {
            player.player?.preventsDisplaySleepDuringVideoPlayback = false
        }
        if let display = layer as? AVSampleBufferDisplayLayer, display.preventsDisplaySleepDuringVideoPlayback {
            display.preventsDisplaySleepDuringVideoPlayback = false
        }
        layer.sublayers?.forEach { allow(layer: $0) }
    }
}
#endif
