# Drag, Drop, and Data Transfer

> Owner: `references/patterns/10-drag-drop.md` owns `Transferable`-based drag & drop (`.draggable`/`.dropDestination`), multi-item drag containers, copy/paste (`.copyable`/`.pasteDestination`), and the lower-level `.onDrag`/`.onDrop`/`NSItemProvider` escape hatch. Reordering a `List` or grid by drag is owned by `references/interaction/06-custom-controls-reorderable.md` -- this file states only the built-in `List` baseline and points there for the full system. Reduce Motion for any custom hover animation is owned by `references/accessibility/05-motion-accessibility.md`.
> Floors: see `references/_scaffolding/version-floor-registry.md#ios-160` for the `Transferable`/`.draggable`/`.dropDestination` baseline; the `dragContainer` multi-item family is iOS 26.0+ and called out inline below.

Getting drag & drop to feel Apple-native on iOS 26 is mostly about deferring to the system's Liquid Glass lift-and-set-down motion and hitting the HIG affordance cues -- not custom animation. The system renders the lift, the drop snap-back, and (on iOS 26) the drag preview's material; your job is wiring `Transferable`, targeted feedback, and an accessible alternative to every drag action.

## The Apple way

On iOS 26 a lifted drag preview automatically gets the Liquid Glass treatment -- a specular-highlight rim, a soft ambient shadow, a slight scale-up. Do NOT fake this with a custom shadow/scale on the preview; supply a compact `preview` closure and let the system render the material. Drop set-down is animated by the system too; on rejection the item snaps back automatically -- never hand-animate the return.

HIG affordance checklist -- the difference between "feels off" and "feels native":

- **Discoverability**: a plain `.draggable` view gives no visual hint. For non-obvious sources, add a grabber glyph, a hover cursor on iPad/Mac, or surface reordering through `EditButton`.
- **Targeted feedback**: wire `isTargeted:` to a tinted fill + solid accent border + ~1.02-1.05x scale, animated `.snappy(~0.2s)`. A drop zone with no hover feedback is the single most common polish gap.
- **Idle vs. active borders**: dashed/low-contrast at rest, solid accent when targeted.
- **Haptics**: one `.sensoryFeedback(.impact, trigger:)` on drop (or `.success` for a meaningful commit) -- never per-hover, never per frame. Full contract owned by `references/haptics/02-swiftui-sensory-feedback.md`.
- **Operation honesty**: reflect copy vs. move truthfully -- use `DragConfiguration.operationsOutsideApp` to force a copy when the item leaves your app, so a cross-app drag never silently destroys the user's data.

## Decision table

| Need | Use |
|---|---|
| Single item, type-safe | `.draggable(item)` + `.dropDestination(for:)` |
| Multi-select drag from a collection (iOS 26+) | `dragContainer` + `.draggable` + `dragContainerSelection` |
| Reorder a `List` | `ForEach.onMove` + `EditButton` -- OS owns removal (see `interaction/06`) |
| Reorder a grid | manual `.draggable` + `.dropDestination` -- OS gives you no built-in path (see `interaction/06`) |
| Heterogeneous, lazy, or progress-reporting drops | `.onDrag`/`.onDrop` + `NSItemProvider` |
| Clipboard on focused content | `.copyable` / `.cuttable` / `.pasteDestination` |
| Explicit, no-prompt paste | `PasteButton` |
| Cross-device | Universal Clipboard / AirDrop -- NOT drag |

iPhone supports same-app drag only (no side-by-side multitasking); inter-app drag needs iPad Split View/Slide Over/Stage Manager or Mac Catalyst/macOS.

## Single-item drag: `.draggable` + `.dropDestination`

```swift
Text(task.title)
    .draggable(task)                       // task: Transferable

// Custom preview -- an icon + one line beats a full-width row snapshot
Text("Drag me")
    .draggable(task) {
        Label(task.title, systemImage: "checklist")
            .padding(8)
            .background(.regularMaterial, in: .rect(cornerRadius: 10))
    }
```

Without a `preview` closure SwiftUI snapshots the source view -- ship a cleaner, smaller custom preview when the source row is dense. Two `.dropDestination(for:)` overloads exist; the compiler picks based on your closure shape. The iOS 26 form passes a `DropSession` and returns nothing:

```swift
.dropDestination(for: TodoItem.self) { items, session in    // iOS 26.0+ DropSession form
    tasks.append(contentsOf: items)
}
```

The original (iOS 16+) form passes a `CGPoint` and returns `Bool` (`true` = accepted):

```swift
.dropDestination(for: TodoItem.self) { items, location in   // iOS 16+
    tasks.insert(contentsOf: items, at: indexFor(location))
    return true                          // false triggers the automatic snap-back
} isTargeted: { targeted in
    isDropTargeted = targeted            // drives hover feedback
}
```

`isEnabled:` gates a destination without removing the modifier: `.dropDestination(for: Photo.self, isEnabled: canAcceptPhotos) { … }`.

### Hover feedback -- the #1 polish gap

```swift
@State private var isTargeted = false

DropZone()
    .background {
        RoundedRectangle(cornerRadius: 16)
            .fill(isTargeted ? Color.accentColor.opacity(0.15) : .clear)
            .strokeBorder(isTargeted ? Color.accentColor : .secondary.opacity(0.3),
                          style: .init(lineWidth: 2, dash: isTargeted ? [] : [6]))
    }
    .scaleEffect(isTargeted ? 1.02 : 1.0)
    .animation(.snappy(duration: 0.2), value: isTargeted)
    .dropDestination(for: Photo.self) { photos, _ in
        store.add(photos); return true
    } isTargeted: { isTargeted = $0 }
```

Because `Transferable` types can expose fallback representations (a `ProxyRepresentation` down to `String`/`URL`), a destination declared `for: URL.self` also catches drags from Safari, Photos, and Files -- lean on this to accept other-app content for free rather than declaring every possible type explicitly.

## Transferable conformance (the contract)

`Transferable` (module `CoreTransferable`, iOS 16+) is the single, type-safe description of how a value crosses a boundary -- conform once and `.draggable`, `.dropDestination`, `.copyable`, `.pasteDestination`, and `ShareLink` all work. `transferRepresentation` is a result builder where ORDER = fidelity preference, highest first:

```swift
struct Contact: Codable, Transferable {
    let id: String
    let fullName: String
    let phoneNumber: String

    static var transferRepresentation: some TransferRepresentation {
        CodableRepresentation(contentType: .exampleContact)          // 1. highest fidelity, your own UTI

        DataRepresentation(contentType: .vCard) { contact in         // 2. interchange format
            try contact.toVCardData()
        } importing: { data in
            try await parseVCardData(data)
        }
        .suggestedFileName { $0.fullName }

        ProxyRepresentation { contact in contact.phoneNumber }       // 3. lowest-fidelity fallback
        importing: { value in Contact(id: UUID().uuidString, fullName: value, phoneNumber: value) }
    }
}

extension UTType {
    static let exampleContact = UTType(exportedAs: "com.myapp.contact")
}
```

`FileRepresentation` (not shown) is preferred over `DataRepresentation` for large payloads -- it streams a file URL instead of loading everything into memory. A custom `exportedAs:` UTI must ALSO be declared in Info.plist under Exported Type Identifiers with a `UTTypeConformsTo`; without it, cross-app drops silently fail to match, with no error surfaced. Always ship at least one low-fidelity `String`/`URL` proxy representation so a drop into another app (Notes, Messages, a search field) still yields something usable -- a destination that speaks only your private UTI is a dead end everywhere else.

## Multi-item drag containers (iOS 26+)

Before iOS 26, multi-select drag meant hand-assembling an `NSItemProvider` in `.onDrag`. `dragContainer` lets one gesture carry a whole selection out of a `ForEach`/grid:

```swift
// iOS 26.0+ / iPadOS 26.0+ / macOS 26.0+ / visionOS 26.0+.
// On iOS 16-18 the only multi-item path is manual .onDrag + NSItemProvider (below).
struct FruitGrid: View {
    @State private var fruits: [Fruit]
    @State private var selection: [Fruit.ID] = []

    var body: some View {
        ScrollView {
            LazyVGrid(columns: columns) {
                ForEach(fruits) { fruit in
                    FruitCell(fruit).draggable(fruit)     // child opts in
                }
            }
        }
        .dragContainer(for: Fruit.self) { ids in fruits(matching: ids) }   // ids = selection OR the single dragged id
        .dragContainerSelection(selection)
    }
}
```

Return an empty collection from the payload closure to cancel the drag. `dragPreviewsFormation` chooses how stacked previews arrange: `.pile` (default, cards collapse with a count badge), `.list`, or `.stack` -- pick `.stack` for photos, `.list` for text rows. `DragConfiguration` declares allowed operations separately for in-app vs. cross-app:

```swift
CardView(card)
    .draggable(configuration: DragConfiguration(
        operationsWithinApp: .init(allowMove: true, allowDelete: true),
        operationsOutsideApp: .init(allowMove: true, allowDelete: false)),
        card)
    .onDragSessionUpdated { session in
        if case .ended(_, let operation) = session.phase, operation == .move || operation == .delete {
            for id in session.draggedItemIDs(type: UUID.self) { removeCard(id: id) }
        }
    }
```

The DROP destination inserts; the SOURCE removes on `.move`/`.delete` via `onDragSessionUpdated` -- keep that separation clean. For a pure same-app reorder, prefer `List` + `onMove` (below) over this family entirely.

## Reordering (pointer)

`List` gives reordering a built-in path -- prefer it over any hand-rolled drag reorder:

```swift
List {
    ForEach(items, id: \.self) { Text($0) }
        .onMove { from, to in items.move(fromOffsets: from, toOffset: to) }
}
.toolbar { EditButton() }
```

The full reorder system -- grid/`LazyVGrid` manual reordering, spring-loading, and the accessible custom-action alternative -- is owned by `references/interaction/06-custom-controls-reorderable.md`; this section states only the `List` baseline this file's drag mechanics build on.

## Copy, cut, paste

The clipboard rides the same `Transferable` machinery -- conform once and Edit ▸ Copy/Cut/Paste plus Cmd-C/X/V light up for free.

```swift
List(photos, id: \.id, selection: $selection) { PhotoRow($0) }
    .copyable(selectedPhotos)                  // Cmd-C / Edit > Copy exports these
    .cuttable(for: Photo.self) {
        let cut = selectedPhotos
        store.remove(selectedPhotos)           // cut = copy + delete
        return cut
    }
```

`.pasteDestination` is the receiving counterpart; a `validator` filters BEFORE `action` runs -- return `[]` to silently reject:

```swift
List(birds, id: \.self) { Text($0) }
    .pasteDestination(for: String.self) { values in
        birds.append(contentsOf: values)
    } validator: { values in
        values.filter { known.contains($0) }
    }
```

`PasteButton` is the only way to read the clipboard WITHOUT triggering the "…pasted from…" privacy banner, because the tap itself is explicit consent:

```swift
PasteButton(payloadType: URL.self) { urls in
    guard let url = urls.first else { return }; addBookmark(url)
}
.buttonStyle(.glass)                           // matches Liquid Glass toolbars, iOS 26.0+
.labelStyle(.iconOnly)
```

For programmatic clipboard access outside a focused-view context, fall back to `UIPasteboard.general.string`/`.url`/`.image`. Since iOS 16, READING text/URL/image from `UIPasteboard` shows the transient privacy banner and may prompt "Allow Paste?" on first cross-app read -- avoid it by preferring `PasteButton`, and by using detection-only checks (`hasStrings`/`hasURLs`/`hasImages`) to enable/disable a paste affordance without reading content. Never poll the pasteboard on launch or `onAppear`.

## Lower-level: `.onDrag`/`.onDrop` + `NSItemProvider`

Drop to this layer only for heterogeneous multi-type drops, lazy/deferred loading, progress reporting, or UIKit interop:

```swift
Text(note.title)
    .onDrag { NSItemProvider(object: note.title as NSString) }   // lazily built when the drag starts

DropArea()
    .onDrop(of: [.image, .url, .plainText], isTargeted: $isTargeted) { providers, _ in
        for provider in providers where provider.canLoadObject(ofClass: UIImage.self) {
            provider.loadObject(ofClass: UIImage.self) { obj, _ in
                guard let image = obj as? UIImage else { return }
                Task { @MainActor in store.add(image) }          // loaders fire off-main -- hop back
            }
        }
        return !providers.isEmpty
    }
```

A custom cross-app UTI needs an Exported (owner) or Imported (consumer) Type Identifier declared in Info.plist -- built-ins (`.plainText`, `.url`, `.image`, `.pdf`, `.json`, …) need no declaration. Cross-app/cross-device scope:

| Context | Drag & drop scope |
|---|---|
| iPhone | Same-app only |
| iPad (Split View / Slide Over / Stage Manager) | Full inter-app drag between visible apps |
| Mac Catalyst / macOS | Full inter-app drag, Finder, Dock |
| Cross-device | Not via drag -- Universal Clipboard or AirDrop |

Prefer `.draggable`/`.dropDestination(for:)` unless you genuinely need this layer -- they're less code, type-safe, and get the Liquid Glass preview and iOS 26 drag-container features automatically.

## Accessibility contract

Drag-to-reorder and drag-to-transfer are INACCESSIBLE to VoiceOver, Switch Control, and Voice Control on their own (WCAG 2.5.7 Dragging Movements) -- never make drag the ONLY path to an action.

```swift
FileIcon(filename: filename)
    .accessibilityDragPoint(.center, description: Text("Move \(filename)"))     // iOS 16.0+

DropZoneView()
    .accessibilityDropPoint(.center, description: Text("Drop into \(folderName)"))  // iOS 16.0+
```

These VoiceOver-native drag/drop points make the ORIGINAL gesture accessible; they're an upgrade over the also-required non-drag alternative, not a replacement for it. Provide `.accessibilityAction(named: "Move Up")`/"Move Down"/"Move to Favorites" on draggable rows, or expose reordering through `EditButton` mode, which VoiceOver announces as reorderable. Offer a non-drag alternative for every drag action -- a context-menu "Move to…", a toolbar button, or a copy/paste path. The system already tones down the lift animation under Reduce Motion; any CUSTOM hover animation you add on top of `isTargeted` still needs its own check against `references/accessibility/05-motion-accessibility.md`'s double-gate before it ships.

## Anti-patterns

| Wrong | Why it fails | Right |
|---|---|---|
| Custom shadow/scale baked onto a drag preview | Stacks on top of the system's Liquid Glass lift treatment -- doubled, non-native look | Supply a compact `preview` closure, let the system render the lift |
| `.dropDestination` with no `isTargeted:` hover feedback | User gets no signal the drop will land -- the #1 reported "feels off" bug | Always wire `isTargeted:` to a tinted fill + border + snappy scale |
| Declaring `dragContainer`/`DragConfiguration` at an iOS 16-18 floor | Doesn't exist below iOS 26 -- won't compile | Manual `.onDrag` + `NSItemProvider` on pre-26 targets |
| A private `Transferable` UTI with no `String`/`URL` proxy fallback | Drop into any other app (Notes, Safari, a search field) yields nothing | Always include a low-fidelity `ProxyRepresentation` |
| Reading `UIPasteboard` content on `onAppear` to "check for a link" | Triggers the privacy banner / prompt on every launch | `PasteButton`, or detection-only `hasURLs` |
| Drag as the ONLY way to reorder or transfer | Inaccessible to VoiceOver/Switch/Voice Control | Pair with `EditButton` reorder mode or an explicit menu action |

## Severity guide

CRITICAL: drag is the sole path to a required action with no accessible alternative (WCAG 2.5.7 violation). HIGH: `dragContainer`/`DragConfiguration` shipped at a floor below iOS 26 (compile error), or a cross-app UTI missing its Info.plist declaration (silent no-match, hard to diagnose). MEDIUM: no `isTargeted` hover feedback, or a hand-animated snap-back duplicating what the system already provides. LOW: pasteboard read on launch triggering an avoidable privacy banner.

## See also

- `references/interaction/06-custom-controls-reorderable.md` -- full grid/list reorder system, spring-loading, accessible reorder actions
- `references/haptics/02-swiftui-sensory-feedback.md#built-in-feedback-types` -- the `.impact`/`.success` drop haptic
- `references/design/02-liquid-glass.md` -- the material system the iOS 26 drag preview renders through
- `references/accessibility/04-motor-interaction.md#drag-operations-have-single-pointer-alternatives-wcag-257` -- the non-drag-alternative requirement
- `references/accessibility/05-motion-accessibility.md` -- Reduce Motion double-gate for any custom hover animation
