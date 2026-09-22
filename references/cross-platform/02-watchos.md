# watchOS Craft

> Owner: `references/cross-platform/02-watchos.md` owns watchOS-specific UI craft -- Digital Crown input, watch navigation/layout/typography, complications, Always-On rendering, and watch notifications -- per the ARCHITECTURE ownership map. Liquid Glass material rules are owned by `references/design/02-liquid-glass.md` (this file states only the watch-specific consequences). `SensoryFeedback` / `.sensoryFeedback` is owned by `references/haptics/02-swiftui-sensory-feedback.md` (`.start`/`.stop` is watchOS-primary but lives there). WidgetKit fundamentals (`TimelineProvider`, container background, App Groups) are owned by `references/platform/01-widgets-live-activities.md`; this file covers only the watch face's accessory families and Smart Stack.
> Floors: `digitalCrownRotation(_:)` basic binding and the ranged `(_:from:through:by:sensitivity:isContinuous:isHapticFeedbackEnabled:)` overload are **watchOS 6.0+**; only the overload that adds `onChange:`/`onIdle:` closures (event or detent form) is **watchOS 9.0+** -- see `references/_scaffolding/version-floor-registry.md#not-ios-the-1-mis-gate-class` (do not invert these). `NavigationStack` = watchOS 9.0+; `NavigationSplitView` also ships watchOS 9.0+ (Context7-verified) but rarely earns its three columns on a 41-49mm screen. `.tabViewStyle(.verticalPage)` = watchOS 10.0+. `handGestureShortcut(.primaryAction)` (Double Tap) = watchOS 11.0+. `reorderable()` + `reorderContainer(for:isEnabled:move:)` and `TabRole.prominent` = **watchOS 27.0+** (reordering reaches the watch for the first time). `WKExtension` / `WKExtensionDelegate` are deprecated in the watchOS 27 SDK for apps with a minimum deployment target of watchOS 9.2 or later.

A watchOS screen is judged in the two seconds a wrist stays raised: one hero value, one Digital Crown or touch interaction, and text that keeps updating correctly when the display dims. The most common craft failure is treating the watch as a tiny iPhone -- porting `NavigationView`-era chrome, hardcoding `.system(size:)` text, or hand-formatting a countdown string that freezes the instant Always-On dims the screen.

## The Apple way

- The Digital Crown is co-equal with touch, not a fallback -- give any scrub/zoom/value control a crown binding, not just a drag gesture.
- Complications and Smart Stack widgets are the app's most-viewed surface for many users; they must be legible tinted, dimmed, AND at a glance -- design them first, not last.
- Self-updating text (`Text(date, style:)`) is mandatory anywhere a value changes over time; hand-formatted strings silently freeze under Always-On.
- One primary action per screen, mirrored across touch, the Digital Crown, Double Tap, and the accessibility Quick Action -- never a feature reachable by only one input.

## Digital Crown input

`.focusable()` is the prerequisite the whole modifier silently no-ops without -- a view receives crown events only while focused. This is the #1 "crown does nothing" bug: it compiles clean and fails only on device.

```swift
// Ranged form -- watchOS 6.0+. The workhorse: stride, sensitivity, haptic ticks.
@State private var level = 0.0
Gauge(value: level, in: 0...100) { Text("Level") }
    .focusable()
    .digitalCrownRotation(
        $level,
        from: 0.0, through: 100.0,
        by: 1.0,                       // settles on stride multiples
        sensitivity: .low,             // .low | .medium | .high (default .high)
        isContinuous: false,           // true wraps past bounds (color wheel, minute picker)
        isHapticFeedbackEnabled: true  // crown-tick haptics
    )

// Basic form -- also watchOS 6.0+, unbounded range, defaults to 0.0.
Text("\(value, specifier: "%.1f")")
    .focusable()
    .digitalCrownRotation($value)

// Event overload -- watchOS 9.0+ ONLY. Adding onChange:/onIdle: is what raises the floor.
.focusable()
.digitalCrownRotation($value, onChange: { event in
    // event.velocity distinguishes a deliberate slow turn from a flick
}, onIdle: { /* commit / snap once the crown settles */ })

// Detent form -- watchOS 9.0+ (it also carries onChange:/onIdle:). Firm "click into place"
// haptic per stop; prefer this over free rotation whenever the value is inherently discrete.
@State private var step = 0
.focusable()
.digitalCrownRotation(detent: $step, from: 0, through: 4, by: 1,
    sensitivity: .low, isContinuous: false, isHapticFeedbackEnabled: true,
    onChange: { _ in }, onIdle: { })
```

Sensitivity by task: `.low` for fine adjustment (brightness, a timer's seconds), `.high` (default) for a long scrub. One crown consumer per screen -- if a page both scrolls a `List` and hosts a crown dial, focus ping-pongs; isolate the dial on its own `.verticalPage` tab. `digitalCrownAccessory { }` places a small indicator (a percentage label, a mini gauge) beside the physical crown so a blind turn has visible feedback -- add it to any scrubbing/zoom UI.

## Navigation, layout, and typography

watchOS is SwiftUI-first; `NavigationStack` (watchOS 9.0+) is current, `NavigationView` is deprecated. The navigation title collapses beside the clock in the status bar rather than sitting in its own bar:

```swift
NavigationStack {
    List(workouts) { NavigationLink($0.name, value: $0) }
        .navigationTitle("Workouts")
        .navigationDestination(for: Workout.self) { WorkoutDetail($0) }
}
```

Give the destination its branded backdrop with `containerBackground(_:for: .navigation)` -- the same modifier widgets use with `.widget`, targeting `.navigation` instead. It extends into the top safe area behind the clock; a hand-drawn `Rectangle` behind the title will not tint the time bar.

```swift
List { /* rows */ }.containerBackground(.blue.gradient, for: .navigation)
```

`.tabViewStyle(.verticalPage)` (watchOS 10.0+) is the full-screen, crown-driven vertical pager the Workout app uses to page between metrics, controls, and Now Playing -- prefer it over ported horizontal-dot tabs. `.listStyle(.carousel)` scales and centers rows as they scroll under the crown; reserve it for short tappable menus (~10 rows), not long data lists, where `.plain` reads better. `TabRole.prominent` (watchOS 27.0+) gives one destination a separate, trailing, visually emphasised slot -- use it for the one screen that must stay reachable from anywhere (the active workout, the running timer), not as a second navigation style.

### Reordering on the wrist (watchOS 27)

`reorderable()` plus `reorderContainer(for:isEnabled:move:)` (watchOS 27.0+) bring drag-to-reorder to watchOS for the first time, and they work in any container -- `List`, `LazyVGrid`, a custom layout -- not just `List`'s `onMove`:

```swift
@State private var favorites: [Favorite] = Favorite.stored

List {
    ForEach(favorites) { FavoriteRow($0) }
        .reorderable()                                   // marks this content draggable
}
.reorderContainer(for: Favorite.self) { difference in    // declares the surrounding container
    let moving = Set(difference.sources)
    let moved = favorites.filter { moving.contains($0.id) }
    var remaining = favorites.filter { !moving.contains($0.id) }
    if case .before(let anchorID) = difference.destination.position,
       let index = remaining.firstIndex(where: { $0.id == anchorID }) {
        remaining.insert(contentsOf: moved, at: index)
    } else {
        remaining.append(contentsOf: moved)              // .end
    }
    favorites = remaining
}
```

This removes a standing reason to push editing back to the phone: an ordered list of workouts, shortcuts or favourites is now rearrangeable where the user is looking at it. Below watchOS 27 there is no built-in reordering on the watch at all, so the pre-27 branch is a phone-side editor, not a degraded watch one.

Layout for 41-49mm screens (roughly 176-205 pt after safe-area insets): one flexible column, no fixed pixel widths, keep primary content off the extreme corners since full-bleed art clips against the rounded display. Typography is SF Compact at watch-calibrated Dynamic Type sizes tested independently of the phone's text-size setting (Settings ▸ Display & Brightness ▸ Text Size is watch-local) -- bias the one number that matters to `.title2`/`.largeTitle`, everything else to `.caption`/`.footnote`.

## Complications and Smart Stack

Since watchOS 9, ClockKit is deprecated -- every complication is a WidgetKit `Widget` restricted to the accessory families, sharing code with iOS Lock Screen widgets (owner: `references/platform/01-widgets-live-activities.md`).

| Family | Slot | Primitive |
|---|---|---|
| `.accessoryCircular` | corner/subdial circle | `Gauge(.accessoryCircular/.accessoryCircularCapacity)` |
| `.accessoryCorner` | **watchOS-only** face corner | icon + curved `widgetLabel` hugging the bezel |
| `.accessoryRectangular` | large rectangular slot | 2-3 lines, small chart; the primary Smart Stack layout |
| `.accessoryInline` | text arc above the time | one line + optional SF Symbol |

Complications are tinted, not full-color -- `.widgetAccentable()` the foreground glyph only; wrapping a parent that also holds `AccessoryWidgetBackground()` drags the backdrop into the tint group and flattens it (compiles clean, wrong only on device). Prefer `AccessoryWidgetBackground()` over a hand-rolled translucent shape.

The Smart Stack (swipe-up-from-face) ranks widgets two distinct ways -- do not conflate them. `TimelineEntryRelevance(score:duration:)` on a timeline entry only orders your widget against others already in the stack. `RelevanceKit`'s `relevance() async -> WidgetRelevances<Intent>`, returning `WidgetRelevanceEntry(context:)` with a `RelevantContext` (date, location, fitness, sleep, and -- new in watchOS 26 -- point-of-interest categories like "any gym"), proactively surfaces the widget by context even when the user hasn't opened the app. Register 1-2 genuine moments; the system deprioritizes suggesters that fire everywhere. See `references/platform/03-controls-standby.md` for the shared relevance-scoping table across controls, Live Activities, and Smart Stack.

## Always-On + watchOS 26 Liquid Glass

`@Environment(\.isLuminanceReduced)` is `true` while the wrist is down and the always-on display stays lit but dims -- design a legible dimmed state rather than assuming the screen turns off:

```swift
@Environment(\.isLuminanceReduced) private var dimmed
Text(start, style: .timer)                              // keeps ticking while dimmed
    .foregroundStyle(dimmed ? .secondary : .primary)
if !dimmed { HeartRateBadge() }                          // hide costly/animated chrome when dimmed
```

Semantic colors only (`Color.white` glares at low brightness), drop per-second animation behind `!dimmed`, and wrap sensitive values in `.privacySensitive()` so the system redacts them on wrist-down or when locked. watchOS 26 brings the cross-platform Liquid Glass material (owner `references/design/02-liquid-glass.md`) to standard chrome -- `NavigationStack`, toolbars, `List`, `Button` adopt it automatically; do not smother it with an opaque full-bleed backdrop. Contrast still applies at the same bar as `references/accessibility/03-visual-accessibility.md#color-contrast` -- glass is not an exemption.

## Notifications and gestures

Only the Long Look is customizable (Short Look is system-drawn): declare a `WKNotificationScene(controller:category:)` in the `App` body backed by a `WKUserNotificationHostingController<Body>` subclass whose category identifier matches the registered `UNNotificationCategory` exactly, or no buttons render. Keep the body one glanceable headline plus one action, self-updating time text, and `.privacySensitive()` on anything private.

Double Tap (`handGestureShortcut(.primaryAction)`, watchOS 11.0+) binds ONE control per screen to the thumb-index pinch gesture; move the binding via `isEnabled:` as the primary action changes rather than leaving two bound at once. Wrist Flick (watchOS 26) is system-only with no developer binding API -- apps benefit automatically by using standard dismissible sheets/alerts instead of a bespoke full-screen modal the system cannot dismiss. Pair every Double Tap binding with `accessibilityQuickAction(style:)` so motor-accessibility users (AssistiveTouch clench) reach the same primary action.

watchOS 27 adds two more system-only affordances of the same shape, with no API to bind: a **single-handed tap gesture opens the focused Smart Stack widget**, and pressing the Digital Crown opens a **dynamic grid of Siri-suggested apps**. `handGestureShortcut(_:isEnabled:)` still documents only `.primaryAction`; inventing a binding for either would be a phantom API. What follows for craft is entirely upstream: both make a well-ranked Smart Stack widget cheaper to reach, which raises the payoff of the relevance work above. Keep the widget's tap target the app's genuine primary action, because one-handed tap now lands on it directly.

## watchOS 27: lifecycle and on-device generation

`WKExtension` and `WKExtensionDelegate` are deprecated in the watchOS 27 SDK for apps whose minimum deployment target is watchOS 9.2 or later -- the last WatchKit-era lifecycle scaffolding. A watch target still routing launch, background refresh or snapshot scheduling through `WKExtensionDelegate` should move to the SwiftUI `App`/`Scene` lifecycle; lowering the deployment target to keep the old path is a stopgap, not a fix. Also fixed in 27: `WCSession.transferCurrentComplicationUserInfo` now works with WidgetKit-built complications, so a workaround built around that bug can be deleted.

Foundation Models reaches the watch in the same release: `LanguageModelSession` lists watchOS 27.0 (it was absent in 26.x), along with the 27.0-era `LanguageModelError`, `Attachment` and `ToolCallingMode` types. `SystemLanguageModel` itself is still documented without watchOS, so check availability through the session's own path rather than assuming the model type is there. A watch screen has no room for a spinner and no patience for one, which makes the streaming and partial-render discipline in `references/platform/06-apple-intelligence-ui.md#foundation-models-sessions-streaming-and-tool-calling-ui` more load-bearing here than on the phone, not less. tvOS has no Foundation Models on any version -- exclude it with `#if os(tvOS)`, not an availability check.

## Availability + fallbacks

```swift
// watchOS 6.0+ baseline: ranged crown binding works everywhere back to the file floor.
Gauge(value: level, in: 0...100) { Text("Level") }
    .focusable()
    .digitalCrownRotation($level, from: 0, through: 100, by: 1)

if #available(watchOS 9.0, *) {
    canvas.digitalCrownRotation(detent: $step, from: 0, through: 4, by: 1,
        sensitivity: .low, isContinuous: false, isHapticFeedbackEnabled: true,
        onChange: { _ in }, onIdle: { })
} else {
    canvas.digitalCrownRotation($stepAsDouble, from: 0, through: 4, by: 1)  // no detent snap pre-9
}

// watchOS 27 reordering has no watch-side fallback -- below the floor, editing lives on the phone.
if #available(watchOS 27, *) {
    favoritesList
        .reorderContainer(for: Favorite.self) { apply($0) }
} else {
    favoritesList                                                // read-only order; edit in the iOS app
}
```

## Accessibility contract

None of this file's motion is system-auto-gated. Custom crown-driven or Double-Tap-triggered transforms must respect `@Environment(\.accessibilityReduceMotion)` per the double-gate owned by `references/accessibility/05-motion-accessibility.md`. Every gesture-only affordance (Double Tap, Wrist Flick) needs a touch and Voice Control equivalent -- `accessibilityQuickAction` is the primary-action bridge, not an optional extra. VoiceOver and Switch Control read complications and notification actions the same as any other control; verify label text survives truncation at the smallest complication family.

## Anti-patterns

| Wrong | Why it fails | Right |
|---|---|---|
| `digitalCrownRotation` with no `.focusable()` | Crown events never arrive; silent on-device failure | Add `.focusable()` to the crown-bound view |
| Free rotation for a 5-item choice | Values feel mushy, no snap | `digitalCrownRotation(detent:…)` |
| Hand-formatted countdown string | Freezes the instant Always-On dims | `Text(date, style: .timer/.relative)` |
| `.widgetAccentable()` on a parent holding `AccessoryWidgetBackground()` | Backdrop joins the tint group and flattens (device-only bug) | Accent only the foreground glyph |
| Registering Smart Stack relevance for every context | System deprioritizes spammy suggesters | 1-2 genuine, well-chosen moments |
| Custom full-screen modal with only an on-screen close button | Wrist Flick and system dismissal can't reach it | Standard sheet/alert presentation |
| Two `handGestureShortcut(.primaryAction)` active at once | Ambiguous Double Tap target | One per screen; move via `isEnabled:` |
| Sending the user to the phone to reorder a watch list | watchOS 27 reorders in place | `reorderable()` + `reorderContainer(for:isEnabled:move:)` |
| A watch target still built on `WKExtensionDelegate` | Deprecated in the watchOS 27 SDK at a watchOS 9.2 minimum | SwiftUI `App`/`Scene` lifecycle |
| Binding a "handler" to the watchOS 27 one-handed tap or Crown app grid | Both are system-only; no such API exists | Invest in Smart Stack relevance instead |

## Severity guide

CRITICAL: a primary action reachable only by Double Tap, Wrist Flick, or the watchOS 27 one-handed Smart Stack tap with no touch/Quick Action equivalent. HIGH: `digitalCrownRotation` missing `.focusable()`, or sensitive data unredacted on wrist-down. MEDIUM: hand-formatted time text that freezes under Always-On, a Smart Stack card that needs a tap to make sense, or a watch target still routing lifecycle through `WKExtensionDelegate`. LOW: `.high` sensitivity on a fine-adjustment dial, or an ordered watch list that still sends the user to the phone to rearrange it on a watchOS 27 target. NIT: `.listStyle(.carousel)` applied to a long data list where `.plain` reads better.

## See also

- `references/design/02-liquid-glass.md` -- the Liquid Glass material this file only states the watch consequences of (owner)
- `references/haptics/02-swiftui-sensory-feedback.md#built-in-feedback-types` -- `SensoryFeedback` including `.start`/`.stop` (watchOS-primary, owner)
- `references/platform/01-widgets-live-activities.md` -- `TimelineProvider`, container background, App Groups (owner)
- `references/platform/03-controls-standby.md` -- the relevance-scoping table shared with Live Activities and controls (owner)
- `references/platform/06-apple-intelligence-ui.md#foundation-models-sessions-streaming-and-tool-calling-ui` -- session, streaming, and error UI for the Foundation Models surface that reaches watchOS 27 (owner)
- `references/accessibility/04-motor-interaction.md#touch-targets` -- 44pt baseline this file's scarce screen real estate must still honor
- `references/accessibility/05-motion-accessibility.md` -- the Reduce Motion double-gate (owner)
