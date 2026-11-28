import SwiftUI
#if os(iOS)
import UIKit
#endif

@main
struct SyncBeatsApp: App {
    @State private var model = AppModel()
    @State private var room = RoomSession()
    #if os(iOS)
    @State private var mobilePlayback = MobilePlaybackController()
    #endif
    var body: some Scene {
        #if os(macOS)
        Window("SyncBeats", id: "main") {
            NativeEntryView(model: model, room: room).frame(minWidth: 520, minHeight: 420)
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
        WindowGroup {
            NativeEntryView(model: model, room: room)
                .task { mobilePlayback.start(room: room) }
        }
        #endif
    }
}

struct NativeEntryView: View {
    @Environment(\.scenePhase) private var scenePhase
    @Bindable var model: AppModel
    var room = RoomSession()
    var runsLifecycle = true
    private var palette: NativePalette { NativePalette(light: model.appearance == "light") }
    var body: some View {
        VStack(spacing: 0) {
            chrome
            Rectangle().fill(palette.line).frame(height: 1)
            ZStack {
                switch model.phase {
                case .launch: LaunchView(model: model, palette: palette)
                case .introduction: IntroductionView(model: model, palette: palette)
                case .authentication: AuthenticationView(model: model, palette: palette)
                case .verification: VerificationView(model: model, palette: palette)
                case .restoring, .restoreFailed: SessionRecoveryView(model: model, palette: palette)
                case .signedIn:
                    NativeMusicOnboardingGate(room: room, palette: palette, content: {
                        RoomWorkspaceView(model: model, room: room, palette: palette)
                    }, entryError: model.errorMessage, allowsAccountNavigation: model.accountPage != nil || model.workspaceSection != .home).id(model.account?.id)
                }
            }.frame(maxWidth: .infinity, maxHeight: .infinity)
                .nativePageTransition(value: model.phase)
                .clipped()
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
        #if os(iOS)
        .onAppear { NativeDisplaySleep.allowForApplication() }
        .onChange(of: model.phase) { NativeDisplaySleep.allowForApplication() }
        .onReceive(NotificationCenter.default.publisher(for: UIApplication.didBecomeActiveNotification)) { _ in
            NativeDisplaySleep.allowForApplication()
        }
        .onChange(of: scenePhase) { _, phase in
            NativeDisplaySleep.allowForApplication()
            if phase == .active, model.phase == .signedIn { room.returnToForeground() }
            if phase == .background { room.enterBackground() }
        }
        #endif
    }
    private var chrome: some View {
        HStack(spacing: 8) {
            BrandMark(palette: palette).frame(width: 24, height: 24)
            Text("SyncBeats").font(.system(size: 12, weight: .medium))
            Spacer()
            #if os(macOS)
            Text(model.phase == .signedIn ? "Your listening room" : "Welcome to SyncBeats")
                .font(.system(size: 12)).foregroundStyle(palette.secondary).lineLimit(1)
            Spacer()
            #endif
            if model.phase == .signedIn {
                #if os(macOS)
                Button("Library") { model.accountPage = nil; model.workspaceSection = .songs }
                    .font(.system(size: 12, weight: .medium)).buttonStyle(NativeButtonStyle(palette: palette))
                    .foregroundStyle(model.workspaceSection == .home ? palette.secondary : palette.gold)
                    .accessibilityIdentifier("open-library")
                #endif
                AccountMenu(model: model, room: room, palette: palette)
            } else {
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
        }
        .padding(.vertical, 12)
        #if os(macOS)
        .padding(.horizontal, 28)
        #else
        .padding(.horizontal, 20)
        #endif
        .background(palette.panel.opacity(0.5))
    }
}
