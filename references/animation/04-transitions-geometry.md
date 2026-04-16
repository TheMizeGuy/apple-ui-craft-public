# Transitions and matchedGeometryEffect

Transitions define how views appear and disappear. matchedGeometryEffect creates hero animations between two views representing the same conceptual element.

## Transitions

Transitions apply when a view is inserted into or removed from the view hierarchy.

### Built-in transitions

```swift
if showDetail {
    DetailView()
        .transition(.opacity)             // Fade in/out
}

DetailView()
    .transition(.slide)                   // Slide in from leading, out to trailing

DetailView()
    .transition(.scale)                   // Scale from small

DetailView()
    .transition(.scale(scale: 0.5, anchor: .topLeading))

DetailView()
    .transition(.move(edge: .bottom))     // Slide from bottom

DetailView()
    .transition(.push(from: .trailing))   // Push (iOS 16+)

DetailView()
    .transition(.blurReplace)             // Blur transition (iOS 17+)
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

## ContentTransition

Animates content WITHIN a single view when it changes (vs `transition` for view insertion/removal).

```swift
@State private var count = 0

Text("\(count)")
    .font(.system(size: 60, weight: .bold, design: .rounded))
    .contentTransition(.numericText())
    .onTapGesture {
        withAnimation(.snappy) {
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
ScrollView {
    LazyVStack {
        ForEach(items) { item in
            ItemCard(item: item)
                .scrollTransition { content, phase in
                    content
                        .opacity(phase.isIdentity ? 1 : 0.3)
                        .scaleEffect(phase.isIdentity ? 1 : 0.8)
                        .blur(radius: phase.isIdentity ? 0 : 5)
                }
        }
    }
}
```

### Asymmetric scroll transition

```swift
ItemView()
    .scrollTransition(
        topLeading: .interactive,
        bottomTrailing: .animated(.spring)
    ) { content, phase in
        content
            .rotationEffect(.degrees(phase.value * 15))
            .offset(x: phase.value * 50)
    }
```

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
Image("landscape")
    .resizable()
    .aspectRatio(contentMode: .fill)
    .frame(height: 200)
    .visualEffect { content, proxy in
        content
            .offset(y: proxyOffset(proxy: proxy))
    }

private func proxyOffset(proxy: GeometryProxy) -> CGFloat {
    let frame = proxy.frame(in: .scrollView)
    return -frame.minY * 0.3  // 30% parallax
}
```

## Common mistakes

| Mistake | Problem | Fix |
|---|---|---|
| matchedGeometryEffect with both views visible | Glitchy overlapping animation | Only one view visible at a time |
| Forgetting `@Namespace` | Compile error or wrong scope | Declare `@Namespace private var` |
| Same namespace ID for unrelated views | Views jump to wrong positions | Use unique IDs per pair |
| Manual matched geometry for nav transitions | Complex, fragile | Use `.matchedTransitionSource` + `.navigationTransition` (iOS 18+) |
| ContentTransition without `withAnimation` | No animation occurs | Wrap content change in `withAnimation` |
| Using `.transition` for content changes | Wrong tool | Use `.contentTransition` for text/symbol changes |
| `.scrollTransition` with expensive effects | Causes scroll jank | Use cheap effects (opacity, scale, offset) |

## See also

- `01-animation-fundamentals.md` -- when to use transitions vs animations
- `02-spring-physics.md` -- spring parameters for transition animations
