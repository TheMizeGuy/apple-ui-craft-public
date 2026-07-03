# Typography and Dynamic Type

Apple's typography system is engineered, not decorative. Every text style maps to a specific use, scales with Dynamic Type, and integrates with SF Symbols and the system layout grid.

## System text styles

These are the only text sizes you should use unless you have a specific reason. They all scale with Dynamic Type automatically.

| Style | Default size (pt) | Use case | Weight |
|---|---|---|---|
| `.largeTitle` | 34 | Top-level screen title (large title navigation bar) | Regular |
| `.title` | 28 | Section title within a screen | Regular |
| `.title2` | 22 | Sub-section title | Regular |
| `.title3` | 20 | Minor heading | Regular |
| `.headline` | 17 | Emphasized body, list row title | Semibold |
| `.body` | 17 | Default body text | Regular |
| `.callout` | 16 | Slightly de-emphasized body | Regular |
| `.subheadline` | 15 | Secondary text | Regular |
| `.footnote` | 13 | Tertiary text, metadata | Regular |
| `.caption` | 12 | Image captions, brief annotations | Regular |
| `.caption2` | 11 | Smallest text | Regular |

```swift
Text("Title")
    .font(.title)

Text("Body text")
    .font(.body)

Text("Caption")
    .font(.caption)
    .foregroundStyle(.secondary)
```

## Weight customization

System fonts support weight modifications without losing Dynamic Type scaling:

```swift
Text("Bold body")
    .font(.body)
    .fontWeight(.bold)        // .ultraLight, .thin, .light, .regular, .medium, .semibold, .bold, .heavy, .black

Text("Heavy headline")
    .font(.headline)
    .fontWeight(.heavy)
```

Modern shorthand:

```swift
Text("Bold")
    .bold()

Text("Italic")
    .italic()
```

## Width (iOS 16+)

```swift
Text("Compact")
    .font(.body)
    .fontWidth(.compressed)    // .compressed, .condensed, .standard, .expanded
```

## Design

```swift
Text("Code")
    .font(.system(.body, design: .monospaced))   // .default, .serif, .monospaced, .rounded
```

For monospaced numbers (essential for dashboards/timers):

```swift
Text("00:23:45")
    .font(.title)
    .monospacedDigit()  // Numbers don't shift width as they change
```

## Dynamic Type sizes

Users can adjust text size system-wide. There are 12 categories:

| Category | Identifier |
|---|---|
| Extra Small | `.xSmall` |
| Small | `.small` |
| Medium | `.medium` |
| Large (default) | `.large` |
| Extra Large | `.xLarge` |
| Extra Extra Large | `.xxLarge` |
| Extra Extra Extra Large | `.xxxLarge` |
| AX 1 | `.accessibility1` |
| AX 2 | `.accessibility2` |
| AX 3 | `.accessibility3` |
| AX 4 | `.accessibility4` |
| AX 5 | `.accessibility5` |

The 5 AX sizes can scale text up to ~312% of default (`.body` goes from 17pt to 53pt at AX5 -- 53/17 = 3.12x). Your layouts MUST survive these.

### Reading the current size

```swift
@Environment(\.dynamicTypeSize) var typeSize

if typeSize >= .accessibility1 {
    // Switch to vertical layout, increase touch targets, etc.
}
```

### Limiting text scaling

Sometimes you genuinely cannot let text scale (e.g., a design with a fixed-width status bar). Use `.dynamicTypeSize(_:)` to clamp:

```swift
Text("Always small")
    .font(.caption)
    .dynamicTypeSize(...DynamicTypeSize.large)  // Caps at .large

Text("Never tiny")
    .font(.body)
    .dynamicTypeSize(.medium...)  // Floor at .medium
```

**Use this sparingly.** Most users who enable AX5 do so because they need it. Clamping defeats accessibility.

## Custom fonts with Dynamic Type

Custom fonts can scale with Dynamic Type via `relativeTo:`:

```swift
Text("Brand text")
    .font(.custom("BrandFont-Bold", size: 17, relativeTo: .body))

// The font scales relative to .body's current size
// At AX5, "BrandFont-Bold" appears proportionally larger
```

| Wrong | Right |
|---|---|
| `.font(.custom("Brand", size: 17))` | `.font(.custom("Brand", size: 17, relativeTo: .body))` |
| `.font(.system(size: 17))` | `.font(.body)` |

## Custom dimensions that scale (@ScaledMetric)

For non-text dimensions that should scale with text size (icons in lists, custom button heights):

```swift
struct AlertRow: View {
    @ScaledMetric(relativeTo: .body) private var iconSize: CGFloat = 24
    
    var body: some View {
        HStack {
            Image(systemName: "bell.fill")
                .font(.system(size: iconSize))
            Text("Alert")
                .font(.body)
        }
    }
}
```

`@ScaledMetric` reads the current Dynamic Type size and scales the wrapped value accordingly.

## Layout adaptation strategies

When text grows, layouts must adapt. Three patterns:

### 1. Vertical reflow (most common)

Use `ViewThatFits` or check Dynamic Type size:

```swift
ViewThatFits(in: .horizontal) {
    HStack {
        Image(systemName: "star.fill")
        Text("Favorited at 12:34 PM on January 15")
    }
    
    VStack(alignment: .leading) {
        HStack {
            Image(systemName: "star.fill")
            Text("Favorited")
        }
        Text("12:34 PM on January 15")
    }
}
```

### 2. Truncation with disclosure

```swift
Text(longArticle.summary)
    .lineLimit(2)
    .truncationMode(.tail)
    // Tap to expand to full text
```

### 3. Scrollable container

If content genuinely doesn't fit:

```swift
ScrollView {
    VStack {
        Text(article.body)
            .font(.body)
    }
    .padding()
}
```

## Testing

Always test with:
- Default size (`.large`)
- Maximum standard size (`.xxxLarge`)
- AX1 (where layouts often first break)
- AX5 (worst case)

```swift
#Preview("AX5") {
    MyView()
        .dynamicTypeSize(.accessibility5)
}
```

## Common mistakes

| Mistake | Problem | Fix |
|---|---|---|
| `.font(.system(size: 17))` | Doesn't scale with Dynamic Type | Use `.font(.body)` |
| `.frame(height: 50)` for cells | Truncates at AX sizes | Use `.frame(minHeight: 50)` or remove fixed height |
| `lineLimit(1)` on user content | Truncates names, addresses, etc. | Allow wrapping, use truncation only for known-safe cases |
| Fixed icon sizes | Look tiny at AX5 next to giant text | Use `@ScaledMetric` |
| Custom font without `relativeTo:` | Doesn't scale with Dynamic Type | Add `relativeTo: .body` (or appropriate style) |
| Truncating navigation titles | Inline title becomes "..." at AX5 | Use `.toolbarTitleDisplayMode(.large)` and let it expand |
| Hardcoded VStack spacing | Cramped at AX5 | Use system spacing or scale with `@ScaledMetric` |
| `.font(.extraLargeTitle)` / `.extraLargeTitle2` on iOS | Doesn't exist on iOS -- `Font.TextStyle.extraLargeTitle`/`.extraLargeTitle2` are visionOS 1.0+ ONLY | Cap at `.largeTitle`; the iOS ramp is 11 styles, there is no 12th |

## See also

- `references/design/04-color-system.md` -- color hierarchy that pairs with text hierarchy
- `references/accessibility/02-dynamic-type-adaptation.md` -- accessibility deep dive
- `~/Claude/vault/iOS Development/06 - SwiftUI Fundamentals.md` -- Text and Font reference
