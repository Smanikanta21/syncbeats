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
    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: "waveform")
                .resizable()
                .scaledToFit()
                .frame(width: 80, height: 80)
                .foregroundColor(.cyan)
            
            Text("Welcome to SyncBeats")
                .font(.largeTitle)
                .fontWeight(.bold)
            
            Text("Please log in via the web app to continue.")
                .foregroundColor(.secondary)
            
            Button("Login via Web") {
                // Open the local web app login page with a returnTo deep link
                if let url = URL(string: "http://localhost:3000/login?returnTo=syncbeats://auth") {
                    NSWorkspace.shared.open(url)
                }
            }
            .buttonStyle(.borderedProminent)
            .tint(.cyan)
            .controlSize(.large)
            .padding(.top, 20)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(NSColor.windowBackgroundColor))
    }
}

#Preview {
    ContentView()
}
