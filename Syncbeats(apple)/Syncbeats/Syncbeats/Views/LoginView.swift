import SwiftUI

private enum AuthMode: String, CaseIterable, Identifiable {
    case login = "Sign In"
    case register = "Create Account"
    case reset = "Reset Password"
    case verifyOtp = "Set Password"

    var id: String { rawValue }

    var subtitle: String {
        switch self {
        case .login:    return "Listen together, in perfect sync."
        case .register: return "One account, every device."
        case .reset:    return "We'll email you a reset link."
        case .verifyOtp: return "Check your email for the OTP."
        }
    }
}

struct LoginView: View {
    @StateObject private var auth = AuthManager.shared
    @Environment(\.colorScheme) private var scheme

    @State private var mode: AuthMode = .login
    @State private var isSwapping = false
    @State private var name = ""
    @State private var email = ""
    @State private var password = ""
    @State private var confirmPassword = ""
    @State private var otp = ""
    @State private var notice: String?
    @State private var emailExists: Bool? = nil
    @State private var emailCheckTask: Task<Void, Never>? = nil
    @FocusState private var focused: Field?

    @State private var waveOffset: CGFloat = 0.0
    @State private var showPassword = false
    @State private var showConfirm = false

    #if os(macOS)
    @Environment(\.colorScheme) private var systemScheme
    @State private var pointer: CGVector? = nil
    @State private var typingTick = 0
    @State private var errorTick = 0
    @State private var jitterTick = 0

    /// User choice: the glass card contrasts the wallpaper — light system → dark
    /// card, dark system → white card. Flip to `false` for match-the-system glass.
    private let invertGlass = true
    private var effectiveScheme: ColorScheme {
        invertGlass ? (systemScheme == .dark ? .light : .dark) : systemScheme
    }
    #endif

    private enum Field { case name, email, password, confirm, otp }


    var body: some View {
        #if os(macOS)
        macLayout
        #else
        iosLayout
        #endif
    }

    // MARK: - Shared content (single-sourced across platforms)

    @ViewBuilder private var headerSection: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 8) {
                    Circle()
                        .fill(Color.accentColor)
                        .frame(width: 6, height: 6)
                    Text(mode == .login ? "SIGN IN" : mode == .register ? "CREATE ACCOUNT" : mode.rawValue.uppercased())
                        .font(.system(.caption, design: .monospaced).weight(.bold))
                        .tracking(2)
                        .foregroundStyle(.secondary)
                }

                Text(mode == .login ? "Sound, in step." : mode == .register ? "Get in step." : "SyncBeats.")
                    .font(.system(size: 34, weight: .bold, design: .rounded))
                    .foregroundStyle(.primary)
                    .padding(.top, 4)

                Text(mode == .login ? "Log in to pick up where your session left off." : mode == .register ? "Turn the devices you own into one speaker." : mode.subtitle)
                    .font(.system(.subheadline))
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 2)
            }
            Spacer()
            Image("SyncBeatsLogo")
                .resizable()
                .scaledToFit()
                .frame(width: 44, height: 44)
        }
        .padding(.top, 20)
        .padding(.bottom, 12)
    }

    @ViewBuilder private var modePicker: some View {
        HStack(spacing: 0) {
            ForEach([AuthMode.login, AuthMode.register], id: \.self) { tab in
                Text(tab == .login ? "Sign In" : "Sign Up")
                    .font(.system(size: 15, weight: tab == mode ? .bold : .medium))
                    .frame(maxWidth: .infinity)
                    .frame(height: 40)
                    .foregroundStyle(mode == tab ? Color.white : Color.primary.opacity(0.7))
                    .contentShape(Rectangle())
                    .onTapGesture {
                        guard mode != tab else { return }
                        
                        // 1. Lift and break apart
                        withAnimation(.easeOut(duration: 0.2)) {
                            isSwapping = true
                        }
                        
                        // 2. Swap positions
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
                            withAnimation(.spring(response: 0.5, dampingFraction: 0.8)) {
                                mode = tab
                            }
                            
                            // 3. Drop and fuse flat seamlessly
                            DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
                                withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) {
                                    isSwapping = false
                                }
                            }
                        }
                    }
            }
        }
        .background {
            GeometryReader { geo in
                let w = geo.size.width / 2
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .fill(Color.accentColor)
                    .shadow(color: Color.black.opacity(0.15), radius: 6, y: 3)
                    .overlay(
                        RoundedRectangle(cornerRadius: 10, style: .continuous)
                            .stroke(Color.white.opacity(0.2), lineWidth: 1)
                    )
                    .frame(width: w)
                    .offset(x: mode == .login ? 0 : w)
            }
        }
        .padding(4)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(fieldFill)
                .overlay(
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .stroke(scheme == .dark ? Color.white.opacity(0.1) : Color.black.opacity(0.06), lineWidth: 1)
                )
        )
        .padding(.vertical, 8)
        .opacity(mode == .reset || mode == .verifyOtp ? 0 : 1)
        .frame(height: mode == .reset || mode == .verifyOtp ? 0 : nil)
        .disabled(mode == .reset || mode == .verifyOtp)
    }


    @ViewBuilder private var fieldsSection: some View {
        #if os(macOS)
        macFieldsSection
        #else
        iosFieldsSection
        #endif
    }

    #if os(macOS)
    @ViewBuilder private var macFieldsSection: some View {
        VStack(spacing: 16) {
            if mode == .register {
                HStack(spacing: 12) {
                    TextField("Full Name", text: $name)
                        .textFieldStyle(.plain)
                        .font(.system(size: 15))
                        .textContentType(.name)
                        .focused($focused, equals: .name)
                }
                .padding(.horizontal, 16)
                .frame(height: 48)
                .background(fieldFill, in: RoundedRectangle(cornerRadius: 12))
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(effectiveScheme == .dark ? Color.white.opacity(0.1) : Color.black.opacity(0.06), lineWidth: 1))
            }

            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 12) {
                    TextField("Email Address", text: $email)
                        .textFieldStyle(.plain)
                        .font(.system(size: 15))
                        .textContentType(.emailAddress)
                        .focused($focused, equals: .email)
                        .onChange(of: email) { newValue in
                            validateEmail(newValue)
                        }
                }
                .padding(.horizontal, 16)
                .frame(height: 48)
                .background(fieldFill, in: RoundedRectangle(cornerRadius: 12))
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(effectiveScheme == .dark ? Color.white.opacity(0.1) : Color.black.opacity(0.06), lineWidth: 1))
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(emailToneColor.opacity(0.8), lineWidth: emailExists != nil ? 1 : 0)
                )

                if let hint = emailHint {
                    Text(hint)
                        .font(.system(size: 11, weight: .medium, design: .monospaced))
                        .foregroundStyle(emailToneColor)
                        .padding(.leading, 8)
                }
            }

            if mode == .verifyOtp {
                HStack(spacing: 12) {
                    TextField("OTP Code", text: $otp)
                        .textFieldStyle(.plain)
                        .font(.system(size: 15))
                        .textContentType(.oneTimeCode)
                        .focused($focused, equals: .otp)
                }
                .padding(.horizontal, 16)
                .frame(height: 48)
                .background(fieldFill, in: RoundedRectangle(cornerRadius: 12))
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(effectiveScheme == .dark ? Color.white.opacity(0.1) : Color.black.opacity(0.06), lineWidth: 1))
            }

            if mode != .reset {
                HStack(spacing: 12) {
                    if showPassword {
                        TextField(mode == .verifyOtp ? "New password" : "Password", text: $password)
                            .textFieldStyle(.plain)
                            .font(.system(size: 15))
                            .textContentType(mode == .register || mode == .verifyOtp ? .newPassword : .password)
                            .focused($focused, equals: .password)
                    } else {
                        SecureField(mode == .verifyOtp ? "New password" : "Password", text: $password)
                            .textFieldStyle(.plain)
                            .font(.system(size: 15))
                            .textContentType(mode == .register || mode == .verifyOtp ? .newPassword : .password)
                            .focused($focused, equals: .password)
                    }
                    Button(action: { showPassword.toggle() }) {
                        Image(systemName: showPassword ? "eye.slash.fill" : "eye.fill")
                            .foregroundStyle(.secondary)
                    }
                    .buttonStyle(.plain)
                }
                .padding(.horizontal, 16)
                .frame(height: 48)
                .background(fieldFill, in: RoundedRectangle(cornerRadius: 12))
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(effectiveScheme == .dark ? Color.white.opacity(0.1) : Color.black.opacity(0.06), lineWidth: 1))

                if mode == .register || mode == .verifyOtp {
                    HStack(spacing: 12) {
                        if showConfirm {
                            TextField("Confirm password", text: $confirmPassword)
                                .textFieldStyle(.plain)
                                .font(.system(size: 15))
                                .textContentType(.newPassword)
                                .focused($focused, equals: .confirm)
                        } else {
                            SecureField("Confirm password", text: $confirmPassword)
                                .textFieldStyle(.plain)
                                .font(.system(size: 15))
                                .textContentType(.newPassword)
                                .focused($focused, equals: .confirm)
                        }
                        Button(action: { showConfirm.toggle() }) {
                            Image(systemName: showConfirm ? "eye.slash.fill" : "eye.fill")
                                .foregroundStyle(.secondary)
                        }
                        .buttonStyle(.plain)
                    }
                    .padding(.horizontal, 16)
                    .frame(height: 48)
                    .background(fieldFill, in: RoundedRectangle(cornerRadius: 12))
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(effectiveScheme == .dark ? Color.white.opacity(0.1) : Color.black.opacity(0.06), lineWidth: 1))
                }
            }
        }
        .onSubmit(submit)
        }
    #endif

    @ViewBuilder private var iosFieldsSection: some View {
        VStack(spacing: 24) {
            if mode == .register {
                HStack(spacing: 12) {
                    Image(systemName: "person.fill").foregroundStyle(.secondary).frame(width: 20)
                    TextField("Full Name", text: $name)
                        .textContentType(.name)
                        .focused($focused, equals: .name)
                }
                .padding(.horizontal, 16)
                .frame(height: 60)
                .background(fieldFill, in: RoundedRectangle(cornerRadius: 16))
            }

            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 12) {
                    Image(systemName: "envelope.fill").foregroundStyle(.secondary).frame(width: 20)
                    TextField("Email Address", text: $email)
                        .textContentType(.emailAddress)
                        .focused($focused, equals: .email)
                        .onChange(of: email) { newValue in
                            validateEmail(newValue)
                        }
                        #if !os(macOS)
                        #endif
                }
                .padding(.horizontal, 16)
                .frame(height: 60)
                .background(fieldFill, in: RoundedRectangle(cornerRadius: 16))
                .overlay(
                    RoundedRectangle(cornerRadius: 16)
                        .stroke(emailToneColor.opacity(0.8), lineWidth: emailExists != nil ? 1 : 0)
                )

                if let hint = emailHint {
                    Text(hint)
                        .font(.system(size: 11, weight: .medium, design: .monospaced))
                        .foregroundStyle(emailToneColor)
                        .padding(.leading, 8)
                }
            }

            if mode == .verifyOtp {
                HStack(spacing: 12) {
                    Image(systemName: "number.square.fill").foregroundStyle(.secondary).frame(width: 20)
                    TextField("OTP Code", text: $otp)
                        .textContentType(.oneTimeCode)
                        .focused($focused, equals: .otp)
                }
                .padding(.horizontal, 16)
                .frame(height: 60)
                .background(fieldFill, in: RoundedRectangle(cornerRadius: 16))
            }

            if mode != .reset {
                HStack(spacing: 12) {
                    Image(systemName: "lock.fill").foregroundStyle(.secondary).frame(width: 20)
                    if showPassword {
                        TextField(mode == .verifyOtp ? "New password" : "Password", text: $password)
                            .textContentType(mode == .register || mode == .verifyOtp ? .newPassword : .password)
                            .focused($focused, equals: .password)
                    } else {
                        SecureField(mode == .verifyOtp ? "New password" : "Password", text: $password)
                            .textContentType(mode == .register || mode == .verifyOtp ? .newPassword : .password)
                            .focused($focused, equals: .password)
                    }
                    Button(action: { showPassword.toggle() }) {
                        Image(systemName: showPassword ? "eye.slash.fill" : "eye.fill")
                            .foregroundStyle(.secondary)
                    }
                    .buttonStyle(.plain)
                }
                .padding(.horizontal, 16)
                .frame(height: 60)
                .background(fieldFill, in: RoundedRectangle(cornerRadius: 16))

                if mode == .register || mode == .verifyOtp {
                    HStack(spacing: 12) {
                        Image(systemName: "lock.fill").foregroundStyle(.secondary).frame(width: 20)
                        if showConfirm {
                            TextField("Confirm password", text: $confirmPassword)
                                .textContentType(.newPassword)
                                .focused($focused, equals: .confirm)
                        } else {
                            SecureField("Confirm password", text: $confirmPassword)
                                .textContentType(.newPassword)
                                .focused($focused, equals: .confirm)
                        }
                        Button(action: { showConfirm.toggle() }) {
                            Image(systemName: showConfirm ? "eye.slash.fill" : "eye.fill")
                                .foregroundStyle(.secondary)
                        }
                        .buttonStyle(.plain)
                    }
                    .padding(.horizontal, 16)
                    .frame(height: 60)
                    .background(fieldFill, in: RoundedRectangle(cornerRadius: 16))
                }
            }
        }
        .textFieldStyle(.plain)
        .controlSize(.large)
        .onSubmit(submit)
    }
    @ViewBuilder private var noticeSection: some View {
        if let message = auth.authError {
            Label(message, systemImage: "exclamationmark.circle.fill")
                .foregroundStyle(.red)
                .font(.callout)
        }
        if let notice {
            Label(notice, systemImage: "checkmark.circle.fill")
                .foregroundStyle(.green)
                .font(.callout)
        }
    }

    @ViewBuilder private var actionButtons: some View {
        #if os(macOS)
        macActionButtons
        #else
        iosActionButtons
        #endif
    }

    #if os(macOS)
    @ViewBuilder private var macActionButtons: some View {
        VStack(spacing: 16) {
            Button(action: submit) {
                if auth.isLoading {
                    ProgressView().controlSize(.small)
                        .frame(maxWidth: .infinity)
                } else {
                    Text(mode.rawValue)
                        .font(.system(size: 15, weight: .bold))
                        .frame(maxWidth: .infinity)
                }
            }
            .buttonStyle(.plain)
            .frame(height: 48)
            .foregroundStyle(primaryLabel)
            .background(primaryFill)
            .opacity(auth.isLoading || !isValid ? 0.5 : 1.0)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .disabled(auth.isLoading || !isValid)
            .onHover { isHovered in
                if !auth.isLoading && isValid {
                    if isHovered { NSCursor.pointingHand.push() } else { NSCursor.pop() }
                }
            }

            if mode == .login || mode == .register {
                Button(action: { Task { await auth.authenticateWithWeb() } }) {
                    HStack(spacing: 12) {
                        Image("GoogleLogo")
                            .resizable()
                            .scaledToFit()
                            .frame(width: 18, height: 18)
                        Text("Continue with Google")
                            .font(.system(size: 15, weight: .semibold))
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 48)
                }
                .buttonStyle(.plain)
                .foregroundStyle(googleLabel)
                .background(googleFill)
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(googleStroke, lineWidth: 1)
                )
                .onHover { isHovered in
                    if isHovered { NSCursor.pointingHand.push() } else { NSCursor.pop() }
                }
            }

            Button(mode == .reset || mode == .verifyOtp ? "Back to sign in" : "Forgot your password?") {
                switchTo(mode == .reset || mode == .verifyOtp ? .login : .reset)
            }
            .buttonStyle(.plain)
            .foregroundStyle(.secondary)
            .font(.callout.weight(.medium))
            .padding(.top, 8)
            .onHover { isHovered in
                if isHovered { NSCursor.pointingHand.push() } else { NSCursor.pop() }
            }
        }
        .padding(.top, 8)
        }
    #endif

    @ViewBuilder private var iosActionButtons: some View {
        VStack(spacing: 24) {
            Button(action: submit) {
                if auth.isLoading {
                    ArrowWaveLoadingView(tint: primaryLabel)
                } else {
                    Text(mode.rawValue)
                        .font(.system(size: 14, weight: .bold))
                        .frame(maxWidth: .infinity)
                }
            }
            .frame(height: 60)
            .foregroundStyle(primaryLabel)
            .background(primaryFill)
            .opacity(auth.isLoading || !isValid ? 0.5 : 1.0)
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .disabled(auth.isLoading || !isValid)

            if mode == .login || mode == .register {
                Button(action: { Task { await auth.authenticateWithWeb() } }) {
                    HStack(spacing: 12) {
                        Image("GoogleLogo")
                            .resizable()
                            .scaledToFit()
                            .frame(width: 20, height: 20)
                        Text("Continue with Google")
                            .font(.system(size: 14, weight: .semibold))
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 60)
                }
                .foregroundStyle(googleLabel)
                .background(googleFill)
                .clipShape(RoundedRectangle(cornerRadius: 16))
                .overlay(
                    RoundedRectangle(cornerRadius: 16)
                        .stroke(googleStroke, lineWidth: 1)
                )
            }

            Button(mode == .reset || mode == .verifyOtp ? "Back to sign in" : "Forgot your password?") {
                switchTo(mode == .reset || mode == .verifyOtp ? .login : .reset)
            }
            .buttonStyle(.plain)
            .foregroundStyle(.secondary)
            .font(.callout.weight(.medium))
            .padding(.top, 8)
        }
        .padding(.top, 8)
    }
    // MARK: - Adaptive tokens
    // iOS branches return today's exact literals → the phone design is untouched.

    private var fieldFill: Color {
        #if os(macOS)
        effectiveScheme == .dark ? Color.white.opacity(0.08) : Color(white: 0.95)
        #else
        Color.white.opacity(0.05)
        #endif
    }
    private var primaryFill: Color {
        #if os(macOS)
        Color.accentColor
        #else
        Color.white
        #endif
    }
    private var primaryLabel: Color {
        #if os(macOS)
        Color.white
        #else
        Color.black
        #endif
    }
    private var googleFill: Color {
        #if os(macOS)
        effectiveScheme == .dark ? Color.white.opacity(0.08) : Color(white: 0.95)
        #else
        Color.white.opacity(0.08)
        #endif
    }
    private var googleLabel: Color {
        #if os(macOS)
        effectiveScheme == .dark ? Color.white : Color.black
        #else
        Color.white
        #endif
    }
    private var googleStroke: Color {
        #if os(macOS)
        (effectiveScheme == .dark ? Color.white : Color.black).opacity(0.15)
        #else
        Color.white.opacity(0.15)
        #endif
    }

    // MARK: - iOS layout (unchanged from the original vertical design)

    #if !os(macOS)
    private var iosLayout: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 32) {
                if mode == .login {
                    Color.clear.frame(height: 100) // Pushes login form down, but goes away completely on Sign Up
                }
                headerSection
                modePicker
                fieldsSection
                noticeSection
                actionButtons
            }
        }
        .scrollIndicators(.hidden)
        .padding(24)
        .frame(maxWidth: 480)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(AnimatedBackground(waveOffset: waveOffset))
        .animation(.spring(response: 0.4, dampingFraction: 0.8), value: mode)
    }
    #endif

    // MARK: - macOS layout (two-pane: glass card + reactive avatar)

    #if os(macOS)
    private var hairline: Color { (effectiveScheme == .dark ? Color.white : Color.black).opacity(0.14) }

    private var avatarFocus: AvatarFocus {
        switch focused {
        case .some(.password), .some(.confirm): return .secure
        case .some(.email):                     return .email
        case .some(.name), .some(.otp):         return .text
        case .none:                             return .idle
        }
    }
    private var avatarTone: AvatarTone {
        guard let exists = emailExists else { return .neutral }
        return exists == (mode == .login) ? .valid : .invalid
    }


    private var macGraphicPane: some View {
        ZStack {
            VStack {
                Spacer()
                
                // Graphic Constellation
                ZStack {
                    Circle()
                        .stroke(Color.primary.opacity(0.1), style: StrokeStyle(lineWidth: 2, dash: [8, 8]))
                        .frame(width: 320, height: 320)
                    
                    avatarPane
                        .frame(width: 250, height: 250)
                    
                    Image(systemName: "iphone")
                        .font(.system(size: 44, weight: .ultraLight))
                        .foregroundStyle(Color.primary.opacity(0.6))
                        .offset(x: -160, y: -50)
                    
                    Image(systemName: "macbook.and.ipad")
                        .font(.system(size: 48, weight: .ultraLight))
                        .foregroundStyle(Color.primary.opacity(0.6))
                        .offset(x: 0, y: 160)
                    
                    Image(systemName: "homepod.fill")
                        .font(.system(size: 46, weight: .ultraLight))
                        .foregroundStyle(Color.primary.opacity(0.6))
                        .offset(x: 160, y: -50)
                }
                .frame(height: 400)
                
                Spacer()
                
                AudioWaveformGraphic()
                    .frame(height: 50)
                    .padding(.bottom, 60)
            }
        }
         // Same glass material as authCard
        .environment(\.colorScheme, .light)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var macLayout: some View {
        GeometryReader { geo in
            let isWide = geo.size.width > 850
            
            ZStack {
                (systemScheme == .dark ? Color.black : Color.white).ignoresSafeArea()
                
                if isWide {
                    ZStack {
                        // MASTER UNIFIED FLAT CARD
                        // Fade the background master card out during swap so only the 2 lifting cards are visible
                        RoundedRectangle(cornerRadius: 30, style: .continuous)
                            .fill(Color(white: effectiveScheme == .dark ? 0.12 : 1.0))
                            .shadow(color: .black.opacity(isSwapping ? 0 : 0.15), radius: 40, y: 20)
                            .opacity(isSwapping ? 0 : 1)
                            
                        let isLogin = (mode != .register)
                        let w: CGFloat = isSwapping ? 420 : 450
                        let h: CGFloat = isSwapping ? 680 : 720
                        let swapOffset: CGFloat = isSwapping ? 220 : 225
                        let corner: CGFloat = isSwapping ? 30 : 0
                        let cardFill = Color(white: effectiveScheme == .dark ? 0.14 : 1.0)
                        
                        // Right-side Graphic Pane
                        macGraphicPane
                            // When swapping, create a temporary elevated card effect with matching color!
                            .background(
                                RoundedRectangle(cornerRadius: corner, style: .continuous)
                                    .fill(cardFill)
                                    .shadow(color: .black.opacity(isSwapping ? 0.2 : 0), radius: 30, y: 15)
                                    .opacity(isSwapping ? 1 : 0) // Only visible during swap
                            )
                            .overlay(
                                RoundedRectangle(cornerRadius: corner, style: .continuous)
                                    .stroke(hairline, lineWidth: 1)
                                    .opacity(isSwapping ? 1 : 0)
                            )
                            .frame(width: w, height: h)
                            .clipShape(isSwapping ? AnyShape(RoundedRectangle(cornerRadius: corner, style: .continuous)) : AnyShape(Rectangle()))
                            .offset(x: isLogin ? swapOffset : -swapOffset)
                            .zIndex(isLogin ? 0 : 1)
                        
                        // Left-side Auth Card
                        authCard
                            .background(
                                RoundedRectangle(cornerRadius: corner, style: .continuous)
                                    .fill(cardFill)
                                    .shadow(color: .black.opacity(isSwapping ? 0.2 : 0), radius: 30, y: 15)
                                    .opacity(isSwapping ? 1 : 0) // Only visible during swap
                            )
                            .overlay(
                                RoundedRectangle(cornerRadius: corner, style: .continuous)
                                    .stroke(hairline, lineWidth: 1)
                                    .opacity(isSwapping ? 1 : 0)
                            )
                            .frame(width: w, height: h)
                            .clipShape(isSwapping ? AnyShape(RoundedRectangle(cornerRadius: corner, style: .continuous)) : AnyShape(Rectangle()))
                            .offset(x: isLogin ? -swapOffset : swapOffset)
                            .zIndex(isLogin ? 1 : 0)
                    }
                    .frame(width: 900, height: 720)
                    // The master container clip for idle state
                    .clipShape(RoundedRectangle(cornerRadius: 30, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: 30, style: .continuous)
                            .stroke(hairline, lineWidth: 1)
                            .opacity(isSwapping ? 0 : 1)
                    )
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
                } else {
                    authCard
                        // When narrow, it just acts as a transparent card over adaptive background or we can give it a solid background
                        .background(Color(white: effectiveScheme == .dark ? 0.12 : 1.0))
                        .clipShape(RoundedRectangle(cornerRadius: 30, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 30, style: .continuous).stroke(hairline, lineWidth: 1))
                        .frame(width: 430, height: 720)
                        .shadow(color: .black.opacity(0.15), radius: 30, y: 15)
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
                }
            }
        }
        .animation(.spring(response: 0.5, dampingFraction: 0.7), value: mode)
        .onAppear { focused = .email }
        .onChange(of: [name, email, password, confirmPassword, otp]) { _, _ in typingTick += 1 }
        .onChange(of: auth.authError) { _, newValue in if newValue != nil { errorTick += 1 } }
        .onChange(of: avatarTone) { _, newValue in if newValue == .invalid { jitterTick += 1 } }
    }

    private var authCard: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                headerSection
                modePicker
                fieldsSection
                noticeSection
                actionButtons
            }
            .padding(.horizontal, 72)
            .padding(.vertical, 44)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .scrollIndicators(.hidden)
        
        .environment(\.colorScheme, effectiveScheme)
    }

    private var avatarPane: some View {
        GeometryReader { geo in
            AvatarView(
                mode: mode,
                focus: avatarFocus,
                tone: avatarTone,
                isLoading: auth.isLoading,
                pointer: pointer,
                typingTick: typingTick,
                errorTick: errorTick,
                jitterTick: jitterTick
            )
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .contentShape(Rectangle())
            .coordinateSpace(.named("pane"))
            .onContinuousHover(coordinateSpace: .named("pane")) { phase in
                switch phase {
                case .active(let pt):
                    let hw = max(geo.size.width / 2, 1)
                    let hh = max(geo.size.height / 2, 1)
                    pointer = CGVector(dx: max(-1, min(1, (pt.x - hw) / hw)),
                                       dy: max(-1, min(1, (pt.y - hh) / hh)))
                case .ended:
                    pointer = nil
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
    #endif

    // MARK: - Logic (unchanged)

    private var emailToneColor: Color {
        guard let exists = emailExists else { return .clear }
        return exists == (mode == .login) ? .green : .red
    }

    private var emailHint: String? {
        guard let exists = emailExists else { return nil }
        if mode == .login {
            return exists ? "Recognised." : "No account with this email yet."
        } else {
            return exists ? "Already registered — sign in instead." : "Available."
        }
    }

    private func validateEmail(_ newValue: String) {
        emailCheckTask?.cancel()
        guard newValue.contains("@") && newValue.contains(".") else {
            withAnimation { emailExists = nil }
            return
        }

        emailCheckTask = Task {
            try? await Task.sleep(nanoseconds: 400_000_000)
            guard !Task.isCancelled else { return }
            let exists = await auth.checkEmail(email: newValue.trimmingCharacters(in: .whitespaces))
            if !Task.isCancelled {
                withAnimation {
                    self.emailExists = exists
                }
            }
        }
    }

    private var isValid: Bool {
        switch mode {
        case .login:    return email.contains("@") && !password.isEmpty
        case .reset:    return email.contains("@")
        case .register: return !name.isEmpty && email.contains("@")
            && password.count >= 8 && password == confirmPassword
        case .verifyOtp: return email.contains("@") && otp.count >= 6
            && password.count >= 8 && password == confirmPassword
        }
    }

    private func switchTo(_ next: AuthMode) {
        mode = next
        auth.authError = nil
        notice = nil
    }

    private func submit() {
        guard isValid, !auth.isLoading else { return }
        notice = nil

        Task {
            switch mode {
            case .login:
                await auth.login(email: email, password: password)
                if let err = auth.authError, err.contains("GOOGLE_AUTH_SETUP_PASSWORD") {
                    switchTo(.verifyOtp)
                    notice = "An OTP was sent to your email to set a local password."
                }
            case .register:
                if await auth.register(name: name, email: email, password: password) {
                    notice = "Account created. Check your email, then sign in."
                    password = ""
                    confirmPassword = ""
                    mode = .login
                }
            case .reset:
                if await auth.forgotPassword(email: email) {
                    notice = "Reset link sent to \(email)."
                }
            case .verifyOtp:
                if await auth.resetPassword(email: email, otp: otp, password: password) {
                    notice = "Password set successfully. You can now sign in."
                    password = ""
                    confirmPassword = ""
                    otp = ""
                    mode = .login
                }
            }
        }
    }
}

// MARK: - Reactive avatar (the "Sync orb")

#if os(macOS)
private enum AvatarFocus { case idle, text, email, secure }
private enum AvatarTone { case neutral, valid, invalid }

private struct RippleValue { var scale: CGFloat = 1.0; var opacity: Double = 0.0 }

/// A precise center dot + a springy trailing ring — the web cursor's DNA, made
/// alive. It breathes on a heartbeat, leans toward the pointer, and reacts to
/// focus, typing, email validity, loading, errors and mode changes.
private struct AvatarView: View {
    let mode: AuthMode
    let focus: AvatarFocus
    let tone: AvatarTone
    let isLoading: Bool
    let pointer: CGVector?
    let typingTick: Int
    let errorTick: Int
    let jitterTick: Int

    // ponytail: physical feel — these are calibration knobs, not magic numbers.
    private let restBPM = 60.0
    private let loadBPM = 132.0
    private let beatDepth = 0.06
    private let lookStrength: CGFloat = 12

    private var ringColor: Color {
        switch tone {
        case .valid:   return .green
        case .invalid: return .red
        case .neutral: return .accentColor
        }
    }
    private var baseRadius: CGFloat {
        switch focus {
        case .secure:       return 30   // password → ring seals shut, dot hides
        case .email, .text: return 52
        case .idle:         return 44
        }
    }
    private var dotOpacity: Double { focus == .secure ? 0 : 1 }
    private var split: CGFloat { mode == .register ? 15 : 0 }          // two devices → one speaker
    private var morph: Angle { (mode == .reset || mode == .verifyOtp) ? .degrees(180) : .zero }
    private var dashed: Bool { mode == .reset }

    var body: some View {
        TimelineView(.animation) { ctx in
            let t = ctx.date.timeIntervalSinceReferenceDate
            let p = t * (isLoading ? loadBPM : restBPM) / 60.0
            let lub = pow(max(0, sin(p * 2 * .pi)), 8.0)
            let dub = pow(max(0, sin((p - 0.14) * 2 * .pi)), 8.0) * 0.5
            let beat = lub + dub
            content(beat: beat, syncPhase: p.truncatingRemainder(dividingBy: 1))
        }
        .frame(width: 240, height: 240)
    }

    private func content(beat: Double, syncPhase: Double) -> some View {
        let look = CGSize(width: (pointer?.dx ?? 0) * lookStrength,
                          height: (pointer?.dy ?? 0) * lookStrength)
        return ZStack {
            // Sync-seeking pulses — radiate outward while loading (devices locking in).
            ForEach(0..<3, id: \.self) { i in
                let ph = (syncPhase * 0.9 + Double(i) / 3.0).truncatingRemainder(dividingBy: 1)
                Circle()
                    .stroke(ringColor.opacity((1 - ph) * (isLoading ? 0.45 : 0)), lineWidth: 2)
                    .frame(width: baseRadius * 2, height: baseRadius * 2)
                    .scaleEffect(0.7 + ph * 1.8)
            }

            ringGroup(look: look)

            // Center dot — the precision point. Beats a touch harder than the ring.
            Circle()
                .fill(ringColor)
                .frame(width: 12, height: 12)
                .scaleEffect(1 + beatDepth * beat * 2)
                .opacity(dotOpacity)
                .offset(look)
                .animation(.spring(response: 0.18, dampingFraction: 0.7), value: look)
                .animation(.smooth(duration: 0.3), value: dotOpacity)
                .animation(.smooth(duration: 0.3), value: ringColor)
        }
        .scaleEffect(1 + beatDepth * beat)
        .phaseAnimator([0, -8, 8, -5, 5, 0] as [CGFloat], trigger: errorTick) { view, dx in
            view.offset(x: dx)
        } animation: { _ in .spring(response: 0.08, dampingFraction: 0.35) }
    }

    private func ringGroup(look: CGSize) -> some View {
        let style = StrokeStyle(lineWidth: 2, dash: dashed ? [4, 7] : [])
        return ZStack {
            Circle().stroke(ringColor.opacity(0.9), style: style)
                .frame(width: baseRadius * 2, height: baseRadius * 2)
                .offset(x: -split)
            Circle().stroke(ringColor.opacity(0.9), style: style)
                .frame(width: baseRadius * 2, height: baseRadius * 2)
                .offset(x: split)
        }
        .rotationEffect(morph)
        .offset(x: look.width * 0.6, y: look.height * 0.6)
        // Ripple outward on every keystroke.
        .overlay {
            Circle().stroke(ringColor, lineWidth: 2)
                .frame(width: baseRadius * 2, height: baseRadius * 2)
                .keyframeAnimator(initialValue: RippleValue(), trigger: typingTick) { c, v in
                    c.scaleEffect(v.scale).opacity(v.opacity)
                } keyframes: { _ in
                    KeyframeTrack(\.scale) {
                        LinearKeyframe(1.0, duration: 0.01)
                        SpringKeyframe(1.7, duration: 0.55)
                    }
                    KeyframeTrack(\.opacity) {
                        LinearKeyframe(0.5, duration: 0.01)
                        LinearKeyframe(0.0, duration: 0.55)
                    }
                }
        }
        .animation(.spring(response: 0.42, dampingFraction: 0.55), value: look)
        .animation(.spring(response: 0.5, dampingFraction: 0.6), value: mode)
        .animation(.smooth(duration: 0.35), value: baseRadius)
        .animation(.smooth(duration: 0.3), value: ringColor)
        // Jitter when the email is wrong for the current mode.
        .phaseAnimator([0.0, -1, 1, -0.6, 0], trigger: jitterTick) { view, k in
            view.rotationEffect(.degrees(k * 5))
        } animation: { _ in .spring(response: 0.12, dampingFraction: 0.4) }
    }
}


#endif

// MARK: - Subviews

private struct AnimatedBackground: View {
    let waveOffset: CGFloat

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            #if os(macOS)
            // Animated ambient background only on macOS
            Circle()
                .fill(Color.accentColor.opacity(0.4))
                .frame(width: 500, height: 500)
                .blur(radius: 120)
                .offset(x: waveOffset == 1 ? 150 : -150, y: waveOffset == 1 ? -150 : 150)
                .animation(.easeInOut(duration: 8).repeatForever(autoreverses: true), value: waveOffset)

            Circle()
                .fill(Color.purple.opacity(0.3))
                .frame(width: 400, height: 400)
                .blur(radius: 100)
                .offset(x: waveOffset == 1 ? -200 : 200, y: waveOffset == 1 ? 200 : -200)
                .animation(.easeInOut(duration: 10).repeatForever(autoreverses: true), value: waveOffset)
            #endif
        }
    }
}
// MARK: - Transverse Wave Arrow Loading Animation
private struct ArrowWaveLoadingView: View {
    var tint: Color = .black
    @State private var phase = 0.0
    @State private var arrowOffset: CGFloat = -15

    var body: some View {
        HStack(spacing: 12) {
            // Transverse wave particles
            HStack(spacing: 4) {
                ForEach(0..<4, id: \.self) { i in
                    Circle()
                        .fill(tint.opacity(0.3 + Double(i) * 0.2))
                        .frame(width: 5, height: 5)
                        .offset(y: sin(phase + Double(i) * 0.8) * 5)
                }
            }

            // Flying Arrow
            Image(systemName: "arrow.right")
                .font(.system(size: 18, weight: .black))
                .foregroundColor(tint)
                .offset(x: arrowOffset)
                .opacity(1.0 - (arrowOffset / 15.0))
        }
        .frame(maxWidth: .infinity)
        .onAppear {
            withAnimation(.linear(duration: 0.6).repeatForever(autoreverses: false)) {
                phase = .pi * 2
            }
            withAnimation(.easeIn(duration: 0.6).repeatForever(autoreverses: false)) {
                arrowOffset = 15
            }
        }
    }
}



// MARK: - App Graphics
private struct AudioWaveformGraphic: View {
    @State private var phase: Double = 0
    
    var body: some View {
        HStack(spacing: 6) {
            ForEach(0..<14, id: \.self) { i in
                RoundedRectangle(cornerRadius: 3)
                    .fill(Color.accentColor.opacity(0.4 + Double(i%3)*0.1))
                    .frame(width: 5, height: 10 + CGFloat(abs(sin(phase + Double(i) * 0.6))) * 25)
            }
        }
        .onAppear {
            withAnimation(.linear(duration: 1.2).repeatForever(autoreverses: true)) {
                phase = .pi * 2
            }
        }
    }
}

#Preview {
    LoginView()
}
