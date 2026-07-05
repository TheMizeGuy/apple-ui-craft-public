# App Intents and System Integration

App Intents expose your app's actions to Siri, Shortcuts, Spotlight, Control Center, and the Action button. NSUserActivity donates content to Spotlight and Handoff. Quick Actions provide home screen long-press shortcuts. Together they make your app a first-class citizen of iOS.

## App Intents

Define discrete actions in your app that the system can invoke:

```swift
import AppIntents

struct StartTimerIntent: AppIntent {
    static var title: LocalizedStringResource = "Start Timer"
    static var description = IntentDescription("Starts a new timer with the specified duration")
    
    @Parameter(title: "Duration in Minutes")
    var duration: Int
    
    func perform() async throws -> some IntentResult & ProvidesDialog {
        await TimerManager.shared.start(minutes: duration)
        return .result(dialog: "Started a \(duration) minute timer")
    }
}
```

### AppShortcutsProvider

Expose your intents as Shortcuts that appear in Spotlight, Siri, and the Shortcuts app:

```swift
struct AppShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: StartTimerIntent(),
            phrases: [
                "Start a timer in \(.applicationName)",
                "Start a \(\.$duration) minute timer in \(.applicationName)"
            ],
            shortTitle: "Start Timer",
            systemImageName: "timer"
        )
    }
}
```

The system surfaces these as voice shortcuts and Spotlight suggestions. No setup required from the user.

### App Entities

For intents that operate on data (e.g., "Add this to my list"):

```swift
struct ItemEntity: AppEntity {
    static var typeDisplayRepresentation = TypeDisplayRepresentation(name: "Item")
    static var defaultQuery = ItemQuery()
    
    var id: UUID
    var name: String
    
    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(title: "\(name)")
    }
}

struct ItemQuery: EntityQuery {
    func entities(for identifiers: [UUID]) async throws -> [ItemEntity] {
        await ItemStore.shared.items(with: identifiers)
    }
    
    func suggestedEntities() async throws -> [ItemEntity] {
        await ItemStore.shared.recentItems()
    }
}
```

## Assistant Schemas (iOS 26)

Two schema layers let Apple Intelligence and Siri understand what an intent or entity DOES, without phrase-matching your `AppShortcut` strings:

```swift
// iOS 26.0+. Conforms the intent to AppSchemaIntent -- the current, general form.
@AppIntent(schema: .photos.createAssets)
struct CreateAssetsIntent: AppIntent {
    static let isAssistantOnly: Bool = true   // hide from Shortcuts/Siri phrase UI, expose only to Apple Intelligence
    func perform() async throws -> some ReturnsValue<[PhotoAssetEntity]> { /* ... */ }
}

// iOS 18.0+. Conforms to AssistantSchemaIntent -- the older naming, still valid today.
// Sibling macros: @AssistantEntity(schema:), @AssistantEnum(schema:).
@AssistantIntent(schema: .photos.openAsset)
struct OpenPhotoIntent: AppIntent {
    @Parameter var target: PhotoAssetEntity   // parameter shape is fixed by the schema
    func perform() async throws -> some IntentResult { .result() }
}
```

Both macros compile and both are current -- they are two protocol families from different releases, not competing versions of the same thing:

| Namespace | Protocol | Era | Domain count |
|---|---|---|---|
| `@AppIntent(schema:)` | `AppSchemaIntent` | iOS 26, current | 23: `assistant`, `audio`, `books`, `browser`, `calendar`, `camera`, `clock`, `files`, `journal`, `mail`, `maps`, `messages`, `notes`, `phone`, `photos`, `presentation`, `reader`, `reminders`, `spreadsheet`, `system`, `visualIntelligence`, `whiteboard`, `wordProcessor` |
| `@AssistantIntent(schema:)` | `AssistantSchemaIntent` | iOS 18, Apple Intelligence subset | 15: the 23 above minus `audio`, `calendar`, `clock`, `maps`, `messages`, `notes`, `phone`, `reminders` |

Treat the 15-domain catalog as the older namespace, not a stale figure to "correct up" to 23 -- both ship, both compile, and existing iOS 18-targeted code using `@AssistantIntent` stays correct. New code reaching for the widest domain set should use `@AppIntent(schema:)`.

`isAssistantOnly: Bool` (default `false`) is the migration lever on both: set `true` to make an intent reachable only by Apple Intelligence/Siri, without disturbing users' existing phrase-based Shortcuts built against a separate intent.

Availability: the iOS 18-era domains (`.presentation.*`, `.photos.*`, `.mail.*`, ...) are iOS 18.0+/iPadOS 18.0+/macOS 15.0+ (Catalyst)/visionOS 2.0+. The 8 domains iOS 26 adds (`audio`, `calendar`, `clock`, `maps`, `messages`, `notes`, `phone`, `reminders`) are iOS 26.0+. `AppSchemaIntent.assistant` (the `.assistant.activate` "open/activate my app" family) needs iOS/iPadOS **26.2+** specifically -- gate it separately from the 26.0 domains [plausible -- SDK-verify against the shipping Xcode 26.2 SDK before relying on it].

If nothing fits your app's category, don't force a schema -- ship a plain `AppIntent` with `AppShortcutsProvider` phrases instead.

## Interactive Snippets (iOS 26)

The card an intent shows after running can contain LIVE SwiftUI whose controls run other intents and re-render the card in place, without opening the app. Two distinct result-type protocols -- do not conflate them:

| Protocol | Behavior |
|---|---|
| `ShowsSnippetView` | Static SwiftUI card (iOS 16+). Fixed once returned. |
| `ShowsSnippetIntent` | Interactive card (iOS 26.0+). Body is produced by a separate `SnippetIntent`; tapping a control re-runs its `perform()` and re-renders the card. |

```swift
// iOS 26.0+. The action intent hands off to a SnippetIntent instead of a static view.
struct ClosestLandmarkIntent: AppIntent {
    static let title: LocalizedStringResource = "Find Closest Landmark"
    @Dependency var modelData: ModelData

    func perform() async throws
        -> some ReturnsValue<LandmarkEntity> & ShowsSnippetIntent & ProvidesDialog {
        let landmark = try await modelData.closestLandmark()
        return .result(
            value: landmark,
            dialog: IntentDialog(
                full: "The closest landmark is \(landmark.name).",
                supporting: "\(landmark.name) is in \(landmark.continent)."),
            snippetIntent: LandmarkSnippetIntent(landmarkID: landmark.id))
    }
}

// The SnippetIntent owns the card's live body; re-runs on every control tap inside it.
struct LandmarkSnippetIntent: SnippetIntent {
    static let title: LocalizedStringResource = "Landmark Snippet"
    @Parameter var landmarkID: LandmarkEntity.ID
    @Dependency var modelData: ModelData

    @MainActor
    func perform() async throws -> some IntentResult & ShowsSnippetView {
        let landmark = try await modelData.landmark(id: landmarkID)
        return .result(view: LandmarkSnippetView(landmark: landmark))
    }
}

struct LandmarkSnippetView: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let landmark: Landmark

    private var favoriteAnimation: Animation? { reduceMotion ? nil : .default }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(landmark.name).font(.headline)
            // Controls inside a snippet MUST be intent-backed -- plain closures do not
            // survive the out-of-process snippet host.
            Button(intent: ToggleFavoriteIntent(id: landmark.id)) {
                Label(landmark.isFavorite ? "Unfavorite" : "Favorite",
                      systemImage: landmark.isFavorite ? "star.fill" : "star")
            }
        }
        .padding()
        .animation(favoriteAnimation, value: landmark.isFavorite)
    }
}
```

Controls inside an interactive snippet must be `Button(intent:)` / `Toggle(isOn:intent:)` -- the host re-invokes the matching `SnippetIntent` out-of-process, so a plain closure has nothing to call back into. Keep snippets glanceable: constrained height, no heavy scrolling. The snippet host respects Reduce Motion for its OWN re-render transition, but any `.animation`/`.transition` you add inside the view body needs the same nil-under-Reduce-Motion gate as every other SwiftUI animation.

`.result(value:dialog:snippetIntent:)` defaults `snippetIntent:` to `EmptySnippetIntent()` when there's nothing interactive to show; `.result(value:opensIntent:dialog:snippetIntent:)` adds an explicit "open the app" affordance alongside the snippet.

## Siri integration

App Shortcuts automatically work with Siri:

> "Hey Siri, start a 5 minute timer in TimerApp"

The system pattern-matches the user's speech against the phrases you registered. No NLP work required.

## Shortcuts app integration

App Shortcuts appear in the Shortcuts app. Users can compose them into custom workflows. For maximum reach:

- Provide phrases for common variations
- Provide entities for data-operating intents
- Use parameter summaries for Shortcut clarity

## Control Center (iOS 18+)

App Intents can power Control Center controls:

```swift
struct TimerControl: ControlWidget {
    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(
            kind: "com.example.TimerControl"
        ) {
            ControlWidgetButton(action: StartTimerIntent(duration: 5)) {
                Label("5 min", systemImage: "timer")
            }
        }
        .displayName("Quick Timer")
    }
}
```

Toggle controls:

```swift
ControlWidgetToggle(
    "Wifi",
    isOn: isWifiOn,
    action: ToggleWifiIntent(),
    valueLabel: { value in
        Label(value ? "On" : "Off", systemImage: value ? "wifi" : "wifi.slash")
    }
)
```

### Opening the app from a control (iOS 26)

A control extension can't call `UIApplication.shared.open(_:)` -- that API is unavailable outside the app process. Two correct paths:

```swift
// Preferred when the destination is expressible as an AppEntity: OpenIntent implies
// openAppWhenRun and gives you a required `target`.
struct OpenPlaylistIntent: OpenIntent {
    static var title: LocalizedStringResource = "Open Playlist"
    @Parameter(title: "Playlist") var target: PlaylistEntity

    @MainActor
    func perform() async throws -> some IntentResult {
        Router.shared.navigate(to: target.id)   // system foregrounds the app first
        return .result()
    }
}

// When you only have a URL, bridge through OpenURLIntent instead of touching UIApplication.
struct OpenCaptureIntent: AppIntent {
    static let title: LocalizedStringResource = "Open Capture"
    func perform() async throws -> some IntentResult & OpensIntent {
        .result(opensIntent: OpenURLIntent(URL(string: "myapp://capture")!))
    }
}
```

`openAppWhenRun` -- the older `Bool` that made a control foreground the app -- is **deprecated on iOS 26**; setting it `true` inside a control/widget extension now throws at runtime. Its replacement is `static var supportedModes: IntentModes` (iOS 26.0+): `.background` runs the intent with no app launch, `.foreground(.immediate/.dynamic/.deferred)` brings the app forward before, optionally, or right before completion. `OpenIntent` and the `OpenURLIntent` bridge above remain the right tools specifically for "this control opens the app somewhere" -- `supportedModes` covers everything else.

## Action button (iPhone 15 Pro+)

The Action button can trigger any App Intent. Users assign it via Settings. No code needed beyond the intent itself.

## Spotlight indexing

Donate content to Spotlight so users can find it from system search:

### Via NSUserActivity

```swift
.onAppear {
    let activity = NSUserActivity(activityType: "com.example.viewing-item")
    activity.title = item.name
    activity.userInfo = ["itemID": item.id.uuidString]
    activity.isEligibleForSearch = true
    activity.isEligibleForHandoff = true
    activity.becomeCurrent()
}
```

### Via Core Spotlight (more control)

```swift
import CoreSpotlight

let attributeSet = CSSearchableItemAttributeSet(itemContentType: UTType.item.identifier)
attributeSet.title = item.name
attributeSet.contentDescription = item.description
attributeSet.thumbnailURL = item.thumbnailURL

let searchableItem = CSSearchableItem(
    uniqueIdentifier: item.id.uuidString,
    domainIdentifier: "items",
    attributeSet: attributeSet
)

CSSearchableIndex.default().indexSearchableItems([searchableItem]) { error in
    // Handle result
}
```

### Handle Spotlight tap

```swift
.onContinueUserActivity(CSSearchableItemActionType) { activity in
    if let id = activity.userInfo?[CSSearchableItemActivityIdentifier] as? String {
        navigate(toItemId: id)
    }
}
```

## Quick Actions (home screen long-press)

Static quick actions in `Info.plist`:

```xml
<key>UIApplicationShortcutItems</key>
<array>
    <dict>
        <key>UIApplicationShortcutItemType</key>
        <string>com.example.add-item</string>
        <key>UIApplicationShortcutItemTitle</key>
        <string>Add Item</string>
        <key>UIApplicationShortcutItemSubtitle</key>
        <string>Quickly add a new item</string>
        <key>UIApplicationShortcutItemIconType</key>
        <string>UIApplicationShortcutIconTypeAdd</string>
    </dict>
</array>
```

Dynamic quick actions:

```swift
let item = UIApplicationShortcutItem(
    type: "com.example.recent-trip",
    localizedTitle: "Continue trip",
    localizedSubtitle: trip.name,
    icon: UIApplicationShortcutIcon(systemImageName: "car.fill"),
    userInfo: ["tripID": trip.id.uuidString as NSString]
)

UIApplication.shared.shortcutItems = [item]
```

Handle in scene delegate:

```swift
func windowScene(_ windowScene: UIWindowScene, performActionFor shortcutItem: UIApplicationShortcutItem, completionHandler: @escaping (Bool) -> Void) {
    handleShortcut(shortcutItem)
    completionHandler(true)
}
```

## Context menus

Long-press on iOS, right-click on Mac/iPad with mouse:

```swift
ItemRow(item: item)
    .contextMenu {
        Button("Edit", systemImage: "pencil") { edit() }
        Button("Share", systemImage: "square.and.arrow.up") { share() }
        Divider()
        Button("Delete", systemImage: "trash", role: .destructive) { delete() }
    } preview: {
        ItemPreview(item: item)
            .frame(width: 300, height: 200)
    }
```

## Drag and drop (Transferable)

Make content draggable:

```swift
extension Item: Transferable {
    static var transferRepresentation: some TransferRepresentation {
        CodableRepresentation(contentType: .item)
        ProxyRepresentation { item in
            URL(string: "https://example.com/items/\(item.id)")!
        }
    }
}

ItemView(item: item)
    .draggable(item)

DropZone()
    .dropDestination(for: Item.self) { items, location in
        for item in items { handleDrop(item) }
        return true
    }
```

## ShareLink

```swift
ShareLink(item: url) {
    Label("Share", systemImage: "square.and.arrow.up")
}

// With preview
ShareLink(item: image, preview: SharePreview("Photo", image: image))

// With subject and message
ShareLink(item: url, subject: Text("Check this out"), message: Text("I thought you'd like this"))
```

## TipKit (iOS 17+)

Surface non-obvious features:

```swift
import TipKit

struct ShakeToUndoTip: Tip {
    var title: Text {
        Text("Shake to undo")
    }
    
    var message: Text? {
        Text("Shake your device to undo the last action.")
    }
    
    var image: Image? {
        Image(systemName: "iphone.gen2.radiowaves.left.and.right")
    }
}

// In view
ContentView()
    .popoverTip(ShakeToUndoTip())
```

Configure when tips appear:

```swift
struct ShakeToUndoTip: Tip {
    static let userPerformedAction = Event(id: "userPerformedAction")
    
    var rules: [Rule] {
        // Show only after user has performed an action 3+ times
        #Rule(Self.userPerformedAction) {
            $0.donations.count >= 3
        }
    }
}

// Donate event
ShakeToUndoTip.userPerformedAction.donate()
```

## Keyboard shortcuts (iPad and Mac)

```swift
Button("Save") { save() }
    .keyboardShortcut("s", modifiers: .command)        // Cmd+S

Button("New") { create() }
    .keyboardShortcut("n", modifiers: .command)        // Cmd+N

Button("Find") { find() }
    .keyboardShortcut("f", modifiers: .command)        // Cmd+F

Button("Delete") { delete() }
    .keyboardShortcut(.delete)                          // Delete key

Button("Cancel") { dismiss() }
    .keyboardShortcut(.cancelAction)                    // Escape

Button("Confirm") { confirm() }
    .keyboardShortcut(.defaultAction)                   // Return
```

## Handoff

Continue activities across devices:

```swift
.userActivity("com.example.viewing-item") { activity in
    activity.title = item.name
    activity.userInfo = ["itemID": item.id.uuidString]
    activity.isEligibleForHandoff = true
}
```

When user opens your app on another device, the activity restores their location.

## Fit assessment

Use this to decide what's worth implementing:

| Feature | Implement when |
|---|---|
| App Intents | App has discrete actions worth voice/Shortcut access |
| Siri shortcuts | Same as App Intents (free with App Shortcuts) |
| Control Center | App has toggle-style controls (smart home, mute, etc.) |
| Spotlight indexing | App has searchable content |
| Quick Actions | App has 2-4 common entry points |
| Context menus | Items have multiple actions worth exposing |
| Drag and drop | Content has natural drag/drop interactions |
| ShareLink | App produces shareable content |
| TipKit | App has non-obvious features users discover slowly |
| Keyboard shortcuts | App targets iPad or Mac, has frequent actions |
| Handoff | App has detail screens worth continuing on another device |
| Live Activities | App has real-time ongoing events |
| Assistant Schemas | App matches a first-party domain (mail, photos, files, browser, ...) and wants Siri-native semantic understanding for free |
| Interactive Snippets | An intent's result is worth showing AND acting on inline in Siri/Spotlight, not just displaying |

## Common mistakes

| Mistake | Problem | Fix |
|---|---|---|
| Donate every screen as activity | Spotlight noise | Donate meaningful destinations only |
| Quick Actions for everything | Long-press menu cluttered | Limit to 2-4 most common entry points |
| Custom drag-drop without Transferable | Doesn't integrate with system | Use Transferable protocol |
| Custom share sheet | Inconsistent with system | Use ShareLink |
| TipKit on first launch | Annoying onboarding | Use rules to show after relevant action |
| App Intent without entities | Can't be parameterized in Shortcuts | Add AppEntity for data operations |
| Missing keyboard shortcuts on iPad | Poor iPad experience | Add `.keyboardShortcut()` to common actions |
| Spotlight indexing without cleanup | Stale results | Delete on content change/removal |
| `openAppWhenRun = true` in a Control/Widget extension | Throws at runtime on iOS 26 | `supportedModes: IntentModes`, or bridge via `OpenIntent`/`OpenURLIntent` |

## See also

- `references/platform/01-widgets-live-activities.md#interactive-widgets-ios-17` -- widgets and Live Activities use App Intents
