import SwiftUI

struct SettingsScreen: View {
    @State private var serverIP: String = "192.168.29.61"
    @State private var useHighQualityAudio: Bool = true
    @State private var downloadOverCellular: Bool = false
    
    var body: some View {
        List {
            Section(header: Text("Network")) {
                HStack {
                    Text("Server IP")
                    Spacer()
                    TextField("IP Address", text: $serverIP)
                        .multilineTextAlignment(.trailing)
                        .keyboardType(.decimalPad)
                        .foregroundColor(.secondary)
                }
                
                Toggle("Download over Cellular", isOn: $downloadOverCellular)
            }
            
            Section(header: Text("Audio & Playback")) {
                Toggle("High Quality Audio", isOn: $useHighQualityAudio)
            }
            
            Section(header: Text("About")) {
                HStack {
                    Text("Version")
                    Spacer()
                    Text("1.0.0").foregroundColor(.secondary)
                }
                HStack {
                    Text("Developer")
                    Spacer()
                    Text("SyncBeats").foregroundColor(.secondary)
                }
            }
        }
        .listStyle(InsetGroupedListStyle())
        .navigationTitle("Settings")
        .navigationBarTitleDisplayMode(.inline)
    }
}

#Preview {
    SettingsScreen()
}
