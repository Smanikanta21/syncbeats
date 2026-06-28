import SwiftUI

struct SplashScreen: View {
    var body: some View {
        VStack {
            Image(systemName: "music.note")
                .resizable()
                .scaledToFit()
                .frame(width: 100, height: 100)
                .foregroundColor(.blue)
            Text("SyncBeats")
                .font(.largeTitle)
                .fontWeight(.bold)
        }
    }
}

#Preview {
    SplashScreen()
        .environmentObject(AppState())
}
