import SwiftUI

struct AuthenticationView: View {
    @Bindable var model: AppModel
    let palette: NativePalette
    @State private var name = ""
    @State private var password = ""
    @State private var otp = ""
    @State private var revealPassword = false
    @FocusState private var focused: Field?
    private enum Field { case name, email, password, otp }

    var body: some View {
        GeometryReader { geometry in
            let layout = EntryLayout(size: geometry.size)
            let contentWidth = layout.contentWidth
            ScrollView {
                Group {
                    if contentWidth >= 660 {
                        HStack(spacing: 0) {
                            story(compact: false, layout: layout)
                                .frame(width: contentWidth * layout.storyFraction)
                                .frame(maxHeight: .infinity)
                                .background(palette.panel)
                            form(layout: layout).frame(maxWidth: layout.formWidth)
                                .frame(width: contentWidth * (1 - layout.storyFraction))
                        }
                        .frame(minHeight: layout.minimumPanelHeight)
                    } else {
                        VStack(spacing: 0) {
                            story(compact: true, layout: layout)
                            form(layout: layout).frame(maxWidth: 440).frame(maxWidth: .infinity)
                        }
                    }
                }
                .frame(width: contentWidth)
                .background(palette.background)
                .clipShape(RoundedRectangle(cornerRadius: 16))
                .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(palette.line))
                .shadow(color: .black.opacity(palette.light ? 0.05 : 0), radius: 16, y: 8)
                .padding(.vertical, layout.scaled(28, 44))
                .frame(minHeight: geometry.size.height, alignment: .center)
                .frame(maxWidth: .infinity)
            }
        }
        .onChange(of: model.accountMode) { _, mode in
            password = ""; otp = ""; revealPassword = false
            focused = mode == .signup ? .name : .email
        }
    }

    private func story(compact: Bool, layout: EntryLayout) -> some View {
        VStack(alignment: .leading, spacing: compact ? 14 : layout.scaled(24, 32)) {
            if !compact { BrandMark().frame(width: layout.scaled(49, 65), height: layout.scaled(49, 65)) }
            Text(compact ? "Your music. Your people. One room." : "Your music.\nYour people.\nOne room.")
                .font(.system(size: compact ? 28 : layout.scaled(38, 58), weight: .regular, design: .serif)).tracking(-0.8)
                .fixedSize(horizontal: false, vertical: true)
            Text("A shared queue, familiar songs, and a space to listen together. Your next session starts here.")
                .font(.system(size: layout.scaled(13, 16))).lineSpacing(5).foregroundStyle(palette.secondary)
                .frame(maxWidth: compact ? .infinity : layout.scaled(330, 470), alignment: .leading)
            HStack(spacing: 8) {
                IntroPill(text: "Apple Music library", palette: palette, fontSize: layout.scaled(12, 13))
                IntroPill(text: "Nearby + cloud", palette: palette, fontSize: layout.scaled(12, 13))
            }
            if !compact {
                Rectangle().fill(palette.line).frame(height: 1).padding(.top, 22)
                Text("Separate devices. Shared music.").font(.system(size: layout.scaled(10, 12))).foregroundStyle(palette.quiet)
            }
        }
        .padding(compact ? 28 : layout.scaled(44, 68))
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(palette.panel)
    }

    private var title: String {
        switch model.accountMode {
        case .login: "Sign in to SyncBeats"
        case .signup: "Create your account"
        case .forgot: "Reset your password"
        case .reset: "Choose a new password"
        }
    }
    private var subtitle: String {
        switch model.accountMode {
        case .login: "Sign in to open your listening room"
        case .signup: "Create an account to open your room"
        case .forgot: "Enter the email address you use with SyncBeats"
        case .reset: "Use the six-digit code from your email"
        }
    }
    private var submitTitle: String {
        switch model.accountMode {
        case .login: "Log in"
        case .signup: "Create account"
        case .forgot: "Send reset code"
        case .reset: "Update password"
        }
    }

    private func form(layout: EntryLayout) -> some View {
        VStack(alignment: .leading, spacing: layout.scaled(12, 17)) {
            if model.accountMode == .login || model.accountMode == .signup { tabs(layout: layout) }
            Text(title).font(.system(size: layout.scaled(27, 33), weight: .medium)).tracking(-0.6).accessibilityAddTraits(.isHeader)
            Text(subtitle).font(.system(size: layout.scaled(12, 14))).lineSpacing(4).foregroundStyle(palette.secondary)
            if model.accountMode == .login || model.accountMode == .signup {
                Button { Task { await model.signInWithGoogle() } } label: {
                    HStack(spacing: 8) {
                        Image("GoogleLogo").resizable().scaledToFit()
                            .frame(width: layout.scaled(15, 18), height: layout.scaled(15, 18)).accessibilityHidden(true)
                        Text("Continue with Google").font(.system(size: layout.scaled(12, 14)))
                    }.frame(maxWidth: .infinity, minHeight: layout.scaled(38, 46))
                        .background(palette.raised, in: RoundedRectangle(cornerRadius: 8))
                        .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(palette.line))
                }.buttonStyle(NativeButtonStyle(palette: palette)).padding(.top, 4)
                HStack(spacing: 12) {
                    Rectangle().fill(palette.line).frame(height: 1)
                    Text("or use your email").font(.system(size: layout.scaled(12, 13))).foregroundStyle(palette.quiet)
                    Rectangle().fill(palette.line).frame(height: 1)
                }
            }
            if model.accountMode == .signup {
                input(label: "Your name", layout: layout) {
                    TextField("Your name", text: $name).textContentType(.name).focused($focused, equals: .name)
                        .onSubmit { focused = .email }
                }
            }
            input(label: "Email address", layout: layout) {
                TextField("you@example.com", text: $model.email).textContentType(.emailAddress).focused($focused, equals: .email)
                    .onSubmit { if model.accountMode == .forgot { submit() } else { focused = model.accountMode == .reset ? .otp : .password } }
            }
            if model.accountMode == .reset {
                input(label: "Email verification code", layout: layout) {
                    TextField("Six-digit code", text: $otp).textContentType(.oneTimeCode).focused($focused, equals: .otp)
                        .onSubmit { focused = .password }
                }
            }
            if model.accountMode != .forgot {
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text(model.accountMode == .reset ? "New password" : "Password").font(.system(size: layout.scaled(12, 13))).foregroundStyle(palette.secondary)
                        Spacer()
                        if model.accountMode == .login {
                            Button("Forgot password?") { model.enterAccount(.forgot) }
                                .buttonStyle(NativeButtonStyle(palette: palette)).font(.system(size: layout.scaled(12, 13))).foregroundStyle(palette.gold)
                        }
                    }
                    HStack(spacing: 4) {
                        Group {
                            if revealPassword { TextField("Your password", text: $password) }
                            else { SecureField("Your password", text: $password) }
                        }
                        .textContentType(model.accountMode == .login ? .password : .newPassword)
                        .focused($focused, equals: .password).onSubmit(submit)
                        .privacySensitive()
                        Button(revealPassword ? "Hide" : "Show") { revealPassword.toggle() }
                            .buttonStyle(NativeButtonStyle(palette: palette)).font(.system(size: layout.scaled(12, 13))).foregroundStyle(palette.quiet)
                            .accessibilityLabel(revealPassword ? "Hide password" : "Show password")
                    }.textFieldStyle(.plain).font(.system(size: layout.scaled(13, 15))).padding(layout.scaled(12, 16))
                        .background(palette.background.opacity(0.7), in: RoundedRectangle(cornerRadius: 8))
                        .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(palette.line))
                    if model.accountMode != .login {
                        Text("Use at least 8 characters.").font(.system(size: layout.scaled(12, 13))).foregroundStyle(palette.quiet)
                    }
                }
            }
            InlineStatus(model: model, palette: palette, fontSize: layout.scaled(12, 13))
            GoldButton(title: submitTitle, palette: palette, working: model.isWorking,
                       fontSize: layout.scaled(12, 14), minimumHeight: layout.scaled(39, 48), action: submit)
                .frame(maxWidth: .infinity).keyboardShortcut(.defaultAction)
            HStack(spacing: 4) {
                Text(model.accountMode == .login ? "New to SyncBeats?" : "Already have an account?")
                    .foregroundStyle(palette.quiet)
                Button(model.accountMode == .login ? "Create an account" : "Log in") {
                    model.enterAccount(model.accountMode == .login ? .signup : .login)
                }.buttonStyle(NativeButtonStyle(palette: palette)).foregroundStyle(palette.gold)
            }.font(.system(size: layout.scaled(10, 12))).frame(maxWidth: .infinity)
            Button("← Back to introduction") { model.showIntroduction() }
                .buttonStyle(NativeButtonStyle(palette: palette)).font(.system(size: layout.scaled(10, 12))).foregroundStyle(palette.quiet).padding(.top, 7)
        }
        .padding(layout.scaled(28, 32))
        .disabled(model.isWorking)
    }

    private func tabs(layout: EntryLayout) -> some View {
        HStack(spacing: 4) {
            ForEach([AccountMode.login, .signup], id: \.self) { mode in
                Button { model.enterAccount(mode) } label: {
                    Text(mode == .login ? "Log in" : "Create account").font(.system(size: layout.scaled(12, 13)))
                        .foregroundStyle(model.accountMode == mode ? palette.gold : palette.secondary)
                        .frame(maxWidth: .infinity, minHeight: layout.scaled(32, 40))
                        .background(model.accountMode == mode ? palette.raised : .clear, in: RoundedRectangle(cornerRadius: 4))
                }.buttonStyle(NativeButtonStyle(palette: palette))
                    .accessibilityAddTraits(model.accountMode == mode ? .isSelected : [])
            }
        }.padding(4).background(palette.raised, in: RoundedRectangle(cornerRadius: 8))
            .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(palette.line)).padding(.bottom, 8)
    }

    private func input<Content: View>(label: String, layout: EntryLayout, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(label).font(.system(size: layout.scaled(12, 13))).foregroundStyle(palette.secondary)
            content().textFieldStyle(.plain).font(.system(size: layout.scaled(13, 15))).padding(layout.scaled(12, 16))
                .background(palette.background.opacity(0.7), in: RoundedRectangle(cornerRadius: 8))
                .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(palette.line))
                .accessibilityLabel(label)
        }
    }

    private func submit() {
        Task {
            let success = await model.submit(name: name, email: model.email, password: password, otp: otp)
            if success { password = ""; revealPassword = false }
            else if let error = model.errorMessage?.lowercased() {
                if error.contains("email") { focused = .email }
                else if error.contains("password") { focused = .password }
                else if error.contains("name") { focused = .name }
                else if error.contains("code") { focused = .otp }
            }
        }
    }
}
