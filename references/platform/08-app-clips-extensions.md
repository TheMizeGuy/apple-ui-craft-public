# App Clips and App Extensions

> Owner: `references/platform/08-app-clips-extensions.md` owns App Clip UI (card, invocation, size budget, ephemeral experience, upgrade-to-full-app) and app-extension UI craft (Share/Action extensions, custom keyboards, Safari Web Extensions, Notification Content Extensions). `references/performance/03-launch-memory-instruments.md` (Memory: `phys_footprint`, jetsam, and images) owns the extension process-memory ceiling numbers this file cites, not restates. `references/platform/04-system-surfaces-notifications.md#rich-notifications-attachments-categories-content-extension-communication` owns general notification design; this file owns the Notification Content Extension's own view-controller implementation. `references/patterns/08-paywall-storekit-applepay.md` owns the Apple Pay button API this file only invokes.
> Floors: mostly pre-iOS-26 UIKit/PassKit/ExtensionKit APIs -- cite `references/_scaffolding/version-floor-registry.md` per API; Liquid Glass inheritance is `#ios-26x`.

App Clips and app extensions all run **outside your main app's process**, embedded in someone else's flow -- Safari, Photos, the lock screen, a physical scan. That shared reality dictates a shared craft discipline: one focused task, inherited system chrome, a finite lifecycle, and no assumption of durable state or a shared process with the containing app.

## The Apple way

- Do one focused thing, confirm it, and get out. If an interaction needs more than one screen, deep-link into the full app rather than growing the extension.
- Standard system components (`NavigationStack`, `.toolbar`, `.sheet`, the App Clip card, `SKOverlay`, the notification shell, the Safari popup sheet) render in Liquid Glass automatically under the iOS 26 SDK -- inherit it, never hand-roll translucency.
- The only shared channel between an extension/clip and the containing app is an **App Group** (`UserDefaults(suiteName:)`, a shared container) plus a Keychain shared access group for credentials. There is no other process bridge.
- Most extensions (keyboards, Safari extensions, content blockers) cannot be enabled programmatically -- the containing app must onboard with a clear, illustrated setup guide.

## Surface selection

| You want to... | Surface | UI framework |
|---|---|---|
| Let a stranger complete one task without installing | **App Clip** | SwiftUI/UIKit, under 50 MB |
| Send content out to your service from any app | **Share extension** | `SLComposeServiceViewController` or SwiftUI |
| Transform or act on content in place, maybe return it | **Action extension** | UIKit/SwiftUI, or UI-less |
| Replace typing system-wide | **Custom keyboard** | `UIInputViewController` |
| Extend Safari (button, popup, page UI) | **Safari Web Extension** | HTML/CSS/JS + native handler |
| Silently block content in Safari | **Content Blocker** | JSON rules, no UI |
| Custom expanded-notification UI | **Notification Content Extension** | `UIViewController` + `UNNotificationContentExtension` |
| Modify a push before delivery (decrypt, attach media) | **Notification Service Extension** | no UI |
| Home/lock-screen glanceable content | **Widget** | `references/platform/01-widgets-live-activities.md` |

If the interaction needs more than one focused screen, deep-link into the full app instead of building a bigger extension.

## Cross-cutting constraints

1. **Separate process, tight memory.** Extensions get a fraction of a full app's budget and are killed aggressively -- keep view hierarchies shallow, defer heavy work, stream large media instead of loading it whole. Exact per-process ceilings are `references/performance/03-launch-memory-instruments.md`'s memory table (community-observed, not a published contract).
2. **No direct access to the host or the main app.** App Group + shared Keychain only -- design every hand-off (App Clip to full app, keyboard to containing app, blocker config to blocker) around this.
3. **Finite lifecycle -- always terminate cleanly.** Every extension path must call `extensionContext.completeRequest`/`cancelRequest`; App Clip data is purged after roughly 30 days idle. Never imply durable state you do not own.
4. **Accessibility is not free in custom views.** Keyboards and notification UIs are custom-drawn -- add `accessibilityLabel`/traits explicitly or VoiceOver users get nothing.

## App Clip card & invocation

The user's first impression is not your UI -- it is the **App Clip card**, a system-rendered sheet that slides up before any of your code runs. You configure it in App Store Connect (default experience) or per-URL (Advanced App Clip Experiences, up to 10), not in code.

| Slot | Constraint | Craft rule |
|---|---|---|
| Header image | 3000x2000 px (3:2), no baked-in text/logos, no transparency | Show the place or object, not your brand -- a photo of the actual counter/scooter/menu builds trust |
| Title | App name, fixed | Keep it short and legible |
| Subtitle | About 2 lines, plain text | Outcome language: "Order ahead, skip the line", not "Welcome to our app" |
| Action verb | Fixed enum: Open, View, Play | Match the outcome -- Open for a task, View for content, Play for media |

App Clip Codes must be 1 inch (25 mm) or larger to scan reliably. Parse the invocation URL and render the task-specific screen immediately -- never show a generic launch screen and fetch after:

```swift
WindowGroup {
    ClipRootView()
        .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { activity in
            guard let url = activity.webpageURL,
                  let payload = activity.appClipActivationPayload else { return }
            let storeID = url.pathComponents.last ?? ""
            Task { await confirmAndLoad(storeID: storeID, payload: payload) }
        }
}
```

For physical invocations, confirm location silently -- `APActivationPayload.confirmAcquired(in:)` (`AppClip` framework) checks against a registered `CLRegion` with no visible permission prompt:

```swift
do {
    try await payload.confirmAcquired(in: region)
    state = .readyToOrder(storeID)          // trusted: show the order UI
} catch {
    state = .genericMenu                    // fall back gracefully, never an error wall
}
```

## Ephemeral experience and size budget

| Invocation type | Uncompressed budget |
|---|---|
| Physical (App Clip Code, NFC, QR) | 15 MB |
| Digital (Safari banner, Messages, Maps, App Store, links) | 50 MB (iOS 17+) |

Design to the 15 MB physical ceiling if any physical invocation exists -- the same binary serves both. Prefer SF Symbols over bundled images (free, scale with Dynamic Type, adapt to Liquid Glass tinting), gate heavy SDKs with `#if !APPCLIP`, and defer imagery over the network after the first frame:

```swift
AsyncImage(url: item.imageURL) { image in
    image.resizable().aspectRatio(contentMode: .fill)
} placeholder: {
    RoundedRectangle(cornerRadius: 12).fill(.quaternary)
}
```

The user has no account and no history -- every wall between the scan and the outcome loses people. No onboarding, no tour. Defer or eliminate sign-in: **Sign in with Apple** (`references/patterns/09-auth-account.md#sign-in-with-apple-label-style-placement`) is the only acceptable account step, and only when genuinely required. Use the native payment and identity buttons -- `PayWithApplePayButton` (`references/patterns/08-paywall-storekit-applepay.md#paywithapplepaybutton-swiftui-module-passkit-ios-160`) is one-tap, requires no typed credentials, and is exactly what App Clips are optimized for; a custom credit-card form is slow, untrusted, and often over the size budget. Pre-fill from the invocation URL; one primary action per screen; show the merchant name, exact item, and price before the commit action -- the user has zero relationship with you, so transparency substitutes for trust.

## Upgrade-to-full-app UX

Two Apple-native surfaces drive the upgrade, and both are secondary offers that must never block or precede the task.

**`SKOverlay`** -- a system-rendered banner previewing the full app with a one-tap Get/Install that preserves the clip's state via the shared App Group:

```swift
.appStoreOverlay(isPresented: $showFullApp) {
    SKOverlay.AppClipConfiguration(position: .bottom)
}
.onAppear { showFullApp = true }   // present on the confirmation/success screen, not on launch
```

Persist essential context to the App Group **before** presenting the overlay -- `SKOverlay` does not carry in-memory state:

```swift
let shared = UserDefaults(suiteName: "group.com.example.shared")
shared?.set(order.id.uuidString, forKey: "pendingOrderID")
```

Rules: `position: .bottom` only, dismissible, never re-presented more than once per session; the receipt/confirmation must be fully usable with the overlay dismissed.

**Ephemeral notifications** -- request `.ephemeral` authorization for an 8-hour, no-permission-prompt window tied to `NSAppClipRequestEphemeralUserNotification = true` in Info.plist. Use only for task-completion follow-ups scoped to the current session (order status, arrival, expiry) -- never marketing; abusing the window is a fast path to rejection and clip removal.

## Share & Action extensions

| | Share extension | Action extension |
|---|---|---|
| Entry | Top row of the share sheet | Bottom row (action list), or UI-less |
| Job | Send/post content out to your service | Act on the content, optionally returning it |
| Returns content? | No -- fire-and-forget | Optionally, e.g. an edited image back to the host |

Build the Share UI with the classic `SLComposeServiceViewController` (system-styled compose sheet, free) or custom SwiftUI hosted via `UIHostingController` when richer branding is needed -- a standard `NavigationStack` + `.toolbar` still renders in Liquid Glass automatically:

```swift
class ShareViewController: SLComposeServiceViewController {
    override func isContentValid() -> Bool { !(contentText?.isEmpty ?? true) }
    override func didSelectPost() {
        Task {
            await Backend.post(contentText ?? "", attachments: extensionContext?.inputItems ?? [])
            extensionContext?.completeRequest(returningItems: nil)   // ALWAYS complete
        }
    }
}
```

Every path out must call exactly one of `extensionContext?.completeRequest(returningItems:completionHandler:)` (success -- Action extensions return edited `NSExtensionItem`s here) or `cancelRequest(withError:)`. Forgetting this strands the host's share sheet and leaks the process. Kick off uploads with a background `URLSession` and complete immediately -- do not hold the sheet open while a large upload finishes. `NSExtensionActivationRule` in Info.plist decides when you even appear; declare the narrowest supported types your icon/UI actually handles.

Craft: single focused task, no tab bars or wizards; preview the content being acted on; pre-fill smartly (default account, default album); fast dismissal with optimistic success; semantic colors and Dynamic Type since the extension appears over arbitrary hosts; no sign-in walls -- show a compact "Open App to sign in" affordance instead.

## Custom keyboard

The highest UI-craft bar of any extension -- it replaces the system keyboard everywhere. Two mandatory affordances:

1. **The globe key.** Honor `needsInputModeSwitchKey`; wire a tap to `advanceToNextInputMode()` and a long-press to `handleInputModeList(from:with:)`. Omitting it is an automatic rejection.
2. **A correct, consistent height** matching the stock keyboard's proportions (roughly 216-260 pt portrait, plus the suggestion bar) -- never jump height between fields.

Read `textDocumentProxy`'s traits and honor them: `keyboardAppearance` for light/dark key colors, `returnKeyType` to relabel Go/Search/Send/Done, `keyboardType` for the matching layout. `RequestsOpenAccess = YES` in Info.plist gates network, App Group data, and haptic key feedback -- without it the keyboard is sandboxed to on-device, no-network typing, and the request itself shows the user a scary transmit-everything-you-type warning. Degrade gracefully without Full Access; request it only for features that genuinely need it. Every key is a custom view -- give each an `accessibilityLabel` and `.keyboardKey` trait (`references/accessibility/01-voiceover-fundamentals.md#accessibility-labels`) or VoiceOver users get nothing. The containing app cannot enable the keyboard programmatically; ship an illustrated Settings guide.

## Safari Web Extension & Content Blocker

Safari Web Extensions are standard web-platform extensions (Manifest V3) with HTML/CSS/JS UI, not SwiftUI -- the craft problem is making web UI feel native. On iOS 26 the popup sits inside Safari's Liquid Glass sheet:

```css
:root { color-scheme: light dark; }
body {
  font: -apple-system, system-ui, sans-serif;
  padding: max(12px, env(safe-area-inset-top)) 16px env(safe-area-inset-bottom);
  background: Canvas; color: CanvasText;      /* system-adaptive */
}
button { min-height: 44px; border-radius: 12px; }
```

Bridge to native for anything the web layer cannot do -- `SafariWebExtensionHandler` (`NSExtensionRequestHandling`) answers `browser.runtime.sendNativeMessage(...)` calls via `SFExtensionMessageKey`. Keep the popup's first paint instant with cached state, then reconcile with the native reply asynchronously. Extensions ask for per-site or all-sites access at runtime -- the containing app must onboard with an illustrated "how to turn this on" guide, since there is no programmatic enable path, and the popup should handle the not-yet-granted state gracefully rather than showing a blank UI.

A **Content Blocker** ships a JSON rules file (capped at 150,000 rules) with **no runtime UI at all** -- every user-facing control (rule-category toggles, whitelist management) lives in the containing SwiftUI app, which writes the active rule set to a shared App Group and calls `SFContentBlockerManager.reloadContentBlocker(withIdentifier:)`.

## Notification Content Extension

A `UNNotificationContentExtension` supplies custom UI for an *expanded* notification -- distinct from the UI-less `UNNotificationServiceExtension`, which only mutates the payload before delivery. Three Info.plist keys control frame and default chrome: `UNNotificationExtensionCategory` (matches your `UNNotificationCategory` id), `UNNotificationExtensionInitialContentSizeRatio` (height as a ratio of width), and `UNNotificationExtensionDefaultContentHidden` (`true` only if the custom UI already re-presents title/body).

```swift
func didReceive(_ notification: UNNotification) {
    let content = notification.request.content
    titleLabel.text = content.title
    if let att = content.attachments.first, att.url.startAccessingSecurityScopedResource() {
        mediaImageView.image = UIImage(contentsOfFile: att.url.path)
        att.url.stopAccessingSecurityScopedResource()
    }
}
```

Handle in-place `UNNotificationAction` taps and return a `UNNotificationContentExtensionResponseOption` (`.dismissAndForwardAction`, `.doNotDismiss`, `.dismiss`) so the user can act without opening the app. Let the *service* extension do heavy lifting -- attachment downloads belong pre-delivery; the content extension renders already-local assets fast and never blocks on a network fetch. Glanceable, fixed frame: one image/map, one line of context, up to a couple of actions -- everything must read in half a second, since the user is often on the lock screen. See `references/platform/04-system-surfaces-notifications.md#rich-notifications-attachments-categories-content-extension-communication` for the broader notification-design picture this extension slots into.

## Accessibility contract

Custom-drawn surfaces (keyboards, notification content extensions, hand-rolled App Clip screens) carry no accessibility for free -- add `accessibilityLabel`/traits explicitly. Every extension and App Clip screen uses semantic colors (`Color(.systemBackground)`, `.primary`) and Dynamic Type (`.font(.body)`) everywhere, since the UI appears over arbitrary host apps, wallpapers, and color schemes -- never hardcode a light background or a fixed point size. None of these surfaces ship looping symbol/Phase/Keyframe animation in the corpus reviewed here; if one is added, gate it manually per `references/patterns/01-gotchas-anti-patterns.md#looping-symbol-effects-are-never-auto-gated` -- the system never auto-gates a looping effect.

## Anti-patterns

| Wrong | Why it fails | Right |
|---|---|---|
| Treating an extension like a mini-app | Memory kills, sluggish, over budget | One focused task; deep-link for more |
| Reaching for the main app's singletons | No shared process | App Group + shared Keychain only |
| Hand-rolled translucent "glass" | Misses the iOS 26 material, wastes budget | Inherit via system components |
| Login wall before the App Clip task | Kills the instant-experience promise | Anonymous-first; Sign in with Apple only if required |
| `SKOverlay` on launch or the first screen | Blocks the task, feels like an ad | Present on the success/confirmation screen |
| Custom "Download our app" banner | Loses state, non-native, violates guidelines | `SKOverlay` |
| Ephemeral notifications used for promos | Rejection, user removes the clip | Task-completion follow-ups only |
| Forgetting `completeRequest`/`cancelRequest` | Sheet hangs, process leaks | Exactly one terminal call on every path out |
| No globe / next-keyboard key | Automatic rejection, user trapped | Honor `needsInputModeSwitchKey` + `handleInputModeList` |
| Downloading media inside a notification content extension | Slow or blank expanded view | Fetch in the service extension, pre-delivery |
| No setup onboarding in the containing app | Users cannot find how to enable the extension | Illustrated guide + link to Settings |

## Severity guide

- **CRITICAL**: an extension that never calls a terminal lifecycle method (stranded host sheet, leaked process), or an App Clip that blows the size budget for its invocation type.
- **HIGH**: a login/payment wall before the App Clip's single task, a missing globe key on a custom keyboard, or `SKOverlay` presented before task completion.
- **MEDIUM**: hand-rolled translucency that misses Liquid Glass, or accessibility labels missing on a fully custom-drawn surface (keyboard keys, notification content extension controls).
- **LOW**: an extension icon/UI mismatched to its declared `NSExtensionActivationRule` types, or a missed opportunity to use a native payment/identity button over a custom form.

## See also

- `references/performance/03-launch-memory-instruments.md` -- extension process-memory ceilings (Memory: `phys_footprint`, jetsam, and images)
- `references/platform/04-system-surfaces-notifications.md#rich-notifications-attachments-categories-content-extension-communication` -- notification design this extension implements
- `references/patterns/08-paywall-storekit-applepay.md` -- the Apple Pay button and Wallet-pass API App Clips invoke
- `references/patterns/09-auth-account.md#sign-in-with-apple-label-style-placement` -- the one acceptable App Clip account step
- `references/design/02-liquid-glass.md` -- the material every system-owned sheet in this file inherits
- `references/design/07-navigation-patterns.md#deep-linking` -- routing from a clip/extension into the full app
- `references/accessibility/01-voiceover-fundamentals.md#accessibility-labels` -- labeling custom-drawn keyboard and notification UI
- `references/platform/01-widgets-live-activities.md` -- the ongoing-event counterpart to a one-shot App Clip task
- `references/platform/02-app-intents-system.md` -- App Clips can donate App Intents / `NSUserActivity` for Spotlight and Handoff
