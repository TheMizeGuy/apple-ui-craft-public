# Onboarding and TipKit

> Owner: `references/patterns/03-onboarding-tipkit.md` owns first-run architecture, the welcome/What's New surface, TipKit contextual teaching, and the GENERAL cross-permission priming pattern (the soft-ask-before-the-system-prompt architecture, the which/when decision matrix, Location/Camera/Contacts/Photos/ATT specifics). The notification-permission INSTANCE of priming -- including `.provisional` and denial recovery -- is owned by `references/patterns/07-feedback-reviews-notifications.md#notification-permission-earn-the-prompt`; this file states the pattern once and points there for its most common single application. Deferred account creation is owned by `references/patterns/09-auth-account.md`. Settings deep-linking mechanics are owned by `references/patterns/06-settings.md#deep-linking-to-system-settings`.
> Floors: TipKit and `ContentUnavailableView` are iOS 17.0+ (`references/_scaffolding/version-floor-registry.md#ios-170`); `TipGroup` is iOS 18.0+ (`#ios-180`).

Apple's guidance on onboarding is blunt: get people to real content as fast as possible. The worst first run is a marketing carousel the user swipes through to reach the app; the best is nearly invisible -- usable immediately, with teaching deferred to the moment a feature becomes relevant. Three mechanisms do this job and they are NOT interchangeable: a one-time welcome flow (state, not content), TipKit (in-context feature discovery), and permission priming (protecting a one-shot system dialog with a reversible custom screen).

## Onboarding architecture

| Pattern | Fits | Risk |
|---|---|---|
| Value-first / zero-onboarding | Utility, single-purpose apps | User misses a non-obvious feature |
| Guided setup | Apps needing config to function (accounts, import, permissions) | Per-step drop-off |
| Contextual teaching (TipKit) | Feature-rich apps with progressive complexity | Tips ignored if mistimed |

Most shipping apps blend all three. Gate the flow on ONE source of truth -- `@AppStorage` for a boolean, a version string if onboarding must re-run after a feature bump:

```swift
@main struct MyApp: App {
    @AppStorage("onboardingVersionSeen") private var onboardingVersionSeen = ""
    private let currentOnboardingVersion = "3"

    var body: some Scene {
        WindowGroup {
            RootView()
                .fullScreenCover(isPresented: .constant(onboardingVersionSeen != currentOnboardingVersion)) {
                    OnboardingFlow(onComplete: { onboardingVersionSeen = currentOnboardingVersion })
                        .interactiveDismissDisabled()   // can't swipe past a required step
                }
        }
    }
}
```

Use `.fullScreenCover`, not `.sheet` -- onboarding isn't dismissible mid-flow and the user shouldn't see the app behind it (`references/patterns/05-modality-sheets.md` owns the sheet-vs-cover decision generally). Model steps as an enum, not booleans, so the flow is testable and every transition is a named, measurable event:

```swift
enum OnboardingStep: String, CaseIterable { case welcome, valueProps, notificationsPriming, done }

@Observable final class OnboardingModel {
    var step: OnboardingStep = .welcome
    func advance() {
        let all = OnboardingStep.allCases
        if let i = all.firstIndex(of: step), i + 1 < all.count { step = all[i + 1] }
    }
}
```

Naming each step is what makes drop-off answerable later: emit an event on every `advance()` and the step-to-step conversion tells you exactly which screen bleeds users -- an unmeasured onboarding is an unmanaged one. Never gate the entire app behind a step you don't strictly need; a user who force-quits mid-flow must still be able to reach content on relaunch.

## Welcome flow

Apple's own apps (Photos, Notes, Fitness) share one instantly recognizable shape: a large glyph, a bold title, 3-4 feature rows (symbol + headline + one line), one prominent button. Reproduce that, not a marketing carousel:

```swift
struct WelcomeFeature: Identifiable {
    let id = UUID()
    let symbol: String
    let title: LocalizedStringKey
    let description: LocalizedStringKey
}

struct WelcomeView: View {
    let features: [WelcomeFeature]
    let onContinue: () -> Void
    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    ForEach(features) { feature in
                        HStack(alignment: .top, spacing: 16) {
                            Image(systemName: feature.symbol)
                                .font(.title2).frame(width: 44, height: 44)
                                .accessibilityHidden(true)          // decorative; text carries meaning
                            VStack(alignment: .leading, spacing: 3) {
                                Text(feature.title).font(.headline)
                                Text(feature.description).font(.subheadline).foregroundStyle(.secondary)
                            }
                        }
                        .accessibilityElement(children: .combine)   // reads as one "title, description"
                    }
                }
                .padding(.horizontal, 32)
            }
            Button("Continue", action: onContinue)
                .buttonStyle(.borderedProminent).controlSize(.large)
                .frame(maxWidth: .infinity).padding()
        }
    }
}
```

Fixed 44x44 symbol frames keep every headline aligned regardless of glyph width -- the detail that reads as Apple-built. Content lives in a `ScrollView` so large Dynamic Type never clips the pinned Continue button. If the flow pages (`TabView(.page)`), a system-driven swipe needs no gate, but a Continue button that advances the page PROGRAMMATICALLY is your own animated transition and needs the standard accessor:

```swift
@Environment(\.accessibilityReduceMotion) private var reduceMotion
Button(page < 2 ? "Continue" : "Get Started") {
    if page < 2 { withAnimation(reduceMotion ? nil : .snappy) { page += 1 } } else { finish() }
}
```

Never more than ~3 pages if you do page; onboarding is a cost, not content. Re-show a "What's New" variant only on an UPGRADE, never a fresh install (a first-time user has nothing "new" to see), and present it as `.sheet`, not `.fullScreenCover` -- it's optional, unlike required first-run.

## TipKit

```swift
import TipKit
// once, at launch:
try? Tips.configure([.displayFrequency(.immediate), .datastoreLocation(.applicationDefault)])

struct FavoriteTip: Tip {
    var title: Text { Text("Save as Favorite") }
    var message: Text? { Text("Favorites always appear at the top.") }
    var image: Image? { Image(systemName: "star") }
}

TipView(favoriteTip)                              // inline -- reserves layout space
Image(systemName: "star").popoverTip(favoriteTip)  // anchored -- points at a control
```

Only `title` is required. Gate eligibility with `Rule`s -- a **parameter rule** on persisted app state, an **event rule** on how many times something happened:

```swift
struct SearchTip: Tip {
    static let appOpened = Tips.Event(id: "appOpened")
    var title: Text { Text("Try searching") }
    var rules: [Rule] { #Rule(Self.appOpened) { $0.donations.count >= 3 } }
}
// on each launch: Task { await SearchTip.appOpened.donate() }
```

Combine rules (all must pass) rather than teaching a feature before it's relevant. Invalidate the moment the lesson lands -- `tip.invalidate(reason: .actionPerformed)` -- a tip that keeps nagging after the user already found the feature is worse than no tip. TipKit persists shown/invalidated state AND syncs it across the user's devices via iCloud automatically on the default datastore -- never build your own "seen this" `@AppStorage` flag; it defeats the sync and re-teaches on every device. Point the datastore at an app group (`.groupContainer(identifier:)`) to share state with an extension.

For a deliberate guided tour, `TipGroup(.ordered)` (iOS 18+) shows exactly one tip at a time and advances only when the current one is invalidated:

```swift
if #available(iOS 18, *) {
    // TipGroup(.ordered) { WelcomeTip(); AddItemTip(); ShareTip() }
    // tour.currentTip is the single eligible tip; advance by invalidating it.
} else {
    // Sequence manually: chain each later tip's event rule to the prior
    // tip's completion donation -- there is no TipGroup fallback API.
}
```

`.firstAvailable` is the sibling policy for independent hints with no inherent order. Keep tours to 3-4 steps -- a ten-step `TipGroup` is the carousel anti-pattern in a native costume.

## Permission priming

Every system permission dialog (notifications, location, camera, contacts, tracking) shows **once per install**. After a "Don't Allow," you cannot re-prompt in-app -- only Settings recovers it. The priming pattern spends a cheap, reversible custom screen (soft-ask) to protect that expensive, irreversible one (hard-ask): show your own on-brand rationale first, and only fire the real request if the user taps your affirmative button.

| Permission | Prime with a soft-ask? | No-prompt alternative |
|---|---|---|
| Notifications | Yes, or use `.provisional` -- see `references/patterns/07-feedback-reviews-notifications.md#notification-permission-earn-the-prompt` | -- |
| Location, When In Use | Light -- point-of-need context is often enough | -- |
| Location, Always | Yes, hard -- only after When-In-Use is already granted | -- |
| Camera / Mic | Usually no -- the tap context IS the rationale | -- |
| Photo library | No | `PhotosPicker` needs no permission at all |
| Contacts (full book) | Yes, hard | `ContactAccessButton`/picker (iOS 18+) needs no prompt |
| Tracking (ATT) | Yes, always | SKAdNetwork / AdAttributionKit if declined |

```swift
struct PrePermissionView: View {
    let symbol: String
    let title: LocalizedStringKey
    let rationale: LocalizedStringKey
    let onEnable: () -> Void
    let onSkip: () -> Void
    var body: some View {
        VStack(spacing: 24) {
            Image(systemName: symbol).font(.system(size: 64)).symbolRenderingMode(.hierarchical)
                .accessibilityHidden(true)
            Text(title).font(.title.bold())
            Text(rationale).font(.body).foregroundStyle(.secondary)
            Button(action: onEnable) { Text("Continue").frame(maxWidth: .infinity) }
                .buttonStyle(.borderedProminent).controlSize(.large)
            Button("Not Now", action: onSkip).tint(.secondary)   // low-friction, genuinely reversible
        }
        .padding(24)
    }
}
```

App Review's imitate-the-system-alert and no-gating/no-incentive rules (Guideline 2.3 / 5.1.1) are stated in full at `references/patterns/07-feedback-reviews-notifications.md#notification-permission-earn-the-prompt` -- they apply identically to every permission below, most strictly to tracking. Once status is `.denied`, the only recovery is a Settings deep link (`references/patterns/06-settings.md#deep-linking-to-system-settings`), offered only on explicit intent, never auto-fired. Design every denied path to degrade gracefully -- a maps feature falls back to manual entry.

**Location** requires the two-step escalation -- request When-In-Use first; Always is meaningless (and silently downgraded by the system) if requested cold:

```swift
manager.requestWhenInUseAuthorization()
// only after .authorizedWhenInUse is granted, and only if the feature needs it:
manager.requestAlwaysAuthorization()
```

**Contacts** has a limited-access tier (iOS 18+) and a picker path that needs no permission at all -- reserve the full `CNContactStore.requestAccess(for:)` for features that genuinely need the whole address book (find-friends matching), and prime hardest before it since full-book access is the most sensitive contacts ask. **Photo library**: `PhotosPicker` returns user-selected images with zero permission prompt -- the selection IS the consent; only request `PHPhotoLibrary` authorization for programmatic access beyond what the user hands you.

**Tracking (ATT)** is the strictest of the six: the dialog is silently dropped unless the app is `.active`, so fire it after a short delay once foregrounded, never during launch or a transition animation; check `trackingAuthorizationStatus == .notDetermined` before every call, since a second call after any decision is a no-op; and reading `ASIdentifierManager.shared().advertisingIdentifier` before authorization returns an all-zero UUID. Gating a feature or offering a reward for allowing tracking is Guideline 5.1.1(iv) and an automatic rejection.

## Accessibility contract

Onboarding sheets and covers inherit Liquid Glass materials on iOS 26 -- keep welcome surfaces on standard `Material` backgrounds and let the system provide the glass; don't hand-roll a blur behind a welcome card. Any animated welcome sequence must honor `.accessibilityReduceMotion` (the page-advance gate above) and `.accessibilityReduceTransparency`. `.accessibilityElement(children: .combine)` on each feature row is mandatory so VoiceOver reads "title, description" as one element instead of stopping on the decorative symbol -- the symbol itself needs `.accessibilityHidden(true)`, or its auto-derived name ("star") leaks into the merged utterance. Every priming-screen button, including "Not Now," meets the 44pt minimum from `references/accessibility/04-motor-interaction.md#touch-targets`.

## Anti-patterns

| Wrong | Why it fails | Right |
|---|---|---|
| Onboarding hardcoded into the root view, always renders | No gate, re-shows every launch | `@AppStorage` flag + `.fullScreenCover` |
| Requesting all permissions on launch / onboarding page 1 | Guarantees a cold prompt and a permanent denial | Just-in-time priming, request on user tap |
| Home-grown coach-mark overlay with hand-rolled "seen" flags | Reinvents persistence AND loses cross-device sync | TipKit -- persistence and sync are free |
| A 6-page marketing carousel | Users swipe through without reading | ≤3 pages, always skippable, or skip paging entirely |
| `.sheet` for a required first-run flow | Swipe-dismissable, shows the app behind it | `.fullScreenCover` |
| `TipGroup` with ten ordered tips | The carousel anti-pattern wearing a native costume | 3-4 steps, each self-contained |
| Re-showing a system permission prompt after denial | It's a silent no-op | Deep-link to Settings |
| Gating a feature or offering a reward for allowing tracking | App Review rejection (5.1.1(iv)) | Never gate or incentivize any declinable permission |
| Requesting Always-location cold, before When-In-Use | The system silently downgrades the request | Escalate only after When-In-Use is granted |

## Severity guide

CRITICAL: any code path that gates functionality behind a declinable permission, or fires ATT during launch/a transition animation (the dialog is silently dropped, and a second attempt is a no-op). HIGH: no priming before a location/contacts/tracking system dialog -- a cold prompt burns the one shot. MEDIUM: a `TipGroup`/onboarding tour with no self-contained steps, or a "seen" flag hand-rolled instead of TipKit's own persistence. LOW: a welcome flow exceeding ~3 pages, or a decorative symbol missing `.accessibilityHidden(true)`.

## See also

- `references/patterns/04-loading-empty-error.md#empty` -- empty states as in-place teaching, the sibling of TipKit for zero-content screens
- `references/patterns/07-feedback-reviews-notifications.md#notification-permission-earn-the-prompt` -- the notification-specific instance of the priming pattern above, including `.provisional`
- `references/patterns/09-auth-account.md` -- deferred account creation, a guided-setup onboarding step
- `references/patterns/05-modality-sheets.md` -- `.sheet` vs. `.fullScreenCover` decision this file specializes for first-run
- `references/design/05-sf-symbols.md#rendering-modes` -- hierarchical rendering for hero/feature-row glyphs
- `references/accessibility/03-visual-accessibility.md#reduce-motion` -- the system-vs-developer-owned motion boundary this file's page-advance gate follows
- `references/accessibility/05-motion-accessibility.md#accessibility-contract` -- the double-gate accessor pattern
- `~/Claude/vault/iOS Development/` -- deep source for TipKit and permission APIs
