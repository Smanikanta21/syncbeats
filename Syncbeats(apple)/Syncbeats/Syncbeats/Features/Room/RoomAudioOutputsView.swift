import SwiftUI

struct RoomAudioOutputsView: View {
    let participant: RoomParticipant
    let room: RoomSession
    let palette: NativePalette

    private var own: Bool { participant.id == room.ownSocketID }
    private var externalOutputs: [LocalAudioOutput] { room.audio.outputs.filter { $0.output.type != .builtIn } }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if own {
                ForEach(externalOutputs) { item in
                    #if os(macOS)
                    outputRow(item.output, select: item.canSelect ? { room.audio.chooseOutput(item.id) } : nil)
                    #else
                    outputRow(item.output)
                    #endif
                }
                routingControls
                if let error = room.audio.outputError {
                    Text(error).font(.system(size: 11)).foregroundStyle(palette.secondary)
                }
            } else {
                let outputs = (participant.audioOutputs ?? []).filter { $0.type != .builtIn }
                ForEach(outputs.indices, id: \.self) { index in
                    outputRow(outputs[index]).id(outputs[index].id)
                }
            }
        }.frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder private var routingControls: some View {
        #if os(iOS)
        HStack(spacing: 6) {
            if #available(iOS 26.2, *), !externalOutputs.isEmpty {
                Toggle("Play on this device too", isOn: Binding(
                    get: { room.audio.dualRouteEnabled },
                    set: { room.audio.selectDualRoute($0) }
                )).font(.system(size: 11)).tint(palette.gold)
            }
            if !room.audio.dualRouteEnabled {
                MobileAudioRoutePicker().frame(width: 32, height: 32).accessibilityLabel("Choose audio output")
            }
        }
        #elseif os(macOS)
        if externalOutputs.contains(where: { $0.output.selected }),
           let builtIn = room.audio.outputs.first(where: { $0.output.type == .builtIn }) {
            Toggle("Play on this Mac too", isOn: Binding(
                get: { builtIn.output.selected },
                set: { _ in room.audio.chooseOutput(builtIn.id) }
            )).toggleStyle(.checkbox).font(.system(size: 11))
        }
        if !room.audio.usesSystemOutput {
            Button("Use system output") { room.audio.chooseOutput(nil) }
                .buttonStyle(.plain).font(.system(size: 11)).foregroundStyle(palette.secondary)
        }
        #endif
    }

    private func outputRow(_ output: RoomAudioOutput, select: (() -> Void)? = nil) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack(spacing: 6) {
                let label = Label(output.name, systemImage: output.type == .bluetooth ? "headphones" : "speaker.wave.2")
                    .font(.system(size: 12)).foregroundStyle(palette.secondary).lineLimit(2)
                #if os(macOS)
                if let select {
                    Toggle(isOn: Binding(get: { output.selected }, set: { _ in select() })) { label }
                        .toggleStyle(.checkbox)
                } else {
                    label
                }
                #else
                label
                #endif
                if !output.selected {
                    Text("Available").font(.system(size: 10)).foregroundStyle(palette.quiet)
                }
            }
            if let volume = output.volume, let id = output.id {
                RoomOutputVolumeSlider(name: output.name, volume: volume, enabled: own || room.canControl, palette: palette) {
                    room.setSpeakerVolume($0, outputID: id, socketID: participant.id)
                }
            }
        }
    }
}

private struct RoomOutputVolumeSlider: View {
    let name: String
    let volume: Double
    let enabled: Bool
    let palette: NativePalette
    let commit: (Double) -> Void
    @State private var draft: Double?
    @State private var editing = false

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: "speaker.wave.1").font(.system(size: 10)).foregroundStyle(palette.quiet)
            Slider(value: Binding(get: { draft ?? volume }, set: {
                if editing { draft = $0 } else { commit($0) }
            }), in: 0...100, step: 1) { active in
                editing = active
                if !active, let draft {
                    commit(draft)
                    self.draft = nil
                }
            }.tint(palette.gold).disabled(!enabled).accessibilityLabel("Volume for \(name)")
        }
    }
}
