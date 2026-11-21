import SwiftUI
#if os(macOS)
import AppKit
#endif

/// Responsive account pages; unslop by Damir Sokolovsky (@heydamir), CC BY 4.0.
struct AccountProfileView: View {
    @Bindable var model: AppModel
    @Bindable var room: RoomSession
    let palette: NativePalette
    @State private var name = ""
    @State private var isSaving = false
    @State private var message: String?
    @State private var failed = false
    @State private var showsInterests = false

    var body: some View {
        GeometryReader { geometry in
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    AccountPageHeading(title: "Profile", detail: "Your name, account and music interests", palette: palette)
                    HStack(alignment: .center, spacing: 16) {
                        AccountMonogram(name: model.account?.name ?? "", palette: palette, size: 64)
                        VStack(alignment: .leading, spacing: 8) {
                            Text(model.account?.name ?? "Your account").font(.system(size: 22, weight: .medium)).fixedSize(horizontal: false, vertical: true)
                            Text(model.account?.email ?? "").font(.system(size: 13)).foregroundStyle(palette.secondary).textSelection(.enabled).fixedSize(horizontal: false, vertical: true)
                        }
                    }.padding(.vertical, 4)
                    LazyVGrid(columns: AccountPageLayout.columns(width: geometry.size.width), alignment: .leading, spacing: 24) {
                        AccountSection(title: "Account", palette: palette) {
                            VStack(alignment: .leading, spacing: 8) {
                                Text("Display name").font(.system(size: 13))
                                TextField("Your name", text: $name).textFieldStyle(.plain).font(.system(size: 14))
                                    .padding(12).background(palette.raised, in: RoundedRectangle(cornerRadius: 8))
                                    .overlay { RoundedRectangle(cornerRadius: 8).strokeBorder(palette.line) }
                                    .accessibilityIdentifier("profile-name-field")
                                    .onSubmit { if canSave { saveName() } }
                                Text("This name appears on your profile and when you next join a room.")
                                    .font(.system(size: 12)).foregroundStyle(palette.secondary).fixedSize(horizontal: false, vertical: true)
                            }
                            HStack {
                                AccountActionButton(isSaving ? "Saving…" : "Save name", palette: palette, prominent: true, action: saveName).disabled(!canSave)
                                    .accessibilityIdentifier("profile-save-name")
                                Spacer(minLength: 0)
                            }
                            if let message {
                                Text(message).font(.system(size: 12)).foregroundStyle(failed ? palette.error : palette.secondary)
                                    .fixedSize(horizontal: false, vertical: true).accessibilityAddTraits(.updatesFrequently)
                            }
                            accountValue("Email", value: model.account?.email ?? "")
                            accountValue("Email status", value: model.account?.emailVerifiedAt == nil ? "Not verified" : "Verified")
                        }
                        AccountSection(title: "Music interests", palette: palette) {
                            Text("Choose the languages, artists and genres that shape your suggestions.")
                                .font(.system(size: 13)).foregroundStyle(palette.secondary).fixedSize(horizontal: false, vertical: true)
                            if let taste = room.musicFeed?.profile {
                                accountValue("Languages", value: taste.languages.isEmpty ? "Not selected" : taste.languages.joined(separator: ", "))
                                accountValue("Genres", value: taste.genres.isEmpty ? "Not selected" : taste.genres.joined(separator: ", "))
                                let names = room.musicCatalog?.artists.filter { taste.favoriteArtistIds.contains($0.id) }.map(\.name) ?? []
                                accountValue("Artists", value: (names + taste.customArtists).isEmpty ? "Not selected" : (names + taste.customArtists).joined(separator: ", "))
                            }
                            AccountActionButton("Edit music interests", palette: palette) { showsInterests = true }

                                .disabled(room.isLoadingMusicInterests || room.musicFeed == nil)
                        }
                    }
                }.padding(geometry.size.width < 600 ? 16 : 28).frame(maxWidth: 1100, alignment: .leading).frame(maxWidth: .infinity, alignment: .leading)
            }.accessibilityIdentifier("profile-page")
        }
        .foregroundStyle(palette.text).background(palette.background)
        .onAppear { name = model.account?.name ?? "" }
        .onChange(of: model.account?.name) { old, updated in
            if name.isEmpty || name == old { name = updated ?? "" }
        }
        .sheet(isPresented: $showsInterests) {
            MusicInterestsModal(room: room, palette: palette) { showsInterests = false }.interactiveDismissDisabled(room.isSavingMusicInterests)
        }
    }

    private var canSave: Bool {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        return !isSaving && !trimmed.isEmpty && trimmed.count <= 80 && trimmed != model.account?.name
    }
    private func saveName() {
        guard canSave else { return }
        isSaving = true; message = nil
        let submitted = name
        Task {
            defer { isSaving = false }
            do {
                try await model.updateProfileName(submitted)
                if name == submitted { name = model.account?.name ?? submitted }
                failed = false; message = "Name updated"
            }
            catch { failed = true; message = error.localizedDescription }
        }
    }
    private func accountValue(_ title: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(.system(size: 12)).foregroundStyle(palette.secondary)
            Text(value).font(.system(size: 13)).textSelection(.enabled).fixedSize(horizontal: false, vertical: true)
        }.frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct AccountSettingsView: View {
    @Bindable var model: AppModel
    @Bindable var room: RoomSession
    let palette: NativePalette
    @AppStorage("native.artworkGlowEnabled") private var artworkGlow = true
    @State private var showsInterests = false
    @State private var confirmsReset = false
    @State private var pendingActivity: Bool?

    var body: some View {
        GeometryReader { geometry in
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    AccountPageHeading(title: "Settings", detail: "Make the app feel right for your listening room", palette: palette)
                    LazyVGrid(columns: AccountPageLayout.columns(width: geometry.size.width), alignment: .leading, spacing: 24) {
                        AccountSection(title: "Appearance", palette: palette) {
                            VStack(alignment: .leading, spacing: 8) {
                                Text("Colour theme").font(.system(size: 13))
                                Picker("Colour theme", selection: $model.appearance) {
                                    Text("Dark studio").tag("dark")
                                    Text("Light gallery").tag("light")
                                }.pickerStyle(.segmented).labelsHidden().accessibilityIdentifier("settings-appearance")
                            }
                            settingToggle("Album artwork glow", detail: "Soft cover-colour lighting around artwork in Home", value: $artworkGlow)
                            #if os(macOS)
                            settingToggle("Dynamic Island", detail: "Keep your room within reach at the top of the screen", value: $model.notchEnabled)
                            #endif
                        }
                        AccountSection(title: "Music & privacy", palette: palette) {
                            settingToggle("Use my listening activity", detail: "Use your explicit listening activity to shape your music suggestions", value: activityBinding)
                                .disabled(room.musicFeed == nil || room.isSavingMusicInterests || pendingActivity != nil)
                            Text("You can choose favourite artists without sharing listening activity.")
                                .font(.system(size: 12)).foregroundStyle(palette.secondary).fixedSize(horizontal: false, vertical: true)
                            AccountActionButton("Edit music interests", palette: palette) { showsInterests = true }
                                .disabled(room.musicFeed == nil || room.isSavingMusicInterests)
                            AccountActionButton("Reset music interests", palette: palette) { confirmsReset = true }
                                .disabled(room.musicFeed == nil || room.isSavingMusicInterests)
                            if room.isSavingMusicInterests { Text("Saving preferences…").font(.system(size: 12)).foregroundStyle(palette.secondary) }
                            if let error = room.musicInterestsError { Text(error).font(.system(size: 12)).fixedSize(horizontal: false, vertical: true) }
                        }
                        AccountSection(title: "Room & devices", palette: palette) {
                            settingValue("Your room", value: model.roomID ?? "Opening room")
                            settingValue("Connection", value: room.connection.label)
                            settingValue("Connected devices", value: "\(room.participants.count)")
                            #if os(macOS)
                            Text("SyncBeats uses your Mac’s selected audio output.").font(.system(size: 12)).foregroundStyle(palette.secondary)
                            AccountActionButton("Open Sound settings", palette: palette) {
                                if let url = URL(string: "x-apple.systempreferences:com.apple.Sound-Settings.extension") { NSWorkspace.shared.open(url) }
                            }
                            #else
                            HStack {
                                Text("Audio output").font(.system(size: 13))
                                Spacer()
                                MobileAudioRoutePicker().frame(width: 44, height: 44).accessibilityLabel("Choose audio output")
                            }
                            Text("AirPlay may add output latency. For the closest room sync, use the built-in speaker or wired headphones.")
                                .font(.system(size: 12)).foregroundStyle(palette.secondary).fixedSize(horizontal: false, vertical: true)
                            #endif
                        }
                        AccountSection(title: "Account & app", palette: palette) {
                            settingValue("Signed in as", value: model.account?.email ?? "")
                            AccountActionButton("Open profile", palette: palette) { model.accountPage = .profile }
                            settingValue("SyncBeats", value: versionLabel)
                            Link("SyncBeats website", destination: URL(string: "https://syncbeats.in")!).font(.system(size: 13)).foregroundStyle(palette.gold)
                            AccountActionButton("Log out", palette: palette) { model.signOut(); if model.phase != .signedIn { room.disconnect() } }

                        }
                    }
                }.padding(geometry.size.width < 600 ? 16 : 28).frame(maxWidth: 1100, alignment: .leading).frame(maxWidth: .infinity, alignment: .leading)
            }.accessibilityIdentifier("settings-page")
        }.foregroundStyle(palette.text).background(palette.background).tint(palette.gold)
            .sheet(isPresented: $showsInterests) {
                MusicInterestsModal(room: room, palette: palette) { showsInterests = false }.interactiveDismissDisabled(room.isSavingMusicInterests)
            }
            .confirmationDialog("Reset your music interests?", isPresented: $confirmsReset, titleVisibility: .visible) {
                Button("Reset music interests", role: .destructive) { Task { await room.resetMusicInterests() } }
                Button("Cancel", role: .cancel) {}
            } message: { Text("Your selected artists, genres, feedback and activity preferences will be cleared.") }
    }

    private var activityBinding: Binding<Bool> {
        Binding(get: { pendingActivity ?? room.musicFeed?.profile.useActivity ?? false }, set: { enabled in
            guard var taste = room.musicFeed?.profile, !room.isSavingMusicInterests, pendingActivity == nil else { return }
            pendingActivity = enabled; taste.useActivity = enabled
            Task { await room.saveMusicInterests(taste); pendingActivity = nil }
        })
    }
    private var versionLabel: String {
        guard let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String else { return "Development build" }
        let build = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String
        return build.map { "Version \(version) (\($0))" } ?? "Version \(version)"
    }
    private func settingToggle(_ title: String, detail: String, value: Binding<Bool>) -> some View {
        Toggle(isOn: value) {
            VStack(alignment: .leading, spacing: 4) {
                Text(title).font(.system(size: 13))
                Text(detail).font(.system(size: 12)).foregroundStyle(palette.secondary).fixedSize(horizontal: false, vertical: true)
            }
        }.toggleStyle(.switch).tint(palette.gold).padding(.vertical, 4).accessibilityLabel(title)
    }
    private func settingValue(_ title: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(.system(size: 12)).foregroundStyle(palette.secondary)
            Text(value).font(.system(size: 13)).textSelection(.enabled).fixedSize(horizontal: false, vertical: true)
        }.frame(maxWidth: .infinity, alignment: .leading)
    }
}

private enum AccountPageLayout {
    static func columns(width: CGFloat) -> [GridItem] {
        Array(repeating: GridItem(.flexible(minimum: 0), spacing: 24, alignment: .topLeading), count: width >= 840 ? 2 : 1)
    }
}
private struct AccountPageHeading: View {
    let title: String
    let detail: String
    let palette: NativePalette
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(.system(size: 28, weight: .medium))
            Text(detail).font(.system(size: 14)).foregroundStyle(palette.secondary).fixedSize(horizontal: false, vertical: true)
        }
    }
}
private struct AccountSection<Content: View>: View {
    let title: String
    let palette: NativePalette
    @ViewBuilder let content: () -> Content
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(title).font(.system(size: 17, weight: .medium)).padding(.bottom, 4)
            content()
        }.frame(maxWidth: .infinity, alignment: .leading).padding(20)
            .background(palette.panel, in: RoundedRectangle(cornerRadius: 12))
            .overlay { RoundedRectangle(cornerRadius: 12).strokeBorder(palette.line) }
    }
}

private struct AccountActionButton: View {
    let title: String
    let palette: NativePalette
    var prominent = false
    let action: () -> Void
    init(_ title: String, palette: NativePalette, prominent: Bool = false, action: @escaping () -> Void) {
        self.title = title; self.palette = palette; self.prominent = prominent; self.action = action
    }
    var body: some View {
        Button(action: action) {
            Text(title).font(.system(size: 13, weight: prominent ? .medium : .regular))
                .foregroundStyle(prominent ? palette.buttonText : palette.text)
                .padding(.horizontal, 12).frame(minHeight: 36)
                .background(prominent ? palette.gold : palette.raised, in: RoundedRectangle(cornerRadius: 8))
                .contentShape(RoundedRectangle(cornerRadius: 8))
        }.buttonStyle(NativeButtonStyle(palette: palette, prominent: prominent))
    }
}
