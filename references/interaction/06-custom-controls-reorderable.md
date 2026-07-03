# Custom Controls and Reorderable Collections

> Owner: this file owns building bespoke value controls (sliders, knobs, segmented pills) and their accessibility bridge (`accessibilityRepresentation`), plus drag-to-reorder collections. `references/interaction/05-press-feedback-states.md` owns `ButtonStyle` press mechanics -- cite it for stepper/button feel, don't restate. `references/interaction/03-direct-manipulation-drag.md` owns general drag/pinch/rotate cookbook and `accessibilityDragPoint`/`accessibilityDropPoint`.
> Floors: `references/_scaffolding/version-floor-registry.md`. `reorderable()`/`reorderContainer(for:itemID:isEnabled:move:)` is **iOS 27.0+ Beta** -- it will not compile on iOS 26. The iOS-26 path is `List.onMove` (lists) or hand-rolled `.draggable`/`.dropDestination` (grids/free-form). `accessibilityRepresentation(representation:)` is iOS 15.0+.

Two disciplines, opposite bias. A genuinely custom control (nothing native maps to it) demands you own the feel completely -- an exact finger-to-value transfer function, plus `accessibilityRepresentation` to borrow a real control's semantics rather than hand-rolling VoiceOver support. Reordering demands the reverse: prefer the native primitive over hand-rolling, because on your deployment floor the system choreography -- lift, make-way, settle, haptics, VoiceOver -- is either already free (`List.onMove`) or one Beta cycle away (`reorderContainer`).

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
| Rotary knob/dial | `atan2` gives -pi...pi; naive assignment jumps 2*pi at the seam -- accumulate the UNWRAPPED delta between samples, never assign the raw angle | `.selection` per notch, or `.impact(.rigid)` at end stops only |
| Segmented pill (drag-across) | `matchedGeometryEffect` alone can't live-track a finger; for drag-across selection, measure segment width and drive a `@GestureState` offset, ticking `.selection` per segment crossed | `.selection` per segment crossed |
| Media timeline scrubber | Accumulate scaled INCREMENTAL deltas (`dx * tier`) by vertical-distance speed tier -- re-deriving from absolute x teleports the playhead when the tier changes | `.selection` per speed-tier crossing |
| Press-and-hold stepper | Geometric interval decay (`interval *= 0.82` per tick, floor ~50ms) replicates `UIStepper`'s acceleration; a fixed interval reads as robotic | `.increase`/`.decrease` |

A segmented pill on iOS 26 can use real Liquid Glass for the moving selection indicator -- wrap segments in `GlassEffectContainer` and pair the selected one with a stable `glassEffectID` so it morphs between segments instead of fading (`references/design/02-liquid-glass.md#glasseffectcontainer-multi-element-glass`, OWNER):

```swift
GlassEffectContainer(spacing: 4) {
    HStack(spacing: 4) {
        ForEach(items.indices, id: \.self) { i in
            Text(items[i]).padding(.vertical, 8).frame(maxWidth: .infinity)
                .glassEffect(.regular.interactive(), in: .capsule)
                .glassEffectID(selection == i ? "sel" : "seg\(i)", in: ns)
                .onTapGesture { withAnimation(.snappy(duration: 0.3)) { selection = i } }
        }
    }
}
```

Reserve real glass for the selection layer -- glass-on-glass-on-glass is noise. Accessibility for a segmented control: `.accessibilityRepresentation { Picker(...) { ForEach... }.pickerStyle(.segmented) }` gets "selected"/"1 of 3" semantics for free.

## Reordering: prefer the native primitive

### iOS 26 primary path -- `List`, single collection

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

`List.onMove` auto-scrolls at the container edge, fires the correct pickup/drop haptics, and exposes reorder to VoiceOver's rotor automatically. This is the correct default for any `List`-backed collection -- do not hand-roll a `DragGesture` reorder for a plain list.

### iOS 26 primary path -- grids and free-form layouts

`List.onMove` does not cover `LazyVGrid`/custom `Layout`. Compose `.draggable`/`.dropDestination` (base recipe: `references/animation/05-gesture-driven.md#drag-and-drop`, OWNER) with a stable target-slot function. The load-bearing detail everyone omits is the MIDPOINT crossing rule with hysteresis, so a finger resting on a slot boundary does not flicker the layout every frame:

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

### iOS 27 Beta -- `reorderContainer`/`reorderable`

```swift
if #available(iOS 27, *) {
    // SDK-verify: signature confirmed via Context7 2026-07-03, but iOS 27 is a developer beta --
    // do not ship this as the only reorder path.
    ScrollView {
        LazyVGrid(columns: [.init(.adaptive(minimum: 96), spacing: 12)], spacing: 12) {
            ForEach(cards) { CardCell($0) }
                .reorderable()                                    // marks the ForEach content liftable
        }
    }
    .reorderContainer(for: Card.self, itemID: \.id) { difference in
        cards.apply(difference)                                   // ReorderDifference<ItemID, _> -- you own the mutation
    }
} else {
    // iOS 26 fallback: the hand-rolled draggable/dropDestination recipe above.
    GridReorderFallback(cards: $cards)
}
```

When it ships stable, `reorderContainer(for:itemID:isEnabled:move:)` (on the container) + `reorderable()` (on the `ForEach` content) is the first grid-capable built-in reorder: it delivers the Liquid Glass lift, live make-way re-flow, velocity-aware settle, pickup/drop haptics, Reduce Motion damping, and VoiceOver rotor support entirely system-owned -- everything the hand-rolled recipe above reproduces manually. A multi-collection overload (`reorderContainer(for:itemID:in:)` + `reorderable(collectionID:)`) additionally handles cross-section/Kanban moves natively. Track its exit from Beta before adopting it as the primary path; until then it is a `#available(iOS 27, *)` aside, never the only reorder implementation you ship.

## Cross-container moves (Kanban) -- hand-rolled, pre-iOS-27

Moving a card between columns is one atomic mutation, not two, so both collections reflow as a single continuous motion:

```swift
withAnimation(.spring(duration: 0.30, bounce: 0.18)) {
    columns[fromCol].cards.remove(at: cardIdx)      // source gap CLOSES
    columns[toCol].cards.insert(card, at: idx)      // destination gap OPENS
}
```

Mark the container-enter moment distinctly from an in-column slot crossing -- it is semantically bigger (the item's category is changing): a one-shot `.impact(weight: .medium)` keyed to the hovered column ID changing, plus a brief `.snappy(0.2)` tint on the entered column. Float the dragged card in a shared named coordinate space with a high `zIndex` so it is never clipped crossing the gutter between columns, and give an empty column a visible dashed-placeholder drop target -- an empty column with nothing to highlight is a dead end.

## Haptic choreography for reorder

Three edge-triggered beats, never continuous:

| Beat | When | Haptic |
|---|---|---|
| Pickup | rising edge of `isLifted` | `.impact(flexibility: .soft)` |
| Slot cross | hysteresis-stable target changes | `.selection` |
| Commit | drop settles | `.impact(flexibility: .rigid)` or `.success` |

Key every trigger to a discrete, debounced state (`isLifted`, the hysteresis-stable target, a `didDrop` counter) -- never to `drag.translation` or a raw per-frame index, or the Taptic Engine machine-guns. Reduce Motion does NOT gate any of these three; haptics are feedback, not motion, and they become more important once the decorative lift/slide is suppressed.

## Availability + fallbacks

```swift
if #available(iOS 27, *) {
    grid.reorderContainer(for: Card.self, itemID: \.id) { cards.apply($0) }   // SDK-verify, Beta
} else {
    grid.gesture(handRolledReorderGesture)                                    // draggable/dropDestination + midpoint/hysteresis
}
```

## Accessibility contract

- **Custom controls without `accessibilityRepresentation`:** `.accessibilityElement()` + label + `.accessibilityValue` + `.accessibilityAdjustableAction` is the floor. Omitting the adjustable action makes the control completely inoperable for VoiceOver -- a frequent App Store rejection, not a nice-to-have.
- **Reordering:** `List.onMove` and the iOS-27 `reorderContainer` family expose reorder to VoiceOver's rotor automatically. A hand-rolled grid `DragGesture` reorder does NOT -- pair it with `accessibilityDragPoint`/`accessibilityDropPoint` and `.accessibilityAction(named: "Move up"/"Move down")` (`references/interaction/03-direct-manipulation-drag.md`, OWNER).
- **Reduce Motion:** the finger-follow track is direct manipulation and is never gated. Gate only the lift scale/pop and the settle bounce -- replace with a static tint/opacity cue so "picked up" stays legible (`references/accessibility/05-motion-accessibility.md`, OWNER).
- **Differentiate Without Color:** never encode a custom control's value by hue alone (a red-to-green meter) -- pair with a numeric readout or fill length.

## Anti-patterns

| Wrong | Why it fails | Right |
|---|---|---|
| Custom control with no `accessibilityAdjustableAction` | Inoperable for VoiceOver -- circular/linear dragging means nothing to it | `accessibilityRepresentation { Slider/Stepper/Picker }` or the manual adjustable contract |
| `reorderContainer`/`reorderable` shipped as the only reorder path | Won't compile below iOS 27; iOS 27 is a developer beta | `List.onMove` / hand-rolled `.draggable`+`.dropDestination` as primary, `reorderContainer` behind `#available(iOS 27, *)` |
| Target slot from raw finger position, no hysteresis | Flickers/thrashes when the finger rests on a boundary | Midpoint crossing rule + asymmetric enter/exit margin |
| `.position(drag.location)` on the dragged cell | Item snaps to re-center under the finger on pickup | `.offset(drag.translation)` -- already relative to the grab point |
| One `.animation(.spring, value: everything)` for lift+track+settle | Follow offset gets animated too -- the drag chases the finger with lag | Three animations keyed to three distinct values (`isLifted`, raw `drag`, `items`) |
| `UIImpactFeedbackGenerator.impactOccurred()` inside `.onChanged` | Fires every frame during a drag -- machine-guns the Taptic Engine | Edge-triggered `.sensoryFeedback` keyed to a debounced state |
| Encoding a custom slider's value by hue only | Invisible under Differentiate Without Color | Add a numeric readout or fill-length cue |

## Severity guide

- **CRITICAL** -- a custom control ships with no accessibility bridge at all; `reorderContainer` shipped as the ONLY reorder path (won't compile on the app's actual floor).
- **HIGH** -- hand-rolled grid reorder invisible to VoiceOver (no drag point/drop point actions); haptic fired per-frame instead of edge-triggered.
- **MEDIUM** -- missing hysteresis causes visible flicker at slot boundaries; `.position` used instead of `.offset` causing a pickup jump.
- **LOW** -- lift/settle share one animation value; segmented-pill glass morph missing a stable `glassEffectID`.

## See also

- `references/interaction/05-press-feedback-states.md` -- `ButtonStyle`/press mechanics for steppers and pill taps (OWNER)
- `references/interaction/03-direct-manipulation-drag.md` -- drag/pinch/rotate cookbook, `accessibilityDragPoint`/`accessibilityDropPoint` (OWNER)
- `references/interaction/04-gesture-disambiguation.md` -- `minimumDistance` as a feel knob, axis-lock, `GestureMask`
- `references/animation/05-gesture-driven.md#drag-and-drop` -- base `.draggable`/`.dropDestination` recipe (OWNER)
- `references/design/02-liquid-glass.md#glasseffectcontainer-multi-element-glass` -- `GlassEffectContainer`/`glassEffectID` morph mechanics (OWNER)
- `references/haptics/02-swiftui-sensory-feedback.md` -- `SensoryFeedback` case catalog (OWNER)
- `references/accessibility/05-motion-accessibility.md` -- Reduce Motion double-gate (OWNER)
- `~/Claude/vault/iOS Development/50 - Drag Drop Clipboard and Share.md`
