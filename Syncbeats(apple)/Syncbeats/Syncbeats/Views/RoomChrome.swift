import SwiftUI
import AVKit

// The shared visual vocabulary for the room. Everything the stage and the notch
// island both draw lives here and is written once — three artwork tiles and two
// scrubbers had already drifted apart before this file absorbed them.
//
// Motion convention: one `.animation(_:value:)` per gesture (two springs on the
// same frame produce a visible double-step), and no `.repeatForever` — it keeps
// running on views that stay mounted at opacity 0. Anything ongoing is driven by
// `TimelineView(paused:)`.
//
// Colour convention: monochrome. The only hues in the app are semantic state
// (sync health, errors) and the album artwork itself — which is why the stage is
// full-bleed and the bloom is the room's light source.

// MARK: - Design tokens

/// Spacing, radii, motion and numeric type, in one place so call sites stop
/// re-deriving them.
enum Design {
    // 8pt grid; `xs` is the only sub-grid step, for intra-component gaps.
    static let xs: CGFloat = 4
    static let s: CGFloat = 8
    static let m: CGFloat = 12
    static let l: CGFloat = 16
    static let xl: CGFloat = 24
    static let xxl: CGFloat = 32

    static let panelRadius: CGFloat = 20
    static let cardRadius: CGFloat = 12

    /// State changes: play/pause, selection, a value settling.
    static let state = Animation.smooth(duration: 0.35)
    /// Layout changes: panels, the island, anything that moves a frame.
    static let layout = Animation.spring(response: 0.4, dampingFraction: 0.75, blendDuration: 0.1)
    /// Button press-down.
    static let press = Animation.smooth(duration: 0.22, extraBounce: 0.3)

    /// Every number in the app. Monospaced so ticking values don't reflow.
    static let numeric = Font.caption.monospacedDigit()
    static let numericSmall = Font.caption2.monospacedDigit()
}

// MARK: - Haptics

/// Trackpad haptics — the "cursor vibration" you feel under the finger on a
/// Force Touch trackpad.
///
/// `perform` is a no-op on hardware with no haptic engine (Magic Mouse, external
/// keyboards, a plain USB mouse), so there is nothing to feature-detect. It also
/// respects the user's "Force Click and haptic feedback" setting in System
/// Settings for free — we deliberately don't try to override that.
enum Haptics {
    /// Light detent. Transport glyphs, row taps, tab switches.
    static func tap() {
        #if os(macOS)
        NSHapticFeedbackManager.defaultPerformer.perform(.alignment, performanceTime: .now)
        #endif
    }

    /// Heavier thunk. Play/pause and anything with a committed consequence.
    static func impact() {
        #if os(macOS)
        NSHapticFeedbackManager.defaultPerformer.perform(.levelChange, performanceTime: .now)
        #endif
    }
}

// MARK: - Glass

extension View {
    /// Liquid Glass where the OS has it, a vibrancy material everywhere else.
    ///
    /// Both read as glass — macOS 26 just does the specular highlight and
    /// refraction properly instead of a flat blur. The fallback is not a
    /// degradation to plain colour; `.ultraThinMaterial` has been the real
    /// glassmorphism primitive since macOS 12.
    ///
    /// This is the ONLY macOS 26-only call in the app. If `glassEffect` fails to
    /// compile (wrong argument labels on your SDK), delete the `if #available`
    /// branch and keep the `else` — everything else here is macOS 12-era API and
    /// the material path already looks right.
    @ViewBuilder
    func syncbeatsGlass<S: Shape>(in shape: S) -> some View {
        if #available(macOS 26.0, iOS 26.0, *) {
            self.glassEffect(.regular, in: shape)
        } else {
            self.background(.ultraThinMaterial, in: shape)
        }
    }
}

// MARK: - Buttons

/// Transport glyph: springs down on press, fades a circular bed in behind it,
/// and ticks the trackpad. Replaces bare `.buttonStyle(.plain)` + `Image`, which
/// gave no press feedback at all.
///
/// `tinted` means "this toggle is on" and resolves to `.primary` against
/// `.secondary` — never a hue. Inside the island's forced-dark subtree
/// `Color.primary` is white, which is exactly what it wants.
struct GlyphButtonStyle: ButtonStyle {
    var size: CGFloat = 15
    var tinted: Bool = false

    func makeBody(configuration: Configuration) -> some View {
        Glyph(configuration: configuration, size: size, tinted: tinted)
    }

    private struct Glyph: View {
        let configuration: ButtonStyleConfiguration
        let size: CGFloat
        let tinted: Bool

        @Environment(\.isEnabled) private var isEnabled

        var body: some View {
            configuration.label
                .font(.system(size: size, weight: .semibold))
                .foregroundStyle(tinted ? Color.primary : Color.secondary)
                .frame(width: size * 2.4, height: size * 2.4)
                .background(
                    Circle()
                        .fill(.quaternary)
                        .opacity(configuration.isPressed ? 1 : 0)
                )
                .scaleEffect(configuration.isPressed ? 0.86 : 1)
                .opacity(isEnabled ? 1 : 0.35)
                .contentShape(Circle())
                .animation(Design.press, value: configuration.isPressed)
                .animation(Design.state, value: tinted)
                .onChange(of: configuration.isPressed) { _, pressed in
                    if pressed { Haptics.tap() }
                }
        }
    }
}

/// The play button. A filled `.primary` disc with a `.background`-coloured glyph
/// punched out of it — the highest-contrast control available without spending a
/// hue on it. The shadow collapses under the press so the whole control reads as
/// physically depressing.
struct PlayButtonStyle: ButtonStyle {
    var diameter: CGFloat = 62

    func makeBody(configuration: Configuration) -> some View {
        ButtonView(configuration: configuration, diameter: diameter)
    }

    struct ButtonView: View {
        let configuration: ButtonStyleConfiguration
        let diameter: CGFloat

        @Environment(\.isEnabled) private var isEnabled

        var body: some View {
            configuration.label
                .font(.system(size: diameter * 0.42, weight: .semibold))
                .foregroundStyle(.background)
                .frame(width: diameter, height: diameter)
                .background(Circle().fill(.primary))
                .shadow(
                    color: .black.opacity(configuration.isPressed ? 0.15 : 0.35),
                    radius: configuration.isPressed ? 6 : 18,
                    y: configuration.isPressed ? 2 : 8
                )
                .scaleEffect(configuration.isPressed ? 0.90 : 1)
                .opacity(isEnabled ? 1 : 0.4)
                .contentShape(Circle())
                .animation(.smooth(duration: 0.25, extraBounce: 0.35), value: configuration.isPressed)
                .onChange(of: configuration.isPressed) { _, pressed in
                    if pressed { Haptics.impact() }
                }
        }
    }
}

// MARK: - Ambient

public enum BackgroundTheme: String, CaseIterable, Identifiable {
    case albumArt = "Album Art"
    case aurora = "Aurora"
    case sunset = "Sunset"
    case midnight = "Midnight"
    case minimalGlass = "Minimal Glass"

    public var id: String { rawValue }

    public var icon: String {
        switch self {
        case .albumArt: return "sparkles"
        case .aurora: return "waveform.path"
        case .sunset: return "sun.horizon.fill"
        case .midnight: return "moon.stars.fill"
        case .minimalGlass: return "square.on.square.intersection.dashed"
        }
    }
}

/// Persisted knobs for the ambient bloom, shared by the backdrop and its
/// settings sheet so the two can never read different keys. Stored in
/// UserDefaults via `@AppStorage`, matching the app's `sb_`-prefixed convention.
enum Ambient {
    static let enabledKey = "sb_ambient_enabled"
    static let intensityKey = "sb_ambient_intensity"
    static let brightnessKey = "sb_ambient_brightness"
    static let themeKey = "sb_ambient_theme"
    static let defaultEnabled = true
    static let defaultIntensity = 0.6   // 0…1 — how hard the bloom pulses on the beat
    static let defaultBrightness = 0.6  // 0…1 — baseline glow before the beat adds to it
    static let defaultTheme = BackgroundTheme.albumArt.rawValue
}

/// The room's light source.
struct AmbientBackdrop: View {
    let url: URL?
    var videoUrl: URL? = nil
    let isPlaying: Bool

    @AppStorage(Ambient.enabledKey) private var enabled = Ambient.defaultEnabled
    @AppStorage(Ambient.intensityKey) private var intensity = Ambient.defaultIntensity
    @AppStorage(Ambient.brightnessKey) private var brightness = Ambient.defaultBrightness
    @AppStorage(Ambient.themeKey) private var themeRaw = Ambient.defaultTheme

    private var theme: BackgroundTheme {
        BackgroundTheme(rawValue: themeRaw) ?? .albumArt
    }

    private let bloomBase: CGFloat = 400

    var body: some View {
        if enabled {
            GeometryReader { geo in
                let fill = max(geo.size.width, geo.size.height) * 1.35 / bloomBase

                TimelineView(.animation(minimumInterval: 1.0 / 30.0, paused: !isPlaying)) { _ in
                    Group {
                        switch theme {
                        case .albumArt:
                            ZStack {
                                // Deep chromatic underglow so dark album art (e.g. AC/DC) never collapses into a black void
                                RadialGradient(
                                    colors: [Color.indigo.opacity(0.4), Color.purple.opacity(0.25), Color.clear],
                                    center: .center,
                                    startRadius: 20,
                                    endRadius: bloomBase * 0.7
                                )
                                if let videoUrl = videoUrl {
                                    AnimatedVideoBloom(url: videoUrl, isPlaying: isPlaying)
                                        .saturation(1.7)
                                } else {
                                    bloom
                                }
                            }

                        case .aurora:
                            ZStack {
                                RadialGradient(
                                    colors: [Color.teal.opacity(0.8), Color.indigo.opacity(0.6), Color.clear],
                                    center: .topLeading,
                                    startRadius: 40,
                                    endRadius: bloomBase
                                )
                                RadialGradient(
                                    colors: [Color.purple.opacity(0.7), Color.blue.opacity(0.5), Color.clear],
                                    center: .bottomTrailing,
                                    startRadius: 50,
                                    endRadius: bloomBase
                                )
                            }

                        case .sunset:
                            ZStack {
                                RadialGradient(
                                    colors: [Color.orange.opacity(0.8), Color.pink.opacity(0.6), Color.clear],
                                    center: .topTrailing,
                                    startRadius: 30,
                                    endRadius: bloomBase
                                )
                                RadialGradient(
                                    colors: [Color.purple.opacity(0.7), Color.red.opacity(0.5), Color.clear],
                                    center: .bottomLeading,
                                    startRadius: 40,
                                    endRadius: bloomBase
                                )
                            }

                        case .midnight:
                            ZStack {
                                RadialGradient(
                                    colors: [Color.cyan.opacity(0.4), Color.blue.opacity(0.3), Color.clear],
                                    center: .center,
                                    startRadius: 10,
                                    endRadius: bloomBase * 0.8
                                )
                                RadialGradient(
                                    colors: [Color.indigo.opacity(0.6), Color.black.opacity(0.8), Color.clear],
                                    center: .bottom,
                                    startRadius: 60,
                                    endRadius: bloomBase
                                )
                            }

                        case .minimalGlass:
                            RadialGradient(
                                colors: [Color.white.opacity(0.08), Color.clear],
                                center: .center,
                                startRadius: 0,
                                endRadius: bloomBase * 0.6
                            )
                        }
                    }
                    .frame(width: bloomBase, height: bloomBase)
                    .blur(radius: theme == .minimalGlass ? 40 : 96)
                    .scaleEffect(fill * scale)
                    .opacity(opacity)
                    .animation(.smooth(duration: 0.9), value: isPlaying)
                    .animation(.smooth(duration: 0.9), value: url)
                    .animation(.smooth(duration: 0.9), value: videoUrl)
                    .animation(.smooth(duration: 0.5), value: themeRaw)
                }
                .frame(width: geo.size.width, height: geo.size.height)
                .clipped()
            }
            .allowsHitTesting(false)
            .accessibilityHidden(true)
        }
    }

    @ViewBuilder
    private var bloom: some View {
        if let url {
            AsyncImage(url: url) { phase in
                if let image = phase.image {
                    image.resizable().aspectRatio(contentMode: .fill)
                } else {
                    neutralWash
                }
            }
            .saturation(1.7)
        } else {
            neutralWash
        }
    }

    private var pulse: Double { isPlaying ? AudioEngine.shared.level * intensity : 0 }
    private var scale: CGFloat { (isPlaying ? 1.08 : 1.0) + pulse * 0.16 }
    private var opacity: Double { (isPlaying ? 0.9 : 0.45) * brightness + pulse * 0.30 }

    private var neutralWash: some View {
        RadialGradient(
            colors: [.primary.opacity(0.14), .clear],
            center: .center,
            startRadius: 0,
            endRadius: bloomBase * 0.5
        )
        .blur(radius: 60)
    }
}

// MARK: - Ambient settings

struct AmbientSettingsView: View {
    let artworkURL: URL?

    @Environment(\.dismiss) private var dismiss
    @AppStorage(Ambient.enabledKey) private var enabled = Ambient.defaultEnabled
    @AppStorage(Ambient.intensityKey) private var intensity = Ambient.defaultIntensity
    @AppStorage(Ambient.brightnessKey) private var brightness = Ambient.defaultBrightness
    @AppStorage(Ambient.themeKey) private var themeRaw = Ambient.defaultTheme

    var body: some View {
        NavigationStack {
            Form {
                Section("Preview") {
                    ZStack {
                        Color.black
                        AmbientBackdrop(url: artworkURL, isPlaying: true)
                    }
                    .frame(height: 150)
                    .clipShape(RoundedRectangle(cornerRadius: Design.cardRadius, style: .continuous))
                    .listRowInsets(EdgeInsets())
                }

                Section("Theme") {
                    Picker("Background Theme", selection: $themeRaw) {
                        ForEach(BackgroundTheme.allCases) { t in
                            Label(t.rawValue, systemImage: t.icon).tag(t.rawValue)
                        }
                    }
                    #if os(macOS)
                    .pickerStyle(.menu)
                    #endif
                }

                Section {
                    Toggle("Ambient background", isOn: $enabled)
                } footer: {
                    Text("A rich blurred wash that swells and pulses with the beat.")
                }

                Section("Beat reactivity") {
                    LabeledContent("Intensity") {
                        Slider(value: $intensity, in: 0...1)
                            .frame(maxWidth: 220)
                            .accessibilityValue("\(Int(intensity * 100)) percent")
                    }
                    LabeledContent("Brightness") {
                        Slider(value: $brightness, in: 0...1)
                            .frame(maxWidth: 220)
                            .accessibilityValue("\(Int(brightness * 100)) percent")
                    }
                }
                .disabled(!enabled)
            }
            .navigationTitle("Ambient & Background")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
        #if os(macOS)
        .frame(minWidth: 380, minHeight: 460)
        #endif
    }
}

// MARK: - Artwork

/// Album art, everywhere. The stage hero, queue rows, library rows, search
/// results and both island lobes are all this view at different sizes.
///
/// `cornerScale` is a fraction of `size`, so a 15pt island lobe and a 440pt hero
/// keep a visually consistent corner instead of one reading as a circle and the
/// other as a square.
struct ArtworkTile: View {
    let url: URL?
    let size: CGFloat
    var cornerScale: CGFloat = 0.06

    private var radius: CGFloat { max(3, size * cornerScale) }

    var body: some View {
        RoundedRectangle(cornerRadius: radius, style: .continuous)
            .fill(.quaternary)
            .overlay {
                if let url {
                    AsyncImage(url: url) { phase in
                        if let image = phase.image {
                            image.resizable().aspectRatio(contentMode: .fill)
                        } else {
                            placeholder
                        }
                    }
                } else {
                    placeholder
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
            .frame(width: size, height: size)
    }

    private var placeholder: some View {
        Image(systemName: "music.note")
            .font(.system(size: max(9, size * 0.28)))
            .foregroundStyle(.secondary)
    }
}

/// Artwork + title + subtitle. The row shape shared by the queue, the library and
/// search results.
struct TrackRow: View {
    let title: String
    let subtitle: String
    let url: URL?
    var artworkSize: CGFloat = 40

    var body: some View {
        HStack(spacing: 12) {
            ArtworkTile(url: url, size: artworkSize, cornerScale: 0.15)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.body)
                    .fontWeight(.regular)
                    .lineLimit(1)
                Text(subtitle)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, 4)
    }
}

/// Trailing accessory on a queue row: tap to cache the song on this device, a filling
/// ring while it downloads, a solid glyph once it's local.
struct DownloadBadge: View {
    let state: TrackCache.State
    let onTap: () -> Void

    var body: some View {
        switch state {
        case .downloaded:
            Image(systemName: "arrow.down.circle.fill")
                .foregroundStyle(.green)
                .help("Downloaded — plays from this device")

        case .downloading(let progress):
            // The server fetches from source before sending a single byte, so there's
            // a stretch with nothing to count. Spin rather than show a frozen 0%.
            Group {
                if progress > 0 {
                    ZStack {
                        Circle().stroke(.quaternary, lineWidth: 2)
                        Circle()
                            .trim(from: 0, to: progress)
                            .stroke(.tint, style: StrokeStyle(lineWidth: 2, lineCap: .round))
                            .rotationEffect(.degrees(-90))
                    }
                    .frame(width: 15, height: 15)
                    .animation(.linear(duration: 0.2), value: progress)
                } else {
                    ProgressView().controlSize(.mini)
                }
            }
            .help(progress > 0 ? "Downloading \(Int(progress * 100))%" : "Fetching…")

        case .missing:
            Button(action: onTap) {
                Image(systemName: "arrow.down.circle")
            }
            .buttonStyle(.plain)
            .foregroundStyle(.secondary)
            .help("Download to this device")
        }
    }
}

// MARK: - Scrubber

/// Progress bar that commits a seek on release. Used by the stage and the island.
///
/// The position is derived from the server clock, so no timer is needed to advance
/// it — just a redraw. `TimelineView` interpolates instead of stepping (a 0.25s
/// periodic tick was visibly chunky) and `isLive` stops the schedule outright, so
/// a paused room or a collapsed island costs nothing. Both callers keep subtrees
/// mounted at opacity 0, which is exactly the case `paused:` exists for.
struct Scrubber: View {
    var progress: Double
    var durationSec: Double
    /// False stops all redraws. Pass `isPlaying && isVisible`.
    var isLive: Bool
    /// Island sizing: thinner track, smaller labels.
    var compact: Bool = false
    var onSeek: (Double) -> Void

    @State private var dragProgress: Double?

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30.0, paused: !isLive)) { _ in
            let live = dragProgress ?? progress

            VStack(spacing: compact ? 3 : Design.xs) {
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        Capsule().fill(.quaternary)
                        Capsule().fill(.primary)
                            .frame(width: max(0, geo.size.width * live))
                    }
                    .contentShape(Rectangle())
                    .gesture(
                        DragGesture(minimumDistance: 0)
                            .onChanged { value in
                                guard durationSec > 0 else { return }
                                dragProgress = min(1, max(0, value.location.x / geo.size.width))
                            }
                            .onEnded { _ in
                                if let p = dragProgress, durationSec > 0 {
                                    Haptics.tap()
                                    onSeek(p * durationSec)
                                }
                                dragProgress = nil
                            }
                    )
                }
                .frame(height: compact ? 4 : 5)

                HStack {
                    Text(Self.timecode(live * durationSec))
                    Spacer()
                    Text(durationSec > 0 ? Self.timecode(durationSec) : "--:--")
                }
                .font(compact ? Design.numericSmall : Design.numeric)
                .foregroundStyle(.secondary)
            }
        }
        .accessibilityElement()
        .accessibilityLabel("Playback position")
        .accessibilityValue("\(Self.timecode(progress * durationSec)) of \(Self.timecode(durationSec))")
    }

    static func timecode(_ seconds: Double) -> String {
        guard seconds.isFinite, seconds >= 0 else { return "0:00" }
        let total = Int(seconds)
        return String(format: "%d:%02d", total / 60, total % 60)
    }
}

// MARK: - Level meter

/// Four bars driven off a TimelineView tick — no `.repeatForever` to leak when the
/// island collapses, and the schedule stops outright when inactive so an idle
/// meter costs nothing.
struct LevelMeter: View {
    let active: Bool
    var barHeight: CGFloat = 11

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30.0, paused: !active)) { context in
            let t = context.date.timeIntervalSinceReferenceDate
            HStack(spacing: 2) {
                ForEach(0..<4, id: \.self) { i in
                    Capsule()
                        .opacity(active ? 0.9 : 0.3)
                        .frame(width: 2, height: barHeight)
                        .scaleEffect(y: active ? height(t, i) : 0.28, anchor: .center)
                }
            }
            .frame(width: 16, height: barHeight)
        }
        .accessibilityHidden(true)
    }

    private func height(_ t: Double, _ index: Int) -> Double {
        0.3 + 0.7 * abs(sin(t * (2.3 + Double(index) * 0.7)))
    }
}

// MARK: - Avatar

/// Initials badge. Used by the toolbar account button and the profile sheet, so
/// the two can't drift apart.
struct AvatarBadge: View {
    let name: String
    var diameter: CGFloat = 22

    var body: some View {
        Circle()
            .fill(.quaternary)
            .frame(width: diameter, height: diameter)
            .overlay(
                Text(Self.initials(from: name))
                    .font(.system(size: diameter * 0.42, weight: .bold))
                    .foregroundStyle(.primary)
            )
    }

    /// Web clients arrive as "User Name::Device Hint", so drop the device half
    /// before taking initials.
    static func initials(from name: String) -> String {
        let clean = name.components(separatedBy: "::").first ?? name
        let parts = clean.split(separator: " ").prefix(2)
        let letters = parts.compactMap(\.first)
        return letters.isEmpty ? "?" : String(letters).uppercased()
    }
}

struct AnimatedVideoBloom: View {
    let url: URL
    let isPlaying: Bool
    @State private var player: AVQueuePlayer?
    @State private var looper: AVPlayerLooper?

    var body: some View {
        Group {
            if let player = player {
                VideoPlayer(player: player)
                    .disabled(true)
            } else {
                Color.clear
            }
        }
        .onAppear {
            let item = AVPlayerItem(url: url)
            let queuePlayer = AVQueuePlayer(playerItem: item)
            queuePlayer.isMuted = true
            
            // Loop seamlessly
            self.looper = AVPlayerLooper(player: queuePlayer, templateItem: item)
            self.player = queuePlayer
            
            if isPlaying {
                queuePlayer.play()
            }
        }
        .onChange(of: isPlaying) { _, playing in
            if playing { player?.play() } else { player?.pause() }
        }
        .onDisappear {
            player?.pause()
            player = nil
            looper = nil
        }
    }
}