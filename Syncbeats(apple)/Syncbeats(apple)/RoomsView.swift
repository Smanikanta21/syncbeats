import SwiftUI

struct DbRoom: Codable, Identifiable {
    let id: String
    let host_id: String
    let created_at: String
    let ended_at: String?
    let playback_state: String
    let position_ms: Int
    let track_url: String?
}

struct RoomsResponse: Codable {
    let rooms: [DbRoom]
}

struct RoomsView: View {
    @State private var rooms: [DbRoom] = []
    @State private var isLoading = true
    @State private var errorMessage: String? = nil
    
    // Website Gradient Colors
    let colorCyan = Color(red: 0.0, green: 1.0, blue: 0.7)
    let colorPurple = Color(red: 0.48, green: 0.38, blue: 1.0)
    
    let columns = [
        GridItem(.adaptive(minimum: 280, maximum: 320), spacing: 24)
    ]
    
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                Text("Your Rooms")
                    .font(.system(size: 34, weight: .bold, design: .rounded))
                    .foregroundColor(.white)
                    .padding(.horizontal, 32)
                    .padding(.top, 40)
                
                if isLoading {
                    ProgressView()
                        .frame(maxWidth: .infinity, minHeight: 200)
                } else if let error = errorMessage {
                    Text(error)
                        .foregroundColor(.red)
                        .padding(.horizontal, 32)
                } else if rooms.isEmpty {
                    VStack(spacing: 16) {
                        Image(systemName: "hifispeaker.2.fill")
                            .font(.system(size: 48))
                            .foregroundColor(.white.opacity(0.4))
                        Text("You don't have any active rooms.")
                            .foregroundColor(.gray)
                    }
                    .frame(maxWidth: .infinity, minHeight: 200)
                } else {
                    LazyVGrid(columns: columns, spacing: 24) {
                        ForEach(rooms) { room in
                            RoomCard(room: room)
                        }
                    }
                    .padding(.horizontal, 32)
                    .padding(.bottom, 40)
                }
            }
        }
        .onAppear {
            fetchRooms()
        }
    }
    
    private func fetchRooms() {
        guard let token = AuthManager.shared.appToken else {
            errorMessage = "Not authenticated"
            isLoading = false
            return
        }
        
        guard let url = URL(string: "\(Config.backendURL)/rooms/mine") else { return }
        
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        
        URLSession.shared.dataTask(with: request) { data, response, error in
            DispatchQueue.main.async {
                self.isLoading = false
                
                if let error = error {
                    self.errorMessage = error.localizedDescription
                    return
                }
                
                guard let data = data else {
                    self.errorMessage = "No data received"
                    return
                }
                
                do {
                    let decoded = try JSONDecoder().decode(RoomsResponse.self, from: data)
                    self.rooms = decoded.rooms
                } catch {
                    self.errorMessage = "Failed to parse rooms: \(error)"
                    print("Rooms parse error: \(error)")
                }
            }
        }.resume()
    }
}

struct RoomCard: View {
    let room: DbRoom
    @State private var isHovered = false
    
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Image(systemName: "hifispeaker.fill")
                    .foregroundColor(Color(red: 0.0, green: 1.0, blue: 0.7)) // Cyan
                    .font(.system(size: 24))
                Spacer()
                
                let isEnded = room.ended_at != nil
                Text(isEnded ? "Ended" : "Active")
                    .font(.caption.bold())
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(isEnded ? Color.gray.opacity(0.3) : Color(red: 0.0, green: 1.0, blue: 0.7).opacity(0.2))
                    .foregroundColor(isEnded ? .gray : Color(red: 0.0, green: 1.0, blue: 0.7))
                    .cornerRadius(8)
            }
            
            VStack(alignment: .leading, spacing: 4) {
                Text("Room Code")
                    .font(.caption)
                    .foregroundColor(.gray)
                Text(room.id)
                    .font(.system(size: 18, weight: .bold, design: .monospaced))
                    .foregroundColor(.white)
            }
            
            if let trackUrl = room.track_url {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Last Playing")
                        .font(.caption)
                        .foregroundColor(.gray)
                    Text(trackUrl.prefix(20) + "...")
                        .font(.system(size: 13))
                        .foregroundColor(.white)
                }
            }
            
            Spacer()
            
            Button(action: {
                // Join this room!
                SocketService.shared.joinRoom(roomId: room.id)
            }) {
                Text("Join Room")
                    .font(.system(size: 14, weight: .bold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
                    .background(isHovered ? Color.white : Color.white.opacity(0.1))
                    .foregroundColor(isHovered ? .black : .white)
                    .cornerRadius(8)
            }
            .buttonStyle(.plain)
        }
        .padding(20)
        .frame(height: 220)
        .background(Color.white.opacity(0.05))
        .cornerRadius(16)
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(Color.white.opacity(isHovered ? 0.3 : 0.1), lineWidth: 1)
        )
        .shadow(color: .black.opacity(0.3), radius: 10, y: 5)
        .onHover { hovering in
            withAnimation(.easeInOut(duration: 0.2)) {
                isHovered = hovering
            }
        }
    }
}
