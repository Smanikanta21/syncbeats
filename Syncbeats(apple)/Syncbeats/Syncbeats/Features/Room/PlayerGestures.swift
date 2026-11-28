import Foundation

nonisolated enum PlayerGestures {
    static func isDownward(_ translation: CGSize) -> Bool {
        translation.height > 0 && translation.height > abs(translation.width) * 1.25
    }
    static func dismisses(translation: CGSize, predicted: CGSize) -> Bool {
        isDownward(translation) && (translation.height >= 100 ||
            (translation.height >= 24 && predicted.height >= 180))
    }
    static func expands(translation: CGSize, predicted: CGSize) -> Bool {
        translation.height < -20 && abs(translation.height) > abs(translation.width) * 1.25 &&
            (translation.height <= -60 || predicted.height <= -140)
    }
    static func goesBack(startX: CGFloat, translation: CGSize, predicted: CGSize) -> Bool {
        startX <= 44 && translation.width > 20 && translation.width > abs(translation.height) * 1.5 &&
            (translation.width >= 80 || predicted.width >= 160)
    }
}
