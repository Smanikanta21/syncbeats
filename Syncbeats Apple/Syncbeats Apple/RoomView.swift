import SwiftUI

struct RoomView: View {
    @EnvironmentObject var socketManager: SocketManager
    @EnvironmentObject var multipeerManager: MultipeerManager
    @EnvironmentObject var audioEngine: AudioEngine
    
    @State private var isInspectorPresented = true
    @State private var recentRooms: [String] = []
    @State private var manualRoomId: String = ""
    
    var body: some View {
        HStack(spacing: 0) {
            // MAIN CONTENT AREA
            VStack(spacing: 0) {
                // Top Room Details Header
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 5) {
                        Text(socketManager.currentRoomId != nil ? "Room: \(socketManager.currentRoomId!)" : "Join a Room")
                            .font(.system(size: 28, weight: .bold))
                        
                        HStack(spacing: 6) {
                            Circle()
                                .fill(socketManager.isConnected ? Color.green : Color.orange)
                                .frame(width: 8, height: 8)
                            Text(socketManager.isConnected ? "Connected to SyncBeats Cloud" : "Reconnecting...")
                                .font(.subheadline)
                                .foregroundColor(.secondary)
                        }
                    }
                    
                    Spacer()
                    
                    if socketManager.currentRoomId != nil {
                        Button(action: {
                            withAnimation {
                                isInspectorPresented.toggle()
                            }
                        }) {
                            Image(systemName: "sidebar.right")
                                .font(.title2)
                                .foregroundColor(.secondary)
                        }
                        .buttonStyle(.plain)
                        .help("Toggle Sidebar")
                        
                        Button(action: {
                            socketManager.leaveRoom()
                        }) {
                            Image(systemName: "rectangle.portrait.and.arrow.right")
                                .font(.title2)
                                .foregroundColor(.red)
                        }
                        .buttonStyle(.plain)
                        .help("Leave Room")
                        .padding(.leading, 10)
                    }
                }
                .padding(.horizontal, 40)
                .padding(.top, 30)
                
                Spacer()
                
                if socketManager.currentRoomId == nil {
                    // --- ROOM JOIN SCREEN ---
                    VStack(spacing: 40) {
                        Image(systemName: "antenna.radiowaves.left.and.right")
                            .font(.system(size: 60))
                            .foregroundColor(.purple)
                        
                        Text("Connect to a SyncBeats Room")
                            .font(.title)
                            .fontWeight(.semibold)
                        
                        // Recent Sessions
                        VStack(alignment: .leading) {
                            Text("RECENT SESSIONS")
                                .font(.caption)
                                .foregroundColor(.secondary)
                                .padding(.leading, 5)
                            
                            ScrollView {
                                VStack(spacing: 10) {
                                    if recentRooms.isEmpty {
                                        Text("Loading recent rooms...")
                                            .foregroundColor(.secondary)
                                            .padding()
                                    } else {
                                        ForEach(recentRooms, id: \.self) { roomId in
                                            Button(action: {
                                                let uId = NetworkManager.shared.userId ?? "unknown"
                                                let uName = NetworkManager.shared.userName ?? "Mac User"
                                                let deviceName = Host.current().localizedName ?? "My Mac"
                                                socketManager.joinRoom(roomId: roomId, userId: uId, displayName: "\(uName)::\(deviceName)")
                                            }) {
                                                HStack {
                                                    Image(systemName: "play.circle.fill")
                                                        .font(.title2)
                                                        .foregroundColor(.purple)
                                                    
                                                    VStack(alignment: .leading) {
                                                        Text(roomId)
                                                            .font(.headline)
                                                        Text("Click to join this session")
                                                            .font(.caption)
                                                            .foregroundColor(.secondary)
                                                    }
                                                    
                                                    Spacer()
                                                    Image(systemName: "arrow.right")
                                                        .foregroundColor(.secondary)
                                                }
                                                .padding()
                                                .background(Color.white.opacity(0.05))
                                                .cornerRadius(12)
                                            }
                                            .buttonStyle(.plain)
                                        }
                                    }
                                }
                            }
                            .frame(maxHeight: 200)
                        }
                        .frame(maxWidth: 400)
                        
                        HStack {
                            Rectangle().fill(Color.gray.opacity(0.3)).frame(height: 1)
                            Text("OR").font(.caption).foregroundColor(.secondary)
                            Rectangle().fill(Color.gray.opacity(0.3)).frame(height: 1)
                        }
                        .frame(maxWidth: 400)
                        
                        // Manual Entry
                        HStack {
                            TextField("Enter 6-digit Code", text: $manualRoomId)
                                .textFieldStyle(.plain)
                                .padding()
                                .background(Color.white.opacity(0.05))
                                .cornerRadius(10)
                            
                            Button(action: {
                                let uId = NetworkManager.shared.userId ?? "unknown"
                                let uName = NetworkManager.shared.userName ?? "Mac User"
                                let deviceName = Host.current().localizedName ?? "My Mac"
                                socketManager.joinRoom(roomId: manualRoomId.uppercased(), userId: uId, displayName: "\(uName)::\(deviceName)")
                            }) {
                                Text("Join")
                                    .fontWeight(.bold)
                                    .padding(.horizontal, 20)
                                    .padding(.vertical, 14)
                                    .background(Color.purple)
                                    .cornerRadius(10)
                                    .foregroundColor(.white)
                            }
                            .buttonStyle(.plain)
                            .disabled(manualRoomId.isEmpty)
                        }
                        .frame(maxWidth: 400)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    
                } else {
                    // --- ACTIVE ROOM STAGE ---
                    // Huge Album Art Stage
                    ZStack {
                        RoundedRectangle(cornerRadius: 20)
                            .fill(LinearGradient(gradient: Gradient(colors: [Color.purple.opacity(0.4), Color.blue.opacity(0.4)]), startPoint: .topLeading, endPoint: .bottomTrailing))
                            .aspectRatio(1, contentMode: .fit)
                            .frame(maxWidth: 500, maxHeight: 500)
                            .shadow(radius: 20)
                        
                        VStack(spacing: 30) {
                            Image(systemName: "music.note.tv.fill")
                                .resizable()
                                .scaledToFit()
                                .frame(height: 120)
                                .foregroundColor(.white.opacity(0.8))
                            
                            VStack(spacing: 10) {
                                Text(socketManager.trackTitle)
                                    .font(.system(size: 32, weight: .bold))
                                    .multilineTextAlignment(.center)
                                    .lineLimit(2)
                                
                                Text("SyncBeats Room")
                                    .font(.title3)
                                    .foregroundColor(.secondary)
                            }
                        }
                        .padding(40)
                    }
                    
                    Spacer()
                    
                    // Bottom Playback Control Bar
                    VStack(spacing: 15) {
                        // Timeline Scrubber (Fake for now)
                        HStack {
                            Text("0:00")
                                .font(.caption)
                                .foregroundColor(.secondary)
                            Slider(value: .constant(0))
                                .accentColor(.white)
                            Text("-3:45")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                        .padding(.horizontal, 40)
                        
                        HStack(spacing: 40) {
                            Button(action: {}) {
                                Image(systemName: "shuffle")
                                    .font(.title3)
                                    .foregroundColor(.secondary)
                            }.buttonStyle(.plain)
                            
                            Button(action: {}) {
                                Image(systemName: "backward.fill")
                                    .font(.title2)
                            }.buttonStyle(.plain)
                            
                            Button(action: {
                                if audioEngine.isPlaying {
                                    socketManager.emitPause()
                                } else {
                                    socketManager.emitPlay()
                                }
                            }) {
                                Image(systemName: audioEngine.isPlaying ? "pause.circle.fill" : "play.circle.fill")
                                    .font(.system(size: 50))
                            }.buttonStyle(.plain)
                            
                            Button(action: {}) {
                                Image(systemName: "forward.fill")
                                    .font(.title2)
                            }.buttonStyle(.plain)
                            
                            Button(action: {}) {
                                Image(systemName: "repeat")
                                    .font(.title3)
                                    .foregroundColor(.secondary)
                            }.buttonStyle(.plain)
                        }
                    }
                    .padding(.bottom, 30)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            
            // RIGHT INSPECTOR (Participants)
            if isInspectorPresented {
                Divider()
                
                VStack(alignment: .leading) {
                    Text("Up Next")
                        .font(.headline)
                        .padding([.top, .leading, .trailing])
                    
                    // Simple placeholder for queue
                    HStack {
                        Image(systemName: "music.note")
                            .frame(width: 40, height: 40)
                            .background(Color.secondary.opacity(0.2))
                            .cornerRadius(5)
                        VStack(alignment: .leading) {
                            Text(socketManager.trackTitle)
                                .fontWeight(.medium)
                            Text("Playing from Room")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    }
                    .padding()
                    
                    Divider()
                    
                    Text("Listening With (\(socketManager.participants.count))")
                        .font(.headline)
                        .padding([.top, .leading, .trailing])
                    
                    List(socketManager.participants, id: \.self.description) { part in
                        HStack {
                            let rawName = part["displayName"] as? String ?? "Unknown"
                            let nameParts = rawName.components(separatedBy: "::")
                            let displayName = nameParts[0]
                            let deviceName = nameParts.count > 1 ? nameParts[1] : "Unknown Device"
                            
                            let isHost = part["isHost"] as? Bool ?? false
                            let isReady = part["isReady"] as? Bool ?? false
                            
                            Circle()
                                .fill(isHost ? Color.yellow : (isReady ? Color.green : Color.orange))
                                .frame(width: 8, height: 8)
                            
                            VStack(alignment: .leading, spacing: 2) {
                                Text(displayName)
                                    .font(.subheadline)
                                Text(deviceName)
                                    .font(.caption2)
                                    .foregroundColor(.secondary)
                            }
                            
                            if isHost {
                                Spacer()
                                Image(systemName: "star.fill")
                                    .foregroundColor(.yellow)
                                    .font(.caption)
                            }
                        }
                        .padding(.vertical, 4)
                        .listRowBackground(Color.clear)
                    }
                    .listStyle(PlainListStyle())
                }
                .frame(width: 260)
                .background(Color(NSColor.windowBackgroundColor).opacity(0.8))
            }
        }
        .frame(minWidth: 800, minHeight: 500)
        .navigationTitle("")
        .onAppear {
            socketManager.audioEngine = audioEngine
            
            NetworkManager.shared.fetchRecentRooms { rooms in
                DispatchQueue.main.async {
                    self.recentRooms = rooms
                }
            }
        }
    }
}
