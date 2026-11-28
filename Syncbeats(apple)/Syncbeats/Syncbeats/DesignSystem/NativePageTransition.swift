import SwiftUI

private struct NativePageTransitionValues {
    var opacity = 1.0
    var offset = 0.0
}

private struct NativePageTransition<Value: Equatable>: ViewModifier {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let value: Value

    func body(content: Content) -> some View {
        // Animate incoming content without changing its identity or retaining
        // an outgoing copy of its controls, focus state, or asynchronous tasks.
        content.keyframeAnimator(initialValue: NativePageTransitionValues(), trigger: value) { view, motion in
            view.opacity(motion.opacity).offset(y: motion.offset)
        } keyframes: { _ in
            KeyframeTrack(\.opacity) {
                // MoveKeyframe sets an immediate value without interpolating
                // over a zero-length interval, which can yield NaN in layout.
                MoveKeyframe(0.0)
                CubicKeyframe(1.0, duration: reduceMotion ? 0.12 : 0.22)
            }
            KeyframeTrack(\.offset) {
                MoveKeyframe(reduceMotion ? 0.0 : 7.0)
                CubicKeyframe(0.0, duration: reduceMotion ? 0.12 : 0.24)
            }
        }
    }
}

extension View {
    func nativePageTransition<Value: Equatable>(value: Value) -> some View {
        modifier(NativePageTransition(value: value))
    }
}
