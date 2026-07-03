# Scene Lifecycle and State Restoration

> Owner: `references/platform/09-scene-lifecycle.md` owns `Scene`/`WindowGroup` lifecycle, `\.scenePhase` semantics, `@SceneStorage` vs `@AppStorage` restoration state, and the cold/warm-launch UX contract, per the ARCHITECTURE ownership map. Deep-link routing mechanics (`onOpenURL`, `NavigationPath` decoding) are owned by `references/design/07-navigation-patterns.md#deep-linking` -- this file states only the precedence rule between a deep link and restored state. Scroll-list rendering cost is owned by `references/performance/02-scroll-list-performance.md`; this file covers only restoring the scroll position across launches. Privacy-cover material choice is owned by `references/design/02-liquid-glass.md`; background-safe extension intents by `references/platform/03-controls-standby.md#core-apis`.
> Floors: `\.scenePhase` and `@SceneStorage` = iOS 14.0+. `restorationBehavior(_:)` modifier + `.automatic` = iOS 18.0+/iPadOS 18.0+/macOS 15.0+/visionOS 2.0+. `SceneRestorationBehavior.disabled` specifically = **macOS 15.0+ / visionOS 26.0+ ONLY** -- see `references/_scaffolding/version-floor-registry.md#not-ios-the-1-mis-gate-class`; there is no iOS/iPadOS lever to disable restoration via this API.

A returning user should land back exactly where they left off, with no visible "the app rebuilt itself" flicker -- that single sentence is the entire craft goal of this file. The most common way it goes wrong: writing restoration state inside the `.background` `scenePhase` closure, which runs AFTER the system has already snapshotted your `@SceneStorage` payload for the next cold launch, so the write silently never round-trips.

## The Apple way

- Only cold launch after termination needs restoration work. A warm resume from the background has the whole view hierarchy intact in memory -- running restoration/decode logic there is wasted work that can visibly reset live scroll position or selection.
- Persist restoration-critical state on `.inactive`, not `.background` -- the system captures the `@SceneStorage` payload while the scene passes through `.inactive`, before `.background` ever fires.
- `@SceneStorage` is per-scene/per-window and ephemeral (wiped by swipe-to-kill); `@AppStorage` is process-global and durable. Picking the wrong one is a real, shipped bug class.
- A `WindowGroup` can be instantiated more than once (iPad Stage Manager, multiwindow, macOS) -- every `@State` you declare at `App`/`Scene` scope answers the question "if the user opens a second window, should this be shared or duplicated?"
- Restore state BEFORE first paint, not in `onAppear` -- one default frame has already painted by the time `onAppear` runs.

## scenePhase: three phases and where you read them

`@Environment(\.scenePhase)` yields exactly three cases: `.active`, `.inactive`, `.background`. Transitions are ordered and not skipped in the normal path: going down `active → inactive → background`; coming up `background → inactive → active`. `.inactive` is a transient state entered on: app-switcher, Control Center/Notification Center pull-down, an incoming call/Siri overlay, and every crossing into or out of `.background`.

The value means something different depending on WHERE you read it:

- **On the `App`**: aggregated across every connected scene. It only reports `.background` when ALL of the app's scenes are backgrounded -- with two windows open (iPad Stage Manager/macOS) and one backgrounded, the app-level phase stays `.active`.
- **On a `View`/`Scene` inside a `WindowGroup`**: scoped to THAT scene -- the correct granularity for per-window privacy blur and per-scene persistence.

```swift
@main
struct MyApp: App {
    @Environment(\.scenePhase) private var scenePhase
    @State private var store = AppStore()

    var body: some Scene {
        WindowGroup { RootView().environment(store) }
            .onChange(of: scenePhase) { _, newPhase in
                switch newPhase {
                case .active:     store.resumeSync()
                case .inactive:   store.flushRestorationState()   // PRIMARY persist point -- see barrier below
                case .background: store.releaseResources()         // fallback persist + teardown
                @unknown default: break
                }
            }
    }
}
```

## The restoration timing barrier (the single most important lifecycle fact)

UIKit captures each scene's `@SceneStorage` restoration payload while the scene passes through `.inactive` -- NOT at `.background`. Any `@SceneStorage` write posted only inside the `newPhase == .background` branch runs AFTER that capture; it succeeds in memory, but the NEXT cold launch restores the payload snapshotted at `.inactive`, which still holds the pre-write value.

A `@SceneStorage("selectedTab") String` restores correctly because it's written eagerly on every tab change, well before the barrier; a `@SceneStorage("navPath") Data?` blob written only in the `.background` closure restores empty. Same view, same mechanism -- the only difference is which side of the barrier the write lands on.

**Rule:** persist restoration-critical state on `.inactive` as the PRIMARY trigger. Keep `.background` as a fallback only for rare hardware-power paths that can skip `.inactive` (an abrupt lock). Never rely on `.background` alone for anything that must survive a cold launch, and never do persistence work in the `.active` branch -- every foreground tick would re-encode state the in-memory model already owns, pure waste with zero restoration benefit.

## @SceneStorage vs @AppStorage -- the plist-type trap

| | `@SceneStorage` | `@AppStorage` |
|---|---|---|
| Backing store | Per-scene state-restoration payload (a `PropertyListCoder` blob owned by UIKit scene restoration) | `UserDefaults` (`.standard` by default; pass a suite name for an App Group) |
| Scope | Automatically per-scene/per-window -- two windows of the same `WindowGroup` get independent values | Global to the app process; every scene, and any extension sharing the suite, reads the same value |
| Lifetime | Ephemeral: tied to the scene's restoration identity, wiped by swipe-to-kill, not guaranteed across OS updates | Durable until explicitly changed or the app is deleted |
| Right for | Transient UI position: selected tab, expanded section, scroll position, current detail selection | Genuine preferences: theme, units, sort order, onboarding-seen flag, feature toggles |

The design rule: if a value should differ between two side-by-side windows, it's `@SceneStorage`. If it must be identical everywhere and survive a full swipe-to-kill, it's `@AppStorage`.

`@SceneStorage`'s top-level value MUST be a property-list type (`String`, `Int`, `Double`, `Bool`, `Data`, `URL`, `Date`, or an optional of those) -- it is NOT a general `Codable` store. The most common mistake is trying to store a `NavigationPath` or a route array directly; pre-encode to `Data`:

```swift
@SceneStorage("navPathData") private var navPathData: Data?

func persist(_ path: NavigationPath) {
    guard let codable = path.codable else { return }   // nil if ANY pushed value isn't Codable
    navPathData = try? JSONEncoder().encode(codable)
}
func restoreNavigationPath() -> NavigationPath {
    guard let data = navPathData,
          let codable = try? JSONDecoder().decode(NavigationPath.CodableRepresentation.self, from: data)
    else { return NavigationPath() }
    return NavigationPath(codable)
}
```

`path.codable` returns `nil` (not an error) if any value currently on the stack isn't `Codable` -- a single non-`Codable` route silently disables restoration for the whole path. Constrain your route enum to `Codable & Hashable` and test the round-trip.

For a widget/Control/Live Activity intent that must read or write the same preference the app observes, use an explicit App Group suite (`@AppStorage("key", store: UserDefaults(suiteName: "group.com.app")!)`) -- `.standard` is not shared with extension processes.

## Scene scoping and the ownership rule

A `WindowGroup` can be instantiated more than once -- iPad Stage Manager, iPadOS multiwindow, and macOS all let the user open a second window of the same group. Every `@State` you declare on an `App`/`Scene` conformer answers one design question: **if the user opens a second window, should this be shared or duplicated?** If "duplicated," it must live INSIDE the `WindowGroup` content (or a scene-root wrapper), never on the `App` struct.

| Scene-scoped (inside `WindowGroup` content) | App-scoped (on `@main App`) |
|---|---|
| A navigation router, per-tab `NavigationPath` | Auth session / shared token store |
| `@SceneStorage`-driven UI (selected tab, scroll position, selection) | `@UIApplicationDelegateAdaptor` (app-lifecycle, never scene) |
| Per-scene sheet presentation | Shared caches, `URLSession` instances |
| `onOpenURL`/`onContinueUserActivity` handler closures | Anything that must not duplicate per-window |

A router declared at `App` level while `@SceneStorage` writes per-scene keys produces a real, confusing bug: every scene reads/writes the SAME shared router while each window's restoration state diverges -- every window restores the wrong path, and it looks like the persistence code is broken when the actual defect is ownership scope. Diagnose scope FIRST; the encode/decode path is usually fine.

## restorationBehavior and defaultLaunchBehavior

`restorationBehavior(_:)` takes a `SceneRestorationBehavior`. The modifier itself and its `.automatic` case (platform decides) are iOS 18.0+/iPadOS 18.0+/macOS 15.0+/visionOS 2.0+. **`.disabled` is macOS 15.0+ / visionOS 26.0+ ONLY -- it does not exist on iOS or iPadOS.** On iOS there is no direct API lever to opt a scene out of restoration; the practical lever is whether the scene populates any `@SceneStorage`/restorable state at all -- a scene with nothing persisted simply has nothing to restore.

```swift
@main
struct MyApp: App {
    var body: some Scene {
        WindowGroup { ContentView() }               // restores automatically on iOS

        #if os(macOS) || os(visionOS)
        Window(id: "network-test", "Network Test") { NetworkTestView() }
            .restorationBehavior(.disabled)          // macOS/visionOS ONLY -- never restored, always fresh
        #endif
    }
}
```

`defaultLaunchBehavior(_:)` takes a `SceneLaunchBehavior`: `.presented` forces a scene to show on a fresh launch with no previously-restored scenes (a welcome window); `.suppressed` keeps a secondary window from auto-presenting on relaunch. `SceneLaunchBehavior.suppressed` is documented macOS 15.0+/visionOS 2.0+ -- a multi-window-platform concern, not a general iPhone tool; on iPhone the primary `WindowGroup`'s restoration is automatic and this modifier rarely applies.

`handlesExternalEvents(preferring:allowing:)` lets an already-open scene claim an incoming URL/activity instead of the system spawning a new window -- relevant on iPad/Mac to avoid duplicate windows when a deep link arrives while a matching window is already open.

## Cold launch UX: avoiding the restoration flash

Three ways an app comes back, each implying different UI:

| Return type | What survived | UI expectation |
|---|---|---|
| Warm resume from background | Whole process + view hierarchy in memory | Instant, unchanged screen. Refresh only time-sensitive data on `.active` -- no restoration work, the views never left |
| Cold launch after termination | Only persisted `@SceneStorage`/files | Rebuild UI, then restore tab + nav path + scroll position so it LOOKS like the user never left |
| Fresh install / swipe-to-kill then relaunch | `@SceneStorage` is wiped | Land on the default/home screen -- do not try to restore a screen the user explicitly dismissed |

The classic bug: the app cold-launches, renders the DEFAULT screen (tab 0, empty nav stack, top of list), THEN a frame later applies the restored state -- a jarring jump from home to the deep screen the user was actually on. Two fixes: restore state BEFORE first paint by initializing scene-scoped state from `@SceneStorage` in the `init` of your scene-root model, not in `onAppear` (one default frame has already painted by then); and where restored content needs an async re-fetch, show the restored LAYOUT immediately under `.redacted(reason: .placeholder)` rather than a spinner on a blank screen -- it reads as "your screen, loading," not "app starting over."

iOS may prewarm your app ahead of an actual user launch, running `App.init`/early bootstrap with no guarantee of a subsequent foregrounding. Never put user-visible side effects (analytics "app opened," a sound, marking content seen) in `init` -- gate those on the FIRST `.active` `scenePhase` transition instead, so a prewarm that never becomes a real launch leaves no observable trace.

## Deep links vs. restored state

Deep-link mechanics -- `onOpenURL`, routing, `NavigationPath` decoding -- are owned by `references/design/07-navigation-patterns.md#deep-linking`; this file states only the precedence rule: an explicit incoming deep link or user activity represents the user's CURRENT intent and takes precedence over whatever was restored from the prior session. Apply restored state first (so the app doesn't flash to a default screen), then let the deep-link handler override the destination if one arrives -- never let stale restored state clobber a URL the user (or a notification tap) just asked for.

## Background execution's UI consequence

`.backgroundTask(_:action:)` is a `Scene` modifier (attach to `WindowGroup`, not a view) that runs an async closure when the system grants background time, paired with `BackgroundTask.appRefresh("id")`. The payoff is UI, not just data: the closure updates your PERSISTED model, so the next foreground shows current content with no loading spinner. It's discretionary -- the system decides when to grant it on its own cadence -- so the foreground path must still tolerate stale data regardless. `beginBackgroundTask(withName:)` covers the different case of a brief (~30s) extension to finish foreground-style work (flush restoration state to disk, complete an in-flight upload) as the scene suspends; always end it in BOTH the completion and the expiration handler, or the watchdog kills the app.

Related surfaces: Live Activities carry a `staleDate` on `ActivityContent` so the system greys out obviously-old data instead of showing a confidently-wrong value (owner `references/platform/01-widgets-live-activities.md`); an `AppIntent` invoked from a widget/Control/Action Button runs in an EXTENSION with no foreground view hierarchy -- background-safe, idempotent, no `@State` reliance (owner `references/platform/03-controls-standby.md#core-apis`).

## Privacy: covering the app-switcher snapshot at the right phase

The system captures a bitmap of your UI as the scene deactivates, for the App Switcher and the background/foreground transition animation -- to guarantee a privacy cover is IN that snapshot, it must already be on screen before the snapshot fires, which means the cover goes up on `.inactive`, not `.background`; waiting for `.background` is the same too-late barrier problem as restoration state.

```swift
struct PrivacyCoverModifier: ViewModifier {
    @Environment(\.scenePhase) private var scenePhase
    let isProtected: Bool

    private var isObscured: Bool { isProtected && scenePhase != .active }   // covers BOTH inactive and background

    func body(content: Content) -> some View {
        content.overlay {
            if isObscured {
                Rectangle().fill(.ultraThinMaterial).ignoresSafeArea()      // material choice: design/02, owner
                    .transition(.opacity)
            }
        }
        .animation(.easeInOut(duration: 0.15), value: isObscured)          // near-instant -- a slow fade can be caught mid-transition
    }
}
```

Apply once at the scene root, not per-screen, so no sensitive view is ever missed. A light translucent blur is NOT sufficient for genuinely secret text (SSNs, seed phrases) -- use an opaque cover. `.privacySensitive()` on specific subviews is a defense-in-depth layer; the scene-root overlay above is the reliable app-switcher-snapshot mechanism.

## Availability + fallbacks

```swift
// restorationBehavior(_:)/.automatic need no fallback (iOS 18.0+ floor, plugin targets iOS 18+ throughout).
// .disabled itself has no iOS/iPadOS equivalent -- there is nothing to gate; simply don't offer a toggle there.
#if os(macOS) || os(visionOS)
if #available(macOS 15, visionOS 26, *) {
    scene.restorationBehavior(.disabled)
}
#endif
```

## Accessibility contract

None of the primitives in this file animate on a loop -- the privacy-cover fade and any restored-content reveal are one-shot state transitions, not decorative motion, so the Reduce Motion double-gate owned by `references/accessibility/05-motion-accessibility.md` does not apply to them directly; keep both near-instant (0.15-0.2s) regardless of the Reduce Motion setting. A `.redacted(reason: .placeholder)` skeleton shown while restored content re-fetches is itself accessible to VoiceOver (it reads as a legible loading state) -- prefer it over a bare spinner for exactly that reason, matching the loading-state guidance owned by `references/patterns/04-loading-empty-error.md`.

## Anti-patterns

| Wrong | Why it fails | Right |
|---|---|---|
| `@SceneStorage` write only in the `.background` branch | Runs after the system's `.inactive` capture; next cold launch restores the pre-write value | Persist on `.inactive` as the primary trigger |
| A `NavigationRouter` declared as `@State` on the `App` struct | Every window shares one router while `@SceneStorage` restores per-scene keys -- windows restore the wrong path | Move router state inside `WindowGroup` content |
| `restorationBehavior(.disabled)` targeting iOS | Compiles only on macOS/visionOS; the case does not exist for iOS | On iOS, simply don't persist state for a scene you don't want restored |
| Restoring state in `onAppear` | One default frame already painted -- visible flash from default to restored screen | Initialize from `@SceneStorage` in the scene-root model's `init` |
| Persistence work in the `.active` branch | Re-encodes state the in-memory model already owns, every foreground tick | Persist on `.inactive`/`.background` only |
| Privacy cover gated on `scenePhase == .background` | The App Switcher snapshot is captured earlier, at `.inactive` | Gate on `scenePhase != .active` |
| Analytics/side effects in `App.init` | Fires on prewarm, which may never become a real launch | Gate on the first `.active` transition |
| Restoring a screen after the user swiped the app out of the switcher | Overrides an explicit dismissal | Swipe-to-kill wipes `@SceneStorage`; land on the default screen, as designed |

## Severity guide

CRITICAL: restoration state written only on `.background`, silently discarding user position across every cold launch -- ships invisibly, since it works fine in the debugger's warm-resume-heavy testing loop. HIGH: privacy cover gated on `.background` instead of `.inactive` (sensitive content briefly visible in the App Switcher); scene-scoped state accidentally declared at `App` level, corrupting multi-window restoration. MEDIUM: restoration applied in `onAppear` producing a visible flash; `@SceneStorage` misused for a value that must survive swipe-to-kill. LOW: analytics side effect in `App.init` firing on prewarm. NIT: a 0.4s+ privacy-cover fade that a fast snapshot could catch mid-transition.

## See also

- `references/design/07-navigation-patterns.md#deep-linking` -- `onOpenURL`, routing, `NavigationPath` decoding (owner)
- `references/design/02-liquid-glass.md` -- Material choice for the privacy-cover overlay (owner)
- `references/platform/01-widgets-live-activities.md` -- `ActivityContent.staleDate` for stale-data presentation (owner)
- `references/platform/03-controls-standby.md#core-apis` -- background-safe, extension-process intent execution (owner)
- `references/patterns/04-loading-empty-error.md` -- `redacted(reason: .placeholder)` loading-skeleton pattern (owner)
- `references/performance/02-scroll-list-performance.md` -- scroll rendering cost, as distinct from restoring scroll position
- `references/accessibility/05-motion-accessibility.md` -- Reduce Motion double-gate (owner)
- `~/Claude/vault/iOS Development/` -- deep Scene/SwiftUI lifecycle source material
