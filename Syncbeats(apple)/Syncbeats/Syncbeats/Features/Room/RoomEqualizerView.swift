import SwiftUI

struct RoomEqualizerView: View {
    @Bindable var audio: NativeRoomAudio
    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            HStack {
                VStack(alignment: .leading, spacing: 5) {
                    Text("Equalizer").font(.system(size: 20, weight: .medium))
                    Text("This Mac").font(.system(size: 12)).foregroundStyle(.secondary)
                }
                Spacer()
                Toggle("Equalizer enabled", isOn: Binding(get: { audio.equalizer.enabled }, set: audio.setEqualizerEnabled))
                    .labelsHidden().toggleStyle(.switch)
            }
            HStack(spacing: 8) {
                ForEach(NativeEqualizer.Preset.allCases) { preset in
                    Button(preset.rawValue) { audio.applyEqualizerPreset(preset) }
                        .buttonStyle(.bordered)
                        .tint(audio.equalizer.enabled && audio.equalizer.gains == preset.gains ? .accentColor : .secondary)
                }
            }
            EqualizerResponseGraph(audio: audio).frame(height: 180)
            Text("Drag a point to shape your sound").font(.system(size: 11)).foregroundStyle(.secondary)
            HStack {
                Text("−12 to +12 dB").font(.system(size: 11)).foregroundStyle(.secondary)
                Spacer()
                Button("Reset") { audio.resetEqualizer() }.buttonStyle(.plain)
            }
        }.padding(24).frame(width: 340)
    }
}
