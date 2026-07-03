# Widgets and Live Activities

Widgets put your app's content on the home screen and lock screen. Live Activities show real-time status in the Dynamic Island and lock screen. Both deepen your app's integration with iOS.

## When to add widgets

| App has | Widget makes sense |
|---|---|
| At-a-glance data (status, score, progress) | YES |
| Quick actions users do often | YES (interactive widgets, iOS 17+) |
| Always-changing content (news, calendar) | YES |
| Deep app data that benefits from preview | YES |
| Content only useful inside the app | NO |
| Complex interactions | NO (widgets are limited interactions) |

## Widget families

| Family | Size | Use case |
|---|---|---|
| `.systemSmall` | 2x2 grid | Single piece of info |
| `.systemMedium` | 4x2 grid | Multiple pieces, simple layout |
| `.systemLarge` | 4x4 grid | Detailed data |
| `.systemExtraLarge` | 8x4 (iPad) | Spreadsheet-style |
| `.accessoryCircular` | Lock screen circle | Watch-style indicator |
| `.accessoryRectangular` | Lock screen text | Status line |
| `.accessoryInline` | Lock screen line | Plain text under clock |

## Basic widget

```swift
import WidgetKit
import SwiftUI

struct MyWidget: Widget {
    let kind = "MyWidget"
    
    var body: some WidgetConfiguration {
        AppIntentConfiguration(
            kind: kind,
            intent: ConfigurationIntent.self,
            provider: Provider()
        ) { entry in
            WidgetView(entry: entry)
                .containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName("My Widget")
        .description("Shows relevant info at a glance")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}
```

## TimelineProvider

```swift
struct Provider: AppIntentTimelineProvider {
    func snapshot(for configuration: ConfigurationIntent, in context: Context) async -> SimpleEntry {
        SimpleEntry(date: .now, data: .placeholder)
    }
    
    func timeline(for configuration: ConfigurationIntent, in context: Context) async -> Timeline<SimpleEntry> {
        // Build entries
        let now = Date()
        var entries: [SimpleEntry] = []
        
        for hourOffset in 0..<24 {
            let entryDate = Calendar.current.date(byAdding: .hour, value: hourOffset, to: now)!
            let entry = SimpleEntry(date: entryDate, data: await fetchData(for: entryDate))
            entries.append(entry)
        }
        
        return Timeline(entries: entries, policy: .after(.now.addingTimeInterval(24 * 3600)))
    }
    
    func placeholder(in context: Context) -> SimpleEntry {
        SimpleEntry(date: .now, data: .placeholder)
    }
}
```

### Refresh policy

| Policy | When |
|---|---|
| `.atEnd` | After last entry's date |
| `.after(date)` | At a specific date -- a request, not a guarantee; the system may service it late under budget pressure |
| `.never` | Manual refresh only -- pair with `WidgetCenter` reloads or the push path below |

WidgetKit grants each widget a rolling background-refresh budget scaled to how often the user actually looks at it: heavily-viewed widgets get roughly **40-70 reloads/day**, rarely-viewed ones far fewer. This range is OBSERVED behavior, not an Apple-published contract -- the budget is adaptive and tightens further in Low Power Mode. Reloads that spend budget: `.atEnd`/`.after` expirations, `WidgetCenter.shared.reloadTimelines(ofKind:)` / `reloadAllTimelines()`, and background-push reloads. Reloads that don't: on-screen relative/timer text (`Text(date, style: .timer)` / `.relative`), and the automatic reload after an interactive-intent `perform()` -- that's a user action, not a background poll.

Design rule: match reload cadence to the data's real change rate. A widget that reloads every 5 minutes "just in case" exhausts its budget by midday and shows stale data for the rest of the day -- worse than a smart hourly schedule.

### Push-based reloads (iOS 26)

Widgets can be reloaded by a server push instead of only timeline expiration -- built for event-driven data (a score change, a delivery step) where polling would waste budget and still lag:

1. The widget vends a push token, surfaced per-configuration through `WidgetCenter` push info. Forward it to your backend the same way you handle a Live Activity token.
2. Your server sends an APNs push with **push-type `widgets`** -- topic header `<your-bundle-id>.push-type.widgets`. The push does not carry rendered content; it tells WidgetKit to request a fresh timeline, so `timeline(for:in:)` still runs -- keep it cheap.
3. Push reloads are still rate-managed by the system, throttled like the background budget -- push buys timeliness, not an unlimited firehose.

Pattern: `Timeline(entries: [entry], policy: .never)` + push, so you never burn budget polling. Confirm the exact symbol names (`WidgetPushHandler` and the push-token accessor) against the Xcode 26 SDK before shipping -- the mechanism is stable; the surface names are newer than the rest of this API.

## Interactive widgets (iOS 17+)

Widgets can host interactive elements via App Intents:

```swift
struct ToggleIntent: AppIntent {
    static var title: LocalizedStringResource = "Toggle Status"
    
    func perform() async throws -> some IntentResult {
        await StatusManager.shared.toggle()
        return .result()
    }
}

struct WidgetView: View {
    let entry: SimpleEntry
    
    var body: some View {
        VStack {
            Text(entry.data.title)
            
            Button(intent: ToggleIntent()) {
                Image(systemName: entry.data.isActive ? "checkmark.circle.fill" : "circle")
            }
        }
    }
}
```

Buttons in widgets must use App Intents. The system runs the intent, then refreshes the widget.

## Container background (iOS 17+)

Widgets need an explicit container background:

```swift
WidgetView(entry: entry)
    .containerBackground(.fill.tertiary, for: .widget)
```

Or for image backgrounds:

```swift
WidgetView(entry: entry)
    .containerBackground(for: .widget) {
        Image("background").resizable().scaledToFill()
    }
```

## Rendering modes and Liquid Glass tinting

A widget is not always drawn in full color. Read `\.widgetRenderingMode` and mark tintable content -- skipping this is the single most common reason a widget "looks broken" the instant a user leaves the default Home Screen appearance:

```swift
@Environment(\.widgetRenderingMode) private var renderingMode

var body: some View {
    switch renderingMode {
    case .fullColor:
        // Home Screen, StandBy: colors render as-authored.
        Image(systemName: "flame.fill").foregroundStyle(.orange)
    case .accented:
        // iOS 18+ tinted Home Screen, watchOS. System splits the widget into a default
        // group (fixed white/gray) and an accent group tinted with the user's color.
        Image(systemName: "flame.fill").widgetAccentable()
    case .vibrant:
        // Lock Screen, StandBy: desaturated and recolored by luminance. Design for
        // contrast, not hue -- custom .foregroundStyle colors are ignored here.
        Image(systemName: "flame.fill")
    @unknown default:
        Image(systemName: "flame.fill")
    }
}
```

Anything NOT marked `.widgetAccentable()` renders in a fixed gray/white under `.accented`/`.vibrant`, regardless of its real color. `.widgetAccentedRenderingMode(_:)` (iOS 18+) gives an `Image` finer control (`.accented`, `.accentedDesaturated`, `.desaturated`, `.fullColor`) without an all-or-nothing toggle -- prefer `.accentedDesaturated` for photos so they don't re-tint into a flat colored blob.

**Audit requirement for the iOS 26 glass/tint pass:** when the Home Screen appearance is set to Clear or a tint color, the system automatically replaces your `.containerBackground(for: .widget)` view with themed Liquid Glass and re-renders content through this SAME `.accented` path. You don't opt in to the glass background -- every widget gets it in tinted mode -- but you own making content still read correctly once everything goes monochrome-white. Every widget shipped since iOS 16 needs its rendering-mode handling reviewed before it can be called current; ship one unreviewed and treat it as a MEDIUM finding.

## Shared data between app and widget

Use App Groups for shared `UserDefaults` or SwiftData containers:

```swift
// In both app and widget extension
let sharedDefaults = UserDefaults(suiteName: "group.com.myapp.shared")

// SwiftData shared container
let container = try ModelContainer(
    for: Item.self,
    configurations: .init(
        url: FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: "group.com.myapp.shared")!
            .appending(path: "Model.sqlite")
    )
)
```

Trigger widget refresh from the app:

```swift
import WidgetKit
WidgetCenter.shared.reloadTimelines(ofKind: "MyWidget")

// Reload all widgets:
WidgetCenter.shared.reloadAllTimelines()
```

## Widget design

| Rule | Detail |
|---|---|
| One purpose per widget | Don't cram multiple data views |
| Tap = open relevant deep link | Not just open the app |
| Use system materials and Liquid Glass | `.containerBackground(.fill.tertiary, for: .widget)` |
| Test all sizes | Small/Medium/Large/ExtraLarge |
| Test light + dark | Both modes |
| No UI controls except buttons (iOS 17+) | No text fields, sliders |
| Respect Dynamic Type | Use system styles |
| Network requests in TimelineProvider only | Not in views |

## Live Activities

Live Activities show real-time status during an ongoing event. They appear:
- Lock screen (full)
- Dynamic Island (compact, expanded, minimal)
- StandBy

### When to use Live Activities

| Use case | Fit |
|---|---|
| Food delivery | EXCELLENT (status changes over 30+ min) |
| Sports score | EXCELLENT (live game) |
| Workout | EXCELLENT (in-progress fitness) |
| Ride share | EXCELLENT (driver location) |
| Timer / stopwatch | EXCELLENT |
| Music playback | Use system NowPlayingInfoCenter, not Live Activity |
| Long download | OK (but be respectful of attention) |
| Notifications | NO (use regular push) |
| Marketing | NO (will be removed) |

### ActivityAttributes

```swift
import ActivityKit

struct DeliveryAttributes: ActivityAttributes {
    public typealias DeliveryState = ContentState
    
    public struct ContentState: Codable, Hashable {
        var status: DeliveryStatus
        var driverName: String
        var estimatedDelivery: Date
    }
    
    var orderId: String
    var restaurant: String
}

enum DeliveryStatus: String, Codable {
    case preparing, picking_up, on_the_way, delivered
}
```

### Starting a Live Activity

```swift
import ActivityKit

func startTracking(orderId: String, restaurant: String) {
    let attributes = DeliveryAttributes(orderId: orderId, restaurant: restaurant)
    let initialContentState = DeliveryAttributes.ContentState(
        status: .preparing,
        driverName: "Pending",
        estimatedDelivery: Date().addingTimeInterval(30 * 60)
    )
    
    do {
        let activity = try Activity.request(
            attributes: attributes,
            content: .init(state: initialContentState, staleDate: nil),
            pushType: .token  // Or nil for local-only updates
        )
        print("Activity started: \(activity.id)")
    } catch {
        print("Failed: \(error)")
    }
}
```

### Updating

```swift
func updateActivity(_ activity: Activity<DeliveryAttributes>, status: DeliveryStatus) async {
    let updatedState = DeliveryAttributes.ContentState(
        status: status,
        driverName: "Sarah",
        estimatedDelivery: Date().addingTimeInterval(15 * 60)
    )
    
    await activity.update(
        ActivityContent(state: updatedState, staleDate: nil)
    )
}
```

### Ending

```swift
await activity.end(
    ActivityContent(state: finalState, staleDate: nil),
    dismissalPolicy: .immediate  // Or .after(date) or .default
)
```

### Widget extension for Live Activity views

```swift
struct DeliveryActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: DeliveryAttributes.self) { context in
            // Lock screen view
            VStack {
                Text(context.attributes.restaurant).font(.headline)
                Text(context.state.status.rawValue)
            }
            .padding()
            .activityBackgroundTint(.green)
        } dynamicIsland: { context in
            DynamicIsland {
                // Expanded
                DynamicIslandExpandedRegion(.leading) {
                    Image(systemName: "fork.knife")
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text(context.state.estimatedDelivery, style: .timer)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Text(context.state.status.rawValue)
                }
            } compactLeading: {
                Image(systemName: "fork.knife")
            } compactTrailing: {
                Text(context.state.estimatedDelivery, style: .timer)
            } minimal: {
                Image(systemName: "fork.knife")
            }
        }
    }
}
```

## Push updates for Live Activities

For server-driven updates (e.g., delivery status from backend):

```swift
let activity = try Activity.request(
    attributes: attributes,
    content: .init(state: initialState, staleDate: nil),
    pushType: .token  // Get push token
)

// Send token to your backend
let pushToken = activity.pushToken
// Backend sends APNs push to update the activity
```

APNs payload format:

```json
{
    "aps": {
        "timestamp": 1234567890,
        "event": "update",
        "content-state": {
            "status": "on_the_way",
            "driverName": "Sarah"
        }
    }
}
```

## Frequency limits

| Resource | Limit |
|---|---|
| Update budget | System-managed, throttled background budget -- there is no Apple-published fixed per-minute cap. Use `apns-priority: 5` for non-urgent updates to stay inside it. `NSSupportsLiveActivitiesFrequentUpdates` (Info.plist) requests a higher budget for genuinely rapid cadence (live sports scores); check `ActivityAuthorizationInfo().frequentPushesEnabled` at runtime rather than assuming the request was granted |
| Active duration | Up to ~8 hours of active updates, then the system ends it |
| Lock Screen persistence after end | Up to ~4 more hours (~12h total visible), governed by `dismissalPolicy` |
| Concurrent Live Activities | System decides; user can stop excess |
| Push payload size | 4 KB total -- `content-state` must fit inside it |

Design update cadence around the real event, not an assumed rate ceiling. Exceeding the throttled budget causes the system to delay or drop pushes rather than reject them outright.

## Common mistakes

| Mistake | Problem | Fix |
|---|---|---|
| No `containerBackground` | Compile error in iOS 17+ | Add `.containerBackground(.fill.tertiary, for: .widget)` |
| Network requests in widget view | Slow, may not refresh | Fetch in TimelineProvider |
| Refresh too often | Burns through widget budget | Adjust timeline policy |
| Live Activity for marketing | Removed by Apple | Only for genuine ongoing events |
| Live Activity that never ends | Persists indefinitely | End when event completes |
| Push tokens not synced to backend | Updates don't reach activity | Send `activity.pushToken` to server |
| Heavy view in Dynamic Island | Cropped or rejected | Keep DI views minimal |
| Same view code for all widget sizes | Bad layout for some | Branch on `widgetFamily` environment value |

## See also

- `references/platform/02-app-intents-system.md#app-intents` -- App Intents power widget interactions
- `~/Claude/vault/iOS Development/30 - App Extensions and WidgetKit.md`
- `~/Claude/vault/iOS Development/74 - Live Activities and Dynamic Island.md`
