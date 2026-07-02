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
| `.after(date)` | At specific date |
| `.never` | Manual refresh only |

iOS budgets widget refreshes (~40 per day for active widgets). Don't refresh more than necessary. If data doesn't change often, push refresh to a daily/hourly schedule.

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

Live Activities have system-imposed limits:

| Resource | Limit |
|---|---|
| Updates per Live Activity | ~4 per minute average (bursts allowed) |
| Live Activity duration | 8 hours active, 4 hours stale |
| Concurrent Live Activities | System decides; user can stop excess |
| Push update size | 4 KB |

Exceeding limits causes the system to throttle or end the activity.

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

- `02-app-intents-system.md` -- App Intents power widget interactions
- `~/Claude/vault/iOS Development/30 - App Extensions and WidgetKit.md`
- `~/Claude/vault/iOS Development/74 - Live Activities and Dynamic Island.md`
