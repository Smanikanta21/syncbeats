<p align="center">
  <img src="https://img.shields.io/badge/Tauri-v2-blue?style=for-the-badge&logo=tauri" />
  <img src="https://img.shields.io/badge/Rust-2021-orange?style=for-the-badge&logo=rust" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react" />
  <img src="https://img.shields.io/badge/Vite-6-646CFF?style=for-the-badge&logo=vite" />
  <img src="https://img.shields.io/badge/Windows-11_Mica-0078D4?style=for-the-badge&logo=windows" />
  <img src="https://img.shields.io/badge/TypeScript-5.7-blue?style=for-the-badge&logo=typescript" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-3.4-38BDF8?style=for-the-badge&logo=tailwindcss" />
</p>

# SyncBeats Windows Client

**Native desktop client for SyncBeats — featuring Windows 11 Mica material design, hardware-level sub-millisecond clock sync, local audio library scanning, and OS-native media key controls.**

The SyncBeats Windows Client bridges high-performance Rust native APIs with a modern React 19 glassmorphic interface built on **Tauri v2**.

---

## 🌟 Key Features

| Feature | Technical Implementation | Description |
| :--- | :--- | :--- |
| **Windows 11 Mica Material** | `DWMSetWindowAttribute` via Win32 API | Native DWM backdrop translucent material blending the app window with desktop wallpaper |
| **Hardware Clock Sync** | `QueryPerformanceCounter` via Rust `Instant` | Sub-microsecond precision timestamp generation (`get_hardware_timestamp`) for SyncBeats NTP synchronization |
| **System Media Controls (SMTC)** | Windows SMTC Integration | Broadcasts track metadata, album art, and status to Windows action center and media overlays; captures keyboard media keys |
| **Local Audio Scanner** | `lofty` Rust crate | Asynchronously scans local folders for `.mp3`, `.flac`, `.wav`, and `.m4a` files, extracting tags, duration, and embedded cover art |
| **System Tray Integration** | Tauri v2 `TrayIconBuilder` | Quick context menu to toggle window visibility, check room status, or exit while running in the background |
| **Custom Frameless Titlebar** | Window Drag Region + Tauri Window API | Custom glassmorphic titlebar supporting minimize, maximize, and minimize-to-tray interactions |
| **Floating Dynamic Island** | React Component with Live Latency | Expandable floating mini-player showing active track info, playback controls, and real-time room sync latency (ms) |

---

## 📁 Architecture & File Structure

```
windows/
├── package.json                      # Frontend dependencies & Tauri CLI scripts
├── tsconfig.json                     # TypeScript configuration
├── vite.config.ts                    # Vite dev server & build config (Port 1420)
├── index.html                        # App HTML entry point
│
├── src/                              # React 19 Frontend Application
│   ├── App.tsx                       # Main layout controller & SMTC event listeners
│   ├── main.tsx                      # React root rendering
│   ├── index.css                     # Design tokens & glassmorphism CSS
│   │
│   ├── components/                   # UI Components
│   │   ├── Titlebar.tsx              # Frameless drag titlebar with window controls
│   │   ├── FloatingIsland.tsx        # Dynamic Island mini-player widget overlay
│   │   ├── NowPlayingBar.tsx         # Persistent bottom playback bar
│   │   └── GlassContainer.tsx        # Glassmorphic container wrapper
│   │
│   ├── views/                        # Core Application Views
│   │   ├── HubSplitView.tsx          # Main split navigation (Sidebar + Main panel)
│   │   ├── SongsView.tsx             # Local library scanner & track browser
│   │   ├── DevicesView.tsx           # Room participants & sync status
│   │   ├── PlaylistDetailView.tsx    # Playlist detail view
│   │   ├── SearchView.tsx            # Track & room search engine
│   │   ├── SettingsView.tsx          # Audio & app settings
│   │   └── SignInView.tsx            # Authentication view
│   │
│   ├── services/                     # Service Modules
│   │   ├── apiClient.ts              # SyncBeats REST API integration
│   │   ├── playerEngine.ts           # HTML5 Audio engine & playback state
│   │   └── roomSocket.ts             # Socket.IO client, NTP sync & drift correction
│   │
│   └── store/                        # State Stores
│       ├── authStore.ts              # Authentication & session token state
│       └── deviceIdentity.ts         # Persistent device UUID generation
│
└── src-tauri/                        # Rust Backend Application (Tauri v2)
    ├── Cargo.toml                    # Rust dependencies (Tauri, lofty, souvlaki, windows)
    ├── tauri.conf.json               # Tauri window configuration & window security
    └── src/
        ├── main.rs                   # Binary entry point
        ├── lib.rs                    # Plugin registration & command handler mapping
        ├── mica.rs                   # Win32 DWM Mica effect helper
        ├── clock.rs                  # QueryPerformanceCounter hardware timestamp
        ├── local_media.rs            # File system scanner & audio metadata extractor
        ├── smtc.rs                   # Windows SMTC metadata & playback state update handlers
        └── tray.rs                   # System tray icon & context menu builder
```

---

## ⚡ Native Rust Backend Commands (`tauri::command`)

The frontend interacts with native Windows capabilities via Tauri IPC command calls:

| Handler | Rust File | Description | Return Type |
| :--- | :--- | :--- | :--- |
| `get_hardware_timestamp()` | `clock.rs` | Obtains sub-microsecond hardware precision timestamp for NTP synchronization | `f64` |
| `apply_mica_effect()` | `mica.rs` | Invokes Win32 `DWMSetWindowAttribute` to apply Windows 11 Mica backdrop effect | `Result<(), String>` |
| `scan_local_folder(folder_path)` | `local_media.rs` | Scans a folder for `.mp3`, `.flac`, `.wav`, `.m4a` files & extracts ID3 metadata + base64 album art | `Result<Vec<TrackMetadata>, String>` |
| `update_smtc_metadata(title, artist, album, cover_url)` | `smtc.rs` | Updates Windows System Media Transport Controls display | `Result<(), String>` |
| `update_smtc_playback(is_playing)` | `smtc.rs` | Updates Windows SMTC play/pause toggle state | `Result<(), String>` |

---

## 🛠️ Tech Stack & Dependencies

### Frontend
- **Framework**: React 19
- **Build Tool**: Vite 6
- **Styling**: Tailwind CSS 3/4 + Custom Glassmorphic Utilities
- **Icons**: Lucide React
- **Real-Time Communication**: `socket.io-client` 4.8

### Backend (Rust / Tauri)
- **Tauri Core**: Tauri v2 (`tauri` 2.1.0)
- **Metadata Extraction**: `lofty` 0.21
- **SMTC Controls**: `souvlaki` 0.7
- **Windows API**: `windows` crate 0.58 (`Win32_Graphics_Gdi`, `Win32_Foundation`, `Win32_UI_WindowsAndMessaging`)
- **System Plugins**: `tauri-plugin-shell`, `tauri-plugin-dialog`, `tauri-plugin-window-state`

---

## 💻 Prerequisites & Setup

To build and run the SyncBeats Windows Client locally, ensure you have the following installed:

1. **Node.js**: v18.0.0 or higher (`npm` package manager)
2. **Rust**: Latest stable Rust toolchain (`rustup target add x86_64-pc-windows-msvc`)
3. **C++ Build Tools**: Visual Studio Build Tools with **Desktop development with C++** workload (required for Tauri MSVC build).

---

## 🚀 Running & Building

### 1. Install Dependencies
```bash
# Navigate to the windows directory
cd windows

# Install Node.js dependencies
npm install
```

### 2. Development Mode
Runs the Vite dev server alongside the Tauri desktop application with hot module reloading (HMR):
```bash
npm run tauri dev
```
*(Alternative: run `npx tauri dev`)*

### 3. Production Build
Compiles the React frontend, builds the Rust binary, and packages the Windows installer (`.msi` / `.exe`):
```bash
npm run tauri build
```
The output installers will be generated in `src-tauri/target/release/bundle/`.

---

## 🔒 Configuration

- **Window Settings (`tauri.conf.json`)**: Configured for frameless windowing (`decorations: false`), transparency (`transparent: true`), and custom window dimensions (Default: 1280x820, Min: 900x650).
- **Vite Server (`vite.config.ts`)**: Runs on port `1420` with HMR file watching configured to ignore `src-tauri` directory changes.
