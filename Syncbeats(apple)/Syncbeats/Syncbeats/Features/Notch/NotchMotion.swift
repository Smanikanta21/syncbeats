import Foundation

/// A single interruptible spring drives the AppKit frame and SwiftUI presentation.
/// Substeps keep the result stable across 60/120 Hz displays and dropped frames.
struct NotchMotion {
    private let openingDamping: Double
    private let openingFrequency: Double
    private let closingFrequency: Double
    private(set) var value: Double = 0
    private(set) var velocity: Double = 0
    private(set) var target: Double = 0

    // Reference recording: about 8% travel overshoot, peaking near 0.3 s.
    init(openingDamping: Double = 0.62, openingFrequency: Double = 14, closingFrequency: Double = 18) {
        self.openingDamping = openingDamping
        self.openingFrequency = openingFrequency
        self.closingFrequency = closingFrequency
    }

    var isSettled: Bool { value == target && velocity == 0 }

    mutating func move(to target: Double, immediately: Bool = false) {
        self.target = min(1, max(0, target))
        if immediately { value = self.target; velocity = 0 }
    }

    mutating func advance(by elapsed: Double) {
        guard elapsed.isFinite, elapsed > 0, !isSettled else { return }
        let duration = min(elapsed, 1.0 / 15)
        let steps = max(1, Int(ceil(duration * 240)))
        let dt = duration / Double(steps)
        let frequency = target == 1 ? openingFrequency : closingFrequency
        let damping: Double = target == 1 ? openingDamping : 1
        for _ in 0..<steps {
            let acceleration = frequency * frequency * (target - value) - 2 * damping * frequency * velocity
            velocity += acceleration * dt
            value += velocity * dt
            // Never collapse inside the hardware camera or overshoot excessively.
            if value < 0 { value = 0; velocity = max(0, velocity) }
            if value > 1.09 { value = 1.09; velocity = min(0, velocity) }
        }
        if abs(value - target) < 0.0005 && abs(velocity) < 0.005 {
            value = target
            velocity = 0
        }
    }
}
