import SwiftUI

/// Reads the shared account profile before mounting the listening dashboard.
struct NativeMusicOnboardingGate<Content: View>: View {
    @Bindable var room: RoomSession
    let palette: NativePalette
    @ViewBuilder var content: () -> Content
    var entryError: String? = nil
    @State private var bypassed = false
    private var needsSetup: Bool { room.musicFeed?.profile.onboardingStatus == "NEW" && !bypassed }
    private var checking: Bool { room.musicFeed == nil && !bypassed }

    var body: some View {
        Group {
            if checking || needsSetup {
                VStack(spacing: 20) {
                    Text("SyncBeats").font(.system(size: 28, weight: .medium, design: .serif))
                    if let error = room.musicInterestsError ?? entryError, checking {
                        Text(error).font(.system(size: 13)).foregroundStyle(palette.secondary).multilineTextAlignment(.center)
                        HStack(spacing: 12) {
                            Button("Try again") { Task { await room.loadMusicInterests() } }
                            Button("Continue to dashboard") { bypassed = true }
                        }.font(.system(size: 12))
                    } else {
                        NativeLoader(title: needsSetup ? "Make room for your music" : "Loading your music interests", palette: palette)
                    }
                }.padding(32).frame(maxWidth: .infinity, maxHeight: .infinity).background(palette.background)
            } else { content() }
        }
        .foregroundStyle(palette.text).buttonStyle(NativeButtonStyle(palette: palette))
        .task(id: room.roomID) {
            guard let roomID = room.roomID, !roomID.isEmpty, room.musicFeed == nil else { return }
            await room.loadMusicInterests()
        }
        .sheet(isPresented: Binding(get: { needsSetup && room.musicCatalog != nil }, set: { _ in })) {
            MusicInterestsModal(room: room, palette: palette).interactiveDismissDisabled()
        }
    }
}

/// The feed stays in the home layout; editing uses the same modal as onboarding.
struct MusicInterestsView: View {
    @Bindable var room: RoomSession
    let palette: NativePalette
    var onSearch: (String) -> Void
    @State private var editing = false

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            if let error = room.musicInterestsError {
                HStack { Text(error).font(.system(size: 12)); Spacer(); Button("Try again") { Task { await room.loadMusicInterests() } } }
                    .foregroundStyle(palette.secondary)
            }
            if let feed = room.musicFeed {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Find your next listen").font(.system(size: 24, weight: .medium, design: .serif))
                        Text("Suggestions shaped by your music interests").font(.system(size: 12)).foregroundStyle(palette.secondary)
                    }
                    Spacer()
                    Button("Edit interests") { room.musicInterestsError = nil; editing = true }.font(.system(size: 12)).disabled(room.musicCatalog == nil)
                }
                ForEach(feed.sections) { section in
                    VStack(alignment: .leading, spacing: 12) {
                        Text(section.title).font(.system(size: 16, weight: .medium))
                        LazyVGrid(columns: [GridItem(.adaptive(minimum: 220), spacing: 12)], spacing: 12) {
                            ForEach(section.picks) { pick in artistCard(pick) }
                        }
                    }
                }
            } else if room.isLoadingMusicInterests {
                NativeLoader(title: "Finding your music", palette: palette).frame(maxWidth: .infinity, minHeight: 160)
            } else { Text("Search above for music, or try your suggestions again").font(.system(size: 13)).foregroundStyle(palette.secondary) }
        }
        .buttonStyle(NativeButtonStyle(palette: palette)).foregroundStyle(palette.text)
        .sheet(isPresented: $editing) {
            MusicInterestsModal(room: room, palette: palette) { editing = false }
                .interactiveDismissDisabled(room.isSavingMusicInterests)
        }
    }

    private func artistCard(_ pick: MusicPick) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Button {
                if !pick.id.hasPrefix("custom:") { Task { await room.recordMusicOpen(pick.id) } }
                onSearch(pick.query)
            } label: {
                HStack(spacing: 12) {
                    Text(pick.name.split(separator: " ").prefix(2).compactMap(\.first).map(String.init).joined())
                        .font(.system(size: 15, weight: .medium)).frame(width: 44, height: 44).background(palette.raised, in: RoundedRectangle(cornerRadius: 8))
                    VStack(alignment: .leading, spacing: 4) {
                        Text(pick.name).font(.system(size: 13, weight: .medium)).lineLimit(2)
                        Text(pick.reason).font(.system(size: 11)).foregroundStyle(palette.secondary).lineLimit(2)
                    }.frame(maxWidth: .infinity, alignment: .leading)
                    Image(systemName: "arrow.up.right").font(.system(size: 12)).foregroundStyle(palette.quiet)
                }
            }.accessibilityLabel("Find music by \(pick.name). \(pick.reason)")
            if !pick.id.hasPrefix("custom:") {
                HStack {
                    Button { Task { await room.musicFeedback(pick.id, kind: "LIKE") } } label: { Label("More like this", systemImage: "heart") }
                    Spacer()
                    Button { Task { await room.musicFeedback(pick.id, kind: "DISLIKE") } } label: { Image(systemName: "minus") }
                        .accessibilityLabel("Less like \(pick.name)")
                }.font(.system(size: 11)).foregroundStyle(palette.secondary).disabled(room.isSavingMusicInterests)
            }
        }.padding(16).background(palette.panel, in: RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(palette.line))
    }
}

/// Three short stages, with scrolling choices and actions that stay in view.
struct MusicInterestsModal: View {
    @Bindable var room: RoomSession
    let palette: NativePalette
    var onFinish: () -> Void = {}
    @State private var draft: MusicTaste
    @State private var stage = 0
    @State private var filter = ""
    @State private var otherArtist = ""
    @State private var addingArtist = false
    @State private var inputError: String?
    private let stages = ["Languages", "Artists", "Listening"]
    private var isNew: Bool { room.musicFeed?.profile.onboardingStatus == "NEW" }

    init(room: RoomSession, palette: NativePalette, initialStage: Int = 0, onFinish: @escaping () -> Void = {}) {
        self.room = room; self.palette = palette; self.onFinish = onFinish
        _draft = State(initialValue: room.musicFeed?.profile ?? MusicTaste())
        _stage = State(initialValue: min(2, max(0, initialStage)))
    }

    var body: some View {
        VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 16) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Tune your music").font(.system(size: 28, weight: .medium, design: .serif))
                        Text("A few favorites help us find your next listen").font(.system(size: 13)).foregroundStyle(palette.secondary)
                    }
                    Spacer()
                    Button(action: close) { Image(systemName: "xmark").font(.system(size: 12)).frame(width: 32, height: 32) }
                        .accessibilityLabel(isNew ? "Skip music setup" : "Close music interests")
                }
                HStack(spacing: 8) {
                    ForEach(stages.indices, id: \.self) { index in
                        Button { inputError = nil; stage = index } label: {
                            HStack(spacing: 8) {
                                Text("\(index + 1)").monospacedDigit().foregroundStyle(stage == index ? palette.gold : palette.quiet)
                                Text(stages[index]).foregroundStyle(stage == index ? palette.text : palette.secondary)
                            }.font(.system(size: 12)).padding(.vertical, 8).padding(.horizontal, 12)
                                .background(stage == index ? palette.raised : .clear, in: RoundedRectangle(cornerRadius: 8))
                        }.buttonStyle(.plain).accessibilityAddTraits(stage == index ? .isSelected : [])
                    }
                    Spacer()
                }
            }.padding(24)
            Rectangle().fill(palette.line).frame(height: 1)
            ScrollView {
                VStack(alignment: .leading, spacing: 20) { stageContent }
                    .padding(24).frame(maxWidth: .infinity, alignment: .leading)
            }
            Rectangle().fill(palette.line).frame(height: 1)
            VStack(alignment: .leading, spacing: 12) {
                if let error = inputError ?? room.musicInterestsError {
                    Text(error).font(.system(size: 12)).foregroundStyle(palette.secondary).fixedSize(horizontal: false, vertical: true)
                }
                HStack(spacing: 12) {
                    Button(isNew ? "Skip for now" : "Cancel", action: close)
                    Spacer()
                    if stage > 0 { Button("Back") { inputError = nil; stage -= 1 } }
                    Button(room.isSavingMusicInterests ? "Saving…" : stage < 2 ? "Continue" : "Use my interests", action: advance)
                        .buttonStyle(NativeButtonStyle(palette: palette, prominent: true))
                }.font(.system(size: 12))
            }.padding(24)
        }
        .disabled(room.isSavingMusicInterests).buttonStyle(NativeButtonStyle(palette: palette))
        .foregroundStyle(palette.text).background(palette.background).tint(palette.gold)
        #if os(macOS)
        .frame(width: 640, height: 500)
        #else
        .presentationDetents([.large])
        #endif
    }

    @ViewBuilder private var stageContent: some View {
        if let catalog = room.musicCatalog {
            if stage == 0 {
                sectionTitle("What languages do you listen to?", detail: "Select as many as you like, or continue without choosing")
                choices(catalog.languages, selected: draft.languages) { toggle(&draft.languages, $0) }
            } else if stage == 1 {
                sectionTitle("Who’s on repeat?", detail: "All artists stay available, whatever languages you choose")
                TextField("Find an artist", text: $filter).textFieldStyle(.roundedBorder).accessibilityLabel("Find an artist")
                let artists = catalog.artists.filter { filter.isEmpty || $0.name.localizedCaseInsensitiveContains(filter) }
                HStack {
                    Text("\(artists.count) artists · \(draft.favoriteArtistIds.count + draft.customArtists.count) selected").font(.system(size: 12)).foregroundStyle(palette.quiet)
                    Spacer()
                    Button("Add an artist by name") { addingArtist.toggle(); if addingArtist { otherArtist = filter } }.font(.system(size: 12))
                }
                if addingArtist || !draft.customArtists.isEmpty { VStack(alignment: .leading, spacing: 12) {
                    Text("Add another favorite").font(.system(size: 13, weight: .medium))
                    HStack {
                        TextField("Artist name", text: $otherArtist).textFieldStyle(.roundedBorder).onSubmit(addArtist).accessibilityLabel("Other favorite artist")
                        Button("Add", action: addArtist).disabled(otherArtist.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    }
                    if !draft.customArtists.isEmpty {
                        choices(draft.customArtists, selected: draft.customArtists) { name in draft.customArtists.removeAll { $0 == name } }
                        Text("Select an added name to remove it").font(.system(size: 11)).foregroundStyle(palette.quiet)
                    }
                } }
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 164), spacing: 8)], spacing: 8) {
                    ForEach(artists) { artist in
                        choice(artist.name, selected: draft.favoriteArtistIds.contains(artist.id)) { toggle(&draft.favoriteArtistIds, artist.id) }
                    }
                }
                if artists.isEmpty { Text("Not listed? Add this artist by name").font(.system(size: 12)).foregroundStyle(palette.secondary) }
            } else {
                sectionTitle("What sounds like you?", detail: "Genres are optional, and you can change them later")
                choices(catalog.genres, selected: draft.genres) { toggle(&draft.genres, $0) }
                VStack(alignment: .leading, spacing: 8) {
                    Toggle("Learn from my activity in SyncBeats", isOn: $draft.useActivity).font(.system(size: 13))
                    Text("Use my own searches and listening to improve suggestions. This is off until you choose it. Likes always shape your suggestions.")
                        .font(.system(size: 12)).foregroundStyle(palette.secondary).fixedSize(horizontal: false, vertical: true)
                }.padding(16).background(palette.raised, in: RoundedRectangle(cornerRadius: 12))
                if !isNew {
                    Button("Reset interests and feedback") { Task { await room.resetMusicInterests(); if room.musicInterestsError == nil { onFinish() } } }
                        .font(.system(size: 12)).foregroundStyle(palette.secondary)
                }
            }
        }
    }
    private func sectionTitle(_ title: String, detail: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(.system(size: 17, weight: .medium))
            Text(detail).font(.system(size: 12)).foregroundStyle(palette.secondary)
        }
    }
    private func choices(_ values: [String], selected: [String], action: @escaping (String) -> Void) -> some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 140), spacing: 8)], spacing: 8) {
            ForEach(values, id: \.self) { value in choice(value, selected: selected.contains(value)) { action(value) } }
        }
    }
    private func choice(_ label: String, selected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 8) {
                Text(label).font(.system(size: 12)).frame(maxWidth: .infinity, alignment: .leading)
                Image(systemName: selected ? "checkmark" : "plus").font(.system(size: 11)).foregroundStyle(selected ? palette.gold : palette.quiet)
            }.padding(12).frame(minHeight: 40)
        }
        .background(selected ? palette.raised : palette.panel, in: RoundedRectangle(cornerRadius: 8))
        .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(selected ? palette.gold : palette.line))
        .buttonStyle(.plain).accessibilityAddTraits(selected ? .isSelected : [])
    }
    private func toggle(_ values: inout [String], _ value: String) {
        if values.contains(value) { values.removeAll { $0 == value } } else { values.append(value) }
    }
    private func addArtist() {
        let name = otherArtist.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else { return }
        guard name.count <= 80, !name.unicodeScalars.contains(where: { CharacterSet.controlCharacters.contains($0) }) else {
            inputError = "Use an artist name under 80 characters"; return
        }
        if let artist = room.musicCatalog?.artists.first(where: { $0.name.caseInsensitiveCompare(name) == .orderedSame }) {
            if !draft.favoriteArtistIds.contains(artist.id) { draft.favoriteArtistIds.append(artist.id) }
        } else if !draft.customArtists.contains(where: { $0.caseInsensitiveCompare(name) == .orderedSame }) {
            guard draft.customArtists.count < 50 else { inputError = "You can save up to 50 other favorites"; return }
            draft.customArtists.append(name)
        }
        otherArtist = ""; inputError = nil
    }
    private func advance() {
        if !otherArtist.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { addArtist(); if inputError != nil { return } }
        if stage < 2 { stage += 1; inputError = nil }
        else {
            inputError = nil
            var profile = draft; profile.onboardingStatus = "COMPLETE"
            Task { await room.saveMusicInterests(profile); if room.musicInterestsError == nil { onFinish() } }
        }
    }
    private func close() {
        guard !room.isSavingMusicInterests else { return }
        if isNew {
            var skipped = MusicTaste(); skipped.onboardingStatus = "SKIPPED"
            Task { await room.saveMusicInterests(skipped); if room.musicInterestsError == nil { onFinish() } }
        } else { onFinish() }
    }
}
