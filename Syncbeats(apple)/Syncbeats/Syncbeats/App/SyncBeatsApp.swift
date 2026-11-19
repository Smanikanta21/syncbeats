import SwiftUI

@main
struct SyncBeatsApp: App {
    @State private var model = AppModel()
    @State private var room = RoomSession()
    var body: some Scene {
        #if os(macOS)
        Window("SyncBeats", id: "main") {
            NativeEntryView(model: model, room: room).frame(minWidth: 720, minHeight: 560)
                .background { NotchLifecycle(model: model, room: room) }
        }
        .defaultSize(width: 960, height: 720)
        .windowStyle(.hiddenTitleBar)
        .windowResizability(.contentMinSize)
        .commands {
            CommandGroup(replacing: .newItem) { }
            CommandMenu("Room") {
                Toggle("Notch player", isOn: $model.notchEnabled)
                    .keyboardShortcut("n", modifiers: [.command, .option])
                    .disabled(model.phase != .signedIn)
            }
        }
        #else
        WindowGroup { NativeEntryView(model: model, room: room) }
        #endif
    }
}

struct NativeEntryView: View {
    @Bindable var model: AppModel
    var room = RoomSession()
    var runsLifecycle = true
    private var palette: NativePalette { NativePalette(light: model.appearance == "light") }
    var body: some View {
        VStack(spacing: 0) {
            chrome
            Rectangle().fill(palette.line).frame(height: 1)
            Group {
                switch model.phase {
                case .launch: LaunchView(model: model, palette: palette)
                case .introduction: IntroductionView(model: model, palette: palette)
                case .authentication: AuthenticationView(model: model, palette: palette)
                case .verification: VerificationView(model: model, palette: palette)
                case .restoring, .restoreFailed: SessionRecoveryView(model: model, palette: palette)
                case .signedIn:
                    NativeMusicOnboardingGate(room: room, palette: palette, content: {
                        RoomWorkspaceView(model: model, room: room, palette: palette)
                    }, entryError: model.errorMessage).id(model.account?.id)
                }
            }.frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .background(palette.background)
        .foregroundStyle(palette.text)
        .tint(palette.gold)
        .preferredColorScheme(palette.light ? .light : .dark)
        .task { if runsLifecycle { await model.start() } }
        .task(id: "\(model.phase)-\(model.roomID ?? "")") {
            guard runsLifecycle else { return }
            if model.phase == .signedIn, let credentials = model.roomCredentials { room.connect(credentials) }
            else { room.disconnect() }
        }
    }
    private var chrome: some View {
        HStack(spacing: 8) {
            BrandMark().frame(width: 24, height: 24)
            Text("SyncBeats").font(.system(size: 12, weight: .medium))
            Spacer()
            Text(model.phase == .signedIn ? "Your listening room" : "Welcome to SyncBeats")
                .font(.system(size: 10)).tracking(0.5).foregroundStyle(palette.quiet)
            Spacer()
            HStack(spacing: 2) {
                ForEach(["dark", "light"], id: \.self) { choice in
                    Button { model.appearance = choice } label: {
                        Text(choice.capitalized).font(.system(size: 10))
                            .foregroundStyle(model.appearance == choice ? palette.gold : palette.secondary)
                            .padding(.horizontal, 10).padding(.vertical, 5)
                            .background(model.appearance == choice ? palette.gold.opacity(0.07) : .clear, in: RoundedRectangle(cornerRadius: 4))
                    }.buttonStyle(.plain)
                        .accessibilityLabel(choice.capitalized + " appearance")
                        .accessibilityAddTraits(model.appearance == choice ? .isSelected : [])
                }
            }.padding(2).overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(palette.line))
        }
        .padding(.trailing, 21).padding(.vertical, 11)
        #if os(macOS)
        .padding(.leading, 24)
        #else
        .padding(.leading, 20)
        #endif
        .background(palette.panel.opacity(0.5))
    }
}
