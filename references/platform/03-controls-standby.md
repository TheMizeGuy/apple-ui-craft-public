# Controls, StandBy, and the Action Button

> Owner: `references/platform/03-controls-standby.md` owns `ControlWidget` (Control Center, the Lock Screen bottom slot, and the Action Button's "Controls" mode) and StandBy's presentation of an existing widget, per the ARCHITECTURE ownership map. The App Intents contract itself -- `AppShortcutsProvider`, `OpenIntent`, and the `openAppWhenRun` -> `supportedModes` migration -- is owned by `references/platform/02-app-intents-system.md#opening-the-app-from-a-control-ios-26`; cite it, don't restate it. `\.widgetRenderingMode` mechanics are owned by `references/platform/01-widgets-live-activities.md#rendering-modes-and-liquid-glass-tinting`.
> Floors: `ControlWidget`/`StaticControlConfiguration`/`ControlWidgetToggle`/`ControlWidgetButton` = iOS 18.0+ (see `references/_scaffolding/version-floor-registry.md#ios-180`). StandBy = iOS 17.0+ (widgets already conforming need no opt-in). Control Center's Liquid Glass chrome = iOS 26.0+, automatic.

One `ControlWidget` reaches Control Center, the Lock Screen, and the Action Button simultaneously with zero per-surface code -- author a `Label` and a `.tint`, and the system places it everywhere the user chooses to put it. The most common way this goes wrong is treating Control Center like the old fixed-grid Control Center (it hasn't been one since iOS 18's pagination) while still shipping five controls nobody asked for, and treating a toggle's `isOn` as a live socket instead of a cached value that only updates on reload.

## The Apple way

- One `ControlWidget` = three surfaces (Control Center, Lock Screen, Action Button "Controls" mode) -- author once, place is the user's decision.
- Ship one or two genuinely high-value controls per app. The single most valuable one should need zero configuration to add.
- Controls are symbol-first. Control Center's default size and the Lock Screen show the symbol alone -- design meaning into the SF Symbol, never rely on the title being visible.
- StandBy is a presentation *context* for a widget you already built, not a family you opt a new widget into.
- `ControlCenter.shared.reloadControls(ofKind:)` is the push you're missing when a toggle looks stuck -- Control Center does not poll your data on its own schedule fast enough to feel live.

## When a control is worth building

| Signal | Build a control |
|---|---|
| Binary or small-enum state flipped several times a day (mute, focus, recording, connectivity) | YES |
| Zero-input action used constantly (quick capture, start the last-used timer preset) | YES |
| Action needs multi-step input or picking from many options | NO -- controls are glanceable, not a mini-form; use Shortcuts or the app |
| State rarely checked or changed (account settings) | NO |
| Feature already has a home-screen widget button doing the same thing | Reuse the SAME `AppIntent` -- add a `ControlWidget` wrapper, don't fork the logic |

## Core APIs

`ControlWidget` conforms to `Widget`, so it drops into the same `WidgetBundle` as home-screen widgets and Live Activities -- no separate extension target. Pick the configuration type by whether the control takes a parameter:

```swift
import WidgetKit
import SwiftUI
import AppIntents

// Zero-parameter control -- the common case. ControlValueProvider supplies an async
// value with nothing for the user to configure; StaticControlConfiguration never
// shows a config sheet.
struct FocusControl: ControlWidget {
    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(
            kind: "com.app.control.focus",
            provider: FocusValueProvider()
        ) { isOn in
            ControlWidgetToggle("Focus", isOn: isOn, action: ToggleFocusIntent()) { on in
                Label(on ? "On" : "Off", systemImage: on ? "moon.fill" : "moon")
            }
            .tint(.indigo)                                    // the ONE appearance lever
            .controlWidgetActionHint("Toggle Focus")          // Action Button / Dynamic Island caption
        }
        .displayName("Focus")
        .description("Turn Focus on or off")
    }
}

struct FocusValueProvider: ControlValueProvider {
    var previewValue = false                                  // shown in the gallery before real data loads
    func currentValue() async throws -> Bool { await FocusStore.shared.isActive }
}

struct ToggleFocusIntent: SetValueIntent {
    static var title: LocalizedStringResource = "Toggle Focus"
    @Parameter(title: "Enabled") var value: Bool              // system sets this before perform()

    func perform() async throws -> some IntentResult {
        await FocusStore.shared.setActive(value)
        ControlCenter.shared.reloadControls(ofKind: "com.app.control.focus")
        return .result()
    }
}

// Parameter-driven control -- user picks WHICH thing (which timer, which scene).
// AppIntentControlConfiguration forces a configuration sheet on every add; only
// reach for it when the control is genuinely parameterized.
struct TimerToggleControl: ControlWidget {
    var body: some ControlWidgetConfiguration {
        AppIntentControlConfiguration(
            kind: "com.app.timer", provider: TimerValueProvider()
        ) { timer in
            ControlWidgetToggle(timer.name, isOn: timer.isRunning, action: ToggleTimerIntent(timer: timer.entity)) { isOn in
                Label(isOn ? "Running" : "Stopped", systemImage: "timer")
            }
        }
        .displayName("Timer")
    }
}
```

`ControlWidgetButton(action:)` is the fire-and-forget form; `ControlWidgetButton(action:label:actionLabel:)` adds an `actionLabel` closure shown while/after the action runs, distinct from the resting `label`. Both templates carry `.tint(_:)` and `.controlWidgetActionHint(_:)` -- Control Center's Liquid Glass chrome (iOS 26+) composites around whatever `Label` you supply; do not attempt a custom background or `.containerBackground` on a control, it is not composited.

After any intent -- or app code -- mutates state a control reflects, call `ControlCenter.shared.reloadControls(ofKind:)` (or `.reloadAllControls()`), the direct analog of `WidgetCenter.shared.reloadTimelines(ofKind:)`. Skipping this is the single most common "my toggle is out of sync" report; the shared state itself must be extension-safe (App Group `UserDefaults`, a shared SwiftData/Core Data store, or an actor singleton compiled into both targets), because `currentValue()` and `perform()` run in the widget extension process, not the app.

A recurring review finding: an intent whose `perform()` reads `@State`/`@Observable` view state directly, on the assumption it always runs while some screen is on-screen. Invoked from Control Center or the Action Button it crashes or silently no-ops, because it runs in the extension process, not the app's foreground view hierarchy. The fix is always the same shared, extension-safe data layer described above -- never `@Environment`/view-owned state.

## Control Center capacity, anatomy, and the Action Button

iOS 18 turned Control Center into swipeable, user-built pages -- there is no fixed ~16-slot grid shared across every app. Capacity is effectively unlimited across pages; the constraint that still matters is user attention, not a slot ceiling. Design assuming a user adds one or two of your controls, and make the single most valuable one need no configuration.

The same control renders different amounts of content depending on where the system surfaces it:

| Surface | Shown | Design consequence |
|---|---|---|
| Control Center, small size | Symbol only | The symbol alone must be unambiguous |
| Control Center, large size | Symbol + title + value | Title/value appear only when the user resizes larger -- never depend on them |
| Lock Screen | Symbol only, always | If a control's meaning depends on its title, it is broken on the Lock Screen |
| Action Button long-press | Symbol + value in the Dynamic Island | Driven by `.tint` + `.controlWidgetActionHint` |

**Discovery.** Long-pressing empty Control Center space enters edit mode; "Add a Control" opens a searchable gallery grouped by app. `.displayName(_:)`, `.description(_:)`, and the `ControlValueProvider`'s `previewValue` are what the user sees there -- a weak display name or a misleading preview value hurts discoverability as much as a missing feature would.

Shipping a `ControlWidget` **does** make it Action-Button-selectable as of iOS 18 -- the user goes to Settings > Action Button > Controls > Choose a Control. `AppShortcutsProvider` is a separate, complementary route (Siri, Spotlight, and the Action Button's "Shortcut" mode); it remains the *only* route on an iPhone 15 Pro running iOS 17. Ship both when you want maximum reach:

| Action Button mode | Binds to | Registered via | Since |
|---|---|---|---|
| Controls | Any `ControlWidget` (yours or Apple's) | Ship the `ControlWidget` | iOS 18 |
| Shortcut | A Shortcut / App Shortcut | `AppShortcutsProvider` phrases | iOS 17 |

Current Action Button hardware: iPhone 15 Pro / 15 Pro Max, every iPhone 16 model (not Pro-only), iPhone 16e, and the full iPhone 17 line including iPhone Air. Constraints on the bound intent: one intent per press (branching beyond a Shortcuts automation isn't available), and the intent must be extension-safe and idempotent -- a stuck press or a watch mirror can double-fire it, and it never assumes a foreground view hierarchy. Because there is no screen to glance at, confirm the press with `.result(dialog:)` and/or a `.sensoryFeedback` haptic inside `perform()`; silent success is indistinguishable from a missed press.

The full `openAppWhenRun`/`OpenIntent`/`supportedModes` story -- including the iOS 26 deprecation -- lives in `references/platform/02-app-intents-system.md#opening-the-app-from-a-control-ios-26` (owner); a control that must open the app to show a result should conform to `OpenIntent` there.

## StandBy (iOS 17+)

StandBy activates automatically when the phone is charging, in landscape, and locked. It is not a widget family you opt into with code: any `.systemSmall` widget that already implements `.containerBackground(for:)` correctly appears in StandBy automatically -- there is no `StandByConfiguration` type and no `.accessoryStandBy` `WidgetFamily` case.

| Property | Behavior |
|---|---|
| Supported family | `.systemSmall` only |
| Background | The system strips whatever you pass to `.containerBackground(.fill.tertiary, for: .widget)` and substitutes its own; use the closure form for a custom look, and expect StandBy to still reprocess it for legibility |
| Interaction | Tap navigates to the app; `Button`/`Toggle` interactive elements (iOS 17+) work identically to the Home Screen |
| Night mode | Auto-switches to a red-tinted, low-luminance render (`\.colorScheme` still reports `.dark`; there is no dedicated night-mode environment key) |
| Live Activities | Render in StandBy through the same Lock Screen presentation -- no separate StandBy layout to author; a `Text(timerInterval:countsDown:)` keeps ticking live with no polling |

Design for arm's-length viewing (2-4 feet, not reading distance): bias the primary value to `.title2`/`.title3`, `.headline` minimum for anything load-bearing. Show one glanceable fact, not a mini-dashboard -- there is no reliable `isStandBy` environment read, so a `.systemSmall` widget's body must work in both contexts by design, not by branching. Favor high contrast over multi-hue color coding, since the night-mode red tint desaturates everything else.

## Two things Control Center controls do NOT have

**Relevance/ranking.** `TimelineEntryRelevance` (Home Screen Smart Stack ranking) and `ActivityContent.relevanceScore` (Live Activity/Dynamic Island competition) are both real, but neither applies to controls. `ControlWidget`/`StaticControlConfiguration`/`AppIntentControlConfiguration` expose no relevance, priority, or ranking API -- Control Center ordering is entirely user-drag. Never suggest a `.controlWidgetRelevance()`-style modifier; it does not exist.

**A distinct rendering-mode branch.** Home Screen and Lock Screen widgets read `\.widgetRenderingMode` (see `references/platform/01-widgets-live-activities.md#rendering-modes-and-liquid-glass-tinting`, owner) to adapt to `.fullColor`/`.accented`/`.vibrant`. Controls don't expose an equivalent -- Control Center composites your `Label` directly into its own Liquid Glass chrome (iOS 26+); there is no accented/vibrant case to author for a control.

## Availability + fallbacks

```swift
// ControlWidget has no pre-18 shape -- gate the whole registration, or ship a
// widget-only WidgetBundle entry for users below the floor.
@main
struct AppWidgets: WidgetBundle {
    var body: some Widget {
        HomeStatusWidget()          // iOS 16+, unaffected
        if #available(iOS 18, *) {
            FocusControl()
            TimerToggleControl()
        }
    }
}
```

Control Center's Liquid Glass chrome (iOS 26+) requires no code branch -- the system composites it automatically around any control built for iOS 18. There is no Material-based fallback to author because you never draw the container in the first place.

## Accessibility contract

A control's only content is a `Label` -- VoiceOver reads the label, value, and `.controlWidgetActionHint` text without additional work, and Voice Control targets it by that same label ("tap Focus"). There is no custom animation surface: symbol/state swaps are instantaneous system transitions, not something you animate. Give every control a specific `.displayName(_:)` and `.description(_:)` -- these are what VoiceOver and the controls gallery both read to let a user identify and add it; a generic name is a real discoverability defect, not a cosmetic one. Because Control Center, the Lock Screen, and the Action Button are all system-owned lists, standard Full Keyboard Access / Switch Control navigation to a control is the system's responsibility, not something a `ControlWidget` author configures.

## Anti-patterns

| Wrong | Why it fails | Right |
|---|---|---|
| `AppIntentControlConfiguration` for a zero-parameter control | Forces an unnecessary configuration sheet on every add | `StaticControlConfiguration` + `ControlValueProvider` |
| Separate logic for a home-screen widget `Button` and a `ControlWidgetToggle` | Two sources of truth drift out of sync | Both call the SAME `AppIntent`/`SetValueIntent` type |
| Treating `ControlWidgetToggle`'s `isOn` as a live socket | Control Center caches the last-known value | Call `ControlCenter.shared.reloadControls(ofKind:)` after any state change |
| Theming or backgrounding a control | Renders inside Control Center's own Liquid Glass chrome; custom backgrounds aren't composited | Supply `Label` + `.tint(_:)` only |
| A "menu" control branching on long-press vs. tap | `ControlWidgetButton`/`Toggle` support one interaction each -- no secondary-gesture API | Ship one focused control per action |
| Building a separate "StandBy widget" | `.accessoryStandBy` doesn't exist | Reuse the existing `.systemSmall` widget; branch only if content genuinely differs |
| Reusing a `Widget`'s `kind` string for a `ControlWidget` | Undefined behavior -- kinds must be unique per registered configuration | Distinct namespaces, e.g. `"com.app.widget.status"` vs `"com.app.control.focus"` |
| Assuming Control Center still enforces a hard slot cap | iOS 18 made it paginated and effectively unlimited | Curate to 1-2 high-value controls anyway -- the constraint is attention, not slots |
| `ControlWidgetButton(action:)` wired to a URL, or reaching for `widgetURL(_:)` on a control | Neither exists -- `ControlWidgetButton` only accepts an `AppIntent`-conforming action, and `widgetURL(_:)` is a `Widget`-family-only modifier | Bridge to a URL through `OpenIntent` (`references/platform/02-app-intents-system.md#opening-the-app-from-a-control-ios-26`, owner) |

## Severity guide

CRITICAL: a control ships with no App-Group-safe state and crashes/no-ops when invoked from the Action Button or Control Center (intent read view-owned state directly). HIGH: theming attempt that silently fails to render, or an `AppIntentControlConfiguration` on a zero-param control forcing every user through a pointless sheet. MEDIUM: missing `reloadControls` after an external state change (visible desync, not a crash). LOW: no `.tint`/`.controlWidgetActionHint` on a branded toggle (falls back to system defaults). NIT: a symbol choice that's ambiguous only at the largest Control Center size.

## See also

- `references/platform/02-app-intents-system.md#opening-the-app-from-a-control-ios-26` -- `OpenIntent`, the `openAppWhenRun` -> `supportedModes` migration, and the App Intents perform contract (owner)
- `references/platform/02-app-intents-system.md#action-button-iphone-15-pro` -- App Intents' own Action Button entry point
- `references/platform/01-widgets-live-activities.md#rendering-modes-and-liquid-glass-tinting` -- `\.widgetRenderingMode`, `.widgetAccentable()` (owner)
- `references/haptics/02-swiftui-sensory-feedback.md` -- `.sensoryFeedback` for Action Button press confirmation
