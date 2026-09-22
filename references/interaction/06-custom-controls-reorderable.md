# Custom Controls and Reorderable Collections

> Owner: this file owns building bespoke value controls (sliders, knobs, segmented pills) and their accessibility bridge (`accessibilityRepresentation`), plus drag-to-reorder collections. `references/interaction/05-press-feedback-states.md` owns `ButtonStyle` press mechanics -- cite it for stepper/button feel, don't restate. `references/interaction/03-direct-manipulation-drag.md` owns general drag/pinch/rotate cookbook and `accessibilityDragPoint`/`accessibilityDropPoint`.
> Floors: `references/_scaffolding/version-floor-registry.md`. `reorderContainer(for:…)` (on the container) and `reorderable()` (on `DynamicViewContent`, i.e. the `ForEach`) are iOS 27.0 / iPadOS 27.0 / Mac Catalyst 27.0 / macOS 27.0 / visionOS 27.0 / watchOS 27.0, and **not tvOS at any version** -- an app with a lower deployment target needs an `#available(iOS 27, *)` gate and a real fallback, which is `List.onMove` (lists) or hand-rolled `.draggable`/`.dropDestination` (grids/free-form). `swipeActionsContainer()` and the `onPresentationChanged:` swipe overload are iOS 27.0+ (not tvOS); `swipeActions(edge:allowsFullSwipe:content:)` keeps its iOS 15.0 floor. `accessibilityRepresentation(representation:)` is iOS 15.0+.

Two disciplines, opposite bias. A genuinely custom control (nothing native maps to it) demands you own the feel completely -- an exact finger-to-value transfer function, plus `accessibilityRepresentation` to borrow a real control's semantics rather than hand-rolling VoiceOver support. Reordering demands the reverse: prefer the native primitive over hand-rolling, because the system now owns that choreography on every collection shape -- `List.onMove` has always been free, and `reorderContainer` has been shipping since iOS 27.0 for stacks, grids and custom layouts.

## The Apple way

A custom control is, to VoiceOver, an inert blob of shapes unless you tell the accessibility layer what it represents. That is the single most-skipped step in custom-control work and a recurring App Store rejection. For reordering, the most-skipped step is the opposite: reaching for a hand-rolled `DragGesture` when `List.onMove` already does the job, correctly, for free.

## `accessibilityRepresentation`: the highest-leverage line in custom-control work

Instead of hand-wiring a label, a value string, an adjustable action, and every trait, tell SwiftUI "for accessibility, treat this as a real `Slider`" and inherit every stock behavior -- the adjustable trait, value formatting, Voice Control number entry, Full Keyboard Access, rotor support:

```swift
CustomSliderTrack(value: $value)
    .accessibilityRepresentation {
        Slider(value: $value, in: 0...100) { Text("Brightness") }
    }
```

The visual stays 100% your custom design; the accessibility semantics become a battle-tested native control. Prefer it over hand-rolled traits whenever the control maps cleanly to `Slider`, `Stepper`, `Toggle`, or `Picker`. Hand-roll only when the mapping is genuinely custom (a 2D pad, a color wheel):

```swift
CustomSlider(value: $volume)
    .accessibilityElement()                       // collapse the ZStack of shapes into ONE element
    .accessibilityLabel("Volume")                 // what it IS (static)
    .accessibilityValue("\(Int(volume * 100))%")  // its CURRENT value -- speak MEANING, never raw radians/points
    .accessibilityAdjustableAction { direction in
        switch direction {
        case .increment: volume = min(1, volume + 0.05)
        case .decrement: volume = max(0, volume - 0.05)
        @unknown default: break
        }
    }
```

`.accessibilityElement()` (or `.accessibilityElement(children: .ignore)`) is required first -- without it VoiceOver reads each shape separately and none is adjustable. `.accessibilityAdjustableAction` is what makes a swipe up/down invoke `.increment`/`.decrement`; without it a blind user cannot change the value at all, since circular/linear dragging is meaningless to VoiceOver. For a rapidly-scrubbing value, add `.accessibilityAddTraits(.updatesFrequently)` so VoiceOver re-reads at a sane cadence instead of every frame. Every custom control needs ≥44x44pt hit target (`references/accessibility/04-motor-interaction.md#touch-targets`, OWNER) and a Dynamic-Type-honoring readout regardless of how thin the visible track is.

## Building the control: the transfer function

Getting a custom slider to feel Apple-smooth is 90% the transfer function -- how a raw touch x-coordinate becomes a bounded value, updated every frame with zero lag. Track the finger in the track's OWN coordinate space, and subtract the thumb's half-width from both the finger position and the usable width so the thumb CENTER, not its leading edge, sits under the finger:

```swift
struct CustomSlider: View {
    @Binding var value: Double
    var range: ClosedRange<Double> = 0...1
    let thumb: CGFloat = 28

    var body: some View {
        GeometryReader { geo in
            let usable = geo.size.width - thumb
            let frac = (value - range.lowerBound) / (range.upperBound - range.lowerBound)
            let x = CGFloat(frac) * usable

            ZStack(alignment: .leading) {
                Capsule().fill(.quaternary).frame(height: 4)
                Capsule().fill(.tint).frame(width: x + thumb / 2, height: 4)
                Circle().fill(.white).shadow(radius: 2).frame(width: thumb, height: thumb).offset(x: x)
            }
            .frame(maxHeight: .infinity)
            .contentShape(Rectangle())                                     // whole track grabbable, not just the thumb
            .gesture(
                DragGesture(minimumDistance: 0, coordinateSpace: .local)    // 0 = welds to the finger on touch-down
                    .onChanged { g in
                        let raw = (g.location.x - thumb / 2) / usable
                        value = range.lowerBound + min(max(raw, 0), 1) * (range.upperBound - range.lowerBound)
                    }
            )
        }
        .frame(height: max(thumb, 44))                                     // >=44pt hit target regardless of track height
    }
}
```

Skipping the `thumb/2` subtraction is the single most common custom-slider bug -- the thumb drifts ~14pt off the finger at the extremes and can never reach the visual ends. Apply non-linear response (audio volume, frequency) to the DISPLAY/output value only; keep the binding linear in track-fraction, or you introduce lag inverting a log curve to reposition the thumb.

## Control recipe index

Each of these is a distinct transfer-function problem with one load-bearing insight; full worked recipes live in the source corpus and follow the same `accessibilityRepresentation`/`accessibilityAdjustableAction` contract above.

| Control | The one thing that makes it feel right | Haptic |
|---|---|---|
| Detented slider (rating, EQ band) | Quantize to notch INDEX and trigger `.sensoryFeedback` on that, never on the continuous value -- otherwise it buzzes every frame | `.selection` per notch |
| Rotary knob/dial | `atan2` gives -pi...pi; naive assignment jumps 2*pi at the seam -- accumulate the UNWRAPPED delta between samples, never assign the raw angle | `.selection` per notch, or `.impact(flexibility: .rigid)` at end stops only |
| Segmented pill (drag-across) | `matchedGeometryEffect` alone can't live-track a finger; for drag-across selection, measure segment width and drive a `@GestureState` offset, ticking `.selection` per segment crossed | `.selection` per segment crossed |
| Media timeline scrubber | Accumulate scaled INCREMENTAL deltas (`dx * tier`) by vertical-distance speed tier -- re-deriving from absolute x teleports the playhead when the tier changes | `.selection` per speed-tier crossing |
| Press-and-hold stepper | Geometric interval decay (`interval *= 0.82` per tick, floor ~50ms) replicates `UIStepper`'s acceleration; a fixed interval reads as robotic | `.increase`/`.decrease` |

A segmented pill on iOS 26 can use real Liquid Glass for the moving selection indicator -- wrap segments in `GlassEffectContainer` and pair the selected one with a stable `glassEffectID` so it morphs between segments instead of fading (`references/design/02-liquid-glass.md#glasseffectcontainer-multi-element-glass`, OWNER):

```swift
GlassEffectContainer(spacing: 4) {
    HStack(spacing: 4) {
        ForEach(items.indices, id: \.self) { i in
            Button { withAnimation(.snappy(duration: 0.3)) { selection = i } } label: {
                Text(items[i]).padding(.vertical, 8).frame(maxWidth: .infinity)
            }
            .buttonStyle(.plain)   // a real Button: press state, cancel, the button trait -- never .onTapGesture
            .glassEffect(.regular.interactive(), in: .capsule)
            .glassEffectID(selection == i ? "sel" : "seg\(i)", in: ns)
        }
    }
}
```

Reserve real glass for the selection layer -- glass-on-glass-on-glass is noise. Accessibility for a segmented control: `.accessibilityRepresentation { Picker(...) { ForEach... }.pickerStyle(.segmented) }` gets "selected"/"1 of 3" semantics for free.

## Reordering: prefer the native primitive

### iOS 27 primary path -- `reorderContainer` + `reorderable()`

Reordering is no longer `List`-only. `reorderContainer(for:…)` declares the scope of a drag-to-reorder session on ANY container -- `List`, `VStack`/`LazyVStack`, `LazyVGrid`, a custom `Layout` -- and `reorderable()` marks which content inside it can be lifted. Two modifiers, two different receivers, and confusing them is the likeliest adoption error: `reorderContainer` is declared on `View` (the container), `reorderable()` on `DynamicViewContent` (the `ForEach`), so `.reorderable()` on an arbitrary view does not compile.

```swift
@available(iOS 27, *)
struct CardBoard: View {
    @State private var cards: [Card]
    @State private var isSyncing = false

    var body: some View {
        ScrollView {
            LazyVGrid(columns: [.init(.adaptive(minimum: 96), spacing: 12)], spacing: 12) {
                ForEach(cards) { CardCell($0) }
                    .reorderable()                        // on the ForEach -- DynamicViewContent, not View
            }
        }
        .reorderContainer(for: Card.self, isEnabled: !isSyncing) { difference in
            apply(difference)                             // YOUR function -- see below
        }
    }
}
```

Four overloads share the name, crossing `Identifiable`-vs-keypath item identity with single-vs-multi collection:

| Overload | Use when |
|---|---|
| `reorderContainer(for:isEnabled:move:)` | `Item: Identifiable`, one collection -- the idiomatic default Apple leads with |
| `reorderContainer(for:itemID:isEnabled:move:)` | model is not `Identifiable`; supply a `KeyPath` to a `Hashable & Sendable` id |
| `reorderContainer(for:in:isEnabled:move:)` | several collections tagged by a `CollectionID` (sections, Kanban columns) |
| `reorderContainer(for:itemID:in:isEnabled:move:)` | both of the above |

`isEnabled:` is a craft knob, not boilerplate: disable reordering while a save or sync is in flight rather than letting a drop race the model.

**You own the mutation, and SwiftUI ships no helper for it.** The `move:` closure receives a `ReorderDifference<ItemID, CollectionID>` whose documented members are exactly two -- `sources: [ItemID]`, the ids being moved, and `destination`, carrying a collection id plus a `Position` of either `.before(id)` or `.end`. There is no `apply(to:)` on `ReorderDifference` and no `apply(_:)` on `Array`; Apple's own article calls a developer-written method, so write one:

```swift
@available(iOS 27, *)
extension CardBoard {
    // The whole contract: the system runs the drag and the make-way placeholder; this applies the edit.
    private func apply(_ difference: ReorderDifference<Card.ID, ReorderableSingleCollectionIdentifier>) {
        let moving = cards.filter { difference.sources.contains($0.id) }
        var remaining = cards.filter { !difference.sources.contains($0.id) }
        switch difference.destination.position {     // @frozen: .before(id) and .end are the whole enum
        case .before(let id):
            let index = remaining.firstIndex { $0.id == id } ?? remaining.endIndex
            remaining.insert(contentsOf: moving, at: index)
        case .end:
            remaining.append(contentsOf: moving)
        }
        cards = remaining
    }
}
```

`ReorderableSingleCollectionIdentifier` is the empty placeholder the single-collection overloads use for `CollectionID` -- spell it out in the signature, or let the closure infer it.

The ID-based diff is a correctness advantage over `onMove`, not a style preference. `onMove` hands you `(IndexSet, Int)`, which describes POSITIONS; if a cloud sync inserts a row mid-drag, those indices now address different items and the move lands on the wrong ones. `sources` plus `.before(id)` describes IDENTITIES and survives that.

Reorder and export-drag are separate opt-ins. A container with `reorderContainer` and no `dragContainer` lets a user rearrange but silently refuses to drag an item to another window or app -- an incomplete-feeling interaction on iPad and Mac. When the container also accepts drops from outside, Apple's composition order is specific: `.dropDestination` goes AFTER `.reorderContainer`, so the container owns internal reorder and the drop destination owns external drops; inside the drop action, `DropSession.reorderDestination(for:in:)` returns the `Destination` the system would have used, so read it instead of computing an insertion index from hit-testing, or the drop lands somewhere other than the visible make-way gap. Full drag-container treatment: `references/patterns/10-drag-drop.md#multi-item-drag-containers-ios-27` (OWNER).

Xcode 27 runs drag and drop, drag-to-reorder included, inside SwiftUI Previews in the Simulator -- reorder feel no longer needs a device build to sanity-check.

Apple documents the drag, the make-way placeholder and the drop. Lift styling, settle physics, pickup/drop haptics and Reduce Motion damping are not stated in the API contract, so check them on device before assuming the system supplies every beat the hand-rolled recipe below builds by hand.

### `List` + `onMove` -- the long-standing single-collection path

```swift
List {
    ForEach(items) { item in
        ItemRow(item)
    }
    .onMove { indices, newOffset in
        items.move(fromOffsets: indices, toOffset: newOffset)
    }
}
.toolbar { EditButton() }
```

`List.onMove` (iOS 13+) auto-scrolls at the container edge, fires the correct pickup/drop haptics, and exposes reorder to VoiceOver's rotor automatically. It stays the correct default for any `List`-backed collection on any floor -- do not hand-roll a `DragGesture` reorder for a plain list, and do not replace a working `onMove` with `reorderContainer` unless you need the ID-based diff or a container that is not a `List`.

### Below iOS 27 -- grids and free-form layouts, hand-rolled

`List.onMove` does not cover `LazyVGrid`/custom `Layout`, and `reorderContainer` needs a 27 deployment floor -- so this is the fallback branch, and on tvOS it is the only path at any version. Compose `.draggable`/`.dropDestination` (base recipe: `references/animation/05-gesture-driven.md#drag-and-drop`, OWNER) with a stable target-slot function. The load-bearing detail everyone omits is the MIDPOINT crossing rule with hysteresis, so a finger resting on a slot boundary does not flicker the layout every frame:

```swift
// Claim slot n once the finger's center passes slot n's MIDPOINT, not its leading edge --
// matches how List and every native reorder behaves.
func targetIndex(fingerY: CGFloat, rows: [CGRect], committed: Int) -> Int {
    let margin = rowHeight * 0.25                       // hysteresis: enter/exit thresholds differ
    for (i, f) in rows.enumerated() {
        if i < committed, fingerY < f.midY - margin { return i }
        if i > committed, fingerY > f.midY + margin { return i }
    }
    return committed                                     // inside the dead-zone -> hold
}
```

Mutate the array and fire the slot-crossing `.selection` haptic ONLY when the stable target actually changes -- never per frame (`.onChanged` runs up to 120Hz). Anchor the dragged cell with `.offset(drag.translation)`, never `.position(drag.location)` -- `translation` is already relative to the grab point, so the item lifts straight up from where it sat instead of re-centering under the finger. Give the lift, the live track, and the drop settle three DISTINCT animations keyed to three different values (`isLifted`, the raw `drag` value with no animation attached, and `items`) -- a single `.animation(.spring, value: everything)` animates the follow offset too and the drag chases the finger with elastic lag:

```swift
Cell(item)
    .scaleEffect(isLifted ? 1.06 : 1.0)
    .shadow(radius: isLifted ? 18 : 3, y: isLifted ? 12 : 2)
    .zIndex(isLifted ? 1 : 0)
    .animation(reduceMotion ? nil : .snappy(duration: 0.22, extraBounce: 0), value: isLifted)   // LIFT: crisp, no bounce
    .offset(isLifted ? drag : .zero)                                                             // TRACK: raw, unanimated
    .animation(reduceMotion ? nil : .spring(duration: 0.30, bounce: 0.20), value: items)         // SETTLE: bounce belongs here
```

Seed the settle from release velocity so a flung item continues its throw rather than dead-stopping: normalize `DragGesture.Value.velocity` (points/sec) by the remaining travel distance and feed the unitless result to `.interpolatingSpring(_:initialVelocity:)` -- the only spring family that honors `initialVelocity`; a plain `.spring(bounce:)` silently ignores it.

## Cross-container moves (Kanban)

### iOS 27 -- one multi-collection container

Tag each section's content with a collection id and scope one container across all of them; the framework then reports a cross-column move as a single `ReorderDifference` whose `destination.collectionID` names the target column:

```swift
// iOS 27+. Inside an @available(iOS 27, *) view.
ScrollView(.horizontal) {
    HStack(alignment: .top, spacing: 16) {
        ForEach(columns) { column in
            LazyVStack(spacing: 8) {
                ForEach(column.cards) { CardCell($0) }
                    .reorderable(collectionID: column.id)          // tags this section's content
            }
        }
    }
}
.reorderContainer(for: Card.self, in: Column.ID.self) { difference in
    applyAcrossColumns(difference)                                 // yours, same shape as apply(_:) above
}
```

One `ReorderDifference` means one edit: `difference.destination.collectionID` names the target column, so remove from the source column and insert into the destination column inside a SINGLE mutation, and both columns reflow in one continuous motion instead of two fighting animations.

### Below iOS 27 -- hand-rolled

Moving a card between columns is one atomic mutation, not two, so both collections reflow as a single continuous motion:

```swift
withAnimation(.spring(duration: 0.30, bounce: 0.18)) {
    columns[fromCol].cards.remove(at: cardIdx)      // source gap CLOSES
    columns[toCol].cards.insert(card, at: idx)      // destination gap OPENS
}
```

Mark the container-enter moment distinctly from an in-column slot crossing -- it is semantically bigger (the item's category is changing): a one-shot `.impact(weight: .medium)` keyed to the hovered column ID changing, plus a brief `.snappy(0.2)` tint on the entered column. Float the dragged card in a shared named coordinate space with a high `zIndex` so it is never clipped crossing the gutter between columns, and give an empty column a visible dashed-placeholder drop target -- an empty column with nothing to highlight is a dead end.

## Haptic choreography for reorder

These are the beats you fire in a hand-rolled reorder. Inside `reorderContainer` the system runs the interaction, so add a haptic there only where device testing shows a beat genuinely missing -- doubling the system's own feedback is worse than none.

Three edge-triggered beats, never continuous:

| Beat | When | Haptic |
|---|---|---|
| Pickup | rising edge of `isLifted` | `.impact(flexibility: .soft)` |
| Slot cross | hysteresis-stable target changes | `.selection` |
| Commit | drop settles | `.impact(flexibility: .rigid)` or `.success` |

Key every trigger to a discrete, debounced state (`isLifted`, the hysteresis-stable target, a `didDrop` counter) -- never to `drag.translation` or a raw per-frame index, or the Taptic Engine machine-guns. Reduce Motion does NOT gate any of these three; haptics are feedback, not motion, and they become more important once the decorative lift/slide is suppressed.

## Swipe actions outside `List` (iOS 27+)

The other collection affordance that escaped `List` in iOS 27. `swipeActions(edge:allowsFullSwipe:content:)` keeps its iOS 15 floor and now works on a row in any container -- but outside a `List` it has no cross-row coordination until `swipeActionsContainer()` is applied to the enclosing scroll view, stack, grid or custom layout. That modifier supplies exactly what hand-rolled swipe rigs always omit: only one row's actions open at a time, scrolling dismisses them, and a tap outside the active row closes it. Applying it to a real `List` is a documented no-op.

The paired `onPresentationChanged:` overload reports when a row's drawer opens (`true`) or closes (`false`) -- the first time the app can see a swipe reveal at all:

```swift
@available(iOS 27, *)
struct CardFeed: View {
    @State private var items: [Item]
    @State private var revealedID: Item.ID?

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 8) {
                ForEach(items) { item in
                    CardRow(item, isDimmed: revealedID != nil && revealedID != item.id)
                        .swipeActions(edge: .trailing) {
                            Button("Delete", role: .destructive) { delete(item) }
                        } onPresentationChanged: { shown in
                            revealedID = shown ? item.id : nil
                        }
                        .accessibilityAction(named: "Delete") { delete(item) }
                }
            }
        }
        .swipeActionsContainer()                      // the coordination List gives for free
    }
}
```

Use `onPresentationChanged:` to make swipe read as a MODE rather than an overlay -- dim the row, pause autoplaying content in it, suppress a competing gesture while actions are showing. On a 27 floor, `swipeActions` outside a `List` with no `swipeActionsContainer()` is a real defect, not a nit: several rows stay open at once and scrolling leaves them open. Below iOS 27 the only correct options are a real `List` or hand-rolled open-row bookkeeping across rows. Swipe stays an accelerator on every floor -- each destructive action needs a twin `.accessibilityAction(named:)`.

## Availability + fallbacks

```swift
if #available(iOS 27, *) {
    grid.reorderContainer(for: Card.self) { apply($0) }   // apply(_:) is yours; see the section above
} else {
    grid.gesture(handRolledReorderGesture)                // draggable/dropDestination + midpoint/hysteresis
}

if #available(iOS 27, *) {
    cardFeed.swipeActionsContainer()                      // cross-row coordination outside List
} else {
    List { cardRows }                                     // pre-27: a real List is the only coordinated path
}
```

tvOS has neither `reorderContainer`/`reorderable()` nor `swipeActionsContainer()` at any version -- on that platform the hand-rolled recipe is not a fallback, it is the implementation.

## Accessibility contract

- **Custom controls without `accessibilityRepresentation`:** `.accessibilityElement()` + label + `.accessibilityValue` + `.accessibilityAdjustableAction` is the floor. Omitting the adjustable action makes the control completely inoperable for VoiceOver -- a frequent App Store rejection, not a nice-to-have.
- **Reordering:** `List.onMove` (with `EditButton`) exposes reorder to VoiceOver's rotor automatically -- long-standing, dependable behavior. The `reorderContainer` family owns the reorder INTERACTION, but Apple does not document its VoiceOver surface, so verify the rotor on device before relying on it and ship named move actions either way. A hand-rolled grid `DragGesture` reorder exposes nothing -- pair it with `accessibilityDragPoint`/`accessibilityDropPoint` and `.accessibilityAction(named: "Move up"/"Move down")` (`references/interaction/03-direct-manipulation-drag.md`, OWNER).
- **Reduce Motion:** the finger-follow track is direct manipulation and is never gated. Gate only the lift scale/pop and the settle bounce -- replace with a static tint/opacity cue so "picked up" stays legible (`references/accessibility/05-motion-accessibility.md`, OWNER).
- **Differentiate Without Color:** never encode a custom control's value by hue alone (a red-to-green meter) -- pair with a numeric readout or fill length.

## Anti-patterns

| Wrong | Why it fails | Right |
|---|---|---|
| Custom control with no `accessibilityAdjustableAction` | Inoperable for VoiceOver -- circular/linear dragging means nothing to it | `accessibilityRepresentation { Slider/Stepper/Picker }` or the manual adjustable contract |
| `reorderContainer`/`reorderable` as the only reorder path in an app whose floor is below 27, or on tvOS | Won't compile -- the modifiers require a 27 deployment target and do not exist on tvOS at any version | `reorderContainer` behind `#available(iOS 27, *)` with `List.onMove` / hand-rolled `.draggable`+`.dropDestination` as the real fallback branch |
| `.reorderable()` on the cell instead of the `ForEach` | It is declared on `DynamicViewContent`, not `View` -- does not compile | `.reorderable()` on the `ForEach`, `.reorderContainer(for:)` on the enclosing container |
| `cards.apply(difference)` or `difference.apply(to:)` in a `move:` closure | Neither exists in SwiftUI -- phantom API | Write the mutation yourself from `difference.sources` and `difference.destination.position` |
| Single-collection `reorderContainer` used for a Kanban board | The overload cannot express a cross-column move | `reorderContainer(for:in:isEnabled:move:)` + `reorderable(collectionID:)` per section |
| `swipeActions` outside a `List` with no `swipeActionsContainer()` | No cross-row coordination -- several rows stay open, scrolling leaves them open | `swipeActionsContainer()` on the enclosing container (iOS 27+), or use a real `List` |
| Target slot from raw finger position, no hysteresis | Flickers/thrashes when the finger rests on a boundary | Midpoint crossing rule + asymmetric enter/exit margin |
| `.position(drag.location)` on the dragged cell | Item snaps to re-center under the finger on pickup | `.offset(drag.translation)` -- already relative to the grab point |
| One `.animation(.spring, value: everything)` for lift+track+settle | Follow offset gets animated too -- the drag chases the finger with lag | Three animations keyed to three distinct values (`isLifted`, raw `drag`, `items`) |
| `UIImpactFeedbackGenerator.impactOccurred()` inside `.onChanged` | Fires every frame during a drag -- machine-guns the Taptic Engine | Edge-triggered `.sensoryFeedback` keyed to a debounced state |
| Encoding a custom slider's value by hue only | Invisible under Differentiate Without Color | Add a numeric readout or fill-length cue |

## Severity guide

- **CRITICAL** -- a custom control ships with no accessibility bridge at all; `reorderContainer` shipped as the ONLY reorder path on a floor below 27 or on tvOS (won't compile); a `move:` closure calling a phantom `apply` (won't compile).
- **HIGH** -- hand-rolled grid reorder invisible to VoiceOver (no drag point/drop point actions); haptic fired per-frame instead of edge-triggered; `swipeActions` outside a `List` with no `swipeActionsContainer()` on a 27 floor.
- **MEDIUM** -- a hand-rolled grid/stack reorder in an app whose floor is already 27 (reinvents a system primitive); missing hysteresis causes visible flicker at slot boundaries; `.position` used instead of `.offset` causing a pickup jump.
- **LOW** -- `reorderContainer` with no `dragContainer` on iPad/Mac where dragging an item out is expected; lift/settle share one animation value; segmented-pill glass morph missing a stable `glassEffectID`.

## See also

- `references/interaction/05-press-feedback-states.md` -- `ButtonStyle`/press mechanics for steppers and pill taps (OWNER)
- `references/interaction/03-direct-manipulation-drag.md` -- drag/pinch/rotate cookbook, `accessibilityDragPoint`/`accessibilityDropPoint` (OWNER)
- `references/interaction/04-gesture-disambiguation.md` -- `minimumDistance` as a feel knob, axis-lock, `GestureMask`
- `references/animation/05-gesture-driven.md#drag-and-drop` -- base `.draggable`/`.dropDestination` recipe (OWNER)
- `references/patterns/10-drag-drop.md#multi-item-drag-containers-ios-27` -- `dragContainer`/`dragConfiguration`/`DropSession` family, `Transferable` (OWNER)
- `references/design/02-liquid-glass.md#glasseffectcontainer-multi-element-glass` -- `GlassEffectContainer`/`glassEffectID` morph mechanics (OWNER)
- `references/haptics/02-swiftui-sensory-feedback.md` -- `SensoryFeedback` case catalog (OWNER)
- `references/accessibility/05-motion-accessibility.md` -- Reduce Motion double-gate (OWNER)
