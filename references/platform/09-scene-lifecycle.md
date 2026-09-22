# Scene Lifecycle and State Restoration

> Owner: `references/platform/09-scene-lifecycle.md` owns `Scene`/`WindowGroup` lifecycle, `\.scenePhase` semantics, `@SceneStorage` vs `@AppStorage` restoration state, and the cold/warm-launch UX contract, per the ARCHITECTURE ownership map. Deep-link routing mechanics (`onOpenURL`, `NavigationPath` decoding) are owned by `references/design/07-navigation-patterns.md#deep-linking` -- this file states only the precedence rule between a deep link and restored state. Scroll-list rendering cost is owned by `references/performance/02-scroll-list-performance.md`; this file covers only restoring the scroll position across launches. Privacy-cover material choice is owned by `references/design/02-liquid-glass.md`; background-safe extension intents by `references/platform/03-controls-standby.md#core-apis`.
> Floors: `\.scenePhase` and `@SceneStorage` = iOS 14.0+. `restorationBehavior(_:)` modifier + `.automatic` = iOS 18.0+/iPadOS 18.0+/macOS 15.0+/visionOS 2.0+. `SceneRestorationBehavior.disabled` specifically = **macOS 15.0+ / visionOS 26.0+ ONLY** -- see `references/_scaffolding/version-floor-registry.md#not-ios-the-1-mis-gate-class`; there is no iOS/iPadOS lever to disable restoration via this API. Scene accessories, `UISceneClosureConfirmation`, `UIWindowSceneDelegate.supportedInterfaceOrientations(for:)`, `UIWindowScene.displayLink(action:)`, `documentLaunchTitle(_:)`, the `Document` protocol family and `UIApplication.systemPrefersReducedResourceUsage` are all iOS 27.0+. The camera-capture accessory and the iPhone Duo hinge APIs are **iOS 27.1 and still flagged beta** -- keep them out of shipping code.

A returning user should land back exactly where they left off, with no visible "the app rebuilt itself" flicker -- that single sentence is the entire craft goal of this file. The most common way it goes wrong: writing restoration state inside the `.background` `scenePhase` closure, which runs AFTER the system has already snapshotted your `@SceneStorage` payload for the next cold launch, so the write silently never round-trips.

## The Apple way

- Only cold launch after termination needs restoration work. A warm resume from the background has the whole view hierarchy intact in memory -- running restoration/decode logic there is wasted work that can visibly reset live scroll position or selection.
- Persist restoration-critical state on `.inactive`, not `.background` -- the system captures the `@SceneStorage` payload while the scene passes through `.inactive`, before `.background` ever fires.
- `@SceneStorage` is per-scene/per-window and ephemeral (wiped by swipe-to-kill); `@AppStorage` is process-global and durable. Picking the wrong one is a real, shipped bug class.
- A `WindowGroup` can be instantiated more than once (iPad Stage Manager, multiwindow, macOS) -- every `@State` you declare at `App`/`Scene` scope answers the question "if the user opens a second window, should this be shared or duplicated?"
- Restore state BEFORE first paint, not in `onAppear` -- one default frame has already painted by the time `onAppear` runs.
- Adopting the scene-based life cycle is no longer a preference. An app built with the iOS 27 SDK that has not adopted it does not launch.

## The scene-based life cycle is mandatory (iOS 27 SDK)

Apple's wording is not a deprecation warning: "Beginning in iOS 27, iPadOS 27, Mac Catalyst 27, tvOS 27, and visionOS 27, apps built with the latest SDK must adopt the scene-based life cycle or they fail to launch." This is a build-and-die condition, and it is the hardest change in the whole 27 SDK.

An app needs migration if its `Info.plist` is missing `UIApplicationSceneManifest` or declares it with no configurations, or if its app delegate does not implement `application(_:configurationForConnecting:options:)`. The escalation ran over three releases: iOS 18.4 logged "This process does not adopt UIScene lifecycle. This will become an assert in a future version."; iOS 26 sharpened it to "UIScene lifecycle will soon be required."; iOS 27 asserts.

A pure-SwiftUI `@main App` already satisfies this. The exposure is a legacy `UIApplicationDelegate`-only bootstrap, a UIKit host with SwiftUI screens grafted on, or an `Info.plist` carried forward from an older project. In a UIKit-hosted codebase, check `UIApplicationSceneManifest` before reading a single line of view code.

What this does to the rest of the file: every rule below stops being advice for well-structured apps and becomes universal. `\.scenePhase` rather than `applicationDidEnterBackground` was already the right hook; now it is the only one.

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

### Holding the transition open for async restoration (iOS 27)

`UIScene.extendStateRestoration()` / `completeStateRestoration()` are iOS 15 methods, but linking against the iOS 27 SDK widens what they cover: they now extend restoration across `background` to `foreground` transitions, not only across scene connection.

That is the warm-resume case this file otherwise describes as "nothing to restore." When a scene resumes into a list whose content arrives asynchronously, it can hold the transition instead of flashing a placeholder:

```swift
func sceneWillEnterForeground(_ scene: UIScene) {
    scene.extendStateRestoration()
    Task {
        await store.refreshRestoredContent()
        scene.completeStateRestoration()          // always called, including on failure
    }
}
```

Pair it with a timeout or a `defer`: a `completeStateRestoration()` that never runs leaves the transition hanging. Below the 27 SDK the calls remain valid and cover connection-time restoration only, so keep rendering a redacted placeholder on warm resume there.

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

### A restored tab selection must name a visible tab (iOS 27 SDK)

From the release notes: "In apps built with the iOS 27.0 and iPadOS 27.0 SDKs, a `TabView` enforces that its selection is set to a visible tab. `TabView` might crash when its selection is set to a hidden or otherwise unavailable tab."

A restored `@SceneStorage("selectedTab")` value is exactly the way an invisible tab gets selected: the user was on a tab that a feature flag, a sign-in state, an entitlement, or `TabViewCustomization` has since hidden. What used to be a silently wrong screen is now a crash, and it fires on a recompile alone -- no deployment-target bump required.

Clamp the restored value against the tab set you are actually rendering:

```swift
@SceneStorage("selectedTab") private var storedTab: String = Tab.home.rawValue

private var selection: Binding<Tab> {
    Binding(
        get: { visibleTabs.contains(where: { $0.rawValue == storedTab })
                 ? Tab(rawValue: storedTab)! : visibleTabs[0] },
        set: { storedTab = $0.rawValue }
    )
}

TabView(selection: selection) { /* visibleTabs */ }
    .onChange(of: visibleTabs) { _, tabs in                 // the set can change mid-session
        if !tabs.contains(where: { $0.rawValue == storedTab }) { storedTab = tabs[0].rawValue }
    }
```

Clamp on read and on every change to the visible set, not just at launch -- signing out mid-session hides a tab while it is selected.

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

## Per-scene geometry: orientation, resizability, and the display

iOS 27 finishes a migration that started with multiwindow: the scene, not the app and not the screen, is the unit that owns geometry.

**Orientation moved to the window-scene delegate.** `UIWindowSceneDelegate.supportedInterfaceOrientations(for:)` is new at iOS 27.0 and `UIApplication.supportedInterfaceOrientations(for:)` is deprecated at the same version. Apple's contract: "The returned value replaces the app's `UISupportedInterfaceOrientations` Info.plist value for this scene. If not implemented, the Info.plist value is used." That is the correct model once one app owns several windows with different content -- a video player window and a library window should not have to agree.

```swift
@available(iOS 27, *)
func supportedInterfaceOrientations(for windowScene: UIWindowScene) -> UIInterfaceOrientationMask {
    isPlayingVideo ? .allButUpsideDown : .portrait
}
// Below iOS 27: UIApplicationDelegate.application(_:supportedInterfaceOrientationsFor:)
```

**Declaring a narrow orientation set no longer opts you out of resizing.** From the release notes: "Beginning with iOS 27, supported interface orientations should no longer be a condition for continuous resizability." A 27-SDK scene supports every orientation while mirrored or on iPad, and honors the declared set only until the user starts resizing, after which the scene ignores it. `UIRequiresFullScreen` buys a discrete-step resize model -- each resize arrives as a change to a new `UIScreen` with updated bounds -- not immunity.

Two review rules follow, and they apply to portrait-locked iPhone apps too:

- Any layout keyed to `UIScreen.main.bounds` or a hardcoded iPhone width is wrong. It was already wrong; now it is wrong on every device.
- `UIRequiresFullScreen` is not an acceptable answer to "my layout breaks when resized." The answer is adaptive layout (`references/design/08-adaptive-layout-ipad.md`).

**Animate against the scene's display, not the main screen.** `UIWindowScene.displayLink(action:)` (iOS 27.0) creates a `CADisplayLink` targeting the display the scene is actually on:

```swift
@available(iOS 27, *)
let link = windowScene.displayLink { link in
    advance(by: link.targetTimestamp - link.timestamp)
}
// Below iOS 27: window?.windowScene?.screen.displayLink(withTarget:selector:) -- never UIScreen.main.
```

A `UIScreen.main`-derived display link is wrong the moment a scene moves to another display or an accessory scene appears, which iOS 27 makes routine rather than exotic.

**Deprecated status-bar reads now return garbage.** Under the 27.0 SDK the long-deprecated `UIApplication` accessors -- `statusBarFrame`, `statusBarOrientation`, `statusBarStyle`, `isStatusBarHidden` -- may return NaN or null rather than stale-but-plausible values, which turns a dormant layout bug into a visible one when a NaN frame propagates into a constraint. Read `window?.windowScene?.statusBarManager` and safe-area insets instead. Grep for these before moving any project to the 27 SDK.

## Scene accessories: content the system decides where to put (iOS 27)

A scene accessory declares supplementary content the system presents on the app's behalf when the matching system functionality becomes available -- an external display being connected, for instance. The app declares what to provide; the system decides when and where. That inverts who owns a secondary window.

SwiftUI:

```swift
if #available(iOS 27, *) {
    ContentView()
        .sceneAccessory {
            ExternalNonInteractiveAccessory(isEnabled: $isPresenting) {
                SlideView(slide: deck.current)      // read-only mirror, never the interaction surface
            }
            .onAvailabilityChange { canPresent in   // drives the in-app "Present" affordance
                isExternalDisplayAvailable = canPresent
            }
        }
} else {
    ContentView()   // below iOS 27 there is no SwiftUI form: bridge to UIKit and manage the
                    // external-display UIWindowScene yourself
}
```

UIKit: `UIViewController.registerSceneAccessory(_:)` with `UISceneAccessory.externalNonInteractive(...)`, returning a `UISceneAccessoryRegistration` whose `isAvailable` (the system can show it) and `isEnabled` (the app wants it shown) are the two properties your UI should read.

Two rules, both reviewable:

1. **The app must remain fully functional without the accessory.** Apple states this outright. An accessory is never the only path to a capability.
2. **Drive the affordance from `isAvailable` / `onAvailabilityChange`,** never from an assumption that a display is attached.

**This is a breaking change in disguise.** In apps built with the iOS 27.0 SDK, `windowExternalDisplayNonInteractive` scenes are no longer offered automatically. An app that put a presentation view, a slideshow or a second-screen readout on an external display loses it on recompile unless it registers a scene accessory. The `UISceneSession.Role` constant itself is not deprecated -- the system simply stops handing out the scene unprompted. It only reproduces with hardware attached, so it belongs on the "verify on a real external display" list rather than a code read.

The camera-capture accessory -- `UISceneAccessory.cameraCapture(sceneConfiguration:)`, the `windowCameraCaptureAccessory` role, and SwiftUI's `CameraCaptureAccessory` -- is **iOS 27.1 and still flagged beta in Apple's own symbol metadata**. Do not present it beside `ExternalNonInteractiveAccessory` as though both shipped, and do not recommend it in a review; add `// beta: verify against the installed SDK` to anything you prototype against it. The same applies to the iPhone Duo hinge surface (`onHingeChange(isEnabled:_:)`, `DeviceHinge`, `DeviceHingeContext`, `UIHingeInteraction`), also 27.1 beta. When it does ship, raw hinge angle is still the wrong default tool: `DeviceHingeContext.hinge` is optional and nil on every non-foldable device, so pose-driven UI needs a real non-foldable path, and size classes plus reserved regions do the layout job a custom per-pose layout should not.

## Confirming scene closure with unsaved work (iOS 27)

`UIWindowScene.closureConfirmation` takes a `UISceneClosureConfirmation` and puts a system-presented dialog in front of the user action that would destroy the scene session. Before iOS 27 there was no reliable pre-disconnect hook at all -- you raced scene teardown.

```swift
@available(iOS 27, *)
func updateClosureGuard(on scene: UIWindowScene) {
    scene.closureConfirmation = document.hasUnsavedChanges
        ? UISceneClosureConfirmation(
            title: "Unsaved changes",
            message: "Close this window without saving?",
            actions: [UIAlertAction(title: "Discard", style: .destructive, handler: nil)])
        : nil                                    // clear it the moment the work is committed
}
```

Set it only while there is genuinely unsaved state, and clear it on commit. A permanently installed confirmation turns closing any window into a two-tap chore, which trains the user to dismiss it without reading -- the usual fate of a destructive confirmation that cries wolf. Below iOS 27 the substitute is continuous autosave plus `@SceneStorage` restoration.

## Document launch cards (iOS 27)

For a document-based app the launch card is the first surface the user sees, before any document exists. `documentLaunchTitle(_:)` and `documentLaunchSubtitle(_:)` (iOS/iPadOS/Mac Catalyst 27.0, on both `Scene` and `View`) make it something you author rather than inherit:

```swift
DocumentGroup(newDocument: { Sketch() }) { file in
    SketchEditor(document: file.document)
}
.documentLaunchTitle(Text("Sketches"))
.documentLaunchSubtitle(Text("Start a blank canvas or open a recent sketch"))
```

A subtitle is room to say what a new document will *be*, which is the difference between a card that reads as branding and one that helps the user choose. Below iOS 27 the card shows the system-derived title with no subtitle; omit the modifiers behind `#available`.

The document protocols changed underneath it. `Document` -- which combines `ReadableDocument` and `WritableDocument` -- is the iOS 27.0 replacement for `FileDocument`, **which is soft-deprecated** (Apple's message: "Conform your type to Document instead."); use `ReadableDocument` for read-only documents. The new protocols support asynchronous reading and writing, progress reporting, and direct access to document URLs, and the new `DocumentGroup` initializers let an editing-only app disable document creation and present custom UI before any document opens.

Three concurrency consequences ship with them, and they are the kind that compile and then behave wrongly:

- `DocumentReader.read(from:progress:)` and `DocumentWriter.write(...)` are declared `@concurrent`, not `nonisolated` -- an unannotated `nonisolated async` method would run on the main actor under approachable-concurrency defaults, defeating the off-main I/O you were reaching for.
- `makeDocument:` / `makeReadableDocument:` closures are `@MainActor`-isolated.
- `URLDocumentConfiguration` is a `@MainActor @Observable` reference type and no longer conforms to `Sendable`.

`ReferenceFileDocument` carries the same soft-deprecation stamp and message as `FileDocument` ("Use Document protocol instead."), whatever the release notes say; treat both the same way and write new code against `Document`.

## Deprecated at iOS 27.0

| Deprecated | Replacement |
|---|---|
| `UIApplication.canOpenURL(_:)` | Attempt `open(_:options:completionHandler:)` and handle the failure; universal links remove the need entirely |
| `UIApplication.requestSceneSessionActivation(...)` | `UISceneSessionActivationRequest` (iOS 26), which carries the target SwiftUI scene's identity and presented value |
| `UIApplication.supportedInterfaceOrientations(for:)` | `UIWindowSceneDelegate.supportedInterfaceOrientations(for:)` |

`FileDocument` and `ReferenceFileDocument` are soft-deprecated rather than stamped 27.0: conform new types to `Document`, or `ReadableDocument` for read-only.

`canOpenURL` is the one with a UI consequence. The "show the Open in X button only if X is installed" pattern now rests on a deprecated call *and* a halved query budget -- apps linked on or after iOS 27 are limited to 25 `LSApplicationQueriesSchemes` entries, down from 50. Show the affordance unconditionally and handle the failure:

```swift
if await UIApplication.shared.open(url) {
    route(.openedExternally)
} else {
    present(.appNotInstalled(fallbackURL: webURL))   // a real path, not a dead end
}
```

That path is correct on every OS version, so write it unconditionally rather than gating it.

`requestSceneSessionActivation` matters to any multi-window app that opens a second window from a menu item, a keyboard shortcut or a drag. The replacement expresses the *item* being opened rather than a loose `NSUserActivity`.

## Cold launch UX: avoiding the restoration flash

Three ways an app comes back, each implying different UI:

| Return type | What survived | UI expectation |
|---|---|---|
| Warm resume from background | Whole process + view hierarchy in memory | Instant, unchanged screen. Refresh only time-sensitive data on `.active` -- no restoration work, the views never left |
| Cold launch after termination | Only persisted `@SceneStorage`/files | Rebuild UI, then restore tab + nav path + scroll position so it LOOKS like the user never left |
| Fresh install / swipe-to-kill then relaunch | `@SceneStorage` is wiped | Land on the default/home screen -- do not try to restore a screen the user explicitly dismissed |

The classic bug: the app cold-launches, renders the DEFAULT screen (tab 0, empty nav stack, top of list), THEN a frame later applies the restored state -- a jarring jump from home to the deep screen the user was actually on. Two fixes: restore state BEFORE first paint by initializing scene-scoped state from `@SceneStorage` in the `init` of your scene-root model, not in `onAppear` (one default frame has already painted by then); and where restored content needs an async re-fetch, show the restored LAYOUT immediately under `.redacted(reason: .placeholder)` rather than a spinner on a blank screen -- it reads as "your screen, loading," not "app starting over."

A launch screen is now required, not optional: an app built with the iOS 27.0 SDK must carry `UILaunchStoryboardName`, `UILaunchStoryboards`, `UILaunchScreen` or `UILaunchScreens` in its `Info.plist` or the App Store rejects it. It pairs with the resizability change above -- the launch screen is what lets the system size the first frame correctly before your layout runs, which matters far more now that scene size is not predictable from the device. Design guidance for what goes on it is owned by `references/platform/04-system-surfaces-notifications.md#alternate-app-icons-appearances-and-launch-screens`.

iOS may prewarm your app ahead of an actual user launch, running `App.init`/early bootstrap with no guarantee of a subsequent foregrounding. Never put user-visible side effects (analytics "app opened," a sound, marking content seen) in `init` -- gate those on the FIRST `.active` `scenePhase` transition instead, so a prewarm that never becomes a real launch leaves no observable trace.

## Deep links vs. restored state

Deep-link mechanics -- `onOpenURL`, routing, `NavigationPath` decoding -- are owned by `references/design/07-navigation-patterns.md#deep-linking`; this file states only the precedence rule: an explicit incoming deep link or user activity represents the user's CURRENT intent and takes precedence over whatever was restored from the prior session. Apply restored state first (so the app doesn't flash to a default screen), then let the deep-link handler override the destination if one arrives -- never let stale restored state clobber a URL the user (or a notification tap) just asked for.

## Background execution's UI consequence

`.backgroundTask(_:action:)` is a `Scene` modifier (attach to `WindowGroup`, not a view) that runs an async closure when the system grants background time, paired with `BackgroundTask.appRefresh("id")`. The payoff is UI, not just data: the closure updates your PERSISTED model, so the next foreground shows current content with no loading spinner. It's discretionary -- the system decides when to grant it on its own cadence -- so the foreground path must still tolerate stale data regardless. `beginBackgroundTask(withName:)` covers the different case of a brief (~30s) extension to finish foreground-style work (flush restoration state to disk, complete an in-flight upload) as the scene suspends; always end it in BOTH the completion and the expiration handler, or the watchdog kills the app.

iOS 27 gives the scheduling decision a first-class input. `UIApplication.shared.systemPrefersReducedResourceUsage` is `true` when "the system has entered a state where it would prefer apps to scale back resource-intensive work," and `UIApplication.systemPrefersReducedResourceUsageDidChangeNotification` reports the transitions. It belongs beside Reduce Motion in the list of system preferences a well-behaved app honors rather than infers: it is the right gate for background-refresh scheduling, widget and Live Activity update cadence, and decorative continuous animation. Below iOS 27 the approximations are `ProcessInfo.processInfo.isLowPowerModeEnabled` and `thermalState`, both narrower.

One drag-and-drop consequence belongs here because it is a lifecycle assumption, not a gesture one. On iOS 27.0, Siri can load resources from drag interactions installed in your interface -- when Apple Intelligence is invoked from a context menu, the system calls `UIDragInteractionDelegate` methods with no user-initiated drag gesture behind them. Any lift animation, haptic or modal you present from `dragInteraction(_:sessionWillBegin:)` will fire with nothing visible being dragged. Move that work to `dragInteraction(_:sessionDidMove:)`, which is the correct placement on every OS version and therefore needs no availability branch.

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

Three kinds of iOS 27 change live in this file, and they need different handling:

| Kind | Examples | How to handle it |
|---|---|---|
| Runtime API, iOS 27.0 | Scene accessories, `closureConfirmation`, `displayLink(action:)`, `documentLaunchTitle`, `supportedInterfaceOrientations(for:)`, `systemPrefersReducedResourceUsage` | `#available(iOS 27, *)` with a real pre-27 branch; an iOS-27-minimum target drops the gate |
| SDK-linked behavior | Mandatory scene life cycle, mandatory launch screen, `TabView` selection enforcement, resizability, external-display scenes, NaN status-bar reads | Nothing to gate. It fires on a recompile, at every deployment target. Fix the code |
| Still beta at 27.1 | `CameraCaptureAccessory` / `UISceneAccessory.cameraCapture`, the iPhone Duo hinge APIs | Keep out of shipping code; mark any prototype `// beta: verify against the installed SDK` |

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
| No `UIApplicationSceneManifest`, or an app-delegate-only bootstrap | The app fails to launch when built with the iOS 27 SDK | Adopt the scene-based life cycle; it is required, not preferred |
| Binding a restored `@SceneStorage` tab value straight into `TabView(selection:)` | Crashes under the 27.0 SDK if the tab is now hidden | Clamp the selection against the visible tab set on read and on change |
| `UIRequiresFullScreen` as the answer to a layout that breaks when resized | Buys discrete resize steps, not immunity; every scene is resizable now | Real adaptive layout |
| A layout keyed to `UIScreen.main.bounds` | Wrong the moment the scene is resized, mirrored or moved to another display | Read the scene's own geometry |
| An external-display feature relying on an automatic `windowExternalDisplayNonInteractive` scene | The system stops offering it under the 27.0 SDK -- silent loss, only visible with hardware attached | Register a scene accessory |
| Lift animation or haptic in `dragInteraction(_:sessionWillBegin:)` | Siri starts drag sessions with no user gesture on iOS 27; the animation fires over nothing | Move it to `dragInteraction(_:sessionDidMove:)` |
| `canOpenURL` gating an "Open in X" affordance | Deprecated at iOS 27.0, and the query budget halved to 25 schemes | Show the affordance, `open(_:)`, handle the failure |
| `closureConfirmation` left installed permanently | Every window close becomes a two-tap chore; the user stops reading it | Set it only while work is unsaved; clear it on commit |

## Severity guide

CRITICAL: an app built with the iOS 27 SDK that has not adopted the scene-based life cycle (it does not launch); a `TabView` bound to a restored selection with no clamp against the visible tab set (crashes on recompile under the 27.0 SDK); restoration state written only on `.background`, silently discarding user position across every cold launch -- that last one ships invisibly, since it works fine in the debugger's warm-resume-heavy testing loop. HIGH: privacy cover gated on `.background` instead of `.inactive` (sensitive content briefly visible in the App Switcher); scene-scoped state accidentally declared at `App` level, corrupting multi-window restoration; an external-display feature silently lost because it still expects an automatic `windowExternalDisplayNonInteractive` scene. MEDIUM: restoration applied in `onAppear` producing a visible flash; `@SceneStorage` misused for a value that must survive swipe-to-kill; a lift animation or haptic in `dragInteraction(_:sessionWillBegin:)`; `canOpenURL` gating an affordance. LOW: analytics side effect in `App.init` firing on prewarm; a display link still derived from `UIScreen.main` in a multi-window app. NIT: a 0.4s+ privacy-cover fade that a fast snapshot could catch mid-transition.

## See also

- `references/design/07-navigation-patterns.md#deep-linking` -- `onOpenURL`, routing, `NavigationPath` decoding (owner)
- `references/design/02-liquid-glass.md` -- Material choice for the privacy-cover overlay (owner)
- `references/platform/01-widgets-live-activities.md` -- `ActivityContent.staleDate` for stale-data presentation (owner)
- `references/platform/03-controls-standby.md#core-apis` -- background-safe, extension-process intent execution (owner)
- `references/patterns/04-loading-empty-error.md` -- `redacted(reason: .placeholder)` loading-skeleton pattern (owner)
- `references/platform/04-system-surfaces-notifications.md#alternate-app-icons-appearances-and-launch-screens` -- launch-screen design guidance for the now-mandatory launch screen (owner)
- `references/design/08-adaptive-layout-ipad.md` -- adaptive layout, the real answer now that every scene is resizable
- `references/performance/02-scroll-list-performance.md` -- scroll rendering cost, as distinct from restoring scroll position
- `references/accessibility/05-motion-accessibility.md` -- Reduce Motion double-gate (owner)
