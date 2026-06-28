import ActivityKit
import SwiftUI
import WidgetKit

// MARK: - Activity Attributes

struct SyncBeatsActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var trackTitle: String
        var artistName: String
        var isPlaying: Bool
        var progress: Double
        var elapsedTime: String
        var remainingTime: String
    }
    
    var thumbnailURL: String
}

// MARK: - Live Activity Widget

struct SyncBeatsLiveActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: SyncBeatsActivityAttributes.self) { context in
            // Lock screen banner
            lockScreenBanner(context: context)
        } dynamicIsland: { context in
            DynamicIsland {
                // Expanded regions
                DynamicIslandExpandedRegion(.leading) {
                    HStack(spacing: 8) {
                        Image(systemName: "music.note")
                            .font(.system(size: 20, weight: .bold))
                            .foregroundColor(.white)
                    }
                    .padding(.leading, 4)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    HStack(spacing: 8) {
                        Image(systemName: context.state.isPlaying ? "pause.fill" : "play.fill")
                            .font(.system(size: 16, weight: .bold))
                            .foregroundColor(.white)
                    }
                    .padding(.trailing, 4)
                }
                DynamicIslandExpandedRegion(.center) {
                    VStack(spacing: 4) {
                        Text(context.state.trackTitle)
                            .font(.system(size: 14, weight: .bold))
                            .foregroundColor(.white)
                            .lineLimit(1)
                        Text(context.state.artistName)
                            .font(.system(size: 11, weight: .medium))
                            .foregroundColor(.white.opacity(0.6))
                            .lineLimit(1)
                    }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(spacing: 4) {
                        // Progress bar
                        GeometryReader { geo in
                            ZStack(alignment: .leading) {
                                RoundedRectangle(cornerRadius: 2)
                                    .fill(Color.white.opacity(0.15))
                                    .frame(height: 3)
                                RoundedRectangle(cornerRadius: 2)
                                    .fill(Color.white.opacity(0.8))
                                    .frame(width: geo.size.width * CGFloat(context.state.progress), height: 3)
                            }
                        }
                        .frame(height: 3)
                        
                        HStack {
                            Text(context.state.elapsedTime)
                                .font(.system(size: 9, weight: .medium, design: .monospaced))
                                .foregroundColor(.white.opacity(0.4))
                            Spacer()
                            Text(context.state.remainingTime)
                                .font(.system(size: 9, weight: .medium, design: .monospaced))
                                .foregroundColor(.white.opacity(0.4))
                        }
                    }
                    .padding(.horizontal, 4)
                }
            } compactLeading: {
                // Compact leading — music icon
                Image(systemName: "music.note")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(.white)
            } compactTrailing: {
                // Compact trailing — play state indicator
                if context.state.isPlaying {
                    // Simplified audio bars
                    HStack(spacing: 1.5) {
                        ForEach(0..<3, id: \.self) { _ in
                            RoundedRectangle(cornerRadius: 1)
                                .fill(Color.white.opacity(0.8))
                                .frame(width: 2, height: CGFloat.random(in: 4...10))
                        }
                    }
                    .frame(height: 10)
                } else {
                    Image(systemName: "pause.fill")
                        .font(.system(size: 10))
                        .foregroundColor(.white.opacity(0.6))
                }
            } minimal: {
                // Minimal — just a music note
                Image(systemName: "music.note")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(.white)
            }
        }
    }
    
    @ViewBuilder
    private func lockScreenBanner(context: ActivityViewContext<SyncBeatsActivityAttributes>) -> some View {
        HStack(spacing: 12) {
            Image(systemName: "music.note")
                .font(.system(size: 24, weight: .bold))
                .foregroundColor(.white)
                .frame(width: 44, height: 44)
                .background(Color.white.opacity(0.1))
                .clipShape(RoundedRectangle(cornerRadius: 10))
            
            VStack(alignment: .leading, spacing: 2) {
                Text(context.state.trackTitle)
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(.white)
                    .lineLimit(1)
                Text(context.state.artistName)
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(.white.opacity(0.6))
                    .lineLimit(1)
            }
            
            Spacer()
            
            Image(systemName: context.state.isPlaying ? "pause.circle.fill" : "play.circle.fill")
                .font(.system(size: 28))
                .foregroundColor(.white)
        }
        .padding(16)
        .background(Color.black)
    }
}

// MARK: - Live Activity Manager

class LiveActivityManager {
    static let shared = LiveActivityManager()
    private var currentActivity: Activity<SyncBeatsActivityAttributes>?
    
    private init() {}
    
    func startActivity(track: TrackInfo) {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }
        guard DeviceHelper.hasDynamicIsland else { return }
        
        let attributes = SyncBeatsActivityAttributes(thumbnailURL: track.thumbnailURL)
        let state = SyncBeatsActivityAttributes.ContentState(
            trackTitle: track.title,
            artistName: track.artist,
            isPlaying: true,
            progress: 0,
            elapsedTime: "0:00",
            remainingTime: "0:00"
        )
        
        do {
            let content = ActivityContent(state: state, staleDate: nil)
            currentActivity = try Activity.request(
                attributes: attributes,
                content: content,
                pushType: nil
            )
        } catch {
            print("Failed to start Live Activity: \(error)")
        }
    }
    
    func updateActivity(isPlaying: Bool, progress: Double, elapsed: String, remaining: String, title: String, artist: String) {
        guard let activity = currentActivity else { return }
        
        let state = SyncBeatsActivityAttributes.ContentState(
            trackTitle: title,
            artistName: artist,
            isPlaying: isPlaying,
            progress: progress,
            elapsedTime: elapsed,
            remainingTime: remaining
        )
        
        Task {
            let content = ActivityContent(state: state, staleDate: nil)
            await activity.update(content)
        }
    }
    
    func endActivity() {
        guard let activity = currentActivity else { return }
        
        let state = SyncBeatsActivityAttributes.ContentState(
            trackTitle: "",
            artistName: "",
            isPlaying: false,
            progress: 0,
            elapsedTime: "0:00",
            remainingTime: "0:00"
        )
        
        Task {
            let content = ActivityContent(state: state, staleDate: nil)
            await activity.end(content, dismissalPolicy: .immediate)
            self.currentActivity = nil
        }
    }
}
