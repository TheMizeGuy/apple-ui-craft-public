# CarPlay

> Owner: `references/cross-platform/06-carplay.md` owns CarPlay template UI, scene lifecycle, category/entitlement gating, and the driver-safety constraints that shape every design decision on this surface. WidgetKit/ActivityKit surfacing on the CarPlay Dashboard is owned by `references/platform/01-widgets-live-activities.md`; the Liquid Glass material CarPlay chrome adopts is owned by `references/design/02-liquid-glass.md`; the "adapt, don't port" cross-platform strategy this file specializes for the car is owned by `references/cross-platform/01-ipados-multiplatform.md`.
> Floors: the base CarPlay template framework and scene APIs predate this registry's iOS-16 floor. iOS-26-specific behavior (Liquid Glass template chrome, entitlement-free widgets/Live Activities on the Dashboard) and iOS-26.4 category relaxations are called out inline. Liquid Glass baseline: `references/_scaffolding/version-floor-registry.md#ios-26x`.

CarPlay is not a canvas -- it is a fixed catalog of `CPTemplate` subclasses you populate with data while the system renders, lays out, and themes every pixel except a navigation app's map. Apple built the entire template model as a driver-safety system, not an API limitation to work around: every constraint traces to keeping the driver's eyes on the road and their hands near the wheel, and Apple reviews CarPlay apps against these principles directly. The single mindset shift moving from iPhone UI to CarPlay UI: you are not designing a screen, you are designing the shortest possible glance.

## The Apple way

CarPlay's driver-safety bar governs every screen you ship:

| Principle | Concrete target |
|---|---|
| Glanceability | Comprehensible in under ~2 seconds of looking |
| Minimal interaction | A task completes in 2-3 taps maximum from launch |
| No video, no animation | No video playback, no animated graphics, no decorative motion |
| No custom drawing | Templates only -- the navigation map is the sole exception |
| Bounded content | The system enforces item caps (list 500, grid 8, tab 5) |
| System-controlled rendering | You supply data; the system draws it at legible, consistent sizes you cannot shrink |

Order items by likelihood, not alphabetically or by recency -- a rotary-knob user reaches the first item in one detent, a Siri user says it by name. Many head units have **no touchscreen**: every screen must also work by knob/button focus navigation and, ideally, by voice through App Intents.

## Architecture: the template model and scene lifecycle

CarPlay is a separate UIKit scene (`import CarPlay`) alongside a pure-SwiftUI phone app. Bridge with `@UIApplicationDelegateAdaptor` and declare the CarPlay scene role in `Info.plist`:

```swift
// SwiftUI-lifecycle app bridged onto CarPlay's UIKit scene delegate.
@main
struct MyApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    var body: some Scene { WindowGroup { ContentView() } }   // the phone app stays pure SwiftUI
}

final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(_ app: UIApplication, configurationForConnecting session: UISceneSession,
                      options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        if session.role == .carTemplateApplication {
            let cfg = UISceneConfiguration(name: "CarPlay", sessionRole: session.role)
            cfg.delegateClass = CarPlaySceneDelegate.self
            return cfg
        }
        return UISceneConfiguration(name: "Phone", sessionRole: session.role)
    }
}
```

Implement `CPTemplateApplicationSceneDelegate`; the system hands you a `CPInterfaceController` on connect and expects it dropped on disconnect:

```swift
final class CarPlaySceneDelegate: UIResponder, CPTemplateApplicationSceneDelegate {
    var interfaceController: CPInterfaceController?

    func templateApplicationScene(_ scene: CPTemplateApplicationScene,
                                   didConnect ic: CPInterfaceController) {
        interfaceController = ic
        let list = CPListTemplate(title: "My App", sections: [rootSection])
        ic.setRootTemplate(list, animated: true, completion: nil)
    }

    func templateApplicationScene(_ scene: CPTemplateApplicationScene,
                                   didDisconnect ic: CPInterfaceController) {
        interfaceController = nil          // drop the strong ref or you leak/crash on reconnect
    }
}
```

| `CPInterfaceController` method | Purpose |
|---|---|
| `setRootTemplate(_:animated:completion:)` | Set the initial (bottom) template |
| `pushTemplate(_:animated:completion:)` | Push onto the stack -- respects the category depth limit |
| `popTemplate` / `popToRootTemplate` | Pop the top, or everything back to root |
| `presentTemplate(_:animated:completion:)` | Present modally -- `CPAlertTemplate`/`CPActionSheetTemplate` only |
| `dismissTemplate(animated:completion:)` | Dismiss the modal |

**The completion-handler contract is the #1 CarPlay freeze bug.** Every `CPListItem.handler`, search-result handler, and bar-button action receives a `completion` closure you MUST call when your work finishes -- forgetting it leaves the UI spinning indefinitely, because the system waits for acknowledgment before it will render anything else. Handlers run on the main thread; dispatch heavy work off-main, then call `completion()`.

## Categories, entitlements, and template gating

CarPlay is not open to every app. Pick exactly ONE category before designing a single screen -- it dictates your template vocabulary and push depth, and using a template your category forbids throws a runtime exception, not a warning.

| Category | Push depth | Key templates |
|---|---|---|
| Navigation | 5 | `CPMapTemplate`, `CPSearchTemplate`, `CPListTemplate` |
| Audio | 5 | `CPNowPlayingTemplate`, `CPListTemplate`, `CPTabBarTemplate`, `CPGridTemplate` |
| Communication | 5 | `CPContactTemplate`, `CPMessageListTemplate`, `CPListTemplate` |
| EV Charging / Parking | 5 | `CPPointOfInterestTemplate`, `CPInformationTemplate` |
| Fueling | 3 | `CPPointOfInterestTemplate`, `CPListTemplate` |
| Quick Food Ordering | 2 (3 on iOS 26.4+) | `CPListTemplate`, `CPInformationTemplate` |
| Driving Task | 2 (3 on iOS 26.4+) | `CPListTemplate`, `CPGridTemplate` |
| Public Safety | 5 | `CPListTemplate`, `CPGridTemplate` |
| Voice-Based Conversation | 3 (iOS 26.4+) | `CPListTemplate` |

The global stack ceiling is 5 templates including the root; a category may cap tighter. Request the matching `com.apple.developer.carplay-*` entitlement through the Developer Portal -- Apple product-reviews the use case, it is not a checkbox. There is no generic CarPlay entitlement: without a category fit, an app cannot show template UI at all (though widgets and Live Activities still can -- see below).

**Driving Task is not a full-app loophole.** It exists for ONE quick, genuinely car-relevant task (log a delivery, toggle a fleet status, a quick check-in). Apple reviews it hard and rejects apps using it to smuggle in a phone-app port.

## The template catalog

Root-eligible templates: `CPTabBarTemplate`, `CPListTemplate`, `CPGridTemplate`, `CPInformationTemplate`, `CPPointOfInterestTemplate`, `CPSearchTemplate`. (`CPNowPlayingTemplate` and `CPMapTemplate` are special-cased.)

- **`CPListTemplate`** -- the workhorse. Hard cap `maximumItemCount = 500` across all sections (extra items silently drop), plus a `maximumSectionCount`. Every `CPListItem.handler` closure receives `completion` -- call it or freeze the UI.
- **`CPGridTemplate`** -- up to 8 `CPGridButton`s (image + short title); treat 8 as a hard ceiling.
- **`CPTabBarTemplate`** -- container only, up to 5 child templates as tabs; push onto the selected child, never onto the tab bar itself.
- **`CPSearchTemplate`** -- root-eligible; delivers query updates via its delegate, you return `CPListItem` results. The system decides when to allow the on-screen keyboard -- often locked out while the vehicle is moving.
- **`CPNowPlayingTemplate.shared`** -- a system-owned singleton reflecting `MPNowPlayingInfoCenter`; push the shared instance and add buttons (`CPNowPlayingShuffleButton`, `CPNowPlayingRepeatButton`, custom `CPNowPlayingImageButton`) -- never allocate your own.
- **`CPInformationTemplate`** -- labeled key/value rows plus a few `CPTextButton`/`CPBarButton` actions (order status, charging session detail).
- **`CPPointOfInterestTemplate`** -- a map with a horizontally scrollable row of `CPPointOfInterestItem` cards; the backbone of EV-charging, parking, and fueling apps. (iOS 26 regression to watch: `pinImage` can render oversized -- size pins conservatively.)
- **`CPAlertTemplate` / `CPActionSheetTemplate`** -- modal-only, presented via `presentTemplate(_:animated:completion:)`, confirmations only. No free-form modal content exists.

Pick the template that matches the DATA shape, then live inside its constraints. If an idea needs a template that does not exist, redesign it as list/grid/POI -- the idea is the wrong shape for the car.

## Navigation and audio: the two deep categories

Navigation is the only category that draws its own pixels. Nav apps get an overloaded `didConnect(_:to window: CPWindow)` variant and own the map view; `CPMapTemplate` supplies chrome on top:

```swift
// The ONE place CarPlay lets you draw freely.
func templateApplicationScene(_ scene: CPTemplateApplicationScene,
                               didConnect ic: CPInterfaceController, to window: CPWindow) {
    interfaceController = ic
    window.rootViewController = MapViewController()          // MapKit or a custom renderer
    let map = CPMapTemplate()
    map.mapDelegate = self
    map.mapButtons = [recenterButton, zoomInButton, zoomOutButton]   // iOS 26: auto Liquid Glass
    ic.setRootTemplate(map, animated: true, completion: nil)
}
```

Drive turn-by-turn guidance with `CPTrip`/`CPNavigationSession`/`CPManeuver`, and always supply BOTH long and short `instructionVariants` -- the cluster and narrow displays pick the short one. Handle pan/zoom via `mapDelegate`; the system gates free panning while the vehicle moves, so never build custom gesture handling that bypasses it.

Audio is the most common category. The CarPlay-specific surface is thin (a `CPListTemplate`/`CPGridTemplate`/`CPTabBarTemplate` browse hierarchy plus the system `CPNowPlayingTemplate`); the real work is the **Media Player** framework:

```swift
// Set BEFORE CarPlay connects, or audio drops on background/connect -- a top-reported bug.
try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default)
try AVAudioSession.sharedInstance().setActive(true)

MPRemoteCommandCenter.shared().playCommand.addTarget { _ in Player.shared.play(); return .success }
// Disable commands you don't support so the car greys out the right buttons:
MPRemoteCommandCenter.shared().skipForwardCommand.isEnabled = false
```

Publish `MPNowPlayingInfoCenter.default().nowPlayingInfo` (title/artist/artwork/elapsed/rate) on every state change -- missing artwork or a stale elapsed time is the most common "blank Now Playing" bug. Keep the browse hierarchy SHALLOW: recents and continue-listening near the top, deep catalog behind search -- a driver browsing six levels deep to press play is a safety failure, not a UX nit.

## Dashboard vs. instrument cluster vs. main screen

A navigation app can drive up to three coordinated surfaces from one process, plus the independent iPhone screen:

| Screen | Content | Driven via |
|---|---|---|
| Main CarPlay | Full map + guidance overlay | `CPMapTemplate` + `CPWindow` |
| Dashboard | Compact shortcuts, ETA | `CPDashboardController` (`CPTemplateApplicationDashboardScene`) |
| Instrument cluster | Current maneuver, distance, speed limit | `CPInstrumentClusterController` (`CPTemplateApplicationInstrumentClusterScene`) |

Enable the Dashboard scene with `CPSupportsDashboardNavigationScene = YES` in `Info.plist`; the instrument cluster with `CPSupportsInstrumentClusterNavigationScene = YES`. Both require `UIApplicationSupportsMultipleScenes = YES`. Instrument-cluster availability is vehicle-dependent hardware -- design the app to be fully usable WITHOUT it, then enhance where present. All screens must read one shared route/session model; never let the cluster and the main map disagree on the current maneuver.

**iOS 26 changes the value calculus entirely.** Widgets and Live Activities now surface on the CarPlay Dashboard for apps with NO CarPlay template UI and NO CarPlay entitlement at all -- built with the same WidgetKit code as StandBy widgets (`references/platform/03-controls-standby.md#standby-ios-17`). Order of effort/value for a typical app:

1. **Live Activity in CarPlay** -- free if one already ships (`references/platform/01-widgets-live-activities.md`); verify arm's-length legibility.
2. **CarPlay Dashboard widget** -- a `.systemSmall` glanceable widget, no entitlement needed.
3. **Full template app** -- only if the app's core job is genuinely done while driving; requires the reviewed category entitlement.

Most apps should stop at 1 and 2. CarPlay Ultra (multi-display, deep instrument-cluster/climate integration on supported vehicles) needs no separate "Ultra app" -- a well-behaved template + widget + Live Activity set scales up automatically; Ultra availability is automaker- and region-gated hardware.

## Haptic and sensory restrictions -- frame safety-first

CarPlay has no path to a felt haptic tied to a template interaction, and that is architectural, not an oversight to route around:

- `CPListItem`, `CPGridButton`, and every other template control is a plain data object with a closure `handler` -- it is not a `View` or `UIView`, so there is no surface to attach `.sensoryFeedback` or a `UIFeedbackGenerator` call to a template tap in the first place.
- The vehicle head unit renders the template, and it has no Taptic Engine. Nothing a handler does can produce a sensation there.
- The iPhone running the app still has its own Taptic Engine, and nothing stops a handler from calling `UIImpactFeedbackGenerator` on it -- but the driver is not holding the phone while using CarPlay. A haptic the driver cannot feel is not feedback; it is dead code with a battery cost.

Confirm a CarPlay action the same way the templates already do: update `CPListItem.isPlaying`/`playbackProgress`, push the next template, or reflect the change through `MPNowPlayingInfoCenter` -- a visible template-state change IS the acknowledgment. This specializes the platform-wide "never make haptic the sole feedback channel" rule (`references/haptics/01-haptic-design-principles.md#hardware-availability`, owner of the hardware-reality table); CarPlay simply removes the haptic channel outright instead of leaving it as a silent no-op the way iPad does.

## Testing without a car

| Tool | How | Notes |
|---|---|---|
| CarPlay Simulator (Mac app) | Xcode > Open Developer Tool > Additional Tools for Xcode, connect a real iPhone via USB | Realistic: simulates knob input, Siri button, display sizes, light/dark, cluster |
| Xcode iOS Simulator | Run app -> I/O > External Displays > CarPlay | Quick but less realistic; no instrument-cluster simulation |

Always test with knob/focus input, not just clicks -- that is where touch-only designs break. Before shipping any screen, verify: every handler calls `completion()`; the app stays under its category's push depth; state stays synced across iPhone <-> CarPlay <-> Dashboard/cluster; it renders correctly in light AND dark at multiple display widths.

## Availability + fallbacks

CarPlay's base template framework and scene APIs predate this project's iOS-16 floor -- there is no `#available` branching inside a CarPlay scene delegate for the core template model. Two things ARE version-gated:

```swift
// iOS 26: CPMapTemplate.mapButtons and other system-drawn template chrome
// automatically adopt Liquid Glass (references/design/02-liquid-glass.md#design-properties).
// You do not opt in and you cannot theme it -- do not attempt to draw a background
// behind template content to compensate; the glass reads through the vehicle's context.
```

Widgets and Live Activities appearing on the CarPlay Dashboard with no CarPlay entitlement is iOS 26+; on earlier iOS the Dashboard surface only exists for apps that already hold a CarPlay entitlement and template UI. Category push-depth relaxations (Quick Food Ordering and Driving Task 2->3, Voice-Based Conversation gaining `CPListTemplate`) are iOS 26.4+.

## Accessibility contract

CarPlay's driver-safety constraints ARE its accessibility contract for the sighted-driving-while-attentive case: the system enforces glanceability and bounded content on your behalf. Contrast still needs verification against the CarPlay light/dark switch (`references/accessibility/03-visual-accessibility.md#color-contrast`, owner) -- a custom color that passes in light mode and fails in dark ships broken in half the trips a driver takes. No motion in a template is developer-owned to gate; there IS no template-level animation surface to gate, because CarPlay forbids decorative motion outright.

## Anti-patterns

| Wrong | Why it fails | Right |
|---|---|---|
| Not calling a handler's `completion()` | Freezes the CarPlay UI -- a safety hazard, not just a bug | Call it at the end of every handler, dispatching heavy work off-main first |
| A CarPlay screen that only works by touch | Broken on the large fraction of head units with no touchscreen | Support knob/button focus navigation; order items by likelihood |
| Any video, decorative animation, or marketing splash in a template | Apple rejects it outright | Static, glanceable content only |
| Using a template your category forbids | Runtime exception, not a warning | Check the category matrix before designing |
| Treating Driving Task as a full-app loophole | Apple reviews and rejects this | One quick, genuinely driving-relevant task |
| Drawing a background behind `CPMapTemplate` chrome | Fights the system-owned Liquid Glass material | Let the template own every button; spend the draw budget on the map |
| Attaching a haptic to a `CPListItem.handler` and calling it feedback | The head unit has no Taptic Engine; the phone isn't in the driver's hand | Confirm via visible template state (isPlaying, pushed template, Now Playing sync) |
| Missing `MPNowPlayingInfoCenter` data | The car shows a blank Now Playing screen | Populate title/artist/artwork/elapsed on every state change |

## Severity guide

CRITICAL: a screen reachable only by touch on a no-touchscreen head unit, or a handler that never calls `completion()`. HIGH: decorative animation/video in a template, or a category-forbidden template shipped (App Review rejection risk). MEDIUM: missing long/short `instructionVariants`, or a Now Playing screen missing artwork/title. LOW: a Driving Task flow that technically fits but reads as a stretch of the category's intent. NIT: custom asset sizes exceeding template display resolution.

## See also

- `references/cross-platform/01-ipados-multiplatform.md` -- the "adapt, don't port" cross-platform strategy this file specializes for the car (owner)
- `references/platform/01-widgets-live-activities.md` -- WidgetKit/ActivityKit surfaces that now reach the CarPlay Dashboard without any CarPlay entitlement (owner)
- `references/platform/03-controls-standby.md#standby-ios-17` -- the `.systemSmall` glanceable rendering model CarPlay Dashboard widgets share with StandBy
- `references/design/02-liquid-glass.md#design-properties` -- the material system-drawn CarPlay templates adopt automatically (owner)
- `references/haptics/01-haptic-design-principles.md#hardware-availability` -- the "never make haptic the sole channel" rule this file's restrictions specialize (owner)
- `references/accessibility/03-visual-accessibility.md#color-contrast` -- contrast requirements that map directly to glanceability
