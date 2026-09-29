import SwiftUI

struct HubView: View {
    @StateObject private var authManager = AuthManager.shared
    @State private var rooms: [RoomRecord] = []
    @State private var isLoading = false
    @State private var errorMessage: String? = nil
    
    @State private var joinRoomId: String = ""
    @State private var isJoining = false
    
    var body: some View {
        ZStack {
            // Background imitating Next.js web app's style
            Color.black.edgesIgnoringSafeArea(.all)
            
            // Subtle ambient lighting
            Circle()
                .fill(Color.orange.opacity(0.15))
                .blur(radius: 100)
                .frame(width: 500, height: 500)
                .offset(x: 200, y: -300)
            
            Circle()
                .fill(Color.purple.opacity(0.15))
                .blur(radius: 120)
                .frame(width: 400, height: 400)
                .offset(x: -250, y: 300)
            
            ScrollView {
                VStack(spacing: 40) {
                    // Header
                    HStack {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Welcome back,")
                                .font(.subheadline)
                                .foregroundColor(.white.opacity(0.6))
                            
                            Text(authManager.currentUser?.name ?? "Guest")
                                .font(.system(size: 32, weight: .bold, design: .rounded))
                                .foregroundColor(.white)
                        }
                        
                        Spacer()
                        
                        Button(action: {
                            authManager.logout()
                        }) {
                            Text("Logout")
                                .font(.caption)
                                .fontWeight(.semibold)
                                .padding(.horizontal, 16)
                                .padding(.vertical, 8)
                                .background(Color.white.opacity(0.1))
                                .cornerRadius(20)
                                .foregroundColor(.white)
                        }
                        .buttonStyle(PlainButtonStyle())
                    }
                    .padding(.horizontal, 30)
                    .padding(.top, 40)
                    
                    // Action Cards
                    HStack(spacing: 20) {
                        // Join Card
                        VStack(spacing: 16) {
                            Text("Join a Room")
                                .font(.headline)
                                .foregroundColor(.white)
                            
                            TextField("Room Code", text: $joinRoomId)
                                .textFieldStyle(PlainTextFieldStyle())
                                .padding()
                                .background(Color.white.opacity(0.05))
                                .cornerRadius(12)
                                .foregroundColor(.white)
                                .overlay(
                                    RoundedRectangle(cornerRadius: 12)
                                        .stroke(Color.white.opacity(0.2), lineWidth: 1)
                                )
                                .font(.system(.body, design: .monospaced))
                            
                            Button(action: {
                                // Transition to RoomView
                                print("Joining room: \(joinRoomId)")
                            }) {
                                Text("Join")
                                    .fontWeight(.bold)
                                    .frame(maxWidth: .infinity)
                                    .padding()
                                    .background(Color.white)
                                    .foregroundColor(.black)
                                    .cornerRadius(12)
                            }
                            .buttonStyle(PlainButtonStyle())
                            .disabled(joinRoomId.trimmingCharacters(in: .whitespaces).isEmpty)
                        }
                        .padding(24)
                        .background(.ultraThinMaterial)
                        .environment(\.colorScheme, .dark)
                        .cornerRadius(24)
                        .overlay(
                            RoundedRectangle(cornerRadius: 24)
                                .stroke(Color.white.opacity(0.1), lineWidth: 1)
                        )
                        
                        // Create Card
                        VStack(spacing: 16) {
                            Text("Start a Party")
                                .font(.headline)
                                .foregroundColor(.white)
                            
                            Text("Create a new room and share the code to listen with friends.")
                                .font(.caption)
                                .foregroundColor(.white.opacity(0.6))
                                .multilineTextAlignment(.center)
                                .padding(.bottom, 8)
                            
                            Button(action: {
                                createAndJoinRoom()
                            }) {
                                HStack {
                                    if isJoining {
                                        ProgressView().progressViewStyle(CircularProgressViewStyle(tint: .black))
                                    } else {
                                        Text("Create Room")
                                            .fontWeight(.bold)
                                    }
                                }
                                .frame(maxWidth: .infinity)
                                .padding()
                                .background(Color.purple)
                                .foregroundColor(.white)
                                .cornerRadius(12)
                            }
                            .buttonStyle(PlainButtonStyle())
                            .disabled(isJoining)
                        }
                        .padding(24)
                        .background(.ultraThinMaterial)
                        .environment(\.colorScheme, .dark)
                        .cornerRadius(24)
                        .overlay(
                            RoundedRectangle(cornerRadius: 24)
                                .stroke(Color.white.opacity(0.1), lineWidth: 1)
                        )
                    }
                    .padding(.horizontal, 30)
                    
                    // History
                    VStack(alignment: .leading, spacing: 20) {
                        Text("Recent Rooms")
                            .font(.title3)
                            .fontWeight(.semibold)
                            .foregroundColor(.white)
                            .padding(.horizontal, 30)
                        
                        if isLoading {
                            ProgressView()
                                .padding()
                                .frame(maxWidth: .infinity)
                        } else if let error = errorMessage {
                            Text(error)
                                .foregroundColor(.red)
                                .padding(.horizontal, 30)
                        } else if rooms.isEmpty {
                            Text("No recent rooms found.")
                                .foregroundColor(.white.opacity(0.5))
                                .padding(.horizontal, 30)
                        } else {
                            LazyVStack(spacing: 12) {
                                ForEach(rooms) { room in
                                    RoomRowView(room: room)
                                }
                            }
                            .padding(.horizontal, 30)
                        }
                    }
                    
                    Spacer()
                }
            }
        }
        .task {
            await fetchRooms()
        }
    }
    
    private func fetchRooms() async {
        isLoading = true
        do {
            rooms = try await RoomService.shared.getMyRooms()
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }
    
    private func createAndJoinRoom() {
        isJoining = true
        Task {
            do {
                let newRoomId = try await RoomService.shared.createRoom()
                // Transition to RoomView with newRoomId
                print("Created and joining room: \(newRoomId)")
            } catch {
                errorMessage = error.localizedDescription
            }
            isJoining = false
        }
    }
}

struct RoomRowView: View {
    let room: RoomRecord
    
    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text(room.id)
                    .font(.system(.headline, design: .monospaced))
                    .foregroundColor(.white)
                
                Text(room.isPrivate == true ? "Private Room" : "Public Room")
                    .font(.caption)
                    .foregroundColor(.white.opacity(0.5))
            }
            
            Spacer()
            
            if let count = room.participantCount {
                HStack(spacing: 4) {
                    Image(systemName: "person.2.fill")
                        .font(.caption)
                    Text("\(count)")
                        .font(.caption)
                        .fontWeight(.bold)
                }
                .foregroundColor(.white.opacity(0.7))
            }
            
            Button(action: {
                // Join this room
            }) {
                Image(systemName: "play.circle.fill")
                    .font(.title2)
                    .foregroundColor(.white)
            }
            .buttonStyle(PlainButtonStyle())
            .padding(.leading, 12)
        }
        .padding()
        .background(Color.white.opacity(0.05))
        .cornerRadius(16)
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(Color.white.opacity(0.1), lineWidth: 1)
        )
    }
}

struct HubView_Previews: PreviewProvider {
    static var previews: some View {
        HubView()
            .frame(width: 800, height: 600)
    }
}
