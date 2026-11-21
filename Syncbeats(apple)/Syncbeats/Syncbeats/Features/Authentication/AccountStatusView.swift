import SwiftUI
#if os(macOS)
import AppKit
#endif

struct VerificationView: View {
    let model: AppModel
    let palette: NativePalette
    var body: some View {
        AccountPanel(width: 430) {
            VStack(spacing: 20) {
                Image(systemName: "envelope").font(.system(size: 30, weight: .light)).foregroundStyle(palette.gold)
                    .frame(width: 64, height: 64).background(palette.raised, in: RoundedRectangle(cornerRadius: 16))
                    .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(palette.line))
                Text("Verify your email").font(.system(size: 31, weight: .medium)).tracking(-0.7)
                Text("A verification link has been sent to\n\(model.email).\nVerify your email, then step into your room.")
                    .font(.system(size: 12)).lineSpacing(6).multilineTextAlignment(.center).foregroundStyle(palette.secondary)
                    .privacySensitive()
                InlineStatus(model: model, palette: palette)
                GoldButton(title: "Back to login", palette: palette) { model.enterAccount() }.disabled(model.isWorking)
                Button("Resend verification link") { Task { await model.resendVerification() } }
                    .buttonStyle(NativeButtonStyle(palette: palette)).font(.system(size: 12)).foregroundStyle(palette.gold).disabled(model.isWorking)
            }
        }
    }
}

struct SessionRecoveryView: View {
    let model: AppModel
    let palette: NativePalette
    var body: some View {
        AccountPanel(width: 460) {
            VStack(spacing: 21) {
                if model.phase == .restoring {
                    NativeLoader(title: "Restoring your session", detail: "Returning to your room", palette: palette)
                }
                else {
                    BrandMark().frame(width: 64, height: 64)
                    Text("Reconnect to SyncBeats").font(.system(size: 28, weight: .medium))
                    Text("We couldn't restore your sign-in. Try again, or choose another account.")
                        .font(.system(size: 12)).foregroundStyle(palette.secondary).multilineTextAlignment(.center)
                    InlineStatus(model: model, palette: palette)
                    GoldButton(title: "Try again", palette: palette) { Task { await model.restoreSession() } }
                    Button("Sign in with another account") { model.signOut() }.buttonStyle(NativeButtonStyle(palette: palette)).foregroundStyle(palette.secondary)
                }
            }
        }
    }
}

/// Centers short account states; long names, notices, and small windows can scroll.
private struct AccountPanel<Content: View>: View {
    let width: CGFloat
    @ViewBuilder let content: () -> Content
    var body: some View {
        GeometryReader { geometry in
            ScrollView {
                content().padding(35).frame(maxWidth: width)
                    .frame(maxWidth: .infinity)
                    .frame(minHeight: geometry.size.height, alignment: .center)
            }
        }
    }
}
