#if os(iOS)
import UIKit

/// A short lease bridges download/decode gaps; continuous playback uses audio mode.
@MainActor final class NativeBackgroundAudioWork {
    private var identifier: UIBackgroundTaskIdentifier = .invalid
    init(onExpiration: @escaping @MainActor @Sendable () -> Void) {
        identifier = UIApplication.shared.beginBackgroundTask(withName: "Prepare room audio") { [weak self] in
            Task { @MainActor [weak self] in self?.end(); onExpiration() }
        }
    }
    func end() {
        guard identifier != .invalid else { return }
        UIApplication.shared.endBackgroundTask(identifier)
        identifier = .invalid
    }
}
#endif
