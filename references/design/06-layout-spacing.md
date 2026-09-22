# Layout and Spacing

Apple's layout grid is built on consistent spacing increments and semantic insets. The system handles most spacing for you -- your job is to not fight it.

## Standard spacing increments

Use multiples of 4 for spacing. The system defaults align to this grid.

| Spacing | Use |
|---|---|
| 4pt | Tight (between text and a small icon) |
| 8pt | Compact (within a control) |
| 12pt | Snug (between related items) |
| 16pt | Standard (default `.padding()` value) |
| 20pt | Comfortable (between sections) |
| 24pt | Spacious (around primary content) |
| 32pt+ | Generous (between major sections) |

```swift
VStack(spacing: 16) {
    HeaderView()
    ContentView()
}
.padding()  // Default 16pt all sides
```

## SwiftUI default padding

`.padding()` with no arguments uses the system default (16pt on iOS by default, but adapts to platform):

```swift
.padding()                       // All sides, system default
.padding(.horizontal)            // Leading + trailing only
.padding(.top, 24)               // Specific edge with custom value
.padding(.horizontal, 20)        // Custom horizontal value
```

## Scene padding (iOS 16+)

`.scenePadding()` provides the platform-appropriate margin for the current scene -- larger on iPad, smaller on iPhone, automatic on Mac:

```swift
VStack { ... }
    .scenePadding()        // Adapts to device
    .scenePadding(.horizontal)  // Just horizontal
```

Use this for app-level content that should match other system apps' margins (Settings, Mail, Notes). The parent `ScenePadding` API is iOS 16.0+, but its `.navigationBar`/`.minimum` cases are watchOS 9.0+ (nav-title alignment) and macOS root-window spacing respectively -- on iOS those two cases are a no-op for header alignment; don't reach for them expecting an iPhone/iPad effect.

## Safe area

The safe area excludes:
- Status bar (top)
- Navigation bar (top)
- Tab bar (bottom)
- Home indicator (bottom)
- Notch / Dynamic Island (top)
- Stage Manager bezels (iPad)

SwiftUI respects safe area by default. Content fills the safe area.

### Going edge-to-edge

```swift
Image("hero")
    .resizable()
    .scaledToFill()
    .ignoresSafeArea()                // Ignores all edges
    .ignoresSafeArea(.container, edges: .top)  // Specific edges
    .ignoresSafeArea(.keyboard)       // Ignore keyboard avoidance
```

The classic bug here is a hero or background that extends into the safe area and then centers itself across the full expanded bounds, drifting out of alignment with the safe-area content above it. iOS 27 makes the alignment declarable at the call site instead of correcting it with an outer `frame` plus `offset`:

```swift
// iOS 27.0+ overload: ignoresSafeArea(_:edges:alignment:)
if #available(iOS 27.0, *) {
    heroArtwork
        .ignoresSafeArea(.container, edges: .top, alignment: .top)   // stays pinned, not re-centered
} else {
    heroArtwork
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .ignoresSafeArea(.container, edges: .top)
}
```

An iOS-27-minimum target drops the `else` branch; below 27 the wrapping `frame(maxWidth:maxHeight:alignment:)` is exactly the pattern the overload replaces.

### Keyboard avoidance

SwiftUI auto-adjusts content when the keyboard appears. Disable with:

```swift
ScrollView { ... }
    .ignoresSafeArea(.keyboard)
```

### Reading safe area insets

There is no `EnvironmentValues` key for safe area insets. The only way to read them is `GeometryProxy`:

```swift
GeometryReader { proxy in
    Text("Top inset: \(proxy.safeAreaInsets.top)")
}
```

On visionOS, the 3D-aware equivalent is `GeometryProxy3D.safeAreaInsets` inside a `GeometryReader3D`.

### Adding to safe area

If you have a custom toolbar that should be respected:

```swift
ScrollView { ... }
    .safeAreaInset(edge: .bottom) {
        CustomToolbar()
    }
```

### Safe area under a minimizing toolbar

A toolbar that minimizes on scroll (iOS 27's `toolbarMinimizationBehavior(_:for:)`, owned by `references/design/07-navigation-patterns.md#toolbar-minimization-ios-27`) shrinks the safe area with it by default, so content reflows every time the scroll direction changes. On a screen whose layout would visibly jump, turn the safe-area half off and let the glass recede on its own:

```swift
// iOS 27.0+ (iOS/iPadOS/Mac Catalyst)
.toolbarMinimizationSafeAreaAdjustment(.disabled, for: .navigationBar)
```

This is the fix to reach for when a reviewer sees layout thrash under toolbar minimization -- the bar still recedes, the content just stops moving.

## Margins for content

### List margins

```swift
List { ... }
    .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
    .contentMargins(.horizontal, 20, for: .scrollContent)  // iOS 17+
```

### Form margins

```swift
Form { ... }
    .formStyle(.grouped)         // Default grouped style with proper margins
    .formStyle(.columns)         // For Mac/iPad with columns
```

### Grid margins

```swift
LazyVGrid(columns: columns, spacing: 16) { ... }
    .padding(.horizontal)        // Margin around grid
```

Prefer an even number of columns in a grid-style layout so content divides cleanly when a display is split down the middle -- the HIG's iPhone Duo guidance, and free insurance on any split or folded surface.

### Toolbar item margins

A custom toolbar item that carries its own padding double-counts against the bar's system content margins, and the usual workaround is hand-tuned negative padding. iOS 27 sanctions the escape:

```swift
.toolbar {
    if #available(iOS 27.0, *) {
        ToolbarItem(placement: .topBarTrailing) { AvatarBadge() }
            .contentMarginsRemoved()
    } else {
        ToolbarItem(placement: .topBarTrailing) { AvatarBadge() }
    }
}
```

Reach for it only for an item whose own insets are already correct; for everything else the system margins are the right answer.

### Text field borders

Text input shape is its own axis in iOS 27, separate from text field style. `.textFieldStyle(.bordered)` plus `textInputBorderShape(_:)` (`.automatic` / `.capsule` / `.roundedRectangle`) replaces the plain field wrapped in a hand-drawn `RoundedRectangle` overlay, and the system shape participates correctly in Liquid Glass, focus, and the concentric-corner model. `references/patterns/02-forms-data-entry.md` owns the form-side guidance; the layout point is that a literal corner radius on a field is no longer the only option.

## Leading/trailing (NEVER left/right)

In RTL languages (Arabic, Hebrew), the layout flips. Use `leading`/`trailing` to keep semantic meaning:

```swift
// WRONG -- breaks in RTL
HStack {
    Image(...)
    Text("Title")
        .padding(.left, 8)    // Wrong direction in RTL
}

// RIGHT
HStack(alignment: .center, spacing: 8) {
    Image(...)
    Text("Title")
}

// Or with explicit padding:
HStack {
    Image(...)
    Text("Title")
        .padding(.leading, 8)  // Mirrors automatically
}
```

| Wrong | Right |
|---|---|
| `.padding(.left, ...)` | `.padding(.leading, ...)` |
| `.padding(.right, ...)` | `.padding(.trailing, ...)` |
| `VStack(alignment: .left)` | `VStack(alignment: .leading)` (an `HStack` aligns vertically -- `.top`/`.center`/`.bottom` -- and has no horizontal alignment to get wrong) |
| `.frame(alignment: .left)` | `.frame(alignment: .leading)` |

## Touch targets

44x44pt minimum for any tappable element. The full WCAG-level rationale and citation (`references/accessibility/04-motor-interaction.md`) owns this rule -- here's the layout-side shape of it:

```swift
// Visual icon is small (24pt) but hit area is 44pt
Button {
    action()
} label: {
    Image(systemName: "heart")
        .font(.system(size: 24))
        .frame(width: 44, height: 44)
}

// Or extend hit area without changing visual:
Image(systemName: "heart")
    .font(.system(size: 24))
    .padding(10)  // 24 + 10*2 = 44
    .contentShape(Rectangle())
    .onTapGesture { action() }
```

For tightly-packed lists where 44pt would crowd:
- Stack actions vertically with full-width tap area
- Use a context menu (long-press) for secondary actions
- Combine related actions into a single tap that opens a sheet

## Every width is a real state

Built with the iOS 27 SDK, an iPad app is continuously resizable regardless of what `UISupportedInterfaceOrientations` declares, and `UIRequiresFullScreen` no longer buys immunity -- it buys a discrete-step resize model where each change arrives as a new `UIScreen` with updated bounds. iPhone app windows resize too, under iPhone Mirroring on macOS and on the folding hardware arriving in October.

Two rules follow, and both are review-grade:

- A layout keyed to `UIScreen.main.bounds` or a hardcoded iPhone width is wrong **even in a portrait-locked app**. `UIScreen.main` bounds stay fixed once the screen connects; they stopped describing your window. Read geometry from `GeometryReader` / `.onGeometryChange(for:of:action:)`, or size relative to the container.
- "Declare portrait-only" and `UIRequiresFullScreen` are no longer answers to "my layout breaks when resized." The layout has to hold across the range.

Construction mechanics for the reflow itself -- `AnyLayout` vs `ViewThatFits`, size-class branching, the clamped-proportional split formula -- are owned by `references/design/08-adaptive-layout-ipad.md#core-apis`.

## iPad and adaptive layout

iPad has two size classes (compact width and regular width). Adapt with:

### NavigationSplitView (iOS 16+)

```swift
NavigationSplitView {
    SidebarView()
} content: {
    ContentListView()
} detail: {
    DetailView()
}
```

Three columns on iPad in landscape, collapses to NavigationStack on iPhone.

### ViewThatFits

```swift
ViewThatFits(in: .horizontal) {
    // First child that fits
    HStack { /* compact */ }
    
    // Fallback
    VStack { /* expanded */ }
}
```

### Size class environment

```swift
@Environment(\.horizontalSizeClass) var hSize

if hSize == .regular {
    // iPad-style layout
} else {
    // iPhone-style layout
}
```

## Container relative spacing (iOS 17+)

`containerRelativeFrame` adapts to its containing view, useful for paged content:

```swift
ScrollView(.horizontal) {
    HStack(spacing: 0) {
        ForEach(pages) { page in
            PageView(page: page)
                .containerRelativeFrame(.horizontal)
        }
    }
}
.scrollTargetBehavior(.paging)
```

Rebuilding against the 27 SDK changes how `containerRelativeFrame` accounts for safe-area insets on a scroll view's **non-scrollable** axis, where the old accounting made the calculated scrollable content size too small. A horizontal carousel whose cards use `containerRelativeFrame(.vertical)` while extending under the navigation bar or home indicator measures differently after the rebuild -- re-check carousels visually, don't assume the pixels carried over.

Lazy stacks have their own scroll contract that overrides habit -- a `LazyVStack`'s height is estimated and shifts while scrolling, so absolute content offsets are not stable enough to drive UI, and `onAppear`-based row setup is thrown away under prefetching. `references/performance/02-scroll-list-performance.md` owns it.

## Concentric corners

A nested element inside a rounded container should share the container's curvature, not a hand-picked radius that visibly fights it. `ConcentricRectangle` and `Shape.rect(corners:isUniform:)` (iOS 26.0) draw a concentric shape, and `containerShape(_:)` propagates the container to descendants. What iOS 26 could not do was tell you the resolved *number*, so anything needing the radius for a non-shape purpose -- matching a shadow, insetting a stroke, sizing a nested element -- fell back to a literal.

iOS 27 closes that with `GeometryProxy.concentricCornerRadii` (and `concentricCornerRadii(in:)` for an arbitrary frame inside the view). It returns `RectangleCornerRadii?`, `nil` when no concentric radius applies:

```swift
// iOS 27.0+: read the radii the system would resolve, instead of guessing.
GeometryReader { proxy in
    let radii = proxy.concentricCornerRadii

    RoundedRectangle(cornerRadius: radii?.topLeading ?? 16)
        .fill(Color(.secondarySystemBackground))
}
```

A literal `cornerRadius` chosen to "match the device" or "match the card" is now a defect with a concrete fix. Below iOS 27, draw with `ConcentricRectangle` and accept that the number itself is unreadable.

## Common spacing patterns

### List row

```swift
HStack(spacing: 12) {
    Image(systemName: "doc.fill")
        .font(.title2)
        .foregroundStyle(.tint)
        .frame(width: 36)
    
    VStack(alignment: .leading, spacing: 2) {
        Text("Title")
            .font(.body)
        Text("Subtitle")
            .font(.subheadline)
            .foregroundStyle(.secondary)
    }
    
    Spacer()
    
    Text("Trailing")
        .font(.subheadline)
        .foregroundStyle(.tertiary)
}
.padding(.vertical, 4)
```

### Card

```swift
VStack(alignment: .leading, spacing: 12) {
    Text("Card title")
        .font(.headline)
    
    Text("Card body content explaining what this card is about.")
        .font(.body)
        .foregroundStyle(.secondary)
    
    HStack {
        Spacer()
        Button("Action") { }
            .buttonStyle(.glassProminent)
    }
}
.padding(20)
.background(Color(.secondarySystemBackground), in: .rect(cornerRadius: 16))   // the grouped elevation step, not a dim of the window (design/04)
```

### Form section

```swift
Form {
    Section("Profile") {
        TextField("Name", text: $name)
        TextField("Email", text: $email)
            .textContentType(.emailAddress)
    }
    
    Section("Privacy") {
        Toggle("Allow analytics", isOn: $analytics)
        Toggle("Marketing emails", isOn: $marketing)
    }
}
```

## Common mistakes

| Mistake | Problem | Fix |
|---|---|---|
| `.padding(.left, ...)` | Breaks in RTL | `.padding(.leading, ...)` |
| Hardcoded spacing for everything | Doesn't adapt to size classes | Use system spacing or `.scenePadding()` |
| Touch targets < 44pt | Inaccessible | `.frame(width: 44, height: 44)` or `.contentShape(Rectangle())` extension |
| Fighting the safe area | Custom layout breaks on Dynamic Island devices | `.safeAreaInset()` for custom toolbars |
| Manual margins in `List` | Fights system styling | `.listRowInsets()` and `.contentMargins()` |
| `GeometryReader` for sizing children | Breaks layout, expensive | Use container queries or `ViewThatFits` |
| Same layout iPhone + iPad | Wastes iPad screen | `NavigationSplitView` or size-class branching |
| `.frame(width: UIScreen.main.bounds.width)` | Doesn't adapt to iPad/Mac/Vision -- and under the iOS 27 SDK every window resizes, so it's wrong in a portrait-locked iPhone app too | `.containerRelativeFrame()`, or geometry from `GeometryReader`/`.onGeometryChange` |
| Hand-tuned `HStack` spacing inside a `List` section header button | Compensates for a spacing bug Apple fixed in iOS 27 -- the compensation now over-corrects | Delete the manual spacing and let the system space the icon and title |

## See also

- `references/design/07-navigation-patterns.md` -- safe area + navigation interplay
- `references/accessibility/04-motor-interaction.md` -- 44pt touch target rule + WCAG citations
