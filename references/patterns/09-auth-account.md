# Authentication and Account Management

> Owner: `references/patterns/09-auth-account.md` owns Sign in with Apple button craft and HIG placement, passkey sign-in UX, the credential text-field stack, auth-flow states (loading/cancel/error/success), the account settings screen (profile header, sign-out, credential-state recovery), and account deletion UX. The settings `Form`/`Section` shell and where an account section sits in a broader hierarchy is owned by `references/patterns/06-settings.md#account-section-placement` -- cite it, don't restate. Liquid Glass button styles are owned by `references/design/02-liquid-glass.md`; haptic outcome semantics by `references/haptics/02-swiftui-sensory-feedback.md`; 44pt targets by `references/accessibility/04-motor-interaction.md`.
> Floors: see `references/_scaffolding/version-floor-registry.md#ios-160` for `AddPassToWalletButton`-adjacent floors; `SignInWithAppleButton` is iOS 14+, `.textContentType(.oneTimeCode)`/passkey APIs are iOS 16+ -- both stated inline below since they're this file's headline APIs.

Auth screens are high-stakes: get the flow wrong and you either lock a user out entirely or leak App Store Review rejections (Guideline 4.8 third-party sign-in parity, 5.1.1(v) account deletion). This file covers the craft layer -- label, style, placement, field modifiers, state handling -- not the `ASAuthorizationController` delegate wiring, which lives in goodmem Learnings (cited at the end).

## Sign in with Apple: label, style, placement

`SignInWithAppleButton` is a SYSTEM-DRAWN control (SwiftUI, iOS 14+) -- the pixel geometry, logo clear-space, corner radius, and localized title are Apple's. Never build a lookalike; App Review rejects it on sight. Craft is limited to three decisions the API leaves open.

```swift
SignInWithAppleButton(.continue) { request in
    request.requestedScopes = [.fullName, .email]
    request.nonce = sha256(currentNonce)              // server-side replay defense
} onCompletion: { result in
    switch result {
    case .success(let auth):  session.handle(auth)
    case .failure(let error): session.presentAuthError(error)
    }
}
.signInWithAppleButtonStyle(colorScheme == .dark ? .white : .black)
.frame(maxWidth: .infinity, minHeight: 50)
.clipShape(.capsule)                                  // matches the iOS 26 pill affordance
```

**Label** -- `.signIn` ("Sign in with Apple") for a dedicated returning-user screen, `.signUp` ("Sign up with Apple", iOS 14+) for an account-creation screen, `.continue` ("Continue with Apple") for a single unified auth screen where you don't yet know if the account exists. Pick `.continue` unless the surrounding copy already commits to one path. The button localizes its own title -- never hard-code or overlay your own text on it.

**Style** -- `.signInWithAppleButtonStyle(_:)` takes exactly three values: `.black` for light backgrounds, `.white` for dark/photographic backgrounds, `.whiteOutlined` (white fill + hairline border) for white/very-light backgrounds where a solid white button would vanish. Drive it off `@Environment(\.colorScheme)` so it flips with the system. Do NOT tint it to your brand color -- Apple's HIG forbids recoloring the button.

**Placement** -- HIG puts Sign in with Apple ABOVE email/password and other providers, because for a returning Apple-ID user it's the one-tap path. Order the stack: SIWA → passkey/other providers → an "or" divider → the email field. If you offer ANY third-party login (Google, Facebook), Guideline 4.8 requires Sign in with Apple to be present and given EQUAL prominence -- same width, comparable position, not visually demoted.

**Sizing and radius** -- reference height ~44-50pt; use `minHeight: 50` and let it stretch full-width in a stacked auth sheet. All buttons in the credential stack share ONE corner radius or the screen reads bolted-together -- `.capsule` when the rest of the stack is pill-shaped, `RoundedRectangle(cornerRadius: 12)` when they're rounded rects.

### Liquid Glass context (iOS 26+) -- do not wrap SIWA in glass

The SIWA button is opaque by system design. **Never** wrap it in `.glassEffect()` -- glass over a system-branded button muddies the logo's contrast, and `Glass` has only `.regular`/`.clear`/`.identity` (there is no `.thin`/`.thick` variant to reach for even by mistake). Let SIWA be the solid anchor and render your SECONDARY actions ("Use email instead," "Need help?") as `.buttonStyle(.glass)` so the hierarchy reads: one solid committed action, glass for everything optional.

```swift
Button("Use email instead") { showEmailForm = true }
    .buttonStyle(.glass)                               // secondary weight, iOS 26.0+
```

If the auth sheet floats over app content, keep the SIWA button on a solid `.regularMaterial` plate so its black/white fill always meets contrast, rather than letting it sit directly on unpredictable imagery.

## Passkeys: AutoFill-assisted vs. modal

Passkeys are the credential Apple wants apps to lead with. `ASAuthorizationPlatformPublicKeyCredentialProvider(relyingPartyIdentifier:)` produces an assertion request you present one of two ways.

**AutoFill-assisted (default, quietest UX)** -- the passkey surfaces in the QuickType bar the instant the user taps the username field, no modal, no interruption. Call `performAutoFillAssistedRequests()` once, in `onAppear`, paired with a `.textContentType(.username)` field:

```swift
TextField("Email or username", text: $username)
    .textContentType(.username)                        // arms passkey + password AutoFill
    .onAppear { authModel.beginAutoFillPasskey() }      // performAutoFillAssistedRequests()
```

Never fire an AutoFill-assisted request from a button tap -- it's meant to be ambient. Cancel it when the view disappears.

**Modal (explicit request)** -- when the user taps an explicit "Sign in with a passkey" button, call `performRequests()` instead; this brings up the full account picker + Face ID sheet immediately. Style the explicit affordance as SECONDARY, beneath SIWA, using a bordered glass button rather than a SIWA lookalike:

```swift
Button {
    authModel.signInWithPasskey()                       // performRequests() (modal)
} label: {
    Label("Sign in with a passkey", systemImage: "person.badge.key.fill")
        .frame(maxWidth: .infinity, minHeight: 50)
}
.buttonStyle(.glass)                                     // iOS 26 secondary weight
.clipShape(.capsule)
```

**Prerequisite that breaks silently** -- passkey and password AutoFill both require the Associated Domains entitlement (`webcredentials:example.com`) AND an `apple-app-site-association` file served at `https://example.com/.well-known/`. Without it the QuickType bar shows nothing and there is no error -- this is the single most common "passkeys don't work" cause. `relyingPartyIdentifier` must equal the domain in the entitlement.

**Upgrade prompt** -- don't gate first sign-in behind passkey creation. Right after a successful password or SIWA login for a user without a passkey, offer a one-time, dismissible upsell; persist a "declined" flag so you never nag twice.

```swift
.sheet(isPresented: $offerPasskeyUpgrade) {
    PasskeyUpsellView(
        onCreate: { authModel.registerPasskey() },       // createCredentialRegistrationRequest
        onSkip:   { offerPasskeyUpgrade = false })
    .presentationDetents([.medium])
}
```

For a returning user, a COMBINED request (passkey assertion + SIWA + password provider handed to one `ASAuthorizationController`) lets the system present one unified sheet and return whichever credential the user picks -- fewer choices on screen than three separate buttons.

## Credential field stack

The field modifiers below are load-bearing -- omitting them breaks Keychain AutoFill, the QuickType bar, or keyboard flow, not just cosmetics.

```swift
// Login username/email
TextField("Email", text: $email)
    .textContentType(.username)          // the field the user LOGS IN with must be .username
    .keyboardType(.emailAddress)
    .textInputAutocapitalization(.never)
    .autocorrectionDisabled()
    .submitLabel(.next)

// Existing password (sign-in)
SecureField("Password", text: $password)
    .textContentType(.password)          // offers the saved Keychain password
    .submitLabel(.go)

// New password (account creation) -- triggers Strong Password suggestion + save
SecureField("Create a password", text: $password)
    .textContentType(.newPassword)
    .submitLabel(.continue)

// SMS / email one-time code
TextField("Verification code", text: $code)
    .textContentType(.oneTimeCode)       // surfaces the code from Messages in QuickType
    .keyboardType(.numberPad)
```

**`.username` vs. `.emailAddress`** -- the field the user logs in WITH must be `.username`; `.emailAddress` alone does not trigger the saved-password pairing. **`.newPassword` is what makes Strong Password appear** -- using `.password` on a signup field means iOS won't offer to generate/save one. Pair the visible email field (`.username`) with the `.newPassword` field so iOS associates the credential pair. **`.oneTimeCode` needs no extra wiring** -- don't build a custom 6-box OTP UI that can't receive it; if you want the segmented look, keep one hidden real field bound to `.oneTimeCode` and mirror characters into the boxes.

Wire the keyboard's return key to walk fields with `@FocusState` + `submitLabel`:

```swift
enum Field { case email, password }
@FocusState private var focus: Field?

TextField("Email", text: $email)
    .focused($focus, equals: .email)
    .submitLabel(.next)
    .onSubmit { focus = .password }

SecureField("Password", text: $password)
    .focused($focus, equals: .password)
    .submitLabel(.go)
    .onSubmit { submit() }
```

Auto-focus the first field on appear for a plain login screen -- but NOT on a screen led by a prominent SIWA/passkey button, where a keyboard would shove the primary path off-screen. A reveal toggle needs an explicit label AND value so VoiceOver announces state, not just an icon:

```swift
Button { reveal.toggle() } label: { Image(systemName: reveal ? "eye.slash" : "eye") }
    .accessibilityLabel("Show password")
    .accessibilityValue(reveal ? "Visible" : "Hidden")
```

Validate on BLUR and on submit, never on every keystroke -- a field turning red while the user is still typing their email is hostile. Custom password rules (server-side complexity requirements) bridge through UIKit since SwiftUI has no direct modifier: `field.passwordRules = UITextInputPasswordRules(descriptor: "required: lower; required: upper; required: digit; minlength: 12;")` on a wrapped `UITextField`.

## Flow states: loading, cancel, error, success

The submit button owns its own loading state -- never cover the whole screen with a spinner:

```swift
Button {
    Task { await submit() }
} label: {
    ZStack {
        Text("Sign In").opacity(isLoading ? 0 : 1)
        if isLoading { ProgressView().tint(.white) }
    }
    .frame(maxWidth: .infinity, minHeight: 50)
}
.buttonStyle(.glassProminent)          // iOS 26 primary weight
.clipShape(.capsule)
.disabled(isLoading || !isFormValid)
```

Swapping label→spinner IN PLACE, same frame, avoids a resize-on-tap that reads as jank. `.disabled` while the form is invalid gives the button a "not yet" appearance that guides completion.

**Cancel is not an error** -- the #1 auth-UX bug. Dismissing the SIWA or passkey sheet returns `ASAuthorizationError.canceled`; showing an error alert for it is jarring after the user deliberately backed out.

```swift
func presentAuthError(_ error: Error) {
    guard let e = error as? ASAuthorizationError else {
        alert = .init("Connection problem", "Check your network and try again."); return
    }
    switch e.code {
    case .canceled, .notInteractive, .unknown: return    // silent -- user backed out, or benign no-match
    default: alert = .init("Couldn't sign in", "Please try again.")
    }
}
```

**Actionable vs. system failure use different surfaces**: a wrong password or unknown account renders INLINE next to the field with a recovery affordance ("Forgot password?") -- it's the user's to fix, don't yank them to a modal. A network/server error renders as an `.alert` with a Try Again button, because there's nothing in the form to correct.

```swift
Text(fieldError ?? " ")
    .font(.caption).foregroundStyle(.red)
    .animation(.snappy, value: fieldError)   // slide in, don't pop
```

A haptic confirms the outcome of a call the user can't otherwise see:

```swift
.sensoryFeedback(.success, trigger: didSignIn)   // committed, transitioning in
.sensoryFeedback(.error, trigger: authFailed)    // wrong creds / failure
```

One haptic per outcome -- never on keystroke, never on the loading spinner itself. Full `.sensoryFeedback` contract owned by `references/haptics/02-swiftui-sensory-feedback.md#built-in-feedback-types`. Resign focus the instant the request starts so the keyboard isn't fighting the spinner for space, and cross-fade or push into the app root with a spring rather than snapping so the state change reads as earned -- pointer to `references/animation/02-spring-physics.md#spring-presets` for `.smooth`/`.snappy`. Skip a standalone success-checkmark screen for routine login; reserve a "You're all set" confirmation for account CREATION, where the user benefits from an explicit landing beat.

## Account settings screen

Persist what Apple gives you once -- `ASAuthorizationAppleIDCredential.fullName`/`.email` are returned ONLY on the very first authorization; every subsequent sign-in returns `nil` for both. Store name/email into your own account record on first sign-in; the settings header reads from YOUR store, never re-requests from Apple.

```swift
Section {
    HStack(spacing: 14) {
        Image(systemName: "person.crop.circle.fill")
            .font(.system(size: 56)).foregroundStyle(.secondary)
        VStack(alignment: .leading, spacing: 2) {
            Text(account.displayName).font(.headline)
            Text(account.email).font(.subheadline).foregroundStyle(.secondary)
        }
    }
}
```

If the user chose Hide My Email, `.email` is a private relay (`abc123@privaterelay.appleid.com`) -- display it as-is; never try to resolve or hide it further.

**Credential state** -- Apple can revoke your app's authorization out-of-band (user removes it in Settings ▸ Apple ID ▸ Sign in with Apple). Check on launch and sign out silently on revocation, no scary alert:

```swift
func verifyAppleCredential() async {
    let state = try? await ASAuthorizationAppleIDProvider().credentialState(forUserID: account.appleUserID)
    switch state {
    case .authorized:            break                       // still good
    case .revoked, .notFound:    await signOutSilently()
    case .transferred:           await reverify()             // app moved dev teams
    case .none, .some:           break
    }
}
```

Also observe the live revocation notification so a mid-session revoke is handled: `NotificationCenter.default.addObserver(forName: ASAuthorizationAppleIDProvider.credentialRevokedNotification, …)`.

**Sign out is reversible and low-friction, never destructive-red** -- it sits as a plain row ABOVE the destructive Delete Account row:

```swift
Section { Button("Sign Out") { showSignOutConfirm = true } }
.confirmationDialog("Sign out?", isPresented: $showSignOutConfirm) {
    Button("Sign Out", role: .destructive) { signOut() }   // role only for sheet emphasis
    Button("Cancel", role: .cancel) { }
}
```

On sign-out: clear session tokens and any Keychain items you own, but LEAVE the SIWA credential intact -- the user should be able to sign right back in with one tap. Only account DELETION revokes SIWA; never clear passkeys, which live in the user's own iCloud Keychain. The settings shell (`Form`, `Section` grouping) follows `references/patterns/06-settings.md#account-section-placement`; identity at the top, security/preferences in the middle, sign-out, then delete last and visually separated -- the order every first-party account screen uses.

Don't build UI to manage the Apple ID itself. If a user needs to revoke access or manage Hide My Email, present copy that says "Manage in Settings → Apple ID → Sign in with Apple" and let them navigate -- rolling your own risks reading like a phishing screen.

## Account deletion

Not optional. **App Store Review Guideline 5.1.1(v)**: any app supporting account creation must let the user INITIATE deletion from within the app. Four hard requirements Review checks:

1. **In-app initiation** -- a real in-app path, not a support-email-only route (a web page IN ADDITION is fine, but the app must start the flow).
2. **Full deletion, not deactivation** -- must delete the account record and associated personal data; a "disable my account" toggle alone is a rejection.
3. **Easy to find** -- Apple's guidance: place it in account settings; buried three modals deep counts as non-compliant in practice.
4. **Sign in with Apple token revocation** -- if you offer SIWA, your SERVER must call the SIWA REST endpoint to revoke the user's token on deletion. There is no client-side revoke call, but the UI must trigger the server flow. Skipping revocation is a specific, named rejection reason.

```swift
Section {
    Button("Delete Account", role: .destructive) { showDeleteFlow = true }
} footer: {
    Text("Permanently deletes your account and all associated data. This can't be undone.")
}
```

`role: .destructive` renders red automatically and gives VoiceOver the destructive trait; the footer sets expectation BEFORE the tap. Match confirmation friction to consequence -- a two-step confirmation is right for most apps; for high-value accounts (finance, data-heavy) add typed confirmation:

```swift
.confirmationDialog("Delete your account?", isPresented: $showDeleteFlow, titleVisibility: .visible) {
    Button("Delete Account", role: .destructive) { Task { await deleteAccount() } }
    Button("Cancel", role: .cancel) { }
} message: {
    Text("This permanently deletes your profile, history, and passkey for this app. You can't undo this.")
}
```

State concretely WHAT is deleted, that it's IRREVERSIBLE, and any consequence the user can't guess (an active subscription is NOT canceled by account deletion -- say so, or users get billed and leave one-star reviews). Deletion is a network call -- show and confirm it the same in-place way as sign-in: disable the button, swap to an inline `ProgressView`; on success sign out, clear Keychain items, land on the signed-out root with a calm confirmation and a `.sensoryFeedback(.success)`; on failure keep them on screen with a retry alert. If your backend uses a soft-delete grace window, DISCLOSE it in the confirmation copy ("You can restore within 30 days by signing back in") -- a silent grace period that contradicts "permanent" copy is a trust break.

## Accessibility contract

Auth screens are high-stakes for accessibility -- a blind user who can't complete sign-in is locked out of the entire app.

- A `TextField` placeholder disappears once typing starts and is not a reliable VoiceOver label -- add an explicit `.accessibilityLabel` alongside every placeholder-only field.
- Post an announcement when a validation error appears, in addition to the visible caption: `AccessibilityNotification.Announcement("Incorrect password. Try again.").post()`.
- The Sign in with Apple button is ALREADY accessible -- the system control ships a correct label and button trait. Don't wrap it in a way that overrides them, and don't add a redundant `.accessibilityLabel`.
- Every hand-built control ("Forgot password?", the reveal toggle, "Use email instead") meets the 44×44pt minimum in `references/accessibility/04-motor-interaction.md#touch-targets`.
- Dynamic Type must REFLOW, not clip -- wrap the whole form in a `ScrollView` so labels and helper text survive AX5; keep only the SIWA/primary-button HEIGHT fixed (~50pt), let its label text scale.
- The auth→app transition should degrade to a cross-fade under `accessibilityReduceMotion` -- no slide/scale for users who get motion-sick; gate per `references/accessibility/05-motion-accessibility.md`.

## Anti-patterns

| Wrong | Why it fails | Right |
|---|---|---|
| Custom-drawn "Sign in with Apple" button | Rejected on sight -- wrong logo geometry, violates the system-control requirement | `SignInWithAppleButton` only |
| Wrapping SIWA (or reaching for a "thicker" glass variant that doesn't exist) in a Materials-style thin/thick glass call | `Glass` exposes only `.regular`/`.clear`/`.identity` -- a Materials-style variant name won't compile, and glass over a system-branded button is wrong even conceptually | `.regular`/`.clear` on secondary controls only; SIWA stays unwrapped |
| An alert shown on `ASAuthorizationError.canceled` | User deliberately backed out; looks broken | Return silently on `.canceled`/`.notInteractive` |
| `.emailAddress` on the login field instead of `.username` | Saved-password AutoFill pairing never fires | `.textContentType(.username)` |
| `.password` on a signup field | No Strong Password suggestion or save | `.textContentType(.newPassword)` |
| Custom 6-box OTP UI with no real field | Can't receive the Messages-sourced code, breaks AutoFill | One `.oneTimeCode` field, mirrored into boxes if needed |
| Only offering "deactivate account" | Fails Guideline 5.1.1(v) outright | Full in-app deletion, plus SIWA server-side revoke |
| Sign Out styled destructive-red | Confuses a reversible action with permanent deletion | Neutral row; only Delete Account is red |

## Severity guide

CRITICAL: missing account deletion, or deletion that doesn't revoke SIWA server-side (App Store rejection risk). HIGH: a custom SIWA lookalike, or a Materials-style glass variant that doesn't exist on `Glass` anywhere in the auth stack (compile error). MEDIUM: wrong `textContentType` breaking AutoFill, an error alert on user-initiated cancel. LOW: sign-out styled the wrong color, a missing success haptic on account creation.

## See also

- `references/patterns/06-settings.md#account-section-placement` -- where this section sits in the broader settings hierarchy
- `references/design/02-liquid-glass.md#glass-buttons` -- `.buttonStyle(.glass)`/`.glassProminent` weights used throughout this file
- `references/haptics/02-swiftui-sensory-feedback.md#built-in-feedback-types` -- `.success`/`.error` outcome haptics
- `references/animation/02-spring-physics.md#spring-presets` -- `.smooth`/`.snappy` for state transitions
- `references/accessibility/04-motor-interaction.md#touch-targets` -- 44×44pt minimum for hand-built auth controls
- `references/accessibility/05-motion-accessibility.md` -- Reduce Motion contract for the post-auth transition
- goodmem Learnings `15c6f3fb`, `8eaf9362`, `6a94e9f1` -- full `ASAuthorizationController` wiring, Keychain storage, server-side SIWA verification (plumbing this file deliberately omits)
