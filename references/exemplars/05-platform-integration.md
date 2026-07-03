# Exemplar: Widget + Live Activity + Control Center Integration

> Status: signature-drafted, build-pending (requires Xcode build at iOS 18 + iOS 26 targets).
> Composes: `references/platform/01-widgets-live-activities.md` (widget/Live Activity fundamentals), `references/platform/02-app-intents-system.md` (`AppIntent` design), `references/platform/03-controls-standby.md` (`ControlWidget` fundamentals).
> Floors: `WidgetConfigurationIntent`/interactive `Button`/`Toggle` iOS 17.0+; `ControlWidget` iOS 18.0+; `SetValueIntent`, `LiveActivityIntent` iOS 17.2+; `supplementalActivityFamilies`/`widgetAccentedRenderingMode` iOS 26.0+.

A home-screen widget, a lock-screen accessory, a Live Activity with Dynamic Island, and a Control Center control that ALL drive the same feature through the SAME `AppIntent` layer, registered in ONE `WidgetBundle`. The #1 shipping mistake this exemplar exists to prevent: duplicating the toggle/action logic per surface -- they drift the moment one is edited without the others.

## The Apple way

- One intent per action, reused everywhere: a widget button, a Live Activity button, and a Control Center control all invoke the SAME `AppIntent` type -- never re-implement the mutation per surface.
- `SetValueIntent` for binary/settable state (drives `Toggle`); plain `AppIntent` for a stateless action (drives `Button`). Confusing the two is a compile error, not a style choice.
- Extension targets cannot call `UIApplication.shared.open` -- foregrounding the app from a widget/control/Live Activity ALWAYS routes through `.result(opensIntent: OpenURLIntent(...))`, never `openAppWhenRun` (deprecated on iOS 26).
- `ContentState` is the ONLY part of a Live Activity that changes over its life and must encode under 4KB (the APNs payload cap) -- put slow-changing facts in `ActivityAttributes`, not `ContentState`.
- Prefer `Text(_:style: .timer)`/`Text(timerInterval:countsDown:)` for any visible countdown -- it ticks locally with zero push/timeline cost.

## Core APIs

### Part A -- shared foundation: App Group store, `ActivityAttributes`, the one intent layer

```swift
import ActivityKit
import AppIntents
import WidgetKit
import Foundation

enum Shared {
    static let appGroup = "group.com.example.focus"
    static let defaults = UserDefaults(suiteName: Shared.appGroup)!
}

// Extension-safe state -- no UIKit, no app-only APIs; compiled into BOTH the app and widget targets.
actor FocusStore {
    static let shared = FocusStore()
    var isActive: Bool { Shared.defaults.bool(forKey: "focus.active") }
    var sessionEnd: Date { Shared.defaults.object(forKey: "focus.end") as? Date ?? .now }

    func setActive(_ on: Bool, minutes: Int = 25) {
        Shared.defaults.set(on, forKey: "focus.active")
        Shared.defaults.set(on ? Date.now.addingTimeInterval(Double(minutes) * 60) : Date.now, forKey: "focus.end")
        WidgetCenter.shared.reloadTimelines(ofKind: "FocusStatusWidget")
        if #available(iOS 18.0, *) { ControlCenter.shared.reloadControls(ofKind: "com.example.control.focus") }
    }
}

struct FocusAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {   // the ONLY part that changes; keep < 4KB encoded
        var isActive: Bool
        var sessionEnd: Date          // drives Text(timerInterval:) -- auto-ticks, zero push cost
        var completedIntervals: Int
    }
    var goalTitle: String             // fixed for the activity's lifetime
    var totalIntervals: Int
}

// MARK: - The shared intents -- every surface reuses these, never re-implements the mutation.

/// Binary state → SetValueIntent. System sets @Parameter value to the NEW state before perform().
struct ToggleFocusIntent: SetValueIntent {
    static let title: LocalizedStringResource = "Toggle Focus"
    @Parameter(title: "Enabled") var value: Bool
    func perform() async throws -> some IntentResult { await FocusStore.shared.setActive(value); return .result() }
}

/// Stateless action → plain AppIntent. Runs in-process from a widget, no app launch.
struct AddIntervalIntent: AppIntent {
    static let title: LocalizedStringResource = "Add Interval"
    func perform() async throws -> some IntentResult { await FocusStore.shared.setActive(true); return .result() }
}

/// Interactive button INSIDE a Live Activity/Dynamic Island → LiveActivityIntent (iOS 17.2+), not AppIntent.
struct EndFocusIntent: LiveActivityIntent {
    static let title: LocalizedStringResource = "End Focus"
    func perform() async throws -> some IntentResult { await FocusStore.shared.setActive(false); return .result() }
}

/// Foreground the app from a widget/control. Extensions CANNOT call UIApplication.shared.open --
/// return .result(opensIntent:), never the deprecated openAppWhenRun.
struct OpenFocusIntent: AppIntent {
    static let title: LocalizedStringResource = "Open Focus"
    func perform() async throws -> some IntentResult & OpensIntent {
        .result(opensIntent: OpenURLIntent(URL(string: "focusapp://session")!))
    }
}
```

The intent types must be visible to BOTH the app target and the widget-extension target -- add this file to both targets' membership. That shared membership is the mechanism that makes "one intent, every surface" real.

### Part B -- interactive home-screen + accessory widget

```swift
import SwiftUI

struct FocusEntry: TimelineEntry {
    let date: Date; let isActive: Bool; let sessionEnd: Date; let completed: Int
    static let placeholder = FocusEntry(date: .now, isActive: false, sessionEnd: .now, completed: 0)
}

struct FocusProvider: AppIntentTimelineProvider {
    func placeholder(in context: Context) -> FocusEntry { .placeholder }
    func snapshot(for configuration: FocusConfigIntent, in context: Context) async -> FocusEntry { await currentEntry() }
    func timeline(for configuration: FocusConfigIntent, in context: Context) async -> Timeline<FocusEntry> {
        let entry = await currentEntry()
        // Reload when the session is due to end; otherwise the intent's own reload drives updates.
        return Timeline(entries: [entry], policy: entry.isActive ? .after(entry.sessionEnd) : .never)
    }
    private func currentEntry() async -> FocusEntry {
        let active = await FocusStore.shared.isActive
        return FocusEntry(date: .now, isActive: active, sessionEnd: await FocusStore.shared.sessionEnd, completed: 0)
    }
}

struct FocusConfigIntent: WidgetConfigurationIntent {
    static let title: LocalizedStringResource = "Focus"
    static let description = IntentDescription("Track and toggle your focus session.")
}

struct FocusStatusWidget: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: "FocusStatusWidget", intent: FocusConfigIntent.self, provider: FocusProvider()) { entry in
            FocusWidgetView(entry: entry)
                .containerBackground(.fill.tertiary, for: .widget)   // iOS 17+ REQUIRED or the widget won't render
        }
        .configurationDisplayName("Focus")
        .description("Toggle focus and see time remaining.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular, .accessoryRectangular, .accessoryInline])
        .widgetAccentedRenderingMode(.accented)   // iOS 26: how the accent group tints under Liquid Glass
    }
}

struct FocusWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: FocusEntry

    var body: some View {
        switch family {
        case .accessoryInline:
            Label(entry.isActive ? "Focus ends" : "Focus off", systemImage: entry.isActive ? "moon.fill" : "moon")
        case .accessoryCircular:
            Gauge(value: 0.4) { Image(systemName: "moon.fill") }.gaugeStyle(.accessoryCircularCapacity)
        case .accessoryRectangular:
            HStack {
                Image(systemName: "moon.fill").widgetAccentable()   // iOS 18: lift into the accent-tinted layer
                if entry.isActive { Text(entry.sessionEnd, style: .timer).font(.headline.monospacedDigit()) }
                else { Text("Focus off") }
            }
            .widgetLabel("Focus")   // accessory-only: the label the system draws around the complication
        default:
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Image(systemName: "moon.fill").imageScale(.large).foregroundStyle(.tint).widgetAccentable()
                    Spacer()
                    Toggle(isOn: entry.isActive, intent: ToggleFocusIntent()) { Text(entry.isActive ? "On" : "Off") }
                        .toggleStyle(.button)   // widgets need an EXPLICIT toggle style
                }
                if entry.isActive { Text(entry.sessionEnd, style: .timer).font(.system(.title, design: .rounded).monospacedDigit()) }
                Button(intent: AddIntervalIntent()) { Label("+ Interval", systemImage: "plus.circle.fill") }
                    .buttonStyle(.borderedProminent).tint(.indigo)
            }
            .widgetURL(URL(string: "focusapp://session"))   // whole-widget deep link for taps outside a control
        }
    }
}
```

Interactive widgets (iOS 17+) support ONLY `Button` and `Toggle` -- no `Slider`/`TextField`/`Picker`/`Stepper`. `perform()` runs in-process (no app launch), then WidgetKit reloads the timeline. `.containerBackground(_:for: .widget)` is mandatory iOS 17+ -- its absence is a runtime blank, not merely cosmetic.

### Part C -- Live Activity + Dynamic Island

```swift
struct FocusLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: FocusAttributes.self) { context in
            FocusLockScreenView(context: context)
                .activityBackgroundTint(Color.indigo.opacity(0.18))
                .activitySystemActionForegroundColor(.indigo)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Label("\(context.state.completedIntervals)/\(context.attributes.totalIntervals)", systemImage: "checkmark.circle.fill")
                        .font(.caption).foregroundStyle(.indigo)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text(context.state.sessionEnd, style: .timer).font(.title3.monospacedDigit()).frame(width: 64)
                }
                DynamicIslandExpandedRegion(.center) { Text(context.attributes.goalTitle).font(.headline).lineLimit(1) }
                DynamicIslandExpandedRegion(.bottom) {
                    // Interactive button INSIDE the Dynamic Island → LiveActivityIntent, not a bare AppIntent.
                    Button(intent: EndFocusIntent()) { Label("End Session", systemImage: "stop.circle.fill") }
                        .buttonStyle(.borderedProminent).tint(.indigo)
                }
            } compactLeading: {
                Image(systemName: "moon.fill").foregroundStyle(.indigo)
            } compactTrailing: {
                Text(context.state.sessionEnd, style: .timer).font(.caption2.monospacedDigit()).frame(width: 44)
            } minimal: {
                Image(systemName: "moon.fill").foregroundStyle(.indigo)
            }
            .keylineTint(.indigo)
            .widgetURL(URL(string: "focusapp://session"))
        }
        // iOS 26: extra layouts for Apple Watch Smart Stack / CarPlay.
        .supplementalActivityFamilies([.small, .medium])
    }
}

struct FocusLockScreenView: View {
    let context: ActivityViewContext<FocusAttributes>
    @Environment(\.activityFamily) private var family   // iOS 26: .small (watch) | .medium | unset (phone)

    var body: some View {
        switch family {
        case .small:
            HStack { Image(systemName: "moon.fill").foregroundStyle(.indigo); Text(context.state.sessionEnd, style: .timer).font(.headline.monospacedDigit()) }
                .padding(.horizontal)
        default:
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Label(context.attributes.goalTitle, systemImage: "moon.fill").font(.headline).foregroundStyle(.indigo)
                    Spacer()
                    if context.isStale { Image(systemName: "arrow.clockwise").foregroundStyle(.secondary) }
                }
                HStack(alignment: .firstTextBaseline) {
                    Text(context.state.sessionEnd, style: .timer).font(.system(size: 34, weight: .semibold, design: .rounded).monospacedDigit())
                    Spacer()
                    Text("\(context.state.completedIntervals)/\(context.attributes.totalIntervals)").font(.title3.monospacedDigit()).foregroundStyle(.secondary)
                }
                ProgressView(value: progress).tint(.indigo)
            }
            .padding().contentMargins(.all, 16, for: .expanded)
        }
    }
    private var progress: Double {
        guard context.attributes.totalIntervals > 0 else { return 0 }
        return Double(context.state.completedIntervals) / Double(context.attributes.totalIntervals)
    }
}
```

Expanded regions are `.leading`/`.trailing`/`.center`/`.bottom`; `compactLeading`/`compactTrailing`/`minimal` must stay tiny -- one symbol or a fixed-width timer. Auto-updating time (`Text(_:style: .timer)`) renders locally with zero push/timeline cost -- the correct pattern for any countdown, never push every second.

### Part D -- lifecycle: request / update / end

```swift
@MainActor
final class FocusActivityManager {
    static let shared = FocusActivityManager()
    private var activity: Activity<FocusAttributes>?

    func start(goal: String, intervals: Int, minutes: Int) throws {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { throw ActivityError.notEnabled }
        let attributes = FocusAttributes(goalTitle: goal, totalIntervals: intervals)
        let end = Date.now.addingTimeInterval(Double(minutes) * 60)
        let state = FocusAttributes.ContentState(isActive: true, sessionEnd: end, completedIntervals: 0)

        activity = try Activity.request(attributes: attributes,
                                         content: ActivityContent(state: state, staleDate: end.addingTimeInterval(120)),
                                         pushType: .token)

        if let activity {
            Task {
                // The token ROTATES -- observe the sequence, don't read .pushToken once.
                for await tokenData in activity.pushTokenUpdates {
                    let hex = tokenData.map { String(format: "%02x", $0) }.joined()
                    await Backend.register(activityId: activity.id, token: hex)
                }
            }
        }
    }

    func advance(completed: Int, newEnd: Date, alert: Bool = false) async {
        guard let activity else { return }
        let state = FocusAttributes.ContentState(isActive: true, sessionEnd: newEnd, completedIntervals: completed)
        let alertConfig: AlertConfiguration? = alert
            ? AlertConfiguration(title: "Interval done", body: "Time for a break.", sound: .default) : nil

        // relevanceScore ranks concurrent activities in the Dynamic Island (higher wins the pill).
        await activity.update(ActivityContent(state: state, staleDate: newEnd.addingTimeInterval(120), relevanceScore: alert ? 100 : 50),
                               alertConfiguration: alertConfig, timestamp: .now)   // out-of-order updates older than the last are ignored
    }

    func end(dismissAfter seconds: TimeInterval = 0) async {
        guard let activity else { return }
        let final = FocusAttributes.ContentState(isActive: false, sessionEnd: .now, completedIntervals: activity.content.state.completedIntervals)
        await activity.end(ActivityContent(state: final, staleDate: nil),
                            dismissalPolicy: seconds == 0 ? .immediate : .after(.now.addingTimeInterval(seconds)))
        self.activity = nil
    }

    enum ActivityError: Error { case notEnabled }
}
```

`update(_:alertConfiguration:timestamp:)` (iOS 17.2+) is current; the older `update(using:alertConfiguration:)` is deprecated. `AlertConfiguration(title:body:sound:)` banners on iPhone/iPad and alerts on Apple Watch. There is NO fixed per-minute Live Activity update cap -- the system enforces a throttled, managed budget (payload capped at 4KB, active updates for roughly 8 hours, remaining on the Lock Screen up to roughly 12 hours total from start before a force-end); prefer local `Text(timerInterval:)` ticking over pushing on any fixed cadence regardless. Gate `Activity.request` on `ActivityAuthorizationInfo().areActivitiesEnabled` -- users can disable Live Activities per app.

### Part E -- Control Center `ControlWidget` + the unifying `WidgetBundle`

```swift
struct FocusControlValueProvider: ControlValueProvider {
    var previewValue: Bool { false }
    func currentValue() async throws -> Bool { await FocusStore.shared.isActive }
}

struct FocusControl: ControlWidget {
    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: "com.example.control.focus", provider: FocusControlValueProvider()) { isOn in
            ControlWidgetToggle("Focus", isOn: isOn, action: ToggleFocusIntent()) { on in
                Label(on ? "On" : "Off", systemImage: on ? "moon.fill" : "moon")
            }
            .tint(.indigo)                                   // ONLY color lever a control has
            .controlWidgetActionHint("Toggle Focus")           // verb shown by the Action button / DI confirmation
        }
        .displayName("Focus")
        .description("Turn your focus session on or off.")
    }
}

struct AddIntervalControl: ControlWidget {
    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: "com.example.control.addinterval") {
            ControlWidgetButton(action: AddIntervalIntent()) { Label("Add Interval", systemImage: "plus.circle") }.tint(.indigo)
        }
        .displayName("Add Interval")
    }
}

struct OpenFocusControl: ControlWidget {
    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: "com.example.control.open") {
            ControlWidgetButton(action: OpenFocusIntent()) { Label("Open Focus", systemImage: "arrow.up.forward.app") }
        }
        .displayName("Open Focus")
    }
}

@main
struct FocusWidgetBundle: WidgetBundle {
    var body: some Widget {
        FocusStatusWidget()      // home-screen + accessory widget
        FocusLiveActivity()      // Live Activity + Dynamic Island
        FocusControl()           // Control Center toggle
        AddIntervalControl()     // Control Center button
        OpenFocusControl()       // Control Center open-app button
    }
}
```

`ControlWidget` conforms to `Widget`, so `WidgetBundle`'s result builder accepts it right beside `AppIntentConfiguration` and `ActivityConfiguration` widgets -- one extension target hosts every surface. `StaticControlConfiguration` (zero-parameter, the default -- the toggle's live value comes from a `ControlValueProvider`) vs `AppIntentControlConfiguration` (parameterized -- forces a config sheet every time the user adds the control; reserve for genuinely "which of my N things" controls). A control's content is ONLY a `Label` (+ optional `valueLabel`/`actionLabel` closures) -- no stacks, no custom layout, no background; `.tint(_:)` is the only color, and there is no `.containerBackground` on a control -- Control Center supplies the Liquid Glass chrome. Refresh a control after external state change with `ControlCenter.shared.reloadControls(ofKind:)` (Part A's `FocusStore.setActive`) -- a control's `isOn` is cached and refreshes on system intervals and after its intent runs, not via a live socket.

## Availability + fallbacks

```swift
if #available(iOS 18.0, *) {
    ControlCenter.shared.reloadControls(ofKind: "com.example.control.focus")
}
// ControlWidget itself has no pre-18 shape -- omit the whole ControlWidget type from the
// WidgetBundle below iOS 18; widget + Live Activity surfaces are unaffected.
```

`supplementalActivityFamilies`/`\.activityFamily`/`widgetAccentedRenderingMode` are iOS 26.0+ -- gate the `.small` family branch and the rendering-mode modifier behind `#available(iOS 26.0, *)`; the phone-only Lock Screen/Dynamic Island layouts above already work unmodified back to iOS 17.2 for the Live Activity, iOS 17.0 for the widget.

## Accessibility contract

Every widget/control/Live Activity surface renders through system chrome that is already accessible -- VoiceOver labels each control automatically. Your obligation: every `Button`/`Toggle` label reads its own state correctly (`Label(on ? "On" : "Off", ...)`, not a static string); auto-updating `Text(style: .timer)` announces correctly without your intervention; the Dynamic Island's interactive `EndFocusIntent` button needs no extra label beyond its `Label`. No Reduce Motion surface of its own -- none of this file's motion is developer-controlled (system-owned transitions for widget/Island presentation).

## Anti-patterns

| Wrong | Why it fails | Right |
|---|---|---|
| `openAppWhenRun = true` to foreground the app from a widget/control | Deprecated on iOS 26 | `.result(opensIntent: OpenURLIntent(...))` |
| Duplicating the toggle mutation logic in the widget, the Live Activity button, and the control | The three surfaces drift the moment one is edited alone | One `SetValueIntent`/`AppIntent`, shared target membership, reused everywhere |
| A `Button(intent:)` inside `DynamicIslandExpandedRegion` using a plain `AppIntent` | Wrong protocol for Live Activity/DI interactivity | `LiveActivityIntent` (iOS 17.2+) |
| Reading `activity.pushToken` once and caching it | The token ROTATES; a one-time read silently stops receiving updates | `for await token in activity.pushTokenUpdates` |
| "~4 updates/min" treated as a hard Live Activity cap in code comments/docs | No fixed per-minute cap exists -- it's a system-managed throttled budget | Budget for the payload cap (4KB) and duration limits (~8h active / ~12h total), not an invented rate |
| Missing `.containerBackground(_:for: .widget)` | Runtime-blank widget, not merely unstyled | Always supply it, iOS 17+ |
| `Toggle(isOn:intent:)` with no explicit `.toggleStyle(.button)` in a widget | May not render as expected in widget context | Set the style explicitly |

## Severity guide

CRITICAL: `openAppWhenRun` shipped on iOS 26 (deprecated path, may silently regress). HIGH: duplicated per-surface toggle logic that has already drifted between widget and control. MEDIUM: missing `.containerBackground` (blank widget) or a Live Activity `LiveActivityIntent` swapped for a plain `AppIntent`. LOW: reading `pushToken` once instead of observing `pushTokenUpdates`. NIT: an un-gated `supplementalActivityFamilies` call at a sub-26 floor.

## See also

- `references/platform/01-widgets-live-activities.md` -- widget/Live Activity fundamentals, refresh budget (owner)
- `references/platform/02-app-intents-system.md` -- `AppIntent` design, `SetValueIntent` (owner)
- `references/platform/03-controls-standby.md` -- `ControlWidget` fundamentals, Control Center capacity (owner)
- `references/haptics/02-swiftui-sensory-feedback.md` -- no haptics cross widget-extension process boundaries; pair visual feedback in-app instead
