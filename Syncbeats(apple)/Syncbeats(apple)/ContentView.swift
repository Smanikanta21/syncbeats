//
//  ContentView.swift
//  Syncbeats(apple)
//
//  Created by Abhinay Siraparapu on 09/07/26.
//

import SwiftUI

struct ContentView: View {
    @ObservedObject var auth = AuthManager.shared
    
    var body: some View {
        Group {
            if auth.isAuthenticated {
                MainAppView()
            } else {
                LoginView()
            }
        }
        // Standard large desktop window bounds
        .frame(minWidth: 800, minHeight: 600)
    }
}

struct LoginView: View {
    // Website Gradient Colors
    let colorCyan = Color(red: 0.0, green: 1.0, blue: 0.7)    // #00FFB2
    let colorPurple = Color(red: 0.48, green: 0.38, blue: 1.0) // #7B61FF
    let colorPink = Color(red: 1.0, green: 0.24, blue: 0.44)   // #FF3D71
    
    var body: some View {
        ZStack {
            // Ambient Gradients Background
            AmbientBackground(colorCyan: colorCyan, colorPurple: colorPurple, colorPink: colorPink)
            
            // Glassmorphic Welcome Card
            VStack(spacing: 28) {
                ZStack {
                    Circle()
                        .fill(Color.white.opacity(0.05))
                        .frame(width: 100, height: 100)
                        .overlay(Circle().stroke(Color.white.opacity(0.1), lineWidth: 1))
                    
                    Image(systemName: "waveform")
                        .font(.system(size: 44, weight: .bold))
                        .foregroundColor(colorCyan)
                }
                
                VStack(spacing: 8) {
                    Text("SyncBeats")
                        .font(.system(size: 32, weight: .black, design: .rounded))
                        .foregroundColor(.white)
                    
                    Text("The Cross-Device Co-Listening Platform")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(.gray)
                }
                
                Text("To sync your music and audio streams, log in via your web browser. Once authenticated, the desktop app will configure itself automatically.")
                    .font(.system(size: 12))
                    .foregroundColor(.white.opacity(0.6))
                    .multilineTextAlignment(.center)
                    .lineSpacing(4)
                    .padding(.horizontal, 24)
                
                Button(action: {
                    // Open local web app login page
                    if let url = URL(string: "http://localhost:3000/login?returnTo=syncbeats://auth") {
                        NSWorkspace.shared.open(url)
                    }
                }) {
                    HStack {
                        Text("Login via Web Browser")
                            .font(.system(size: 14, weight: .bold))
                        Image(systemName: "arrow.up.right")
                            .font(.system(size: 12, weight: .bold))
                    }
                    .foregroundColor(.black)
                    .padding(.horizontal, 24)
                    .padding(.vertical, 12)
                    .background(colorCyan)
                    .cornerRadius(12)
                }
                .buttonStyle(.plain)
                .shadow(color: colorCyan.opacity(0.3), radius: 10, y: 4)
            }
            .padding(40)
            .frame(width: 420)
            .background(.ultraThinMaterial)
            .cornerRadius(24)
            .overlay(
                RoundedRectangle(cornerRadius: 24)
                    .stroke(Color.white.opacity(0.08), lineWidth: 1)
            )
            .shadow(color: .black.opacity(0.4), radius: 30, y: 15)
        }
        .preferredColorScheme(.dark)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

#Preview {
    ContentView()
}
