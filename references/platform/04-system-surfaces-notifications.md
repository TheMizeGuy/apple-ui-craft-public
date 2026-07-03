# System Surfaces: Notifications, Sharing, and Polish

> Owner: `references/platform/04-system-surfaces-notifications.md` owns notification authorization/priority/grouping/badging, rich notification content (attachments, categories, content extensions, communication notifications), transient in-app confirmations, alternate app icons + appearances, and launch screens, per the ARCHITECTURE ownership map. It does NOT own `ShareLink`/Spotlight/Quick Actions/context menus/TipKit (owner `references/platform/02-app-intents-system.md`), Dynamic Island presentation (owner `references/platform/01-widgets-live-activities.md`), `ContentUnavailableView`/`redacted` empty-and-loading states (owner `references/patterns/04-loading-empty-error.md`), or `confirmationDialog`/`alert` (owner `references/patterns/05-modality-sheets.md`) -- cite those, don't restate them.
> Floors: cite `references/_scaffolding/version-floor-registry.md` for anything version-gated. `UNNotificationInterruptionLevel` and `.provisional` are iOS 15.0+; `setBadgeCount` is iOS 16.0+; Communication Notifications require the matching capability.

A notification, a share sheet, an icon, and a launch screen are the four places your app talks to the user before they've opened a single screen -- get any of them wrong and the app feels amateur before the user has judged anything else. The single most common way this goes wrong: cold-prompting for notification permission on first launch, which trains the user to reflexively deny every future system prompt this app ever shows.

## The Apple way

- The permission dialog is a one-shot resource. Explain the value in your own UI first; fire `requestAuthorization` only after the user opts in.
- A notification's `interruptionLevel` is a promise about how much it deserves to interrupt the user -- default to `.active`, reserve `.timeSensitive` for things they'd be upset to miss in the next few minutes, and treat `.critical` as unreachable unless you're an approved safety/health app.
- Group related notifications by `threadIdentifier`, never by type; let the system compose the summary.
- Every AI-slop-adjacent "toast" you build must use a `Material`, auto-dismiss, and post a VoiceOver announcement -- nothing here is a system API, so you own all three.
- Alternate icons and appearances are a user-facing settings toggle, not a marketing surprise.

## Notification authorization and priming

Cold-prompting on launch is the single biggest permission-prompt mistake in iOS apps. Ship a soft, in-app priming screen with your own Continue/Not Now buttons; only call `requestAuthorization` when the user taps Continue -- the system shows its dialog exactly once per install, and a decline there is effectively permanent (recoverable only through Settings).

```swift
let center = UNUserNotificationCenter.current()

// Check status before deciding what to show -- never assume.
let settings = await center.notificationSettings()
switch settings.authorizationStatus {
case .notDetermined: showPriming()                 // your own explainer UI, zero system prompt yet
case .denied:        showSettingsDeepLink()         // you cannot re-prompt; route to Settings
case .authorized, .provisional, .ephemeral: break
@unknown default: break
}

// Fired only after the user opts in from your priming screen:
let granted = try await center.requestAuthorization(options: [.alert, .sound, .badge])
```

`.provisional` (iOS 12+) is the Apple-blessed way to start sending without any cold prompt at all: notifications deliver quietly to Notification Center (no banner, no sound), each carries "Keep / Turn off" management controls, and the user can promote you to prominent delivery once you've demonstrated value.

```swift
try await center.requestAuthorization(options: [.alert, .sound, .badge, .provisional])
```

Never combine `.provisional` with a subsequent cold `requestAuthorization` prompt -- the whole point is deferring the real ask until the user has engaged.

## Priority: interruptionLevel, relevanceScore, and Focus

`UNMutableNotificationContent.interruptionLevel` (`UNNotificationInterruptionLevel`, iOS 15+) is the single biggest lever a well-crafted app has over its own attention footprint:

| Level | Screen wake / sound | Breaks through Focus, Summary, mute switch | Use for |
|---|---|---|---|
| `.passive` | No | No | Low-value FYI: backup finished, digests, marketing |
| `.active` (default) | Yes | No | Ordinary useful notifications |
| `.timeSensitive` | Yes | Focus + Notification Summary only | A security code, a ride arriving, a bid expiring |
| `.critical` | Yes | Everything, including the mute switch | Life-safety only -- home security, medical alerts |

```swift
let content = UNMutableNotificationContent()
content.title = "Your ride is arriving"
content.interruptionLevel = .timeSensitive
content.relevanceScore = 1.0                        // 0.0...1.0, ranks within a group/Summary
```

`.timeSensitive` requires the **Time Sensitive Notifications** capability (adds `com.apple.developer.usernotifications.time-sensitive`); without it the level silently downgrades to `.active` -- design so the notification still reads correctly at `.active`. `.critical` requires an Apple-granted entitlement (`com.apple.developer.usernotifications.critical-alerts`) plus `.criticalAlert` user authorization; do not design around it unless you're a safety/health app that will actually be approved. `relevanceScore` only affects ranking/truncation inside a Notification Summary -- it does nothing for foreground or immediate delivery, and defaults to 0, so set it deliberately whenever you send more than one notification type.

Users assign your notifications to Focus modes; you don't control this, but only `.timeSensitive`/`.critical` break through an active Focus -- anything the user would want during Do Not Disturb needs the right level and entitlement. Abusing Time Sensitive to defeat Focus for non-urgent content is a fast way to get muted app-wide.

## Foreground presentation and grouping

By default, a notification does not banner while your app is foreground -- opt in from the delegate and decide per-notification:

```swift
func userNotificationCenter(_ c: UNUserNotificationCenter,
    willPresent n: UNNotification) async -> UNNotificationPresentationOptions {
    // Never banner a notification for content the user is already viewing.
    if n.request.content.threadIdentifier == currentlyOpenConversationID { return [] }
    return [.banner, .sound, .list]   // verified options (iOS 14+): .banner, .list, .sound, .badge
}
```

Group related notifications with the SAME `threadIdentifier` and let the system compose the summary line:

```swift
content.threadIdentifier = "conversation-\(conversationID)"   // group by conversation/order/topic
```

`content.summaryArgument` / `summaryArgumentCount` are DEPRECATED -- do not use them to hand-write the group summary; rely on `threadIdentifier` alone. Group by the thing the user thinks in terms of (a conversation, an order), never by notification type, or Notification Center becomes an unscannable pile of one-notification stacks.

## Rich notifications: attachments, categories, content extension, communication

**Categories + actions** are the cheapest win -- register once at launch, no extension required:

```swift
let reply = UNTextInputNotificationAction(identifier: "REPLY", title: "Reply",
    options: [], textInputButtonTitle: "Send", textInputPlaceholder: "Message")
let category = UNNotificationCategory(identifier: "MESSAGE",
    actions: [reply], intentIdentifiers: [], options: [.customDismissAction])
UNUserNotificationCenter.current().setNotificationCategories([category])
// content.categoryIdentifier = "MESSAGE" must match EXACTLY or actions/routing silently no-op.
```

Action `options`: `.foreground` (launches the app), `.destructive` (red), `.authenticationRequired` (forces device unlock -- set this on any action that mutates data or reveals sensitive content from the Lock Screen).

**Attachments** (image/video/audio) need a Notification Service Extension for push, since the payload only carries a URL:

```swift
// UNNotificationServiceExtension.didReceive
let best = request.content.mutableCopy() as! UNMutableNotificationContent
if let att = try? UNNotificationAttachment(identifier: "img", url: fileURL) { best.attachments = [att] }
contentHandler(best)
```

Requires APNs payload `"mutable-content": 1`. Always implement `serviceExtensionTimeWillExpire()` to call `contentHandler` with your best-so-far content -- you get roughly 30 seconds; if you never return, the system shows the ORIGINAL unmodified notification.

**Notification Content Extension** (`UNNotificationContentExtension`) renders a fully custom `UIViewController` when the user expands the notification. The system BLOCKS touch delivery to that view controller while it's on screen -- do not install gesture recognizers or expect taps inside the custom UI; interaction happens only through the category's registered action buttons.

**Communication notifications** give a message/call notification the Messages-style avatar + name treatment and promote it in Notification Center. Requires the Communication Notifications capability, donating an `INSendMessageIntent`, and decorating the content through the intent:

```swift
let sender = INPerson(personHandle: .init(value: "user-1", type: .unknown), nameComponents: nil,
    displayName: "Alex", image: INImage(named: "alex.png"), contactIdentifier: nil, customIdentifier: nil)
let intent = INSendMessageIntent(recipients: nil, outgoingMessageType: .outgoingMessageText,
    content: "Message content", speakableGroupName: nil, conversationIdentifier: "conversation-1",
    serviceName: nil, sender: sender, attachments: nil)
try await INInteraction(intent: intent, response: nil).donate()

// In the service extension, decorate THROUGH the intent so avatar/name apply:
let updated = try request.content.updating(from: intent)
contentHandler(updated)
```

For a 1:1 incoming message pass `recipients: nil` -- do not include the current user, the system infers them. `updating(from:)` throws on an invalid provider; always fall back to the un-decorated content rather than dropping the notification.

## Badging and deep-link routing on tap

```swift
try await UNUserNotificationCenter.current().setBadgeCount(unreadCount)   // iOS 16+; 0 clears
```

This replaces the deprecated `UIApplication.shared.applicationIconBadgeNumber`. The badge is a promise of "N things need you" -- clear it the moment the user has seen the items or it becomes noise they learn to ignore.

Every tap should land on the exact relevant screen, never the app's home:

```swift
func userNotificationCenter(_ c: UNUserNotificationCenter,
    didReceive response: UNNotificationResponse) async {
    let info = response.notification.request.content.userInfo
    router.open(deepLink: info["deep_link"] as? String)
}
```

## Dynamic Island and Live Activities

Owned by `references/platform/01-widgets-live-activities.md#widget-extension-for-live-activity-views` -- the `DynamicIsland` builder, expanded regions, and `ActivityContent` lifecycle live there. Nothing here duplicates it.

## Share sheet, Spotlight, Quick Actions, context menus, and TipKit

All owned by `references/platform/02-app-intents-system.md` -- cite the specific section rather than restating:

| Surface | Owner section |
|---|---|
| `ShareLink` / `SharePreview` / Share Extension | `references/platform/02-app-intents-system.md#sharelink` |
| Spotlight indexing (`NSUserActivity`, Core Spotlight) | `references/platform/02-app-intents-system.md#spotlight-indexing` |
| Quick Actions (home screen long-press) | `references/platform/02-app-intents-system.md#quick-actions-home-screen-long-press` |
| `.contextMenu` / `Menu` | `references/platform/02-app-intents-system.md#context-menus` |
| TipKit | `references/platform/02-app-intents-system.md#tipkit-ios-17` |

## Polish surfaces: transient confirmations

iOS has deliberately no system toast API -- Apple's own transient confirmations (the "Copied" HUD) are system-drawn; for your app, build one from primitives:

```swift
.overlay(alignment: .bottom) {
    if showConfirmation {
        Label("Saved", systemImage: "checkmark.circle.fill")
            .padding(.horizontal, 16).padding(.vertical, 10)
            .background(.regularMaterial, in: Capsule())          // glass Material, never a solid brand color
            .transition(.move(edge: .bottom).combined(with: .opacity))
            .task { try? await Task.sleep(for: .seconds(2)); withAnimation { showConfirmation = false } }
    }
}
.animation(.snappy, value: showConfirmation)
```

Auto-dismiss in 1.5-2.5 seconds; never require a tap to close a confirmation, and never block interaction behind it. Keep it to an icon plus 1-3 words -- it confirms, it does not explain. Prefer `safeAreaInset(edge:)` over `.overlay` when the transient element should PUSH content rather than float over it (an "offline" bar, a persistent "N selected" bar).

A silent visual overlay never reaches a VoiceOver user -- post the same confirmation as an announcement the instant you show it:

```swift
AccessibilityNotification.Announcement("Saved").post()
```

This is the single most-missed polish detail on transient confirmations; see `## Accessibility contract` below.

## Alternate app icons, appearances, and launch screens

```swift
guard UIApplication.shared.supportsAlternateIcons else { return }       // false in some Catalyst/automotive contexts
try await UIApplication.shared.setAlternateIconName("darkIcon")         // nil restores the primary icon
let current = UIApplication.shared.alternateIconName                    // nil == primary icon showing
```

Setup is build-setting driven (Primary/Alternate App Icon Sets in Build Settings), not just an asset catalog. Changing the icon shows a **system confirmation alert** the user can cancel -- treat that as a legitimate decline, not a failure to log. Ship icon switching as an explicit "Icon" section in Settings, previewed before applying -- never as a surprise triggered by in-app events.

iOS 26 app icons have four appearances: **default, dark, clear, tinted**. Keep core visual features consistent across all four -- swapping elements between variants breaks recognizability when the user switches Home Screen appearance; dark should read more subdued than default, clear/tinted more subtle still. Each alternate icon set needs its own four variants -- it does not inherit the primary icon's. Design layers in Icon Composer (bundled with Xcode 26+), which exposes Liquid Glass group-level effects (specular highlights, refraction, translucency) a flat PNG stack cannot express.

A launch screen exists to make the app feel fast and ready, never as a branding canvas -- it should be nearly identical to the first screen of the app, with no text (localization breaks it) and no logo unless the logo is a permanent fixture of that first screen. A genuine branded moment belongs at the start of onboarding, not on the launch screen. Restore previous app state on relaunch wherever possible -- see `references/platform/09-scene-lifecycle.md` for restoration mechanics.

## Availability + fallbacks

```swift
// interruptionLevel/.provisional/setBadgeCount are all pre-26; nothing here needs an #available gate
// against the file's own floor. Communication Notifications need the capability, not a code branch:
if let updated = try? request.content.updating(from: intent) {
    contentHandler(updated)
} else {
    contentHandler(request.content)   // never drop the notification on a decoration failure
}
```

## Accessibility contract

Every transient confirmation you draw needs a matching `AccessibilityNotification.Announcement` posted the instant it appears -- a visual-only toast is invisible to VoiceOver. Notification action titles and category identifiers must be meaningful strings, never bare icons (confirmationDialog-style button-content rules are owned by `references/patterns/05-modality-sheets.md`, but the same "Text-labels-only, no bare glyph" instinct applies to notification actions). This file has no looping motion of its own to gate; the transient-overlay example above uses a one-shot `.transition`, not a repeating effect, so the Reduce Motion double-gate (owner `references/accessibility/05-motion-accessibility.md`) does not apply here -- keep the 0.15-0.2s appear/dismiss animation regardless of Reduce Motion, since it is a state change, not decorative motion.

## Anti-patterns

| Wrong | Why it fails | Right |
|---|---|---|
| Calling `requestAuthorization` on first launch | Cold prompts get reflexively denied; denial is effectively permanent | Prime in-app first, or start with `.provisional` |
| `content.summaryArgument` to customize a group summary | Deprecated; ignored on current OS | Set `threadIdentifier`, let the system compose the summary |
| Marking every notification `.timeSensitive` "to be safe" | Focus-breakthrough abuse gets the app muted app-wide | Reserve it for genuinely urgent, per-user content |
| Gesture recognizers inside a `UNNotificationContentExtension` view | The system blocks touch delivery to it while shown | Interaction only through registered category actions |
| Inline base64 image in the push payload for a rich notification | APNs 4KB payload limit | Service extension downloads via `mutable-content: 1` |
| A visual-only "Saved" toast | Invisible to VoiceOver | Pair with `AccessibilityNotification.Announcement` |
| Alternate icon swap triggered automatically by an in-app event | Surprises the user; Apple discourages coercive icon changes | Explicit, previewed "Icon" setting |
| Logo/branding/text on the launch screen | Breaks localization; feels like a splash ad, not a fast app | Match the real first screen; branding moves to onboarding |

## Severity guide

CRITICAL: a push carrying sensitive content ships with no Notification Service Extension decryption path, or a notification action mutates data without `.authenticationRequired` from the Lock Screen. HIGH: cold `requestAuthorization` on launch with no priming; `.critical` used without the entitlement (silently no-ops, but signals a design that assumes it works). MEDIUM: `threadIdentifier` missing or per-notification-unique (Notification Center turns into an unscannable list); badge never cleared. LOW: a transient confirmation with no VoiceOver announcement. NIT: alternate icon set shipped with only one appearance variant designed.

## See also

- `references/platform/01-widgets-live-activities.md#widget-extension-for-live-activity-views` -- Dynamic Island and Live Activity presentation (owner)
- `references/platform/02-app-intents-system.md#sharelink` -- `ShareLink`, `SharePreview`, Share Extension (owner)
- `references/platform/02-app-intents-system.md#spotlight-indexing` -- Core Spotlight and `NSUserActivity` (owner)
- `references/platform/09-scene-lifecycle.md` -- state restoration on relaunch, referenced from the launch-screen guidance above
- `references/patterns/05-modality-sheets.md#confirmation-dialogs` -- `confirmationDialog` vs `.alert` (owner)
- `references/patterns/04-loading-empty-error.md` -- `ContentUnavailableView` and `redacted` loading skeletons (owner)
- `references/accessibility/05-motion-accessibility.md` -- Reduce Motion double-gate for any looping polish animation (owner)
- `~/Claude/vault/iOS Development/` -- deep UserNotifications/UNNotificationContentExtension source material
