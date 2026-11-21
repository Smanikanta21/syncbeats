import SwiftUI

private struct IntroCard {
    let label: String
    let title: String
    let description: String
    let detail: String
    static let all = [
        IntroCard(label: "01 / Listen together", title: "One room\nOne soundtrack",
                  description: "Control one shared queue from your Mac while connected players handle the audio. Join the same room and choose what plays together.",
                  detail: "Share a room code. Everyone in the room can play, pause, and skip."),
        IntroCard(label: "02 / Your music", title: "Your library\nTwo ways to listen",
                  description: "Apple Music library support is planned, with a matched room version or direct playback through Apple Music.",
                  detail: "Direct playback will need Apple Music access on each supported device"),
        IntroCard(label: "03 / Nearby and cloud", title: "Close by\nOr miles apart",
                  description: "Cloud rooms connect players over the internet. Nearby pairing and offline local sessions are planned.",
                  detail: "A cloud room and an offline session will remain separate choices")
    ]
}

struct IntroductionView: View {
    let model: AppModel
    let palette: NativePalette
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    private var card: IntroCard { IntroCard.all[model.introIndex] }
    var body: some View {
        GeometryReader { geometry in
            let layout = EntryLayout(size: geometry.size)
            let contentWidth = layout.contentWidth
            let sideBySide = contentWidth >= 660
            let gap: CGFloat = contentWidth >= 900 ? layout.scaled(44, 64) : 26
            let titleSize: CGFloat = layout.scaled(contentWidth >= 1000 ? 48 : contentWidth >= 800 ? 42 : 34, 64)
            let illustrationHeight = sideBySide ? min(max((contentWidth - gap) / 2 * 0.76, 310), layout.scaled(400, 490)) : 310
            ScrollView {
                VStack(spacing: layout.scaled(28, 48)) {
                    if sideBySide {
                        HStack(spacing: gap) {
                            copy(titleSize: titleSize, layout: layout).frame(maxWidth: .infinity, alignment: .leading)
                            IntroIllustration(index: model.introIndex, palette: palette, height: illustrationHeight, expansion: layout.expansion)
                                .frame(maxWidth: .infinity)
                        }
                    } else {
                        VStack(alignment: .leading, spacing: 24) {
                            copy(titleSize: titleSize, layout: layout)
                            IntroIllustration(index: model.introIndex, palette: palette, height: illustrationHeight, expansion: layout.expansion)
                                .frame(maxWidth: 500).frame(maxWidth: .infinity)
                        }
                    }
                    navigation(width: contentWidth, layout: layout)
                }
                .frame(width: contentWidth)
                .padding(.vertical, geometry.size.height < 600 ? 24 : layout.scaled(40, 60))
                .frame(minHeight: geometry.size.height, alignment: .center)
                .frame(maxWidth: .infinity)
            }
        }
    }
    private func copy(titleSize: CGFloat, layout: EntryLayout) -> some View {
        VStack(alignment: .leading, spacing: layout.scaled(20, 28)) {
            HStack(spacing: 8) {
                Rectangle().fill(palette.gold).frame(width: 20, height: 1)
                Text(card.label).font(.system(size: layout.scaled(12, 13))).foregroundStyle(palette.gold)
            }
            Text(card.title).font(.system(size: titleSize, weight: .medium)).tracking(-1.0)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
                .accessibilityLabel(card.title.replacingOccurrences(of: "\n", with: " "))
            Text(card.description).font(.system(size: layout.scaled(14, 17))).lineSpacing(6)
                .foregroundStyle(palette.secondary).fixedSize(horizontal: false, vertical: true)
            Text(card.detail).font(.system(size: layout.scaled(12, 13))).lineSpacing(4).foregroundStyle(palette.quiet)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
    @ViewBuilder private func navigation(width: CGFloat, layout: EntryLayout) -> some View {
        if width < 560 {
            VStack(alignment: .leading, spacing: 12) {
                cardSelection
                navigationActions(layout: layout).frame(maxWidth: .infinity, alignment: .trailing)
            }
        } else {
            HStack(spacing: 16) {
                cardSelection
                Spacer(minLength: 8)
                navigationActions(layout: layout)
            }
        }
    }
    private var cardSelection: some View {
        HStack(spacing: 8) {
            ForEach(0..<3) { index in
                Button {
                    changeCard(index)
                } label: {
                    Capsule().fill(index == model.introIndex ? palette.gold : palette.quiet.opacity(0.45))
                        .frame(width: index == model.introIndex ? 20 : 6, height: 5)
                        .frame(width: 25, height: 28)
                }
                .buttonStyle(NativeButtonStyle(palette: palette))
                .accessibilityLabel("Introduction card \(index + 1): \(IntroCard.all[index].title.replacingOccurrences(of: "\n", with: " "))")
                .accessibilityAddTraits(index == model.introIndex ? .isSelected : [])
            }
        }
    }
    private func navigationActions(layout: EntryLayout) -> some View {
        HStack(spacing: layout.scaled(18, 24)) {
            if model.introIndex > 0 {
                Button("Back") { changeCard(model.introIndex - 1) }
                    .buttonStyle(NativeButtonStyle(palette: palette)).foregroundStyle(palette.secondary).font(.system(size: layout.scaled(12, 13)))
            }
            Button("Sign in instead") { model.enterAccount() }
                .buttonStyle(NativeButtonStyle(palette: palette)).foregroundStyle(palette.secondary).font(.system(size: layout.scaled(12, 13)))
            GoldButton(title: model.introIndex == 2 ? "Get started" : "Next", palette: palette,
                       fontSize: layout.scaled(12, 14), minimumHeight: layout.scaled(39, 48)) {
                if model.introIndex == 2 { model.enterAccount() }
                else { changeCard(model.introIndex + 1) }
            }
            .keyboardShortcut(.defaultAction)
        }
    }
    private func changeCard(_ index: Int) {
        withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.2)) { model.introIndex = index }
    }
}

private struct IntroIllustration: View {
    let index: Int
    let palette: NativePalette
    let height: CGFloat
    let expansion: CGFloat
    private func scaled(_ compact: CGFloat, _ spacious: CGFloat) -> CGFloat {
        compact + (spacious - compact) * expansion
    }
    var body: some View {
        ZStack(alignment: .topLeading) {
            RoundedRectangle(cornerRadius: 16).fill(palette.panel)
                .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(palette.line))
            VStack(alignment: .leading) {
                Text(index == 0 ? "One shared listening room" : index == 1 ? "Your Apple Music library" : "Nearby or across the internet")
                    .font(.system(size: scaled(12, 13))).foregroundStyle(palette.quiet)
                    .padding(scaled(24, 32))
                Spacer()
            }
            Group {
                switch index {
                case 0: devices
                case 1: music
                default: connections
                }
            }.padding(.top, scaled(48, 60)).padding(scaled(20, 28))
        }
        .frame(height: height)
        .shadow(color: .black.opacity(palette.light ? 0.04 : 0.14), radius: 14, y: 9)
        .accessibilityElement(children: .combine)
    }
    private var devices: some View {
        VStack(spacing: 10) {
            ZStack {
                Circle().fill(Color(hex: 0x1B281C)).overlay(Circle().strokeBorder(palette.gold.opacity(0.4)))
                ForEach(0..<9) { i in Circle().stroke(palette.gold.opacity(0.04), lineWidth: 1).padding(CGFloat(i) * 5) }
                Image(systemName: "play.fill").font(.system(size: 22)).foregroundStyle(Color(hex: 0xDDC296))
                    .frame(width: 45, height: 45).background(Color(hex: 0x39432B), in: Circle())
            }.frame(width: height * 0.32, height: height * 0.32).frame(maxWidth: .infinity)
            HStack(spacing: 8) {
                device("desktopcomputer", "Your Mac", "In the room")
                device("iphone", "Your phone", "Ready")
            }
            device("macwindow", "A friend's browser", "Listening together").frame(maxWidth: 220).frame(maxWidth: .infinity)
        }
    }
    private func device(_ icon: String, _ title: String, _ subtitle: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: icon).font(.system(size: 18)).foregroundStyle(palette.gold).frame(width: 23)
            VStack(alignment: .leading, spacing: 4) {
                Text(title).font(.system(size: scaled(12, 14)))
                Text(subtitle).font(.system(size: scaled(11, 12))).foregroundStyle(palette.quiet)
            }
            Spacer(minLength: 0)
        }.padding(10).background(palette.background.opacity(0.65), in: RoundedRectangle(cornerRadius: 8))
            .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(palette.line))
    }
    private var music: some View {
        VStack(spacing: 17) {
            ZStack {
                RoundedRectangle(cornerRadius: 4).fill(LinearGradient(colors: [Color(hex: 0xE5CFA9), Color(hex: 0xA27C4E)], startPoint: .topLeading, endPoint: .bottomTrailing))
                Ellipse().fill(Color(hex: 0x2F3C27)).frame(width: 44, height: 67).rotationEffect(.degrees(28))
            }.frame(width: scaled(86, 122), height: scaled(86, 122)).shadow(color: .black.opacity(0.16), radius: 10, y: 8).frame(maxWidth: .infinity)
            HStack(alignment: .top, spacing: 10) {
                musicOption("arrow.up.right", "Share a version", "Match a song to audio the room can play.")
                musicOption("music.note", "Play the original", "Listen directly through Apple Music.")
            }
        }
    }
    private func musicOption(_ icon: String, _ title: String, _ subtitle: String) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Image(systemName: icon).font(.system(size: 18)).foregroundStyle(palette.gold)
            Text(title).font(.system(size: scaled(12, 14), weight: .medium))
            Text(subtitle).font(.system(size: scaled(12, 13))).lineSpacing(3).foregroundStyle(palette.quiet).fixedSize(horizontal: false, vertical: true)
        }.padding(scaled(13, 18)).frame(maxWidth: .infinity, minHeight: scaled(121, 150), alignment: .topLeading)
            .background(palette.background.opacity(0.65), in: RoundedRectangle(cornerRadius: 10))
            .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(palette.line))
    }
    private var connections: some View {
        VStack(spacing: 30) {
            HStack(spacing: 8) {
                networkNode("desktopcomputer", "Nearby")
                Rectangle().fill(palette.gold.opacity(0.4)).frame(height: 1)
                networkNode("cloud", "Cloud")
                Rectangle().fill(palette.gold.opacity(0.4)).frame(height: 1)
                networkNode("iphone", "Together")
            }.padding(.top, 23)
            VStack(alignment: .leading, spacing: 8) {
                Rectangle().fill(palette.line).frame(height: 1)
                Text("Make room for everyone.").font(.system(size: scaled(12, 16), weight: .medium)).padding(.top, 9)
                Text("Invite your people with a room code. Keep your music and controls in one place.")
                    .font(.system(size: scaled(12, 14))).lineSpacing(4).foregroundStyle(palette.quiet)
            }
        }
    }
    private func networkNode(_ icon: String, _ title: String) -> some View {
        VStack(spacing: 8) {
            Image(systemName: icon).font(.system(size: 23)).foregroundStyle(palette.gold)
            Text(title).font(.system(size: scaled(12, 13)))
        }.frame(width: scaled(70, 88), height: scaled(70, 88)).background(palette.background.opacity(0.65), in: Circle())
            .overlay(Circle().strokeBorder(palette.line))
    }
}
