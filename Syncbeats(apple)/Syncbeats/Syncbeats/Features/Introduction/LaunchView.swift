import SwiftUI

struct LaunchView: View {
    let model: AppModel
    let palette: NativePalette
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var first: CGFloat = 0
    @State private var second: CGFloat = 0
    @State private var visible = false

    var body: some View {
        ZStack {
            VStack(alignment: .center, spacing: 0) {
                BrandMark(progress: first, secondProgress: second)
                    .frame(width: 88, height: 88)
                    .shadow(color: .black.opacity(palette.light ? 0.08 : 0.25), radius: 18, y: 12)
                Text("SyncBeats").font(.system(size: 30, weight: .medium)).tracking(-0.7)
                    .padding(.top, 24)
                Text("Separate devices, shared music")
                    .font(.system(size: 13)).foregroundStyle(palette.secondary)
                    .padding(.top, 12)
            }
            .opacity(visible ? 1 : 0)
            .offset(y: visible || reduceMotion ? 0 : 8)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
            VStack {
                Spacer()
                HStack {
                    Spacer()
                    Button("Skip animation") { model.finishLaunch() }
                        .buttonStyle(NativeButtonStyle(palette: palette)).font(.system(size: 12)).foregroundStyle(palette.secondary)
                }
            }.padding(28)
        }
        .accessibilityElement(children: .contain)
        .task {
            if reduceMotion {
                visible = true; first = 1; second = 1
                try? await Task.sleep(for: .milliseconds(150))
            } else {
                withAnimation(.easeOut(duration: 0.2)) { visible = true }
                withAnimation(.easeOut(duration: 0.32)) { first = 1 }
                do { try await Task.sleep(for: .milliseconds(250)) } catch { return }
                withAnimation(.easeOut(duration: 0.32)) { second = 1 }
                do { try await Task.sleep(for: .milliseconds(2050)) } catch { return }
            }
            guard !Task.isCancelled else { return }
            model.finishLaunch()
        }
    }
}
