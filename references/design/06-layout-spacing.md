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
| `HStack(alignment: .left)` | `HStack(alignment: .leading)` |
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
.background(.background.secondary, in: .rect(cornerRadius: 16))
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
| `.frame(width: UIScreen.main.bounds.width)` | Doesn't adapt to iPad/Mac/Vision | Use `.containerRelativeFrame()` |

## See also

- `references/design/07-navigation-patterns.md` -- safe area + navigation interplay
- `references/accessibility/04-motor-interaction.md` -- 44pt touch target rule + WCAG citations
- `~/Claude/vault/iOS Development/06 - SwiftUI Fundamentals.md#layout`
- `~/Claude/vault/iOS Development/75 - SwiftUI on iPad and Adaptive Layout.md`
