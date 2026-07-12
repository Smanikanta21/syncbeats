import SwiftUI

struct SyncBeatsModal: View {
    @Binding var isPresented: Bool
    @StateObject private var socket = SocketService.shared
    @State private var roomCode = ""
    
    // Website Gradient Colors
    let colorCyan = Color(red: 0.0, green: 1.0, blue: 0.7)
    let colorPurple = Color(red: 0.48, green: 0.38, blue: 1.0)
    
    var body: some View {
        ZStack(alignment: .topTrailing) {
            HStack(spacing: 0) {
                // Left side: Controls
            VStack(spacing: 32) {
                Image(systemName: "opticaldisc")
                    .font(.system(size: 64))
                    .foregroundColor(.white)
                    .shadow(color: .white.opacity(0.3), radius: 10)
                
                VStack(spacing: 8) {
                    Text("SyncBeats Mode")
                        .font(.system(size: 28, weight: .bold, design: .rounded))
                        .foregroundColor(.primary)
                    
                    Text("Create a master room to instantly wake up and sync all your active devices, or join a friend's room.")
                        .multilineTextAlignment(.center)
                        .foregroundColor(.gray)
                        .padding(.horizontal)
                }
                
                if let currentRoom = socket.currentRoom {
                    // Active Room State
                    VStack(spacing: 24) {
                        VStack(spacing: 8) {
                            Text("Connected to Room")
                                .font(.subheadline)
                                .foregroundColor(.gray)
                            Text(currentRoom.roomId)
                                .font(.system(size: 24, weight: .black, design: .monospaced))
                                .foregroundColor(colorCyan)
                        }
                        .padding()
                        .frame(maxWidth: .infinity)
                        .background(Color.white.opacity(0.05))
                        .cornerRadius(16)
                        .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color.white.opacity(0.1), lineWidth: 1))
                        
                        HStack {
                            Image(systemName: "person.2.fill")
                                .foregroundColor(.gray)
                            Text("\(currentRoom.participants.count) Listeners")
                                .font(.headline)
                                .foregroundColor(.white)
                        }
                        
                        Button(action: {
                            socket.disconnect()
                            // Reconnect immediately to clear room state but stay connected to the server
                            socket.connect()
                            // Wait, wait... proper way to leave room is `socket.emit("room:leave")` or similar. Let's just disconnect and reconnect for now to clear the session.
                            // Actually, let's just emit room:leave.
                            socket.leaveRoom() 
                        }) {
                            Text("Leave Room")
                                .font(.headline)
                                .foregroundColor(.white)
                                .frame(maxWidth: .infinity)
                                .padding()
                                .background(Color.red.opacity(0.8))
                                .cornerRadius(12)
                                .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.white.opacity(0.2), lineWidth: 1))
                                .shadow(color: .red.opacity(0.3), radius: 10, y: 4)
                        }
                        .buttonStyle(.plain)
                    }
                } else {
                    // Join / Create UI
                    VStack(spacing: 24) {
                        Button(action: {
                            // Create Master Room Logic
                            let userId = AuthManager.shared.appToken ?? UUID().uuidString
                            let roomId = "room_\(userId.prefix(8))"
                            
                            socket.joinRoom(roomId: roomId)
                            socket.triggerForceAll()
                            
                            isPresented = false
                        }) {
                            Text("Create Master Room")
                                .font(.headline)
                                .foregroundColor(Color(NSColor.windowBackgroundColor))
                                .frame(maxWidth: .infinity)
                                .padding()
                                .background(Color.primary)
                                .cornerRadius(12)
                                .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.white.opacity(0.2), lineWidth: 1))
                                .shadow(color: .black.opacity(0.2), radius: 10, y: 4)
                        }
                        .buttonStyle(.plain)
                        
                        HStack {
                            VStack { Divider().background(Color.gray.opacity(0.3)) }
                            Text("OR").foregroundColor(.gray).font(.caption).padding(.horizontal, 8)
                            VStack { Divider().background(Color.gray.opacity(0.3)) }
                        }
                        
                        HStack(spacing: 12) {
                            TextField("Enter Room Code", text: $roomCode)
                                .textFieldStyle(.plain)
                                .padding()
                                .background(Color.secondary.opacity(0.1))
                                .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.primary.opacity(0.1), lineWidth: 1))
                                .cornerRadius(12)
                                .foregroundColor(.primary)
                            
                            Button(action: {
                                if !roomCode.isEmpty {
                                    socket.joinRoom(roomId: roomCode)
                                    isPresented = false
                                }
                            }) {
                                Text("Join")
                                    .font(.headline)
                                    .padding()
                                    .frame(width: 80)
                                    .background(Color.primary)
                                    .cornerRadius(12)
                                    .foregroundColor(Color(NSColor.windowBackgroundColor))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                
                Button("Cancel") {
                    isPresented = false
                }
                .buttonStyle(.plain)
                .foregroundColor(.gray)
                .padding(.top, 8)
            }
            .padding(40)
            .frame(width: 440)
            
            Divider()
                .background(Color.white.opacity(0.1))
                .padding(.vertical, 40)
            
            // Right side: Active Rooms View
            RoomsView()
                .frame(width: 440)
        }
        .background(.ultraThinMaterial)
        .cornerRadius(24)
        .overlay(RoundedRectangle(cornerRadius: 24).stroke(Color.primary.opacity(0.1), lineWidth: 1))
        .shadow(color: .black.opacity(0.2), radius: 20, y: 10)
        
        // Close (X) Button
        Button(action: {
            isPresented = false
        }) {
            Image(systemName: "xmark.circle.fill")
                .font(.system(size: 24))
                .foregroundColor(.gray.opacity(0.5))
        }
        .buttonStyle(.plain)
        .padding(24)
        }
    }
}
