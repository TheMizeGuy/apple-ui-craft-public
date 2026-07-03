# Feedback, Reviews, and Notification Permission

> Owner: `references/patterns/07-feedback-reviews-notifications.md` owns App Store review-prompt timing ethics (the `requestReview` env action), in-app feedback affordances, and the full notification PERMISSION lifecycle -- priming, the authorization request, `.provisional` quiet delivery, and denial recovery. Rich notification CONTENT (attachments, threading, `relevanceScore`, interruption-level capability wiring beyond the basic request) is owned by `references/platform/04-system-surfaces-notifications.md`. Deep-linking to the system Settings app (`openSettingsURLString`/`openNotificationSettingsURLString`) and the `Link`-row pattern for support/privacy content are owned by `references/patterns/06-settings.md` -- cite it here, don't restate. Account/sign-in flows are owned by `references/patterns/09-auth-account.md`.
> Floors: see `references/_scaffolding/version-floor-registry.md#ios-160` for `requestReview`-era floors and `references/_scaffolding/version-floor-registry.md#ios-170` for `subscriptionStatusTask`; `UNUserNotificationCenter` authorization is iOS 10+ and not re-tabulated here.

Both surfaces in this file share one discipline: earn the ask. A review prompt fired after a crash, or a notification permission dialog fired cold on first launch, doesn't just fail -- it burns a one-shot system resource you can't easily get back. The craft is entirely about timing and honest framing, not visual polish.

## Review prompts: ask, don't beg

```swift
@Environment(\.requestReview) private var requestReview   // iOS 16+, StoreKitSwiftUI

Button("Enjoying the app? Rate it") {
    requestReview()
}
```

`requestReview` (the `RequestReviewAction` SwiftUI environment value) replaces the deprecated UIKit `SKStoreReviewController.requestReview(in:)`; label the UIKit form Deprecated if it appears in older code and migrate to the environment action. Calling `requestReview()` is a REQUEST, not a guarantee -- the system throttles how often the review sheet actually appears, independent of how many times your code calls the action, and there is no completion handler telling you whether it showed. Never gate other app logic on "did the prompt display," and never call it more than once per meaningful milestone.

**Timing rules, in order of how often apps get them wrong:**

- Fire it after a genuinely POSITIVE moment -- a completed purchase, a finished workout, a successfully exported file -- never immediately after an error, a crash recovery, a paywall dismissal, or on cold launch.
- Never place the call behind a button labeled "Rate the App" that the user must actively seek out AND also auto-fire it elsewhere in the same session -- pick one path per milestone.
- A common, App-Review-safe pattern is a sentiment gate: ask a soft in-app question first ("Enjoying \(appName)?"), and only call `requestReview()` on a "Yes" -- route a "No" to the feedback affordance below instead of the App Store sheet. This keeps unhappy users from leaving a public one-star review when what they actually wanted was to report a bug.

```swift
.confirmationDialog("Enjoying the app?", isPresented: $showSentimentGate) {
    Button("Yes, I love it") { requestReview() }
    Button("Not really") { showFeedbackSheet = true }
    Button("Not now", role: .cancel) { }
}
```

## In-app feedback affordances

Keep bug reports and feature requests on a lower-friction path than the App Store review flow -- feedback is a private conversation, a review is a public rating.

```swift
Section("Support") {
    Link("Help Center", destination: URL(string: "https://example.com/help")!)
    Button("Send Feedback") { showFeedbackSheet = true }
}
```

`Link` rows for static help/privacy/contact content follow the pattern owned by `references/patterns/06-settings.md#deep-linking-to-system-settings`. For an in-app feedback form, a `Form` sheet with a `TextEditor` and a short category picker keeps the user in-app; pre-fill diagnostic context so they don't have to type it:

```swift
struct FeedbackSheet: View {
    @State private var body = ""
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Section("What's on your mind?") {
                    TextEditor(text: $body).frame(minHeight: 120)
                }
                Section {
                    LabeledContent("App Version", value: Bundle.main.appVersion)
                    LabeledContent("Device", value: UIDevice.current.model)
                } footer: {
                    Text("This information is included to help us investigate.")
                }
            }
            .navigationTitle("Send Feedback")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Send") { send(body); dismiss() }.disabled(body.isEmpty)
                }
            }
        }
    }
}
```

A simpler alternative for apps without a support backend is a pre-filled `mailto:` `Link` -- it hands off to Mail with the subject/body already populated, at the cost of leaving the app entirely. Never make a feedback affordance the ONLY exit from a negative sentiment gate -- always pair "Not really" with a working next step, never a dead end.

## Notification permission: earn the prompt

Check current status before deciding what to show -- the system displays its authorization dialog exactly once per install; a second `requestAuthorization` call after any decision is a silent no-op:

```swift
let center = UNUserNotificationCenter.current()
let settings = await center.notificationSettings()
switch settings.authorizationStatus {
case .notDetermined: showPriming()                 // safe to prompt
case .denied:         showSettingsDeepLink()        // can't re-prompt -- route to Settings
case .authorized, .provisional, .ephemeral: break    // already resolved
@unknown default: break
}
```

Precede the real system dialog with a soft, app-styled priming screen. App Review enforces real rules here (Guideline 2.3 / 5.1.1): the priming screen must NOT imitate the system alert (no fake "Allow / Don't Allow" buttons styled like iOS), copy must state the user's benefit ("Get notified when your order ships," not "So we can send you deals"), and the decline path ("Not Now") must be a plain, easy-to-find button -- never a dark pattern.

```swift
Button("Enable Notifications") {
    Task {
        _ = try? await UNUserNotificationCenter.current()
            .requestAuthorization(options: [.alert, .sound, .badge])
    }
}
```

Fire the priming screen at the point of need or right after the user's first "aha" moment -- never on the first onboarding page, never before the user has done anything in the app.

### `.provisional` -- the no-prompt escape hatch

When "try before you commit" fits the app better than any dialog, request quiet delivery instead of a visible permission dialog:

```swift
try await UNUserNotificationCenter.current()
    .requestAuthorization(options: [.alert, .sound, .badge, .provisional])
```

`.provisional` delivers notifications straight into Notification Center -- no banner, no sound, no upfront system prompt -- with "Keep / Turn off" management controls the user can act on per-notification. Ship real notifications from day one under `.provisional`, then request full `[.alert, .sound, .badge]` (WITHOUT `.provisional`) once engagement is demonstrated. Never combine `.provisional` with a hard prompt on the same launch -- deferring the visible dialog is the entire point.

### Denial recovery

Once `authorizationStatus == .denied`, the app can never re-prompt in-process. Route to Settings only after explicit intent, using the deep-link pattern owned by `references/patterns/06-settings.md#deep-linking-to-system-settings`:

```swift
Section {
    LabeledContent("Notifications", value: statusText)
    if authStatus == .denied {
        Button("Turn On in Settings") { openURL(notificationSettingsURL) }
    }
} footer: {
    Text("Notifications are turned off. Enable them in Settings to receive reminders.")
}
```

Design the rest of the app to degrade gracefully when notifications stay off -- the feature they gate should still work, just without the push.

## Notification content and actions

`UNUserNotificationCenterDelegate`'s `willPresent` decides whether a notification interrupts the user while your app is already in the foreground -- return an empty option set to suppress a banner for content the user is already looking at, or the full set to show it anyway for something urgent:

```swift
func userNotificationCenter(_ center: UNUserNotificationCenter,
                             willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
    [.banner, .sound, .badge]     // or [] to suppress while the relevant screen is already open
}
```

Attach quick actions to a category so the user can respond without opening the app; a text-input action gives an inline-reply affordance that works even when the system's own Smart Reply strip is unavailable:

```swift
let reply = UNTextInputNotificationAction(
    identifier: "REPLY", title: "Reply",
    options: [], textInputButtonTitle: "Send", textInputPlaceholder: "Message…")
let markRead = UNNotificationAction(identifier: "MARK_READ", title: "Mark as Read", options: [])
let category = UNNotificationCategory(identifier: "MESSAGE", actions: [reply, markRead],
                                       intentIdentifiers: [], options: [])
UNUserNotificationCenter.current().setNotificationCategories([category])
```

`.timeSensitive` interruption level requires the "Time Sensitive Notifications" capability enabled in Signing & Capabilities in addition to setting `interruptionLevel` on the content -- without the capability the system silently downgrades to `.active`. Reserve it for content the user would genuinely be upset to miss in the moment (a security code, a delivery arriving now); overuse is penalized by both App Review and users. Rich attachments, notification grouping/threading, `relevanceScore` ranking inside a Notification Summary, and the Apple-Intelligence-adjacent `content.updating(from:)` promotion lever are owned by `references/platform/04-system-surfaces-notifications.md`.

## Accessibility contract

None of the surfaces in this file introduce a motion obligation -- the review sheet, the system permission dialog, and a `.confirmationDialog`/`.sheet`-based feedback form are all system-presented and Reduce-Motion-safe with zero code, per the shared modal contract in `references/patterns/05-modality-sheets.md#accessibility-contract`. A hand-rolled priming screen still needs the same discipline as any other screen: every button (including "Not Now") meets the 44×44pt minimum from `references/accessibility/04-motor-interaction.md#touch-targets`, and VoiceOver reads the priming copy as ordinary static text with no special handling required.

## Anti-patterns

| Wrong | Why it fails | Right |
|---|---|---|
| `requestReview()` fired right after a crash or error alert | Associates the app with the failure, invites a one-star review | Fire only after a genuinely positive, completed moment |
| Requesting notification authorization on first launch, before onboarding | Cold context produces reflexive denial -- permanent once `.denied` | Soft-ask priming screen at point of need, or `.provisional` |
| A priming screen styled to look like the system alert | Violates App Review Guideline 2.3 / 5.1.1, reads as deceptive | Clearly app-branded copy stating the user benefit |
| Re-calling `requestAuthorization` after a `.denied` decision | Silent no-op -- the system dialog shows once per install | Deep-link to Settings via the pattern in `patterns/06-settings.md` |
| A negative sentiment answer routes nowhere (dead-end dialog) | Traps an unhappy user with no path to be heard | Route "No" to the in-app feedback sheet, never a dead end |
| Gating other app logic on whether `requestReview()` "worked" | There is no completion signal -- the system may not have shown anything | Treat the call as fire-and-forget; never branch on its outcome |

## Severity guide

CRITICAL: a permission or review prompt fired cold on first launch with no priming, burning the one-shot system dialog. HIGH: a priming screen that imitates the system alert (App Review rejection risk), or re-prompting after `.denied` instead of degrading gracefully. MEDIUM: a negative-sentiment dead end with no feedback path, or `.timeSensitive` content shipped without the matching capability. LOW: review-prompt timing that's merely suboptimal (e.g. mid-task instead of after a clean completion) but not actively hostile.

## See also

- `references/patterns/06-settings.md#deep-linking-to-system-settings` -- `openSettingsURLString`/`openNotificationSettingsURLString` mechanics this file reuses
- `references/patterns/05-modality-sheets.md#accessibility-contract` -- the shared system-presented-transition Reduce Motion contract
- `references/platform/04-system-surfaces-notifications.md` -- rich notification content, grouping, `relevanceScore`, Apple Intelligence interplay
- `references/accessibility/04-motor-interaction.md#touch-targets` -- 44×44pt minimum for any hand-rolled priming button
- `~/Claude/vault/iOS Development/12 - Platform Integration.md` -- deep source
