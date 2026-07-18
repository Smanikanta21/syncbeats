import SwiftUI

struct NowPlayingBar: View {
    @Environment(\.colorScheme) var scheme
    @State private var isPlaying = true
    @State private var seekPosition: Double = 0.55 // 55% of track
    @State private var volume: Double = 0.8
    @State private var showStats = false
    
    var body: some View {
        HStack(spacing: Theme.Spacing.containerPadding) {
            
            // Left: Track Details & Artwork
            HStack(spacing: Theme.Spacing.rowGap) {
                RoundedRectangle(cornerRadius: 6)
                    .fill(LinearGradient(colors: [Color.gray, Color.black], startPoint: .topLeading, endPoint: .bottomTrailing))
                    .frame(width: 44, height: 44)
                    .overlay(
                        Image(systemName: "music.note")
                            .foregroundColor(.white)
                    )
                    
                VStack(alignment: .leading, spacing: 2) {
                    Text("Midnight City")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(scheme == .dark ? .white : .black)
                    
                    Text("M83 · Hurry Up, We're Dreaming")
                        .font(.system(size: 11))
                        .foregroundColor(Theme.Colors.textMuted(for: scheme))
                }
            }
            .frame(width: 220, alignment: .leading)
            
            // Middle: Player controls & seek bar
            VStack(spacing: 6) {
                // Controls
                HStack(spacing: 20) {
                    Button(action: {}) {
                        Image(systemName: "backward.fill")
                    }
                    .buttonStyle(.plain)
                    
                    Button(action: { isPlaying.toggle() }) {
                        Image(systemName: isPlaying ? "pause.fill" : "play.fill")
                            .font(.title2)
                    }
                    .buttonStyle(.plain)
                    
                    Button(action: {}) {
                        Image(systemName: "forward.fill")
                    }
                    .buttonStyle(.plain)
                }
                .foregroundColor(scheme == .dark ? .white : .black)
                
                // Seek line
                HStack(spacing: 8) {
                    Text("2:14")
                        .font(Theme.Fonts.mono(size: 10))
                        .foregroundColor(Theme.Colors.textMuted(for: scheme))
                    
                    Slider(value: $seekPosition, in: 0...1)
                        .accentColor(Theme.Colors.primaryAccent(for: scheme))
                        
                    Text("4:03")
                        .font(Theme.Fonts.mono(size: 10))
                        .foregroundColor(Theme.Colors.textMuted(for: scheme))
                }
            }
            .frame(maxWidth: .infinity)
            
            // Right: Volume, Waveform and Stats badge
            HStack(spacing: Theme.Spacing.rowGap) {
                // Volume
                HStack(spacing: 6) {
                    Image(systemName: "speaker.wave.2.fill")
                        .font(.caption)
                    Slider(value: $volume, in: 0...1)
                        .frame(width: 70)
                }
                .foregroundColor(Theme.Colors.textMuted(for: scheme))
                
                // Animated Waveform
                HStack(alignment: .bottom, spacing: 2) {
                    ForEach(0..<5, id: \.self) { i in
                        RoundedRectangle(cornerRadius: 1)
                            .fill(Theme.Colors.primaryAccent(for: scheme))
                            .frame(width: 2, height: CGFloat.random(in: 4...20))
                    }
                }
                .frame(width: 20, height: 20)
                
                // Sync latency popover trigger
                Button(action: { showStats.toggle() }) {
                    HStack(spacing: 4) {
                        Text("⚡")
                        Text("sync 14ms")
                            .font(Theme.Fonts.mono(size: 10))
                    }
                    .padding(.vertical, 4)
                    .padding(.horizontal, 8)
                    .background(Color.green.opacity(0.12))
                    .foregroundColor(.green)
                    .cornerRadius(Theme.Radius.pillBadge)
                }
                .buttonStyle(.plain)
                .popover(isPresented: $showStats) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Network Synchronization")
                            .font(.system(size: 12, weight: .bold))
                        
                        Text("Offset drift: 14 ms")
                        Text("RTT Latency: 18 ms")
                        Text("Jitter variance: 2.1 ms")
                    }
                    .font(.caption)
                    .padding()
                    .frame(width: 180)
                }
            }
            .frame(width: 260, alignment: .trailing)
        }
        .padding(.horizontal, Theme.Spacing.containerPadding)
        .padding(.vertical, 14)
        .glassCard()
    }
}

#Preview {
    NowPlayingBar()
        .preferredColorScheme(.dark)
}
