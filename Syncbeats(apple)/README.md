# SyncBeats for macOS 🎵

An ultra-premium, native macOS desktop application for **SyncBeats**—the real-time, zero-drift multi-device collaborative audio player. Built with Swift, SwiftUI, AVFoundation, and Socket.IO.

---

## ✨ Features

### 🏝️ Dynamic Island Notch Integration
- **MacBook Notch Integration**: Floating interactive Dynamic Island attached seamlessly to the native MacBook display notch.
- **Dynamic State Transitions**: Fluidly transitions between `.miniPlayer`, `.roomWelcome`, `.downloading`, and `.expanded` states.
- **Interactive Audio Visualizer & Waveforms**: Live audio level meters and dynamic equalizer animations during playback.
- **Real-Time Transfer Progress**: Displays P2P transfer progress, buffering percentages, and peer sync indicators.

### 🎧 High-Precision Sync & Audio Engine
- **AVFoundation Playback**: Sub-15ms precise audio playback synchronization using high-performance `AVPlayer` / `AVAudioEngine`.
- **Collaborative Room Sync**: Real-time room timeline alignment via Socket.IO WebSocket protocol.
- **Smart Audio Prefetching**: Automatic pre-downloading of upcoming tracks ~30 seconds before track end for zero-gap playback.
- **Offline Caching**: Caches `.m4a` audio files locally in macOS Application Support / Caches directory.

### 🎨 Apple-Class Aesthetics & Design System
- **Liquid Metal & Glassmorphic UI**: Translucent, frosted glass cards using macOS native `NSVisualEffectView` backdrops.
- **Adaptive Light & Dark Modes**: Seamless theme switching tailored to macOS system appearances.
- **Interactive SyncBeats Mode Controller**: Room status chip near the mini-player showing live latency (`sync 2ms`), room code, and one-click Room Join/Leave.
- **Queue Side-Panel**: Drag-and-drop queue reordering, track removal (`minus.circle.fill`), and track pre-fetching.

### 🔐 Secure Auth & SyncBeats Connect
- **macOS Keychain Storage**: Hardware-secured JWT token storage using the native macOS Keychain.
- **WebAuthConnect Service**: Deep-link OAuth login flow connecting web browser credentials directly to the desktop app.

---

## 📁 Architecture & File Map

```
Syncbeats(apple)/
├── Syncbeats(apple)/
│   ├── Syncbeats_apple_App.swift    # Application entry point & setup
│   ├── WindowManager.swift           # Native window management & Dynamic Island panel positioning
│   ├── IslandView.swift              # Dynamic Island notch widget UI & state machine
│   ├── HubSplitView.swift           # Main NavigationSplitView layout & Queue sidebar panel
│   ├── NowPlayingBar.swift           # Sticky bottom media player bar & SyncBeats mode chip
│   ├── PlayerEngine.swift            # AVFoundation Audio Engine, prefetching & cache manager
│   ├── RoomSocket.swift              # Socket.IO client for WebSocket real-time sync
│   ├── APIClient.swift               # REST API client (127.0.0.1:4000)
│   ├── AuthStore.swift               # Authentication state manager
│   ├── Keychain.swift                # macOS Keychain wrapper for secure token storage
│   ├── WebAuthConnectService.swift   # OAuth deep-link & web auth connector
│   ├── DevicesView.swift             # Connected devices & room manager view
│   ├── SongsView.swift               # Music library catalog & player table
│   ├── PlaylistDetailView.swift      # Playlist detail & track listing view
│   ├── SearchView.swift              # Unified YouTube & local music search view
│   ├── SettingsView.swift            # Audio latency calibration & app preferences
│   ├── SignInView.swift              # Native login & registration interface
│   ├── Theme.swift                   # Color tokens, typography, and glass utilities
│   └── GlassStyles.swift             # Custom SwiftUI glassmorphism modifiers
└── Syncbeats(apple).xcodeproj        # Xcode project bundle
```

---

## 🛠️ Prerequisites

- **macOS**: macOS 13.0 (Ventura) or later *(macOS 14 Sonoma or macOS 15 Sequoia recommended)*.
- **Xcode**: Xcode 15.0 or higher.
- **SyncBeats Backend**: Active `syncbeats-server` running at `http://127.0.0.1:4000`.

---

## 🚀 Building & Running

### Option 1: Xcode GUI
1. Open the project in Xcode:
   ```bash
   open "Syncbeats(apple)/Syncbeats(apple).xcodeproj"
   ```
2. Select target `Syncbeats(apple)` and destination **My Mac**.
3. Press `Cmd + R` to build and run the application.

### Option 2: Command Line (`xcodebuild`)
To build the application via terminal:
```bash
cd "Syncbeats(apple)"
xcodebuild -project "Syncbeats(apple).xcodeproj" -scheme "Syncbeats(apple)" -configuration Debug build
```

---

## ⚙️ Configuration & Server Endpoint

By default, the desktop client connects to the local backend server at `http://127.0.0.1:4000`.

To change the target server address:
- Open `APIClient.swift` and modify:
  ```swift
  var baseURL = "http://127.0.0.1:4000" // Replace with your production server URL
  ```
- Or set environment variables in your Xcode Scheme configuration.

---

## 💡 Troubleshooting & FAQ

### `Could not connect to the server (Error -1004)`
Ensure `syncbeats-server` is running locally on port 4000 (`npm run dev` inside `dev/syncbeats-server`). The desktop app uses `127.0.0.1` directly to avoid IPv6 `::1` resolution delays.

### Dynamic Island Notch Position
The Dynamic Island automatically detects if your Mac has a hardware display notch (e.g. MacBook Pro 14"/16" M1/M2/M3/M4) and anchors to the top center. On notchless displays or external monitors, it renders as a sleek floating top-center pill.

---

## 📄 License

Part of the **SyncBeats** project ecosystem. Created for high-fidelity real-time collaborative listening.
