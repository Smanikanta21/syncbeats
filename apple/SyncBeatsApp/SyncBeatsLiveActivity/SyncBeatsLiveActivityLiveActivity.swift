//
//  SyncBeatsLiveActivityLiveActivity.swift
//  SyncBeatsLiveActivity
//
//  Created by Abhinay Siraparapu on 28/06/26.
//

import ActivityKit
import WidgetKit
import SwiftUI

struct SyncBeatsLiveActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        // Dynamic stateful properties about your activity go here!
        var emoji: String
    }

    // Fixed non-changing properties about your activity go here!
    var name: String
}

struct SyncBeatsLiveActivityLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: SyncBeatsLiveActivityAttributes.self) { context in
            // Lock screen/banner UI goes here
            VStack {
                Text("Hello \(context.state.emoji)")
            }
            .activityBackgroundTint(Color.cyan)
            .activitySystemActionForegroundColor(Color.black)

        } dynamicIsland: { context in
            DynamicIsland {
                // Expanded UI goes here.  Compose the expanded UI through
                // various regions, like leading/trailing/center/bottom
                DynamicIslandExpandedRegion(.leading) {
                    Text("Leading")
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text("Trailing")
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Text("Bottom \(context.state.emoji)")
                    // more content
                }
            } compactLeading: {
                Text("L")
            } compactTrailing: {
                Text("T \(context.state.emoji)")
            } minimal: {
                Text(context.state.emoji)
            }
            .widgetURL(URL(string: "http://www.apple.com"))
            .keylineTint(Color.red)
        }
    }
}

extension SyncBeatsLiveActivityAttributes {
    fileprivate static var preview: SyncBeatsLiveActivityAttributes {
        SyncBeatsLiveActivityAttributes(name: "World")
    }
}

extension SyncBeatsLiveActivityAttributes.ContentState {
    fileprivate static var smiley: SyncBeatsLiveActivityAttributes.ContentState {
        SyncBeatsLiveActivityAttributes.ContentState(emoji: "😀")
     }
     
     fileprivate static var starEyes: SyncBeatsLiveActivityAttributes.ContentState {
         SyncBeatsLiveActivityAttributes.ContentState(emoji: "🤩")
     }
}

#Preview("Notification", as: .content, using: SyncBeatsLiveActivityAttributes.preview) {
   SyncBeatsLiveActivityLiveActivity()
} contentStates: {
    SyncBeatsLiveActivityAttributes.ContentState.smiley
    SyncBeatsLiveActivityAttributes.ContentState.starEyes
}
