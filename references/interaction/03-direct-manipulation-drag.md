# Direct Manipulation & Drag Mechanics

> Owner: `references/interaction/03-direct-manipulation-drag.md` owns **"never animate the follow"** -- the 1:1 tracking discipline, grab-anchor math, rubber-banding at bounds, momentum/throw velocity normalization, snap-to-grid/detent ordering, `@GestureState` reset transactions, and the `accessibilityDragPoint`/`accessibilityDropPoint` VoiceOver bridge for custom drag interactions. `DragGesture` syntax, `@GestureState` basics, `.swipeActions`, and `.draggable`/`.dropDestination` live in `references/animation/05-gesture-driven.md` (cite, don't restate). Which recognizer wins a touch (the gesture arena, `GestureMask`, scroll-vs-drag) is owned by `references/interaction/04-gesture-disambiguation.md`. 44pt targets and WCAG pointer-gesture levels are owned by `references/accessibility/04-motor-interaction.md`.
> Floors: `DragGesture.Value.velocity` is iOS 17.0+ (`predictedEndTranslation`/`predictedEndLocation` are iOS 13.0+) -- see `references/_scaffolding/version-floor-registry.md#ios-170`. `accessibilityDragPoint`/`accessibilityDropPoint` are iOS 16.0+.

A drag either feels welded to the fingertip or it doesn't, and when it doesn't, the cause is almost always the same mistake: **something animated the value the gesture is writing.** Direct manipulation has exactly one non-negotiable law -- the live tracked value is raw and un-animated; every spring in the interaction lives in `.onEnded`, a reset transaction, or an unrelated property, never on the value the finger is driving right now.

## The Apple way

- The live drag value is raw, held in `@GestureState`, rendered via `.offset` in a coordinate space that matches where you position the view. Springs live in `.onEnded` (the settle) or a reset transaction (the return), never in `.onChanged`/`.updating` and never on the tracked value itself.
- Momentum is a *projection* of release velocity, not the release position -- and that projected velocity must be normalized before it seeds a settle spring. Raw points-per-second into `interpolatingSpring(initialVelocity:)` is the single most common drag bug in shipping SwiftUI.
- Snapping obeys one order: project the throw to where momentum would land it, THEN snap that landing to the nearest anchor, THEN run exactly one velocity-preserving spring. Snapping the raw release point makes a fast flick feel like it hit a wall.
- Every custom `Gesture` is invisible to VoiceOver, Switch Control, and Voice Control. Mirror the OUTCOME with `accessibilityDragPoint`/`accessibilityDropPoint` and a matching `.accessibilityAction`, not a "+/-" button bolted on as an afterthought.

## The law: never animate the follow

| Symptom | Cause | Fix |
|---|---|---|
| Object lags behind or rubber-bands toward the finger | An animation is attached to the tracked value (`withAnimation` in `.onChanged`, or `.animation(_:value:)` on the drag offset) | Apply the live offset raw via `@GestureState`; animate only the release settle |
| `withAnimation` in `.onChanged` visibly stutters | Wrapping the per-frame update restarts an animation every frame -- the value never catches up | Never call `withAnimation` inside `.onChanged`/`.updating`; assign the value directly |
| Item jumps so its center meets the finger on pickup | `.position = value.location` centers the view on the touch point regardless of where it was grabbed | Capture a grab anchor once and re-add it every frame, or prefer `.offset` (anchor-correct for free) |
| Item drifts, tracks the wrong distance, or fights a `ScrollView` | Coordinate-space mismatch between the gesture and the positioning modifier | Match `DragGesture(coordinateSpace:)` to the container's `.coordinateSpace(.named(...))` |
| Thrown object stops dead at the release point, no follow-through | Settled to the raw release point, or seeded the spring with zero velocity | Project the release velocity to a landing point and seed the settle spring with it |
| Fast flick overshoots wildly into the distance | Raw `value.velocity` (800-3000+ pt/s) passed straight into `interpolatingSpring(initialVelocity:)`, which expects normalized [0,1] magnitude | Normalize: `initialVelocity = physicalVelocity / (target - start)` |
| Lifted/stretched element snaps back with a hard pop on release | `@GestureState` resets to its initial value instantly, with no animation, by default | `@GestureState(resetTransaction:)` or `@GestureState(reset:)` so the reset eases |
| Dragging causes sibling views to reflow or the layout jumps | The item moved via a layout-affecting modifier (`.padding`, `.position` inside a stack) instead of `.offset` | `.offset` moves the view without re-running layout; add `.zIndex` to float it above neighbors |

## Anchor-correct tracking: `.offset` vs `.position`

`.offset` is anchor-correct for free, because `DragGesture.translation` is a delta from the first touch point -- wherever you grabbed the object, that point stays under the finger with zero anchor math:

```swift
// iOS 13+. .offset moves the view WITHOUT re-running layout -- cheapest per-frame cost, no reflow.
@GestureState private var live: CGSize = .zero
@State private var committed: CGSize = .zero

card
    .offset(x: committed.width + live.width, y: committed.height + live.height)
    .gesture(
        DragGesture()
            .updating($live) { value, state, _ in state = value.translation }   // raw, NO animation
            .onEnded { value in
                committed.width += value.translation.width
                committed.height += value.translation.height
            }
    )
```

`.position`-driven drags need explicit grab-anchor math, and this is where "lift a row into a floating drag proxy" or "place a canvas node at the cursor" goes wrong: writing `position = value.location` centers the view on the finger, so an item grabbed by its edge visibly jumps to re-center. Capture the vector from the finger to the view's origin once, and re-add it every frame:

```swift
@State private var itemCenter: CGPoint
@State private var grabAnchor: CGSize = .zero    // fingerpoint -> itemCenter, captured once

item
    .position(itemCenter)
    .gesture(
        DragGesture(coordinateSpace: .named("canvas"))
            .onChanged { value in
                if grabAnchor == .zero {
                    grabAnchor = CGSize(width: itemCenter.x - value.startLocation.x,
                                        height: itemCenter.y - value.startLocation.y)
                }
                itemCenter = CGPoint(x: value.location.x + grabAnchor.width,
                                     y: value.location.y + grabAnchor.height)
            }
            .onEnded { _ in grabAnchor = .zero }
    )
```

Match `DragGesture(coordinateSpace:)` to whatever space you position in -- mixing `.local` and `.global` (or a `.named` container the gesture doesn't share) is the second-most-common anchor bug, after skipping the grab-anchor capture entirely.

## Rubber-banding at bounds

Resistance past a boundary should feel like an elastic membrane, never a hard wall. Reproduce `UIScrollView`'s asymptotic curve so a large over-drag still moves, just less and less:

```swift
/// offset: how far past the limit. dimension: the view/travel size. c: 0.55 = iOS default stiffness.
func rubberBand(_ offset: CGFloat, dimension: CGFloat, c: CGFloat = 0.55) -> CGFloat {
    (1 - 1 / (offset * c / dimension + 1)) * dimension
}
```

Lower `c` = stiffer wall, higher = looser; `0.55` matches system feel. A hard `min`/`max` clamp instead of this reads as cheap. The return trip is the half everyone gets wrong: a plain `.spring` snap-back starting from zero velocity momentarily reverses the perceived motion (decelerate to a stop, then accelerate back) -- a visible micro-stall that is the single biggest tell of amateur direct manipulation. Hand the release velocity to `interpolatingSpring(initialVelocity:)` so the pixel under the finger keeps moving the SAME direction at the SAME speed through the handoff:

```swift
// iOS 17+ (DragGesture.Value.velocity). reduceMotion = @Environment(\.accessibilityReduceMotion).
.onEnded { value in
    let distance = abs(overTravel)                       // points left to travel back to 0
    guard distance > 0 else { return }
    let v = value.velocity.height / distance              // pt/s -> normalized [0,1]-ish
    withAnimation(reduceMotion ? nil : .interpolatingSpring(duration: 0.4, bounce: 0.2, initialVelocity: v)) {
        overTravel = 0
    }
}
```

`bounce` 0.15-0.25 reads as the OS; `bounce: 0` reads as corrective (a wrong-way rejection); raising `bounce` to fake energy on a high-velocity handoff produces an unstable double-bounce no Apple surface has -- let the handed-off velocity supply the energy, `bounce` only shapes the decay.

## Momentum: projecting the throw

Release velocity is not the endpoint -- its PROJECTION is. `DragGesture.Value` already computes this for you (`predictedEndTranslation: CGSize`, `predictedEndLocation: CGPoint`, both iOS 13+), matched to `UIScrollView`'s own deceleration model. Compute it yourself only when you need a different rate:

```swift
/// Distance a flick coasts before friction stops it. d = UIScrollView.DecelerationRate.normal (0.998);
/// use 0.99 (.fast) for a snappier, shorter throw (paging, small draggables).
func project(_ velocity: CGFloat, _ d: CGFloat = 0.998) -> CGFloat { (velocity / 1000) * d / (1 - d) }
```

**The critical correction:** strict 1:1 tracking does NOT auto-preserve release velocity. `.spring`/`.snappy` are velocity-preserving only when they retarget an animation already in flight -- but a pure `@GestureState` drag mutates the offset directly with no animation running, so a `withAnimation(.spring)` in `.onEnded` starts from velocity ZERO unless you seed it. `interpolatingSpring(initialVelocity:)` documents that parameter as normalized -- "a value in the range [0, 1] representing the magnitude of the value being animated" -- so the physical velocity must be divided by the distance it will actually travel:

```swift
normalizedInitialVelocity = physicalVelocity(points/sec) / (target - start)(points)
```

```swift
.onEnded { value in
    let start = CGPoint(x: position.x + value.translation.width, y: position.y + value.translation.height)
    let target = CGPoint(x: start.x + project(value.velocity.width), y: start.y + project(value.velocity.height))
    let dist = hypot(target.x - start.x, target.y - start.y)
    let speed = hypot(value.velocity.width, value.velocity.height)
    let vNorm = dist > 0 ? speed / dist : 0
    position = target
    withAnimation(reduceMotion ? nil : .interpolatingSpring(duration: 0.55, bounce: 0.22, initialVelocity: vNorm)) {}
}
```

Velocity is colinear with displacement for a free throw (one scalar normalization is exact); for a throw to a snapped target, normalize per axis instead. On a boundary collision, raise `bounce` on impact (`hitWall ? 0.35 : 0.2`) so the wall reads solid -- the object visibly recoils rather than stopping dead.

## Snap-to-grid and snap-to-detent

Order is everything: **project, then snap, then one spring.** Snapping the raw release point makes a fast flick feel like it hit a wall; snapping without projection makes a gentle nudge refuse to advance.

```swift
func nearestAnchor(to value: CGFloat, in anchors: [CGFloat]) -> CGFloat {
    anchors.min(by: { abs($0 - value) < abs($1 - value) }) ?? value
}

.onEnded { value in
    let landing = position + value.translation.width + project(value.velocity.width, 0.99)  // .fast for grids
    let snapped = nearestAnchor(to: landing, in: anchorStops)      // snap the PROJECTED landing
    withAnimation(reduceMotion ? nil : .spring(duration: 0.4, bounce: 0.18)) { position = snapped }
}
```

For a regular grid, quantize the projected landing to the cell pitch (`(landing / cell).rounded() * cell`) per axis instead of an anchor list. For multi-detent panels, add a directional-fling override so a decisive flick always advances one detent even from a short drag: `velocity < -800 -> next detent`, mirroring the native sheet's feel. Compose with rubber-banding, not instead of it -- resistance is the live affordance during the drag, snap is the settle after release.

## Returning cleanly: `@GestureState` reset transactions

`@GestureState` auto-resets to its initial value the instant a gesture ends OR is cancelled -- the cancellation safety that makes it correct for transient drag state. The part almost nobody uses: that reset is INSTANT by default, which pops a lifted/stretched effect back with a hard cut. Give the reset its own transaction so it eases home on end AND on interruption:

```swift
// iOS 13+. Value-dependent reset: stretched far -> bounce back harder; barely moved -> ease gently.
@GestureState(reset: { value, transaction in
    transaction.animation = .spring(duration: 0.4, bounce: abs(value) > 60 ? 0.35 : 0.15)
}) private var stretch: CGFloat = 0
```

This is the correct tool for any effect that always returns to its initial value -- a press-to-lift scale, a peek, a pull-to-refresh head -- because there is no committed counterpart to animate; the reset IS the return animation. Reaching for `.onEnded { withAnimation { state = 0 } }` on a plain `@State` instead reintroduces the bug `@GestureState` exists to fix: `.onEnded` does not fire on cancellation (an incoming call, a parent `ScrollView` stealing the gesture), so the view can strand mid-effect.

## The accessibility bridge: `accessibilityDragPoint` and `accessibilityDropPoint`

Every recipe above is invisible to VoiceOver -- none of it replays a `DragGesture`. The base modifiers (`references/accessibility/04-motor-interaction.md#native-voiceover-bridge-apis`, iOS 16.0+) disambiguate source and destination when a view has more than one drag or drop interaction; wiring them onto a REAL custom drag (not a toy example) means pairing them with the outcome, not the gesture:

```swift
// iOS 16.0+. Applied to a reorderable cell built with the .offset tracking pattern above.
Cell(item)
    .accessibilityDragPoint(.center, description: Text("Reorder \(item.title)"))
    .accessibilityAction(named: "Move up") { move(item, to: index(before: item)) }
    .accessibilityAction(named: "Move down") { move(item, to: index(after: item)) }

DropZone()
    .accessibilityDropPoint(.center, description: Text("Drop into \(folderName)"))
```

The drag point/drop point pair tells VoiceOver's gesture vocabulary WHERE on each view the interaction conceptually happens; the `.accessibilityAction(named:)` pair gives a VoiceOver or Switch Control user a way to perform the SAME reorder without ever touching the drag surface -- swipe up/down with VoiceOver rotor set to Actions. Ship both together: `accessibilityDragPoint`/`DropPoint` alone still requires a drag gesture VoiceOver users may not be able to perform precisely; the named actions are the actual access path. This is why "add a +/- button" is a workaround and this pairing is the fix -- the ORIGINAL interaction becomes reachable, not merely replaced.

## Reduce Motion

1:1 tracking is direct control, not animation -- it is NEVER gated or damped by Reduce Motion; gating it breaks the touch itself. What IS gated:

- The release settle and any momentum coast (`withAnimation(reduceMotion ? nil : .interpolatingSpring(...))`) -- jump straight to the resolved/snapped state instead.
- Decorative lift effects on pickup (scale, shadow growth) -- drop or replace with a non-motion cue (tint/opacity change) so the "picked up" state stays legible.
- Under Reduce Motion, snap to the nearest anchor of the RELEASE point, not a projected fling -- a projected long throw is exactly the large motion the setting asks to suppress.

Keep regardless of Reduce Motion: haptics (governed by the system Haptics setting, not motion), velocity-projection DECISIONS (commit/cancel logic reading responsive to intent is not "motion"), and the `accessibilityDragPoint`/`DropPoint` + named-action bridge -- functional access must not degrade. Full substitution catalog: `references/accessibility/05-motion-accessibility.md` (OWNER).

## Anti-patterns

| Wrong | Why it fails | Right |
|---|---|---|
| `.animation(.spring, value: dragOffset)` on the tracked offset | Animates the follow -- the object visibly chases the finger with lag | No animation on the live value; animate only the `.onEnded` settle |
| `position = value.location` for a lifted item | Snaps the view's center to the finger regardless of grab point | Capture `grabAnchor` once, re-add every frame -- or use `.offset`, which needs no anchor math |
| Raw `value.velocity` into `interpolatingSpring(initialVelocity:)` | Normalized API fed a 800-3000pt/s raw number -> violent overshoot | Normalize: `physicalVelocity / (target - start)` |
| Snapping the release point instead of the projected landing | A fast flick can't skip a cell; a gentle nudge over-commits | Project first, snap the PROJECTED landing |
| `.onEnded { withAnimation { state = 0 } }` on a plain `@State` for a return-to-origin effect | `.onEnded` doesn't fire on cancellation -- the view can strand mid-effect | `@GestureState(resetTransaction:)`/`(reset:)` |
| A tap-only "+/-" bolted beside a custom drag | Replaces the interaction instead of making the original one reachable | `accessibilityDragPoint`/`DropPoint` + `.accessibilityAction(named:)` pair |

## Severity guide

- **CRITICAL** -- a custom drag interaction (reorder, canvas placement) ships with no VoiceOver/Switch Control path at all -- not even a named-action alternative.
- **HIGH** -- the tracked value is animated (visible lag on every drag); OR raw points/sec passed into a normalized `initialVelocity` parameter (wild overshoot in production).
- **MEDIUM** -- release settles to the raw position instead of the momentum projection (no follow-through, but not broken); a return-to-origin effect pops instead of easing due to a missing reset transaction.
- **LOW** -- rubber-band constant noticeably stiffer/looser than system feel; snap bounce outside the 0.15-0.25 house range.

## See also

- `references/animation/05-gesture-driven.md#draggesture` -- `DragGesture` syntax, `@GestureState` basics, swipe actions, `.draggable`/`.dropDestination`
- `references/interaction/01-fluid-smoothness-interruptible.md` -- why velocity-preserving springs retarget without popping (OWNER)
- `references/interaction/04-gesture-disambiguation.md` -- which recognizer wins a touch; scroll-vs-drag conflict resolution (OWNER)
- `references/accessibility/04-motor-interaction.md#native-voiceover-bridge-apis` -- base `accessibilityDragPoint`/`DropPoint`/`ZoomAction`/`ScrollAction` signatures (OWNER)
- `references/accessibility/05-motion-accessibility.md` -- full Reduce Motion substitution catalog (OWNER)
