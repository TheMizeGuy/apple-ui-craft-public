# Spring Physics

Springs are the recommended animation type for almost all interactive UI. They feel natural because they model real physics. Reserve timing curves for non-interactive, decorative motion.

## Why springs

Real objects don't ease-in-out. They have mass, momentum, and settle naturally. Apple's system animations are nearly all springs. When you use timing curves, your UI feels canned. When you use springs, it feels alive.

## Modern API (iOS 17+)

The simplified API uses duration and bounce:

```swift
.spring(duration: 0.4, bounce: 0.2)
```

| Parameter | Meaning |
|---|---|
| `duration` | Time to settle (in seconds) |
| `bounce` | -1 to 1; 0 = critically damped (no overshoot), positive = overshoot, negative = undershoot |

## Spring presets

```swift
.bouncy        // duration: 0.5, bounce: 0.3 -- noticeable bounce
.snappy        // duration: 0.5, bounce: 0.15 -- minimal overshoot
.smooth        // duration: 0.5, bounce: 0.0 -- gentle deceleration
```

These numbers are not a house guess -- Apple's DocC pages for the `.bouncy(duration:extraBounce:)` / `.snappy(duration:extraBounce:)` / `.smooth(duration:extraBounce:)` static-function variants document the defaults verbatim: `duration: TimeInterval = 0.5` on all three, base `extraBounce` 0.3 / 0.15 / 0.0 respectively. The no-argument static vars (`.bouncy`, `.snappy`, `.smooth`) are the zero-argument case of the same function -- they inherit these defaults, not a separate spec. `bounce` and `dampingFraction` are the same axis: `bounce = 1 - dampingFraction`.

Override defaults:

```swift
.bouncy(duration: 0.4, extraBounce: 0.1)
.snappy(duration: 0.3, extraBounce: 0.05)
.smooth(duration: 0.6, extraBounce: 0.0)
```

## Physics-based API (pre-iOS 17 or fine control)

```swift
.spring(response: 0.5, dampingFraction: 0.7, blendDuration: 0.0)
```

| Parameter | Meaning |
|---|---|
| `response` | Period of oscillation in seconds (~= duration) |
| `dampingFraction` | 0.0 = infinite oscillation, 1.0 = critically damped, > 1.0 = overdamped |
| `blendDuration` | Blending time when interrupted by another animation |

## Interactive spring

For gesture-driven animation that must track the finger:

```swift
.interactiveSpring(response: 0.15, dampingFraction: 0.86, blendDuration: 0.25)
```

Lower response = faster tracking. Higher damping = settles quickly when released.

## Spring parameter guide (HOUSE CONVENTION)

These per-interaction tuples are NOT lifted from Apple's system animations -- they are this file's tuned starting points for matching the feel of first-party apps. Only the preset defaults above (`.bouncy`/`.snappy`/`.smooth`) are Apple-documented; this table is a practical convention, not a citation.

| Desired feel | Duration | Bounce | When to use |
|---|---|---|---|
| Quick tap feedback | 0.25 | 0.0 | Button press response, small toggle |
| Standard interaction | 0.35-0.45 | 0.15-0.25 | Sheet presentation, card expansion, most UI |
| Bouncy element | 0.4-0.5 | 0.3-0.5 | Playful UI, success states, attention |
| Gentle settle | 0.5-0.7 | 0.0-0.1 | Background elements, large-area transitions |
| Gesture tracking | 0.15 | 0.0 | Following the finger during drag/pan |

## Real-world examples

### Button press

```swift
.scaleEffect(isPressed ? 0.95 : 1.0)
.animation(.spring(duration: 0.25, bounce: 0), value: isPressed)
```

### Sheet presentation

```swift
.sheet(isPresented: $showSheet) {
    SheetContent()
}
// System uses: spring(duration: 0.5, bounce: 0.0)
```

### Card expand/collapse

```swift
.frame(height: isExpanded ? 200 : 60)
.animation(.spring(duration: 0.4, bounce: 0.2), value: isExpanded)
```

### Hero zoom transition

```swift
withAnimation(.spring(duration: 0.4, bounce: 0.15)) {
    selectedItem = item
}
```

This drives a manual `matchedGeometryEffect` state toggle. For list-to-detail navigation on iOS 18+, prefer the system-owned `.navigationTransition(.zoom(sourceID:in:))` instead -- it drives its own interruptible spring and you don't (can't) supply one; see `references/animation/04-transitions-geometry.md#navigation-transition-with-matched-geometry-ios-18`. Reserve the manual spring shown here for same-screen expansions the zoom transition doesn't cover.

### Success bounce

```swift
.scaleEffect(showSuccess ? 1.2 : 1.0)
.animation(.spring(duration: 0.5, bounce: 0.5), value: showSuccess)
```

### Drag spring-back

```swift
@State private var dragOffset: CGSize = .zero

.offset(dragOffset)
.gesture(
    DragGesture()
        .onChanged { dragOffset = $0.translation }
        .onEnded { _ in
            withAnimation(.spring(duration: 0.5, bounce: 0.4)) {
                dragOffset = .zero  // Spring back to origin
            }
        }
)
```

## Settling duration

For springs, the animation never truly reaches the target (asymptotic). `settlingDuration` returns the time until the spring is "settled":

```swift
let spring = Spring(duration: 0.5, bounce: 0.3)
let settleTime = spring.settlingDuration
// Useful for scheduling work after a spring completes
```

## When to use timing curves instead

Springs are wrong when:
- Animation must end at an exact time (sequence of synchronized animations)
- The motion isn't physical (color crossfade, opacity)
- You need precise timing curve control (entrance/exit choreography)

```swift
// OK: opacity crossfade with timing curve
.opacity(isVisible ? 1 : 0)
.animation(.easeInOut(duration: 0.2), value: isVisible)
```

## Anti-patterns

| Anti-pattern | Problem | Fix |
|---|---|---|
| `.easeInOut` on interactive UI | Feels canned, not physical | `.spring(duration: 0.4, bounce: 0.2)` |
| `.linear` on UI | Mechanical, robotic | Spring or easeOut |
| `duration: 0.8+` for interactive | Sluggish, users wait | Keep under 0.5 |
| `bounce: 0.7+` for production UI | Chaotic, never settles | Keep under 0.5 |
| Same spring everywhere | No hierarchy of importance | Vary by element weight |
| Spring on color/opacity | Wrong tool (no physics) | Use timing curve |
| `.spring()` with default params | Generic feel | Pick params intentionally |

## Composing springs

Different elements can use different springs to communicate hierarchy:

```swift
withAnimation(.spring(duration: 0.4, bounce: 0.2)) {
    // Primary content -- standard interaction
    isExpanded.toggle()
}

// Background slightly slower for depth
.animation(.spring(duration: 0.6, bounce: 0.0), value: isExpanded)
```

## Testing spring feel

Spring feel is hard to judge from code. Always:
1. Build and run on device (not just preview)
2. Try the interaction many times
3. Compare to the closest equivalent in a first-party Apple app
4. Adjust by 0.05 increments on `bounce` and 0.05 increments on `duration`

## Reduce Motion

Springs are decorative motion the user can turn off. Gate every spring-driven call site through the SAME `Animation?` accessor shown in `references/animation/01-animation-fundamentals.md#reduce-motion-critical`; full substitution catalog: `references/accessibility/05-motion-accessibility.md`.

## See also

- `references/animation/01-animation-fundamentals.md#reduce-motion-critical` -- when to use springs vs curves, RM double-gate
- `references/animation/05-gesture-driven.md#interactive-springs-for-gesture-handoff` -- interactive springs for gestures
- `~/Claude/vault/iOS Development/81 - SwiftUI Animation Deep Dive.md#spring-animations`
