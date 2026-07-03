# Animation Fundamentals

SwiftUI provides two paradigms: implicit (`.animation` modifier) and explicit (`withAnimation`). Both produce the same visual result but differ in control flow.

## Implicit animations

Animates whenever the bound value changes. Scoped to the view and its children.

```swift
struct ImplicitExample: View {
    @State private var isExpanded = false
    
    var body: some View {
        Circle()
            .fill(.blue)
            .frame(width: isExpanded ? 200 : 100, height: isExpanded ? 200 : 100)
            .animation(.spring(duration: 0.4, bounce: 0.2), value: isExpanded)
            .onTapGesture { isExpanded.toggle() }
    }
}
```

**ALWAYS provide `value:`.** The deprecated `.animation(_:)` without `value` animates ALL state changes on that view, including unrelated ones.

## Explicit animations

Wraps a state change in an animation context. Affects all views that depend on the changed state, anywhere in the hierarchy.

```swift
Button("Toggle") {
    withAnimation(.spring(duration: 0.4, bounce: 0.2)) {
        isExpanded.toggle()
        rotation += 90
    }
}
```

## When to use each

| Scenario | Use | Why |
|---|---|---|
| Single property animates from one binding | Implicit `.animation` | Scoped, declarative |
| Multiple views animate together | Explicit `withAnimation` | One call animates all dependents |
| Gesture-driven | Explicit | Need precise control |
| Animation with completion handler | Explicit | Only `withAnimation` supports `completion:` |
| Default for a property | Implicit | Set once, always applied |

## withAnimation completion (iOS 17+)

```swift
withAnimation(.easeOut(duration: 0.5)) {
    isVisible = false
} completion: {
    items.remove(at: index)  // After animation finishes
}
```

## Timing curves

For decorative or non-physical motion. Most UI should use springs instead.

```swift
.linear(duration: 0.3)        // Constant speed -- mechanical
.easeIn(duration: 0.3)        // Slow start -- entering
.easeOut(duration: 0.3)       // Slow end -- settling
.easeInOut(duration: 0.3)     // Slow start + end -- generic
```

### Custom timing curves

```swift
.timingCurve(0.2, 0.8, 0.2, 1.0, duration: 0.5)
// Cubic bezier control points
```

### Speed multiplier

```swift
.easeInOut(duration: 0.5).speed(2.0)   // Plays in 0.25s
.spring(duration: 0.4).speed(0.5)      // Plays in 0.8s
```

### Delay

```swift
.spring(duration: 0.5).delay(0.2)

// Staggered:
ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
    ItemView(item: item)
        .animation(.spring().delay(Double(index) * 0.05), value: isShowing)
}
```

### Repeat

```swift
.linear(duration: 1.0).repeatForever(autoreverses: true)
.easeInOut(duration: 0.5).repeatCount(3, autoreverses: true)
```

## Transactions

Transactions carry animation info through the view hierarchy. Override per-view:

```swift
Text(isOn ? "ON" : "OFF")
    .transaction { transaction in
        transaction.animation = .easeInOut(duration: 0.1)  // Override parent
    }
```

### Disabling animation

```swift
// Disable for a specific view
Text("Static")
    .transaction { $0.animation = nil }

// Or shorthand:
Text("Static")
    .animation(nil, value: someValue)

// Disable for a state change
withAnimation(nil) {
    isVisible = false
}
```

## Animation cost: layout vs render

Animating render-only properties is cheap. Animating layout-triggering properties is expensive.

| Cheap (render-only) | Expensive (layout-triggering or per-frame off-screen render) |
|---|---|
| `.opacity` | `.frame(width:height:)` |
| `.scaleEffect` | `.padding` |
| `.rotationEffect` | Content changes (`Text`, `Image`) |
| `.offset` (transform) | `.font` size changes |
| `.brightness` | `HStack`/`VStack` spacing |
| `.saturation` | Adding/removing views |
| | `.fixedSize` changes |
| | `.blur(radius:)` animated -- off-screen render pass every frame |
| | `.shadow(radius:/offset:)` animated -- same off-screen-pass cost; a static shadow is free |

`.blur` and `.shadow` are cheap ONLY when their parameters are static. Animating either one's radius (or a shadow's offset) forces the compositor to recompute an off-screen pass every frame -- the top cause of scroll-list hitches. Never key `.blur`/`.shadow` to a scroll- or gesture-driven value; animate the opacity of a pre-blurred layer instead.

**Rule:** Prefer `scaleEffect` over `frame` changes. Prefer `offset` (as transform) over layout offset.

## Reduce Motion (CRITICAL)

Always check the user's Reduce Motion preference. Skip animations or replace with crossfade. **Double-gate:** both the explicit (`withAnimation`) and implicit (`.animation(_:value:)`) call sites must route through the SAME `Animation?` accessor -- `Animation` has no `.identity`, so `nil` is the only valid "off" value.

```swift
@Environment(\.accessibilityReduceMotion) var reduceMotion

var animation: Animation? {
    reduceMotion ? nil : .spring(duration: 0.4, bounce: 0.2)
}

// Explicit call site
withAnimation(animation) {
    showDetail.toggle()
}

// Implicit call site -- same accessor, not a second decision
Circle()
    .scaleEffect(showDetail ? 1.2 : 1.0)
    .animation(animation, value: showDetail)

// For transitions:
.transition(reduceMotion ? .opacity : .slide.combined(with: .opacity))
```

Gating only one call site is the most common Reduce Motion bug: a view animates correctly from a button tap (`withAnimation`) but still slides on every other state change because a sibling `.animation(_:value:)` on the same property was never wired to the same accessor. See `references/accessibility/05-motion-accessibility.md` for the full substitution catalog (transitions, `matchedGeometryEffect`, scroll parallax, looping symbol/phase/keyframe effects).

## Animation purpose

Every animation must answer: "What is this telling the user?"

| Communication | Animation type |
|---|---|
| "This came from there" | Spatial transition (push, slide, matchedGeometryEffect) |
| "This is changing" | Content transition (`.numericText()`, `.symbolEffect(.replace)`) |
| "Pay attention" | Emphasis (`.symbolEffect(.bounce)`, PhaseAnimator pulse) |
| "You're moving this" | Direct manipulation (DragGesture + `.interactiveSpring`) |
| "This is done" | Completion (scale + opacity + haptic) |
| "This is loading" | Progress (`.symbolEffect(.variableColor)`, `.pulse`) |

If an animation doesn't communicate one of these, remove it.

## Common mistakes

| Mistake | Problem | Fix |
|---|---|---|
| `.animation(.spring)` without `value` | Animates everything | `.animation(.spring, value: specificValue)` |
| `withAnimation` on the view | Does nothing | Wrap the state mutation: `withAnimation { state = newValue }` |
| Mixing implicit + explicit on same property | Unpredictable | Choose one approach per animated property |
| No Reduce Motion check | Accessibility violation | `@Environment(\.accessibilityReduceMotion)` checked |
| Animating expensive properties | Causes hitches | Use transform-based properties (scale, offset, opacity) |
| `.repeatForever` without cleanup | Continues after view removed | Toggle in `.onDisappear` |
| Multiple competing animations | Confusing hierarchy | Use vary spring durations to communicate weight |
| `withAnimation` in tight loop | Multiple competing animations | Batch state changes in single `withAnimation` |

## See also

- `references/animation/02-spring-physics.md#spring-presets` -- spring parameters in depth
- `references/animation/03-advanced-animators.md#phaseanimator` -- PhaseAnimator, KeyframeAnimator, CustomAnimation
- `references/animation/04-transitions-geometry.md#transitions` -- transitions and matchedGeometryEffect
- `references/animation/05-gesture-driven.md#interactive-springs-for-gesture-handoff` -- interactive animation
- `references/accessibility/03-visual-accessibility.md#reduce-motion` -- Reduce Motion deep dive
- `references/accessibility/05-motion-accessibility.md` -- full RM substitution catalog (OWNER)
- `~/Claude/vault/iOS Development/81 - SwiftUI Animation Deep Dive.md`
