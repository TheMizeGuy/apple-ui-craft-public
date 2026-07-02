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

### Drag with velocity (snap)

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
            let velocity = value.predictedEndTranslation.width
            withAnimation(.spring(duration: 0.5, bounce: 0.2)) {
                if velocity < -50 && pageIndex < pageCount - 1 {
                    pageIndex += 1
                } else if velocity > 50 && pageIndex > 0 {
                    pageIndex -= 1
                }
            }
        }
)
```

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

When a gesture ends, the animation should pick up from the gesture's velocity:

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
            // Use spring with high response (snappy settle)
            // The animation picks up from the current position
            withAnimation(.spring(duration: 0.4, bounce: 0.2)) {
                offset.width += value.translation.width
                offset.height += value.translation.height
            }
        }
)
```

For ultra-low-latency tracking (e.g., a slider or scrubber):

```swift
.animation(.interactiveSpring(response: 0.15, dampingFraction: 0.86), value: dragOffset)
```

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

For complex Transferable conformance, see `~/Claude/vault/iOS Development/50 - Drag Drop Clipboard and Share.md`.

## Pull to refresh

```swift
List(items) { item in
    ItemRow(item: item)
}
.refreshable {
    await reloadItems()  // Async function; system handles spinner
}
```

## Common mistakes

| Mistake | Problem | Fix |
|---|---|---|
| `@State` instead of `@GestureState` for live drag | Manual reset code, error-prone | Use `@GestureState` |
| Heavy work in `.onChanged` | Dropped frames, laggy | Throttle, use `@GestureState` for tracking, do work in `.onEnded` |
| `withAnimation` in `.onChanged` | Animation starts/cancels every frame | No animation in `.onChanged`; use `.interactiveSpring` |
| Spring with too-high bounce after gesture | Chaotic settle | `.spring(duration: 0.4, bounce: 0.2)` for handoff |
| Swipe actions as only path | Inaccessible | Always provide button/menu alternative |
| Custom gesture conflicting with system | Breaks swipe-back, scroll | Use `.simultaneousGesture` or limit gesture scope |
| Gesture on `Color` | Color has zero size | Use a Rectangle or set explicit frame |
| Magnify/rotate on list cell | Conflicts with scroll | Restrict to non-scrollable contexts |

## See also

- `01-animation-fundamentals.md` -- timing curves vs springs
- `02-spring-physics.md` -- interactive spring parameters
- `haptics/02-swiftui-sensory-feedback.md` -- haptic feedback for gesture confirmation
- `~/Claude/vault/iOS Development/07 - SwiftUI Advanced Patterns.md#gestures`
