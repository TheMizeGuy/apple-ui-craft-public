# App Intents and System Integration

App Intents expose your app's actions to Siri, Shortcuts, Spotlight, Control Center, and the Action button. NSUserActivity donates content to Spotlight and Handoff. Quick Actions provide home screen long-press shortcuts. Together they make your app a first-class citizen of iOS.

With Siri AI shipping in iOS 27, this stopped being an integration layer and became part of the app's UI surface: the assistant acts on your entities, on screens your app drew, without your app's own controls in the loop. The floors below are mixed on purpose -- several of the most useful additions are iOS 26.0 or 26.4, not 27, and three symbols Apple groups under its June 2026 updates page carry lower floors than that page implies (`UndoableIntent` 26.0, `CancellableIntent` 26.4, `IntentValueRepresentation` 26.4). Read the floor stated here, not the section a symbol was announced in.

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

### Entity craft for Siri AI (iOS 27)

Once Siri can act on an app's entities without the app's UI in the loop, the entity layer has to carry facts the UI used to carry implicitly -- who owns a thing, whether it is the same thing on another device, how expensive it is to resolve. Five iOS 27.0 additions, each a one-conformance change with a user-visible payoff:

| Add | When | Why it matters |
|---|---|---|
| `OwnershipProvidingEntity` + `EntityOwnership` | Any entity that can be collaborative: albums, documents, lists, boards | Declares `.shared` / `.public` / `.unknown`, and the system prompts for confirmation, with that context in the dialog, before a destructive action. The alternative is Siri silently deleting a shared album |
| `EntityCollection<Entity>` | Any `@Parameter` that can plausibly hold dozens of entities | Holds identifiers and resolves lazily. An intent taking `[AlarmEntity]` with hundreds of items stalls before the user sees anything, and that stall reads as Siri hanging |
| `SyncableEntity` | Any entity backed by a synced store | Declares the identifier stable across devices, which is what lets a conversation move from iPhone to Mac and still resolve the same object |
| `IndexedEntityQuery` | Any query whose `IndexedEntity` is donated via `CSSearchableIndex.indexAppEntities(_:priority:)` | Lets the system ask the app to rebuild a damaged index. A corrupted index removes the app from Siri results with no error anywhere |
| `RelevantEntities` | Audio apps: songs, albums, artists, playlists, stations, podcasts | Donates content the system can suggest for playback during a workout -- placement on a system screen the app never draws |

```swift
// Confirmation the app cannot draw itself, because the deletion happens outside the app's UI.
@available(iOS 27, *)
extension AlbumEntity: OwnershipProvidingEntity {
    var ownership: EntityOwnership { collaborators.isEmpty ? [] : .shared }
}

// Perceived-latency fix, not a memory micro-optimization.
@available(iOS 27, *)
struct ArchiveAlarmsIntent: AppIntent {
    @Parameter(title: "Alarms") var alarms: EntityCollection<AlarmEntity>

    func perform() async throws -> some IntentResult {
        for alarm in try await alarms.resolvedEntities() { await store.archive(alarm) }
        return .result()
    }
}
```

`RelevantEntities` replaces rather than appends -- each `updateEntities(_:for:)` supplies the whole set for a context -- and the system expires a donation after roughly four weeks if the app is never launched. Give it a refresh point in the app's lifecycle or the suggestions go stale and then disappear.

Below iOS 27 there is no direct substitute for most of these. The honest fallbacks: an explicit `requestConfirmation` inside `perform()` for entities you know are shared; `[Entity]` with the cheapest possible resolution path; reindexing on your own schedule at launch or migration.

### Parameters: union types and system value bridges

**One parameter, several types.** `@UnionValue` (iOS 27.0) replaces the old workaround of shipping three near-duplicate intents to cover three parameter types -- which was a Shortcuts-app UI problem as much as a code one, since each duplicate crowded the action list:

```swift
@UnionValue
enum Reaction {
    case tapback(Tapback)
    case text(String)
}
```

The macro generates the `AppUnionValue` conformance itself -- supply the metadata in a plain extension, never a second conformance (a redundant conformance is a compile error):

```swift
extension Reaction {
    static var typeDisplayRepresentation: TypeDisplayRepresentation { "Reaction" }
    static let caseDisplayRepresentations: [Cases: DisplayRepresentation] = [
        .tapback: "Tapback", .text: "Text Reaction"
    ]
}
```

Without them the picker shows raw case names, which is exactly the kind of leak that makes an app's Shortcuts actions look unfinished. Below iOS 27, keep separate intents (or one intent with an `AppEnum` discriminator plus optional parameters) and accept the extra rows.

**Carry a contact or a place across apps.** `IntentValueRepresentation` (**iOS 26.4**, not 27) is a `TransferRepresentation` that converts between a custom `AppEntity` and system intent value types such as `IntentPerson` and `PlaceDescriptor`, declared in the entity's `transferRepresentation`. This is what makes cross-app Siri sentences work -- "text my wife this conversation," "call this contact." `init(exporting:)` alone makes the entity a source; add `importing:` to make it a destination. Below 26.4, content moves through ordinary `Transferable`/`NSItemProvider` representations with no semantic typing.

## Assistant Schemas (iOS 26)

(The heading names when this layer arrived, not its currency. It is the current mechanism; what changed in iOS 27 is which macro family expresses it.)

Schemas let Apple Intelligence and Siri understand what an intent or entity DOES, without phrase-matching your `AppShortcut` strings:

```swift
// The surviving macro family: @AppIntent(schema:) / @AppEntity(schema:) / @AppEnum(schema:).
// The macros themselves are iOS 18.0+ -- it is individual schemas that carry higher floors.
@AppIntent(schema: .photos.createAssets)
struct CreateAssetsIntent: AppIntent {
    static let isAssistantOnly: Bool = true   // hide from Shortcuts/Siri phrase UI, expose only to Apple Intelligence
    func perform() async throws -> some ReturnsValue<[PhotoAssetEntity]> { /* ... */ }
}

@AppIntent(schema: .photos.openAsset)
struct OpenPhotoIntent: AppIntent {
    @Parameter var target: PhotoAssetEntity   // parameter shape is fixed by the schema
    func perform() async throws -> some IntentResult { .result() }
}
```

**`@AssistantIntent(schema:)`, `@AssistantEntity(schema:)` and `@AssistantEnum(schema:)` are deprecated in the iOS 27 SDK.** This is a migration, not a choice between two current namespaces:

| Macro | Status | Floor |
|---|---|---|
| `@AppIntent(schema:)` / `@AppEntity(schema:)` / `@AppEnum(schema:)` (`AppSchemaIntent`) | Current | Macro is iOS 18.0+ / iPadOS 18.0+ / Mac Catalyst 18.0+ / macOS 15.0+ / tvOS 18.0+ / visionOS 2.0+ / watchOS 11.0+; each schema has its own floor |
| `@AssistantIntent(schema:)` / `@AssistantEntity(schema:)` / `@AssistantEnum(schema:)` (`AssistantSchemaIntent`) | **Deprecated** in the 27 SDK | Existing code still compiles, with a warning |

Migrating is usually a macro rename: keep the schema path identical wherever the schema exists in both namespaces. The old macro is not a back-deployment tactic -- `@AppIntent(schema:)` reaches iOS 18 too.

The domain catalog is 23 names, but 8 of them only became adoptable in the iOS 27 SDK (floors below): 12 primary (`audio`, `calendar`, `camera`, `clock`, `mail`, `maps`, `messages`, `notes`, `phone`, `photos`, `reminders`, and system-and-in-app-search), 2 single-purpose (`assistant`, `visualIntelligence`), and 9 Shortcuts-specific (`books`, `browser`, `files`, `journaling`, `presentation`, `reader`, `spreadsheet`, `whiteboard`, `wordProcessor`). The `system` domain is now titled "System and in-app search."

`isAssistantOnly: Bool` (default `false`) sets an intent to be reachable only by Apple Intelligence/Siri, without disturbing users' existing phrase-based Shortcuts built against a separate intent.

**Availability.** The iOS 18-era domains (`.presentation.*`, `.photos.*`, `.mail.*`, ...) are iOS 18.0+/iPadOS 18.0+/macOS 15.0+ (Catalyst)/visionOS 2.0+. The 8 domains that became adoptable in the iOS 27 SDK (`audio`, `calendar`, `clock`, `maps`, `messages`, `notes`, `phone`, `reminders`) are iOS 27.0+/iPadOS 27.0+/Mac Catalyst 27.0+/macOS 27.0+/visionOS 27.0+ -- gate them with `#available(iOS 27, *)`, never 26. Two schemas need care:

- **`.system.search` is deprecated at iOS 27.0; the schema is now `.system.searchInApp`.** Same conforming shape (`ShowInAppSearchResultsIntent`, `searchScopes` + `StringSearchCriteria`) -- treat it as a rename and split behind `#available(iOS 27, *)` rather than swapping unconditionally. This is the cheapest Siri-reachability win an app has: it hands a natural-language query straight into the app's own search UI, works with no indexed entities, and needs no first-party domain to fit.
- **`.assistant.activate` is iOS/iPadOS/Mac Catalyst 26.2+, iPhone-in-Japan only, and entitlement-gated.** It is not a general "open my app" schema. Apple's own wording is "launching your voice-based conversational app from the side button on iPhone in Japan"; it requires `com.apple.developer.side-button-access.allow`, and production use requires a Japan Apple Account and physical presence in Japan. Outside Japan there is no side-button hand-off -- use App Shortcuts phrases and the Action button, which any app can claim through Settings with no code.

**Adopt a schema set, not a schema.** From iOS 27 (Xcode 27), Xcode surfaces missing schemas at build time: adopting `.messages.sendMessage` obliges you to adopt `.messages.draftMessage` as well. Half-adopting a domain is now a build-visible defect, so review schema sets for completeness rather than presence.

**Pick your entity-resolution path deliberately.** `IndexedEntity` with `@Property(indexingKey:)` buys semantic search -- Siri answering a vague query like "the message from Flare about movies." `EntityStringQuery` gives you control for large, server-backed or fast-changing data where indexing is not feasible, and loses that. This is a design decision with a user-visible consequence, not an implementation detail.

If nothing fits your app's category, don't force a schema -- ship a plain `AppIntent` with `AppShortcutsProvider` phrases, plus `.system.searchInApp` if the app has a search field.

### Onscreen awareness: annotating views with entities

Siri AI resolves "this" against what is actually on screen, and the annotation lives on the **view**, not the intent. That makes it a UI-layer obligation. The modifiers are iOS 18.4+ (iPadOS 18.4 / macOS 15.4 / tvOS 18.4 / visionOS 2.4 / watchOS 11.4; `AppEntityAnnotatable` is iOS 18.2 / macOS 15.2), so a 26-floor app needs no `#available` -- what changed in iOS 27 is that they became load-bearing.

Three tiers, matched to what the screen shows:

```swift
// 1. One primary item on a detail screen -- NSUserActivity (or the SwiftUI userActivity modifier).
MessageDetail(message: message)
    .userActivity("com.example.viewing-message") { $0.title = message.subject }

// 2. A collection. Annotate the List ONCE, not every row: the system fetches identifiers
//    lazily and can still reach an entity the user selected and then scrolled past.
List(messages, selection: $selection) { MessageRow($0) }
    .appEntityIdentifier(forSelectionType: Message.self) { message in
        entityIdentifier(for: message)          // your MessageEntity's EntityIdentifier
    }

// 3. A custom-drawn canvas -- supply elements the system can point at.
CanvasView(board: board)
    .appEntityUIElements { context in
        board.visibleElements(in: context)      // [AppEntityUIElement]
    }
```

Annotate only views that genuinely show that entity. Apple's guidance is explicit that attaching unrelated entities degrades the experience, and an over-annotated screen makes "delete this" ambiguous in exactly the situation where ambiguity is expensive. UIKit and AppKit equivalents: `appEntityIdentifier` on responders, `appEntityUIElementProvider` on views, and the `UICollectionView` / `UITableView` / `NSCollectionView` / `NSTableView` `AppIntentsDataSource` protocols.

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

## Intent execution: long work, cancellation, undo, and which process runs it

Four protocols decide how an intent behaves once it is running. Their floors are deliberately mixed, and two of them are traps -- Apple lists them under the June 2026 (WWDC26) updates, but their own availability metadata is lower:

| Protocol | Floor | Adopt when |
|---|---|---|
| `UndoableIntent` (refines `SystemIntent`) | **iOS 26.0** (not 27) | The intent mutates user data: delete, archive, mark-done, bulk edit |
| `CancellableIntent` + `IntentCancellationReason` | **iOS 26.4** (not 27) | The intent can be interrupted and needs to clean up differently per reason |
| `LongRunningIntent` (refines `ProgressReportingIntent`) + `performBackgroundTask(options:operation:)` | iOS 27.0 | The intent does real work: upload, export, render |
| `IntentExecutionTargets` / `AppIntent.allowedExecutionTargets` | iOS 27.0 | The intent type is shared across the app, an App Intents extension and a widget extension |

**Undo is the one most apps skip.** Siri and Shortcuts invocations bypass the app's own undo affordances entirely, so an intent that destroys data without registering against the system-supplied `undoManager` is the intents-layer equivalent of a destructive button with no confirmation.

**Cancellation reason drives UI.** A deliberate user cancel should leave no toast; a timeout should surface a retry. `Task.checkCancellation()` cannot tell you which happened.

**A long intent is expected to publish progress** -- that is why `LongRunningIntent` refines `ProgressReportingIntent`. An intent doing real work without it either gets killed mid-flight or leaves the user watching a stalled Siri response:

```swift
@available(iOS 27, *)
struct ExportLibraryIntent: LongRunningIntent {
    static let title: LocalizedStringResource = "Export Library"

    func perform() async throws -> some IntentResult {
        try await performBackgroundTask(options: [.requiresGPU]) {
            try await exporter.run(reporting: progress)
        }
        return .result()
    }
}
```

**Pin UI-touching intents to the main process.** An intent that navigates, presents a sheet or mutates `@MainActor` view state cannot run correctly in a widget or intents extension -- and without `allowedExecutionTargets` it silently sometimes does:

```swift
@available(iOS 27, *)
static var allowedExecutionTargets: IntentExecutionTargets { [.main, .appIntentsExtension] }
```

`allowedExecutionTargets` picks the process; `supportedModes` picks foreground vs background. Set both; they answer different questions.

## Failure, donation, and testing

**An intent that throws a bare Swift error gives Siri nothing to say.** `AppIntentError` is iOS 16+, but its descriptive initializers are iOS 27.0: `init(description:)`, `init(predefinedError:description:)` and `init(wrapping:)` (for `CustomLocalizedStringResourceConvertible & Error` or `CustomAppIntentErrorConvertible`) all need `#available(iOS 27, *)`. Below 27, throw one of the predefined cases. Prefer the predefined `PermissionRequired` / `UserActionRequired` / `Unrecoverable` cases where they fit: the system already knows how to route those -- prompt for permission, tell the user to open the app -- instead of dead-ending on a generic failure.

**Donate the interactions the user completes in the app.** `IntentDonationManager.shared.donate(intent:result:)` (iOS 16+) is what turns a one-off intent into a proactive suggestion; Apple's Siri AI adoption article names it as a required step, because donations give Apple Intelligence the behavioral cues it uses to disambiguate vague requests. Intents run from Shortcuts are donated automatically; the ones you run from your own UI are not. The counterpart obligation is cleanup -- `deleteDonations(matching:)` when the underlying content goes away, since a suggestion that dead-ends is worse than no suggestion.

**Test it without talking to your phone.** The App Intents Testing framework (Xcode 27) validates Siri, Shortcuts and Spotlight integration through real system pathways with no UI automation. The progression that works: `AppIntentsTesting` for logic in isolation, the Shortcuts app for intent shape and parameters, Spotlight for entity indexing, Siri end to end. A review that recommends App Intents adoption should ask how it is tested; before this, the honest answer was "by hand."

## Siri integration

The rebuilt assistant -- branded **Siri AI** -- shipped with iOS 27 on 2026-09-14. It adds personal context, world knowledge, onscreen awareness and systemwide in-app actions, and comes with a dedicated Siri app whose conversation history syncs across devices over iCloud. Apple describes the rollout as a beta: English only at launch (French, Japanese, Korean, Portuguese and Spanish in October 2026), and not available initially in the EU or China.

Two consequences, and they pull in opposite directions.

**Siri is now a destination surface, not a voice-only shortcut runner.** An app's App Intents and App Entities layer is part of its UI surface area rather than an optional integration. Apple's adoption steps are the checklist to audit against when the question is "why isn't my app reachable by Siri?":

1. Define intents, entities and enums.
2. Index entities to Spotlight.
3. Choose `Transferable` types.
4. Adopt schemas (complete sets -- see above).
5. Associate entities with views, and donate actions and content.

**Every Siri-reachable path still needs a complete in-app equivalent.** The assistant is beta, English-only, and absent in two large markets at launch. A feature reachable only through Siri is dead for most of the install base -- that is not a hedge, it is arithmetic.

**SiriKit is not deprecated.** Apple's framework page carries a note, not a deprecation: SiriKit, Intents and IntentsUI "continue to provide legacy support for Shortcuts actions, widget configuration, and most existing Siri interactions," and App Intents is the path for modern support and Apple Intelligence integration. Recommend App Intents for anything new; do not tell a team their SiriKit code is deprecated and invite an unnecessary rewrite.

App Shortcuts still work the way they always did:

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

### A user-configurable launcher button in a widget (iOS 27)

`RunSystemShortcutIntent` is a system intent usable only as `Button(intent:)` inside a widget, and it does nothing anywhere else. When the person configures the widget they pick what the button does: open another installed app, run an App Shortcut, run a custom shortcut, or perform a system action.

```swift
// The person's chosen action lives on the widget's configuration intent.
@available(iOS 27, *)
struct LauncherWidgetConfigurationIntent: WidgetConfigurationIntent {
    static var title: LocalizedStringResource { "Launcher Widget" }
    @Parameter(title: "Action") var shortcut: SystemShortcut
}

// In the widget's content closure:
if #available(iOS 27, *) {
    Button(intent: RunSystemShortcutIntent(shortcut: entry.configuration.shortcut)) {
        Label(entry.configuration.shortcut.displayRepresentation.title, systemImage: "bolt.fill")
    }
}
```

It turns a widget into a user-authored launcher with no routing code of yours, and it is the first sanctioned way to put "open some other app" on a widget button. The platform list is unusually narrow -- **iOS, iPadOS and Mac Catalyst 27.0 only**, no macOS, tvOS, visionOS or watchOS -- so a multiplatform widget needs a real `#if os` branch alongside the `#available`, not a blanket iOS 27 gate. Below the floor, offer a fixed set of your own actions instead.

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

On iOS 27, drag interactions are also how Apple Intelligence loads content: invoking it from a context menu calls `UIDragInteractionDelegate` methods with no user drag gesture behind them. Any lift animation, haptic or modal presented from `dragInteraction(_:sessionWillBegin:)` now fires with nothing visible being dragged -- move that work to `dragInteraction(_:sessionDidMove:)`, which is the correct placement on every OS version and needs no gate.

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
| `.system.searchInApp` | App has a search field and no obvious first-party domain -- the cheapest Siri-reachability win there is |
| Interactive Snippets | An intent's result is worth showing AND acting on inline in Siri/Spotlight, not just displaying |
| Onscreen annotation (`appEntityIdentifier`) | Any screen showing an entity the user might say "this" about |
| `OwnershipProvidingEntity` | Any entity that can be shared or public -- it is the only confirmation the app gets for a Siri-driven deletion |
| `UndoableIntent` | Any intent that mutates user data; Siri and Shortcuts bypass the app's own undo |
| `LongRunningIntent` | An intent that uploads, exports or renders -- otherwise it is killed mid-flight with no feedback |
| Donations (`IntentDonationManager`) | Always, for user-completed actions -- it is what makes suggestions proactive |

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
| `@AssistantIntent(schema:)` in new code | Deprecated in the iOS 27 SDK | `@AppIntent(schema:)` -- same schema path, and it reaches iOS 18 too |
| `@AppIntent(schema: .system.search)` | Deprecated at iOS 27.0 | `.system.searchInApp`, split behind `#available(iOS 27, *)` |
| Adopting one schema from a domain | Xcode 27 surfaces the missing siblings at build time | Adopt the complete schema set |
| Recommending `.assistant.activate` as "open my app" | iPhone-in-Japan only, entitlement-gated | App Shortcuts phrases and the Action button |
| Telling a team SiriKit is deprecated | It is not -- it carries a legacy-support note, not a deprecation | Recommend App Intents for new work; migrate incrementally |
| An intent throwing a bare Swift error | Siri has nothing to say; the user gets a dead end | `AppIntentError` with a description, or a predefined case |
| A Siri-only path with no in-app equivalent | Siri AI is beta, English-only, and absent in the EU and China at launch | Every Siri-reachable action needs a normal in-app control |
| `[Entity]` parameter that can hold dozens of items | Resolution stalls before anything renders; reads as Siri hanging | `EntityCollection<Entity>` (iOS 27) |
| A UI-touching intent shared with a widget extension | Silently runs in the wrong process sometimes | `allowedExecutionTargets: [.main, .appIntentsExtension]` |

## See also

- `references/platform/01-widgets-live-activities.md#interactive-widgets-ios-17` -- widgets and Live Activities use App Intents
