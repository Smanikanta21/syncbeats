import SwiftUI

/// Custom account popover; visual craft informed by unslop by @heydamir (CC BY 4.0).
struct AccountMenu: View {
    @Bindable var model: AppModel
    let room: RoomSession
    let palette: NativePalette
    @State private var isOpen = false
    @FocusState private var focusedPage: AccountPage?

    var body: some View {
        Button { isOpen.toggle() } label: {
            AccountMonogram(name: model.account?.name ?? "", palette: palette, size: 32)
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("account-menu-button")
        .accessibilityLabel("Account menu for \(model.account?.name ?? "your account")")
        .accessibilityValue(isOpen ? "Open" : "Closed")
        .help("Profile and settings")
        .popover(isPresented: $isOpen, arrowEdge: .bottom) {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 12) {
                    AccountMonogram(name: model.account?.name ?? "", palette: palette, size: 40)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(model.account?.name ?? "Your account").font(.system(size: 14, weight: .medium)).lineLimit(1)
                        Text(model.account?.email ?? "").font(.system(size: 12)).foregroundStyle(palette.secondary).lineLimit(1).truncationMode(.middle)
                    }
                }.padding(.horizontal, 8).padding(.top, 4)
                Rectangle().fill(palette.line).frame(height: 1)
                VStack(spacing: 4) {
                    menuRow("Profile", icon: "person.crop.circle", selected: model.accountPage == .profile) { open(.profile) }.focused($focusedPage, equals: .profile)
                    menuRow("Settings", icon: "gearshape", selected: model.accountPage == .settings) { open(.settings) }.focused($focusedPage, equals: .settings)
                    menuRow("Log out", icon: "rectangle.portrait.and.arrow.right") {
                        isOpen = false
                        model.signOut()
                        if model.phase != .signedIn { room.disconnect() }
                    }
                }
            }
            .padding(12).frame(width: 256)
            .foregroundStyle(palette.text).background(palette.panel)
            .presentationCompactAdaptation(.popover)
            .onAppear { focusedPage = .profile }
            .onDisappear { focusedPage = nil }
        }
    }

    private func open(_ page: AccountPage) { isOpen = false; model.accountPage = page }
    private func menuRow(_ title: String, icon: String, selected: Bool = false, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: icon).font(.system(size: 16, weight: .regular)).frame(width: 20)
                Text(title).font(.system(size: 13))
                Spacer(minLength: 8)
                if selected { Image(systemName: "checkmark").font(.system(size: 12)).foregroundStyle(palette.gold) }
            }.foregroundStyle(palette.text).padding(.horizontal, 12).frame(height: 40)
                .background(selected ? palette.raised : .clear, in: RoundedRectangle(cornerRadius: 8))
                .contentShape(RoundedRectangle(cornerRadius: 8))
        }.buttonStyle(NativeButtonStyle(palette: palette))
            .accessibilityIdentifier("account-menu-\(title.lowercased().replacingOccurrences(of: " ", with: "-"))")
    }
}

struct AccountMonogram: View {
    let name: String
    let palette: NativePalette
    let size: CGFloat
    private var initials: String {
        let words = name.split(whereSeparator: { $0.isWhitespace })
        guard let first = words.first else { return "SB" }
        if words.count > 1, let a = first.first, let b = words.last?.first { return String([a, b]).uppercased() }
        return String(first.prefix(2)).uppercased()
    }
    var body: some View {
        Text(initials).font(.system(size: size * 0.34, weight: .medium, design: .rounded))
            .foregroundStyle(palette.gold).frame(width: size, height: size)
            .background(palette.raised, in: Circle())
            .overlay { Circle().stroke(palette.gold.opacity(0.24), lineWidth: 1) }
            .contentShape(Circle()).accessibilityHidden(true)
    }
}
