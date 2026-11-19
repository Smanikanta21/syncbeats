import SwiftUI
#if os(macOS)
import AppKit
#endif

struct RoomWorkspaceView: View {
    @Bindable var model: AppModel
    @Bindable var room: RoomSession
    let palette: NativePalette
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var copied = false
    @State private var showsDevices = false
    @State private var showsPlayer = false
    @State private var showsPlayerQueue = false
    @State private var isFloating = false
    #if os(macOS)
    @State private var floatingPlayer = FloatingPlayerController()
    @State private var fullScreenPlayer = FullScreenPlayerController()
    #endif

    var body: some View {
        GeometryReader { geometry in
            let presentation = RoomLayout.devices(width: geometry.size.width)
            VStack(spacing: 0) {
                header(presentation: presentation).padding(.horizontal, 28).padding(.vertical, 14)
                Rectangle().fill(palette.line).frame(height: 1)
                if let message = room.errorMessage ?? model.errorMessage { errorBanner(message) }
                if model.isLoadingRoom || model.roomID == nil { openingRoom }
                else {
                    HStack(spacing: 0) {
                        RoomHomeView(room: room, palette: palette, onOpenPlayer: { showsPlayer = true })
                        if showsDevices && presentation == .docked { deviceRail.frame(width: 270) }
                    }.overlay(alignment: .trailing) {
                        if showsDevices && presentation == .drawer {
                            ZStack(alignment: .trailing) {
                                palette.background.opacity(0.65).onTapGesture { showsDevices = false }.accessibilityHidden(true)
                                deviceRail.frame(width: 280).shadow(color: .black.opacity(0.14), radius: 20, x: -8)
                            }
                        }
                    }
                }
                if !showsPlayer && !isFloating {
                    RoomMiniPlayer(room: room, palette: palette, onExpand: { showsPlayerQueue = false; showsPlayer = true },
                                   onQueue: { showsPlayerQueue = true; showsPlayer = true }, onFloat: floatPlayer)
                }
            }.overlay {
                if showsPlayer {
                    RoomExpandedPlayer(room: room, palette: palette, showsQueue: $showsPlayerQueue,
                                       onClose: { showsPlayer = false }, onFloat: floatPlayer, onFullScreen: {
                        #if os(macOS)
                        fullScreenPlayer.show(room: room)
                        #endif
                    }).transition(.opacity)
                }
            }.overlay(alignment: .bottom) {
                if let message = room.statusMessage {
                    Text(message).font(.system(size: 12)).padding(.horizontal, 18).padding(.vertical, 12)
                        .background(palette.raised, in: Capsule()).padding(.bottom, showsPlayer || isFloating ? 18 : 116)
                        .accessibilityAddTraits(.updatesFrequently).allowsHitTesting(false)
                }
            }.onChange(of: geometry.size.width) { _, width in
                if RoomLayout.devices(width: width) == .summary { showsDevices = false }
            }
        }.background(palette.background).foregroundStyle(palette.text)
            .animation(reduceMotion ? nil : .easeOut(duration: 0.18), value: showsPlayer)
            .task(id: room.statusMessage) {
                guard room.statusMessage != nil else { return }
                try? await Task.sleep(for: .seconds(3))
                if !Task.isCancelled { room.statusMessage = nil }
            }
            .onDisappear { closeFloatingPlayer();
                #if os(macOS)
                fullScreenPlayer.close()
                #endif
            }
        #if os(macOS)
            .onChange(of: palette.light) { _, _ in if isFloating { floatPlayer() } }
        #endif
    }

    private func header(presentation: RoomLayout.DevicePresentation) -> some View {
        HStack(spacing: 14) {
            Text("Home").font(.system(size: 15, weight: .medium))
            if let code = model.roomID ?? room.roomID {
                Button { copyRoomCode(code) } label: {
                    HStack(spacing: 8) {
                        Text(code).font(.system(size: 12, weight: .medium, design: .monospaced))
                        Image(systemName: copied ? "checkmark" : "square.on.square").font(.system(size: 11))
                    }.padding(9).background(palette.panel, in: RoundedRectangle(cornerRadius: 7))
                }.buttonStyle(NativeButtonStyle(palette: palette)).help(copied ? "Copied room code" : "Copy room code")
                    .accessibilityLabel(copied ? "Room code copied" : "Copy room code \(code)")
                    .task(id: copied) { guard copied else { return }; try? await Task.sleep(for: .seconds(2)); if !Task.isCancelled { copied = false } }
            }
            Spacer(minLength: 0)
            if presentation != .summary {
                Button { showsDevices.toggle() } label: {
                    Label("Devices · \(room.participants.count)", systemImage: "hifispeaker.and.homepod").font(.system(size: 12)).padding(8)
                        .background(showsDevices ? palette.raised : .clear, in: RoundedRectangle(cornerRadius: 8))
                }.buttonStyle(NativeButtonStyle(palette: palette)).accessibilityAddTraits(showsDevices ? .isSelected : [])
            } else { Text("\(room.participants.count) devices").font(.system(size: 12)).foregroundStyle(palette.secondary) }
            RoomConnectionBadge(room: room, palette: palette)
            Menu {
                Text(model.account?.name ?? "Your account")
                if room.connection == .failed { Button("Reconnect", action: room.reconnect) }
                if isFloating { Button("Return player to window", action: closeFloatingPlayer) }
                #if os(macOS)
                Toggle("Notch player", isOn: $model.notchEnabled)
                #endif
                Divider()
                Button("Sign out", action: model.signOut)
            } label: { Image(systemName: "ellipsis").frame(width: 30, height: 30) }
                .menuStyle(.borderlessButton).fixedSize().accessibilityLabel("Room options")
        }
    }
    private var deviceRail: some View {
        VStack(alignment: .leading, spacing: 20) {
            HStack {
                Text("Connected devices").font(.system(size: 16, weight: .medium))
                Spacer()
                Button { showsDevices = false } label: { Image(systemName: "xmark").frame(width: 28, height: 28) }
                    .buttonStyle(NativeButtonStyle(palette: palette)).accessibilityLabel("Close devices")
            }
            Text("This Mac plays audio alongside the connected devices.")
                .font(.system(size: 12)).foregroundStyle(palette.secondary).fixedSize(horizontal: false, vertical: true)
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    ForEach(room.participants) { participant in
                        let own = participant.id == room.ownSocketID
                        HStack(spacing: 12) {
                            Image(systemName: own ? "macbook.gen2" : "hifispeaker.fill").font(.system(size: 18)).foregroundStyle(palette.secondary).frame(width: 26)
                            VStack(alignment: .leading, spacing: 4) {
                                Text(participant.displayName).font(.system(size: 13, weight: .medium)).lineLimit(2)
                                Text(own ? (room.audio.loading ? "Preparing audio · this Mac" : room.audio.error != nil ? "Audio unavailable · this Mac" : "Local playback · this Mac") : participant.isReady ? "Ready to play" : participant.isBlocked == true ? "Enable audio on this device" : "Preparing audio")
                                    .font(.system(size: 11)).foregroundStyle(palette.quiet)
                                if !own { RoomDeviceVolume(participant: participant, room: room, palette: palette) }
                            }.frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                    if room.participants.isEmpty { Text("Join this room from another device to listen together.").font(.system(size: 13)).foregroundStyle(palette.secondary) }
                }
            }
            RoomConnectionBadge(room: room, palette: palette)
        }.padding(20).background(palette.panel).overlay(alignment: .leading) { Rectangle().fill(palette.line).frame(width: 1) }
    }
    private var openingRoom: some View {
        VStack(spacing: 20) {
            if model.isLoadingRoom { NativeLoader(title: "Opening your room", detail: "Getting your shared queue ready", palette: palette) }
            else { GoldButton(title: "Retry opening room", palette: palette) { Task { await model.loadRoom() } } }
        }.frame(maxWidth: .infinity, maxHeight: .infinity)
    }
    private func errorBanner(_ message: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: "exclamationmark.circle")
            Text(message).font(.system(size: 12)).fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
            if room.connection == .failed { Button("Reconnect", action: room.reconnect).buttonStyle(NativeButtonStyle(palette: palette)) }
            Button("Dismiss") { room.errorMessage = nil; model.errorMessage = nil }.buttonStyle(NativeButtonStyle(palette: palette))
        }.foregroundStyle(palette.error).padding(.horizontal, 24).padding(.vertical, 12)
    }
    private func copyRoomCode(_ code: String) {
        #if os(macOS)
        NSPasteboard.general.clearContents(); NSPasteboard.general.setString(code, forType: .string)
        #endif
        copied = true
    }
    private func floatPlayer() {
        #if os(macOS)
        showsPlayer = false; isFloating = true
        floatingPlayer.show(room: room, palette: palette, onExpand: { queue in
            closeFloatingPlayer(); showsPlayerQueue = queue; showsPlayer = true
        }, onClose: { isFloating = false })
        #endif
    }
    private func closeFloatingPlayer() {
        #if os(macOS)
        floatingPlayer.close()
        #endif
        isFloating = false
    }
}

private struct RoomDeviceVolume: View {
    let participant: RoomParticipant
    let room: RoomSession
    let palette: NativePalette
    @State private var draft: Double?
    private var value: Double { min(max(draft ?? participant.volume ?? 100, 0), 100) }
    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: value == 0 ? "speaker.slash" : "speaker.wave.1").font(.system(size: 10)).foregroundStyle(palette.quiet)
            Slider(value: Binding(get: { value }, set: { draft = $0 }), in: 0...100) { editing in
                if !editing, let draft { room.setParticipantVolume(draft, socketID: participant.id); self.draft = nil }
            }.tint(palette.gold).disabled(!room.canControl).accessibilityLabel("Volume for \(participant.displayName)")
                .accessibilityValue("\(Int(value)) percent")
        }.padding(.top, 4)
    }
}
