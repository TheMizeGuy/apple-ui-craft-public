# Transitions and matchedGeometryEffect

Transitions define how views appear and disappear. matchedGeometryEffect creates hero animations between two views representing the same conceptual element.

## Transitions

Transitions apply when a view is inserted into or removed from the view hierarchy.

### Built-in transitions

A transition only plays when its view is INSERTED into or REMOVED from the hierarchy inside an animated transaction. Applying `.transition(_:)` to a view that merely re-renders in place -- with no conditional and no `withAnimation`/`.animation(_:value:)` around the state change -- is a no-op. Every case below needs both:

```swift
if showDetail {
    DetailView()
        .transition(.opacity)             // Fade in/out
}

if showDetail {
    DetailView()
        .transition(.slide)               // Slide in from leading, out to trailing
}

if showDetail {
    DetailView()
        .transition(.scale)               // Scale from small
}

if showDetail {
    DetailView()
        .transition(.scale(scale: 0.5, anchor: .topLeading))
}

if showDetail {
    DetailView()
        .transition(.move(edge: .bottom)) // Slide from bottom
}

if showDetail {
    DetailView()
        .transition(.push(from: .trailing))   // Push (iOS 16+)
}

if showDetail {
    DetailView()
        .transition(.blurReplace)         // Blur transition (iOS 17+)
}

Button("Toggle") {
    withAnimation(.spring(duration: 0.4, bounce: 0.15)) {
        showDetail.toggle()               // The insertion/removal every transition above depends on
    }
}
```

### Combining transitions

```swift
.transition(.opacity.combined(with: .scale))
.transition(.move(edge: .bottom).combined(with: .opacity))
```

### Asymmetric transitions

Different animation for appear vs disappear:

```swift
.transition(.asymmetric(
    insertion: .push(from: .trailing),
    removal: .push(from: .leading)
))

.transition(.asymmetric(
    insertion: .scale(scale: 0.1).combined(with: .opacity),
    removal: .move(edge: .top).combined(with: .opacity)
))
```

### Custom transitions (iOS 17+)

```swift
struct RotateTransition: Transition {
    func body(content: Content, phase: TransitionPhase) -> some View {
        content
            .rotationEffect(.degrees(phase.isIdentity ? 0 : 360))
            .scaleEffect(phase.isIdentity ? 1 : 0.5)
            .opacity(phase.isIdentity ? 1 : 0)
    }
}

// Usage
DetailView()
    .transition(RotateTransition())
```

`TransitionPhase`:

| Phase | When | `isIdentity` |
|---|---|---|
| `.willAppear` | Start of insertion | false |
| `.identity` | Fully visible | true |
| `.didDisappear` | End of removal | false |

## matchedGeometryEffect

Synchronizes geometry (position, size, frame) between two views with the same `id` in the same `Namespace`.

### Basic hero transition

```swift
struct HeroExample: View {
    @Namespace private var animation
    @State private var isExpanded = false
    
    var body: some View {
        VStack {
            if isExpanded {
                RoundedRectangle(cornerRadius: 20)
                    .fill(.blue)
                    .matchedGeometryEffect(id: "card", in: animation)
                    .frame(width: 300, height: 400)
                    .onTapGesture {
                        withAnimation(.spring(duration: 0.5, bounce: 0.2)) {
                            isExpanded = false
                        }
                    }
            } else {
                RoundedRectangle(cornerRadius: 10)
                    .fill(.blue)
                    .matchedGeometryEffect(id: "card", in: animation)
                    .frame(width: 80, height: 80)
                    .onTapGesture {
                        withAnimation(.spring(duration: 0.5, bounce: 0.2)) {
                            isExpanded = true
                        }
                    }
            }
        }
    }
}
```

### Parameters

```swift
.matchedGeometryEffect(
    id: "unique-id",
    in: namespace,
    properties: .frame,        // .position, .size, or .frame (default)
    anchor: .center,           // alignment point
    isSource: true             // which view defines the geometry
)
```

| Property | Matches |
|---|---|
| `.position` | Only position (center point) |
| `.size` | Only size (width and height) |
| `.frame` | Both (default) |

### isSource

When two views share the same `id` and `namespace`, `isSource: true` defines the geometry the other matches:

```swift
HStack {
    ForEach(items) { item in
        if selectedItem?.id != item.id {
            ItemThumbnail(item: item)
                .matchedGeometryEffect(
                    id: item.id,
                    in: namespace,
                    isSource: selectedItem == nil
                )
        }
    }
}

if let selected = selectedItem {
    ItemDetail(item: selected)
        .matchedGeometryEffect(
            id: selected.id,
            in: namespace,
            isSource: true
        )
}
```

### Passing namespace between views

```swift
struct ParentView: View {
    @Namespace private var animation
    
    var body: some View {
        ChildA(namespace: animation)
        ChildB(namespace: animation)
    }
}

struct ChildA: View {
    var namespace: Namespace.ID
    
    var body: some View {
        Circle()
            .matchedGeometryEffect(id: "shared", in: namespace)
    }
}
```

### Navigation transition with matched geometry (iOS 18+)

The cleanest API for list-to-detail hero transitions:

```swift
@Namespace private var transition

NavigationStack {
    ScrollView {
        ForEach(items) { item in
            NavigationLink(value: item) {
                ItemCard(item: item)
            }
            .matchedTransitionSource(id: item.id, in: transition)
        }
    }
    .navigationDestination(for: Item.self) { item in
        ItemDetail(item: item)
            .navigationTransition(.zoom(sourceID: item.id, in: transition))
    }
}
```

This is the modern equivalent of manual `matchedGeometryEffect` for navigation transitions. Prefer it over manual implementations when targeting iOS 18+.

`.navigationTransition(.zoom)` is iOS 18+ (iPadOS/macOS/watchOS/visionOS included) but NOT tvOS -- there it silently falls back to `.automatic` (a plain push/cross-dissolve). `matchedTransitionSource` itself exists on tvOS 18; only the zoom effect degrades. Don't promise a hero zoom on tvOS.

## ContentTransition

Animates content WITHIN a single view when it changes (vs `transition` for view insertion/removal).

```swift
@State private var count = 0
@Environment(\.accessibilityReduceMotion) private var reduceMotion

Text("\(count)")
    .font(.system(size: 60, weight: .bold, design: .rounded))
    .contentTransition(reduceMotion ? .identity : .numericText())
    .onTapGesture {
        withAnimation(reduceMotion ? nil : .snappy) {
            count += 1
        }
    }
```

### Available content transitions

```swift
.contentTransition(.numericText())                    // Digits slide
.contentTransition(.numericText(countsDown: true))    // Digits slide downward
.contentTransition(.opacity)                          // Crossfade
.contentTransition(.interpolate)                      // Interpolate (color, font weight)
.contentTransition(.identity)                         // No animation (instant swap)
.contentTransition(.symbolEffect(.replace))           // SF Symbol swap
```

| Transition | Best for |
|---|---|
| `.numericText()` | Changing numbers |
| `.numericText(countsDown:)` | Numbers with direction |
| `.opacity` | Any text change |
| `.interpolate` | Color, font weight changes |
| `.identity` | Instant swap |
| `.symbolEffect(.replace)` | SF Symbol changes |

## ScrollTransition (iOS 17+)

Apply visual effects to views as they scroll into and out of the visible area.

```swift
@Environment(\.accessibilityReduceMotion) private var reduceMotion

ScrollView {
    LazyVStack {
        ForEach(items) { item in
            ItemCard(item: item)
                .scrollTransition { content, phase in
                    content
                        .opacity(phase.isIdentity ? 1 : 0.3)
                        .scaleEffect(reduceMotion ? 1 : (phase.isIdentity ? 1 : 0.85))
                }
        }
    }
}
```

Keep to compositor-safe effects (opacity, scale, offset, rotation). `.blur(radius:)` inside a `scrollTransition` closure runs every scroll frame -- an off-screen render pass per frame, the same cost called out in `references/animation/01-animation-fundamentals.md#animation-cost-layout-vs-render`. Never blur here.

### Asymmetric scroll transition

```swift
ItemView()
    .scrollTransition(
        topLeading: .interactive,
        bottomTrailing: .animated(.spring)
    ) { content, phase in
        content
            .rotationEffect(.degrees(reduceMotion ? 0 : phase.value * 15))
            .offset(x: reduceMotion ? 0 : phase.value * 50)
    }
```

Same RM gate as above -- multiply every `phase.value`-driven rotation/offset by zero under Reduce Motion rather than shipping a second, ungated parallax path.

### Scroll transition phase

```
phase.value:
  -1.0 = view above visible area (topLeading)
   0.0 = view fully visible (identity)
   1.0 = view below visible area (bottomTrailing)

phase.isIdentity = true when value is ~0
```

## Visual effects (iOS 17+)

`.visualEffect` applies effects responding to view geometry without causing layout changes:

```swift
@Environment(\.accessibilityReduceMotion) private var reduceMotion

Image("landscape")
    .resizable()
    .aspectRatio(contentMode: .fill)
    .frame(height: 200)
    .visualEffect { content, proxy in
        content
            .offset(y: reduceMotion ? 0 : proxyOffset(proxy: proxy))
    }

private func proxyOffset(proxy: GeometryProxy) -> CGFloat {
    let frame = proxy.frame(in: .scrollView)
    return -frame.minY * 0.3  // 30% parallax
}
```

Parallax is a differential scroll rate between a layer and its content -- pure decoration, HIGH vestibular risk. Kill it outright under Reduce Motion; don't merely slow it down.

## Reduce Motion (CRITICAL -- every motion type on this page is a developer gate)

Nothing above is system-auto-gated. Auto-gating covers only Glass specular highlights, the default push/sheet transition, and one-shot discrete symbol effects -- built-in `.transition`, `matchedGeometryEffect`, `.navigationTransition(.zoom)`, `.contentTransition`, and `.scrollTransition`/`.visualEffect` parallax are ALL yours to gate.

| Default effect | Reduce Motion fallback |
|---|---|
| Slide / push / scale transition | `.opacity` crossfade (shown above) |
| `matchedGeometryEffect` hero | Crossfade between the two states -- don't share geometry |
| `.navigationTransition(.zoom)` hero | Crossfade the underlying content; the system spring itself isn't swappable, so gate the presentation path, not the modifier |
| `.scrollTransition` / `.visualEffect` parallax | Opacity-only or identity (shown above) |
| `.contentTransition(.numericText())` | `.contentTransition(.identity)` (shown above) |

`matchedGeometryEffect` hero fallback:

```swift
@Environment(\.accessibilityReduceMotion) private var reduceMotion

if reduceMotion {
    Group {
        if isExpanded { DetailCard() } else { Thumbnail() }
    }
    .transition(.opacity)
} else {
    if isExpanded {
        DetailCard().matchedGeometryEffect(id: "hero", in: animation)
    } else {
        Thumbnail().matchedGeometryEffect(id: "hero", in: animation)
    }
}
```

### accessibilityPrefersCrossFadeTransitions (iOS 26.4+) -- a separate, stricter preference

`accessibilityPrefersCrossFadeTransitions` sits under Settings > Accessibility > Motion > Reduce Motion but is its OWN sub-toggle. It reads `true` when EITHER base Reduce Motion OR the cross-fade sub-toggle is on, and specifically means "replace sliding navigation/push transitions with cross-fades" -- read this (not `accessibilityReduceMotion`) to decide whether a custom `NavigationStack` push animation should become `.opacity`. It is the one writable accessibility environment member (`{ get set }`), so it is `#Preview`-injectable. Below iOS 26.4, read the UIKit equivalent instead: `UIAccessibility.prefersCrossFadeTransitions` (iOS 14+), observing `UIAccessibility.prefersCrossFadeTransitionsStatusDidChange`.

Full substitution catalog and the `Animation?`/`nil` double-gate mechanics live in `references/accessibility/05-motion-accessibility.md` (OWNER) -- this section covers only what's specific to transitions and geometry.

## Common mistakes

| Mistake | Problem | Fix |
|---|---|---|
| matchedGeometryEffect with both views visible | Glitchy overlapping animation | Only one view visible at a time |
| Forgetting `@Namespace` | Compile error or wrong scope | Declare `@Namespace private var` |
| Same namespace ID for unrelated views | Views jump to wrong positions | Use unique IDs per pair |
| Manual matched geometry for nav transitions | Complex, fragile | Use `.matchedTransitionSource` + `.navigationTransition` (iOS 18+) |
| ContentTransition without `withAnimation` | No animation occurs | Wrap content change in `withAnimation` |
| Using `.transition` for content changes | Wrong tool | Use `.contentTransition` for text/symbol changes |
| `.scrollTransition` with expensive effects | Causes scroll jank | Use cheap effects (opacity, scale, offset) -- never `.blur` |
| `.transition` with no conditional insert/removal | Modifier never fires | Wrap the state change in `if`/`withAnimation` |
| No Reduce Motion branch on a hero/parallax/numericText effect | Vestibular-trigger motion never stops | Gate per the Reduce Motion section above |

## See also

- `references/animation/01-animation-fundamentals.md#reduce-motion-critical` -- when to use transitions vs animations, RM double-gate
- `references/animation/02-spring-physics.md#spring-presets` -- spring parameters for transition animations
- `references/accessibility/05-motion-accessibility.md` -- full RM substitution catalog (OWNER)
- `~/Claude/vault/iOS Development/81 - SwiftUI Animation Deep Dive.md#transitions`
