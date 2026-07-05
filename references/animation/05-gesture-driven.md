# Gesture-Driven Animation

Direct manipulation -- where the user moves something and the view responds 1:1 -- is the most physical interaction in iOS. The animation should follow the finger exactly, then settle when released.

## Basic gestures

### Tap

```swift
Text("Tap me")
    .onTapGesture(count: 2) {       // count for double-tap
        handleDoubleTap()
    }
```

### Long press

```swift
Circle()
    .gesture(
        LongPressGesture(minimumDuration: 0.5)
            .onEnded { _ in
                withAnimation(.spring(duration: 0.4, bounce: 0.3)) {
                    isPressed = true
                }
            }
    )
```

## DragGesture

The fundamental gesture for direct manipulation:

```swift
@State private var offset: CGSize = .zero
@GestureState private var dragOffset: CGSize = .zero  // Auto-resets

var body: some View {
    Circle()
        .frame(width: 80, height: 80)
        .offset(
            x: offset.width + dragOffset.width,
            y: offset.height + dragOffset.height
        )
        .gesture(
            DragGesture()
                .updating($dragOffset) { value, state, _ in
                    state = value.translation  // Live tracking
                }
                .onEnded { value in
                    offset.width += value.translation.width
                    offset.height += value.translation.height
                }
        )
}
```

### Why @GestureState

`@GestureState` is purpose-built for gestures: it auto-resets to its initial value when the gesture ends. Use it for "the current drag amount" instead of a regular `@State`.

```swift
@GestureState private var dragOffset: CGSize = .zero
```

vs.

```swift
@State private var dragOffset: CGSize = .zero
// You'd need to manually reset to .zero on gesture end
```

### Drag with spring-back

```swift
@State private var offset: CGSize = .zero

.offset(offset)
.gesture(
    DragGesture()
        .onChanged { offset = $0.translation }
        .onEnded { _ in
            withAnimation(.spring(duration: 0.5, bounce: 0.4)) {
                offset = .zero  // Spring back to origin
            }
        }
)
```

### Drag with momentum projection (snap)

```swift
@State private var pageIndex = 0
@GestureState private var dragOffset: CGFloat = 0

.offset(x: -CGFloat(pageIndex) * pageWidth + dragOffset)
.gesture(
    DragGesture()
        .updating($dragOffset) { value, state, _ in
            state = value.translation.width
        }
        .onEnded { value in
            // predictedEndTranslation is a projected POSITION delta in points (iOS 13+),
            // not velocity -- named and thresholded accordingly.
            let projectedEndX = value.predictedEndTranslation.width
            withAnimation(.spring(duration: 0.5, bounce: 0.2)) {
                if projectedEndX < -50 && pageIndex < pageCount - 1 {
                    pageIndex += 1
                } else if projectedEndX > 50 && pageIndex > 0 {
                    pageIndex -= 1
                }
            }
        }
)
```

`value.velocity` (`CGSize`, points/sec, iOS 17+) is real instantaneous velocity, but its scale is entirely different -- a typical flick runs 800-3,000 pt/s. Swapping `predictedEndTranslation` for `velocity` while keeping the ±50 threshold turns a deliberate-drag gate into a hair-trigger; if you switch, rescale the threshold to roughly ±300-500 pt/s.

## Other gestures

### MagnifyGesture (pinch zoom)

```swift
@State private var scale: CGFloat = 1.0
@GestureState private var magnifyBy: CGFloat = 1.0

Image("photo")
    .scaleEffect(scale * magnifyBy)
    .gesture(
        MagnifyGesture()
            .updating($magnifyBy) { value, state, _ in
                state = value.magnification
            }
            .onEnded { value in
                scale *= value.magnification
            }
    )
```

### RotateGesture

```swift
@State private var rotation: Angle = .zero
@GestureState private var rotateBy: Angle = .zero

Image("compass")
    .rotationEffect(rotation + rotateBy)
    .gesture(
        RotateGesture()
            .updating($rotateBy) { value, state, _ in
                state = value.rotation
            }
            .onEnded { value in
                rotation += value.rotation
            }
    )
```

## Gesture composition

### Sequenced (long press THEN drag)

```swift
let longPressThenDrag = LongPressGesture(minimumDuration: 0.3)
    .sequenced(before: DragGesture())
    .onEnded { value in
        switch value {
        case .second(true, let drag?):
            offset = drag.translation
        default:
            break
        }
    }
```

### Simultaneous (rotate + magnify)

```swift
let rotateAndZoom = RotateGesture()
    .simultaneously(with: MagnifyGesture())
    .onChanged { value in
        rotation = value.first?.rotation ?? .zero
        scale = value.second?.magnification ?? 1.0
    }
```

### Exclusive (only first matching gesture fires)

```swift
let tapOrLongPress = TapGesture()
    .exclusively(before: LongPressGesture())
```

## Gesture priority

| Modifier | Behavior |
|---|---|
| `.gesture()` | Default; child gestures take priority |
| `.simultaneousGesture()` | Runs alongside child gestures |
| `.highPriorityGesture()` | Wins over child gestures |

## Interactive springs for gesture handoff

The spring in `.onEnded` commits state to a new resting offset -- it does not automatically inherit the finger's release velocity. Mutating state inside `withAnimation` starts a FRESH spring from the current visual position to the new target; true velocity preservation only happens when an ALREADY-RUNNING animation is retargeted mid-flight (a real interruption), which is a different case from this one:

```swift
@State private var offset: CGSize = .zero
@GestureState private var dragOffset: CGSize = .zero

.offset(
    x: offset.width + dragOffset.width,
    y: offset.height + dragOffset.height
)
.gesture(
    DragGesture()
        .updating($dragOffset) { value, state, _ in
            state = value.translation
        }
        .onEnded { value in
            // Commits to a new resting offset -- a fresh spring from here to there,
            // not a velocity handoff from the gesture.
            withAnimation(.spring(duration: 0.4, bounce: 0.2)) {
                offset.width += value.translation.width
                offset.height += value.translation.height
            }
        }
)
```

For a real velocity handoff -- where the release genuinely carries momentum into the settle -- read `value.velocity` (`CGSize`, points/sec, iOS 17+) and feed it to `interpolatingSpring(initialVelocity:)`. `initialVelocity` wants velocity RELATIVE TO THE REMAINING TRAVEL DISTANCE, not raw points/sec; passing raw `value.velocity` straight in produces wild overshoot on a fast flick. Full interruptible-animation and velocity-normalization treatment: `references/interaction/01-fluid-smoothness-interruptible.md` (OWNER).

For ultra-low-latency tracking (e.g., a slider or scrubber), lead with the modern form (iOS 17+); the legacy signature still compiles and shows up in code targeting earlier deployments:

```swift
.animation(.interactiveSpring(duration: 0.15, extraBounce: 0.0, blendDuration: 0.25), value: dragOffset)   // iOS 17+
.animation(.interactiveSpring(response: 0.15, dampingFraction: 0.86, blendDuration: 0.25), value: dragOffset)   // legacy, still compiles
```

## Reduce Motion

Direct manipulation is not decorative motion -- the 1:1 finger-follow (`.offset` tracking the gesture in real time) is NEVER gated by Reduce Motion; gating it would break the touch itself. What IS gated is the release: the settle spring and any momentum-driven snap.

```swift
@Environment(\.accessibilityReduceMotion) private var reduceMotion

.onEnded { value in
    withAnimation(reduceMotion ? nil : .spring(duration: 0.4, bounce: 0.2)) {
        offset.width += value.translation.width
        offset.height += value.translation.height
    }
}
```

Same rule for the momentum-projection paging example above: gate the settle, never the drag. Full substitution catalog: `references/accessibility/05-motion-accessibility.md` (OWNER).

## Swipe actions on List rows

```swift
List(items) { item in
    ItemRow(item: item)
        .swipeActions(edge: .trailing, allowsFullSwipe: true) {
            Button("Delete", role: .destructive) {
                delete(item)
            }
        }
        .swipeActions(edge: .leading) {
            Button("Favorite", systemImage: "star") {
                favorite(item)
            }
            .tint(.yellow)
        }
}
```

**Critical:** Swipe actions are accelerators, not the only way to perform an action. Always provide an explicit alternative (button, context menu).

## Drag and drop

```swift
import UniformTypeIdentifiers

// Source
ItemView(item: item)
    .draggable(item)  // Item must conform to Transferable

// Destination
ColorTarget()
    .dropDestination(for: Item.self) { items, location in
        for item in items {
            handleDrop(item: item, at: location)
        }
        return true
    }
```

For complex Transferable conformance, see `references/patterns/10-drag-drop.md#transferable-conformance-the-contract`.

## Pull to refresh

```swift
List(items) { item in
    ItemRow(item: item)
}
.refreshable {
    await reloadItems()  // Async function; system handles spinner
}
```

## Accessibility alternatives for custom gestures

Every custom `Gesture` above is invisible to VoiceOver, Switch Control, and Voice Control -- none of them replay a `DragGesture`. Mirror the OUTCOME of each gesture with the matching accessibility action. This is the gesture-side pointer; deep per-recipe treatment lives in `references/interaction/03-direct-manipulation-drag.md` (OWNER) and `references/interaction/06-custom-controls-reorderable.md`.

| Gesture in this file | Accessibility alternative |
|---|---|
| Custom paged/carousel scroll (`DragGesture` driving `pageIndex`) | `accessibilityScrollAction((Edge) -> Void)` (iOS 13+) -- VoiceOver's 3-finger scroll routes here |
| `MagnifyGesture` pinch-zoom | `accessibilityZoomAction((AccessibilityZoomGestureAction) -> Void)` (iOS 13+) + visible +/- buttons |
| Custom slider/stepper driven by drag | `accessibilityAdjustableAction((AccessibilityAdjustmentDirection) -> Void)` -- VoiceOver swipe up/down maps to `.increment`/`.decrement` |
| Drag-to-reorder | `accessibilityDragPoint(_:description:)` / `accessibilityDropPoint(_:description:)` (base modifiers iOS 16+) + `.accessibilityAction(named: "Move up"/"Move down")` |
| Any custom control with a system analogue | `.accessibilityRepresentation { Slider(...) }` -- swaps in the real control for the accessibility tree while your custom gesture stays for sighted users |

```swift
CardDeck()
    .accessibilityScrollAction { edge in
        edge == .leading || edge == .top ? goToPrevious() : goToNext()
    }
```

Swipe actions are accelerators, never the only path (see "Swipe actions on List rows" above) -- every destructive `.swipeActions` button needs a twin `.accessibilityAction(named:)`, or it is unreachable for Switch Control and VoiceOver users.

## Scroll-driven chrome minimize (iOS 26+)

Not gesture code you write -- a declarative, scroll-direction-driven system chrome behavior, noted here because it lives in the same "scroll direction drives UI" territory as everything above.

```swift
// Tab bar: iOS 26.0+, iPhone-only (not supported for iPad tab bar minimization; Mac Catalyst available)
TabView {
    ScrollView { /* ... */ }
        .tabItem { Label("Home", systemImage: "house") }
}
.tabBarMinimizeBehavior(.onScrollDown)

// Toolbar: a DIFFERENT type, iOS 27.0+ Beta -- gate, never ship ungated
if #available(iOS 27, *) {
    NavigationStack {
        ScrollView { /* ... */ }
    }
    .toolbarMinimizeBehavior(.onScrollDown, for: .navigationBar)   // SDK-verify
} else {
    // iOS 26 fallback: manual onScrollGeometryChange-driven toolbar opacity/offset
    NavigationStack {
        ScrollView { /* ... */ }
    }
}
```

`TabBarMinimizeBehavior.onScrollDown` (iOS 26.0+) and `ToolbarMinimizeBehavior.onScrollDown` (iOS 27.0+ Beta) are DIFFERENT types on DIFFERENT floors -- gate them separately, never as one `#available(iOS 26, *)` block.

## Common mistakes

| Mistake | Problem | Fix |
|---|---|---|
| `@State` instead of `@GestureState` for live drag | Manual reset code, error-prone | Use `@GestureState` |
| Heavy work in `.onChanged` | Dropped frames, laggy | Throttle, use `@GestureState` for tracking, do work in `.onEnded` |
| `withAnimation` in `.onChanged` | Animation starts/cancels every frame | No animation in `.onChanged`; use `.interactiveSpring` |
| Spring with too-high bounce after gesture | Chaotic settle | `.spring(duration: 0.4, bounce: 0.2)` to commit to the new resting offset |
| Swipe actions as only path | Inaccessible | Always provide button/menu alternative, or a twin `.accessibilityAction(named:)` |
| Custom row-drag gesture conflicting with `ScrollView` | `.simultaneousGesture` makes BOTH fire -- doesn't resolve the conflict, just hides it | Direction-gated `UIGestureRecognizerRepresentable` (iOS 18); `.simultaneousGesture` is fine only for swipe-back |
| No Reduce Motion gate on the release settle | Vestibular-trigger motion never stops | Gate the spring per the Reduce Motion section above -- never the 1:1 drag itself |
| Gesture on `Color` | Color has zero size | Use a Rectangle or set explicit frame |
| Magnify/rotate on list cell | Conflicts with scroll | Restrict to non-scrollable contexts |

## See also

- `references/animation/01-animation-fundamentals.md#reduce-motion-critical` -- timing curves vs springs, RM double-gate
- `references/animation/02-spring-physics.md#spring-presets` -- interactive spring parameters
- `references/haptics/02-swiftui-sensory-feedback.md#drag-snap` -- haptic feedback for gesture confirmation
- `references/interaction/01-fluid-smoothness-interruptible.md` -- interruptibility, velocity handoff (OWNER)
- `references/interaction/03-direct-manipulation-drag.md` -- deep drag/pinch/rotate cookbook + accessibility alternatives (OWNER)
- `references/accessibility/05-motion-accessibility.md` -- full RM substitution catalog (OWNER)
