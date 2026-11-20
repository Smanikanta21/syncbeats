import SwiftUI

/// Account sheet, opened from the room toolbar.
///
/// `.formStyle(.grouped)` is doing the visual work here — it's the same inset
/// card treatment System Settings uses, so this reads as native without a single
/// hand-rolled background. Don't replace it with a hand-built VStack of rows.
struct ProfileView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var auth = AuthManager.shared
    @ObservedObject private var room = RoomManager.shared

    let roomId: String

    @State private var copiedCode = false

    var body: some View {
        VStack(spacing: 0) {
            header

            Form {
                Section("Account") {
                    LabeledContent("Account ID") {
                        Text(accountId).monospaced().foregroundStyle(.secondary)
                    }
                    LabeledContent("Sign-in method") {
                        Label(providerLabel, systemImage: providerSymbol)
                            .foregroundStyle(.secondary)
                    }
                    LabeledContent("Email") {
                        HStack(spacing: 5) {
                            if isVerified {
                                Image(systemName: "checkmark.seal.fill").foregroundStyle(.green)
                                Text("Verified")
                            } else {
                                Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.orange)
                                Text("Unverified")
                            }
                        }
                        .foregroundStyle(.secondary)
                    }
                    LabeledContent("Member since") {
                        Text(memberSince).foregroundStyle(.secondary)
                    }
                }

                Section("This room") {
                    LabeledContent("Code") {
                        Button {
                            copyCode()
                        } label: {
                            HStack(spacing: 4) {
                                Text(roomId).monospaced()
                                Image(systemName: copiedCode ? "checkmark" : "doc.on.doc")
                                    .foregroundStyle(copiedCode ? .green : .secondary)
                                    .contentTransition(.symbolEffect(.replace))
                            }
                        }
                        .buttonStyle(.plain)
                        .help("Copy the room code")
                    }
                    LabeledContent("Listeners") {
                        Text("\(room.readyCount) of \(room.participants.count) ready")
                            .foregroundStyle(.secondary)
                            .contentTransition(.numericText())
                            .animation(.smooth(duration: 0.3), value: room.readyCount)
                    }
                    LabeledContent("Transport") {
                        Label(Endpoint.transport.label, systemImage: Endpoint.transport.symbol)
                            .foregroundStyle(.secondary)
                    }
                }

                Section {
                    Button(role: .destructive) {
                        Haptics.impact()
                        auth.logout()
                        dismiss()
                    } label: {
                        Label("Sign Out", systemImage: "rectangle.portrait.and.arrow.right")
                            .frame(maxWidth: .infinity)
                    }
                }
            }
            .formStyle(.grouped)
        }
        .frame(width: 440, height: 520)
    }

    // MARK: - Header

    private var header: some View {
        VStack(spacing: 10) {
            AvatarBadge(name: displayName, diameter: 64)
                .shadow(color: .accentColor.opacity(0.35), radius: 14, y: 6)

            VStack(spacing: 2) {
                Text(displayName)
                    .font(.title3.weight(.semibold))
                Text(auth.currentUser?.email ?? "—")
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 26)
        .padding(.bottom, 18)
        .background(alignment: .top) {
            // Same bloom language as the player, so the sheet belongs to the room.
            AmbientBackdrop(url: room.currentTrack?.artworkURL, isPlaying: false)
                .frame(height: 160)
                .clipped()
        }
        .overlay(alignment: .topTrailing) {
            Button("Done") { dismiss() }
                .keyboardShortcut(.defaultAction)
                .padding(14)
        }
    }

    // MARK: - Derived

    private var displayName: String { auth.currentUser?.name ?? "Signed out" }

    private var accountId: String {
        guard let id = auth.currentUser?.id else { return "—" }
        return "#SB-" + id.prefix(8).uppercased()
    }

    private var isVerified: Bool { auth.currentUser?.emailVerifiedAt != nil }

    private var providerLabel: String {
        switch auth.currentUser?.authProvider.lowercased() {
        case "google": return "Google"
        case "email", .none: return "Email"
        case let other?: return other.capitalized
        }
    }

    private var providerSymbol: String {
        auth.currentUser?.authProvider.lowercased() == "google" ? "globe" : "envelope"
    }

    private var memberSince: String {
        guard let raw = auth.currentUser?.createdAt else { return "—" }
        // The API hands back ISO-8601; some rows carry fractional seconds and
        // some don't, and a formatter configured for one rejects the other.
        let withFraction = ISO8601DateFormatter()
        withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let plain = ISO8601DateFormatter()

        guard let date = withFraction.date(from: raw) ?? plain.date(from: raw) else { return raw }
        return date.formatted(.dateTime.month(.abbreviated).year())
    }

    private func copyCode() {
        #if os(macOS)
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(roomId, forType: .string)
        #else
        UIPasteboard.general.string = roomId
        #endif
        Haptics.tap()
        withAnimation(.smooth(duration: 0.25)) { copiedCode = true }
        Task {
            try? await Task.sleep(for: .seconds(2))
            withAnimation(.smooth(duration: 0.25)) { copiedCode = false }
        }
    }
}
