import SwiftUI

enum NativeLibraryLayout: String { case list, gallery }

/// A surface changes independently of its contents, so artwork and controls lift together.
struct NativeLibraryHoverSurface: ViewModifier {
    let palette: NativePalette
    var selected = false
    var hovered = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        content
            .background(selected || hovered ? palette.raised : palette.panel.opacity(0.6), in: RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(selected ? palette.gold.opacity(0.4) : hovered ? palette.text.opacity(0.16) : palette.line.opacity(0.5), lineWidth: 1))
            .shadow(color: .black.opacity(hovered ? (palette.light ? 0.09 : 0.22) : 0), radius: 6, x: 0, y: 3)
            .offset(y: hovered && !reduceMotion ? -2 : 0)
            .animation(reduceMotion ? nil : .easeOut(duration: 0.16), value: hovered)
    }
}

struct NativeLibraryCollectionLabel<Artwork: View>: View {
    let title: String
    let subtitle: String
    let layout: NativeLibraryLayout
    let palette: NativePalette
    @ViewBuilder let artwork: () -> Artwork
    @State private var hovered = false

    var body: some View {
        Group {
            if layout == .gallery {
                VStack(alignment: .leading, spacing: 12) {
                    artwork().aspectRatio(1, contentMode: .fit)
                    labels
                }.padding(12)
            } else {
                HStack(spacing: 14) {
                    artwork().frame(width: 56, height: 56)
                    labels
                    Image(systemName: "chevron.right").font(.system(size: 12, weight: .medium)).foregroundStyle(palette.quiet)
                }.padding(12)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(RoundedRectangle(cornerRadius: 12))
        .modifier(NativeLibraryHoverSurface(palette: palette, hovered: hovered))
        .onHover { hovered = $0 }
    }

    private var labels: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(title).font(.system(size: 14, weight: .medium)).lineLimit(2)
            Text(subtitle).font(.system(size: 12)).foregroundStyle(palette.secondary).lineLimit(2)
        }.frame(maxWidth: .infinity, alignment: .leading)
    }
}
