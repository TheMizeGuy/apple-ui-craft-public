# Dynamic Type Adaptation

Users can adjust text size system-wide. Your layouts must survive everything from xSmall to AX5 (310% of default). This isn't a "nice to have" -- many users genuinely need AX5 to read your app.

## The 12 sizes

| Category | Identifier | Use |
|---|---|---|
| xSmall | `.xSmall` | Smallest standard |
| Small | `.small` | |
| Medium | `.medium` | |
| Large | `.large` | DEFAULT |
| Extra Large | `.xLarge` | |
| Extra Extra Large | `.xxLarge` | |
| Extra Extra Extra Large | `.xxxLarge` | Largest standard |
| AX 1 | `.accessibility1` | Accessibility tier begins |
| AX 2 | `.accessibility2` | |
| AX 3 | `.accessibility3` | |
| AX 4 | `.accessibility4` | |
| AX 5 | `.accessibility5` | Largest -- 310% scale |

Standard sizes (`xSmall` through `xxxLarge`) typically don't break layouts. AX1-AX5 are where most layouts fail.

## Reading current size

```swift
@Environment(\.dynamicTypeSize) var typeSize

if typeSize >= .accessibility1 {
    // Switch to vertical layout, increase touch targets
}
```

## Using system styles

```swift
Text("Title").font(.title)
Text("Body").font(.body)
Text("Caption").font(.caption)
```

These scale automatically. Hardcoded sizes (`.font(.system(size: 17))`) do NOT scale.

## Custom fonts that scale

```swift
Text("Brand")
    .font(.custom("BrandFont-Bold", size: 17, relativeTo: .body))
```

The `relativeTo:` parameter ties the custom font to a system style; it scales when that style scales.

## Custom dimensions that scale (@ScaledMetric)

For non-text values (icon sizes, button heights, padding):

```swift
struct AlertRow: View {
    @ScaledMetric(relativeTo: .body) private var iconSize: CGFloat = 24
    @ScaledMetric(relativeTo: .body) private var rowHeight: CGFloat = 60
    
    var body: some View {
        HStack {
            Image(systemName: "bell.fill")
                .font(.system(size: iconSize))
            Text("Alert")
                .font(.body)
            Spacer()
        }
        .frame(minHeight: rowHeight)
    }
}
```

`@ScaledMetric` reads the current Dynamic Type size and scales the wrapped value accordingly.

## Layout strategies

When text grows, layouts must adapt. Three patterns:

### 1. Vertical reflow (most common)

```swift
@Environment(\.dynamicTypeSize) var typeSize

var body: some View {
    if typeSize >= .accessibility1 {
        VStack(alignment: .leading) {
            Image(systemName: "star.fill")
            Text("Favorited at 12:34 PM on January 15, 2026")
        }
    } else {
        HStack {
            Image(systemName: "star.fill")
            Text("Favorited at 12:34 PM on January 15, 2026")
        }
    }
}
```

Or with `ViewThatFits`:

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
```

Then offer a "Read more" affordance.

### 3. Scrollable container

If content genuinely doesn't fit at AX5:

```swift
ScrollView {
    VStack(alignment: .leading) {
        Text(article.body)
            .font(.body)
    }
    .padding()
}
```

## Common layout breakers

| Issue | Symptom | Fix |
|---|---|---|
| Fixed-height cell | Content truncated at AX sizes | Remove fixed height OR use `.frame(minHeight:)` |
| `lineLimit(1)` on user content | Names truncated | Allow wrapping |
| Hardcoded VStack spacing | Cramped at AX5 | Use system spacing or `@ScaledMetric` |
| Fixed icon size | Tiny next to giant text | `@ScaledMetric` |
| Forced single line | Cuts off content | `.lineLimit(nil)` or default |
| Hardcoded font sizes | Don't scale | Use `.font(.body)` etc. |
| Custom font without `relativeTo:` | Doesn't scale | Add `relativeTo: .body` |
| HStack at AX5 | Items overflow horizontally | Switch to VStack at AX |
| Inline navigation title at AX5 | Becomes "..." | Use `.toolbarTitleDisplayMode(.large)` |

## Limiting Dynamic Type (use sparingly)

Sometimes you genuinely cannot let text scale (e.g., a fixed-width status badge):

```swift
Text("BETA")
    .font(.caption)
    .dynamicTypeSize(...DynamicTypeSize.large)  // Caps at .large
```

Or set a floor:

```swift
Text("Body")
    .font(.body)
    .dynamicTypeSize(.medium...)  // Floor at .medium
```

**Use this rarely.** Users who enable AX5 do so because they need it. Clamping defeats accessibility. Only clamp:
- Brand badges where size is part of identity
- Numeric readouts in tight grids (e.g., calculator)
- Status indicators where size has fixed meaning

## Large Content Viewer

For fixed-size elements that genuinely can't scale (toolbar buttons, tab bar items), enable Large Content Viewer:

```swift
Image(systemName: "house")
    .accessibilityShowsLargeContentViewer()

// With custom content:
Image(systemName: "house")
    .accessibilityShowsLargeContentViewer {
        Label("Home", systemImage: "house")
    }
```

When user long-presses with VoiceOver enabled (or via Accessibility Settings), a large preview pops up. Essential for tab bars, toolbar buttons, and other fixed-size UI.

## Testing

Always test these sizes:

| Size | Why |
|---|---|
| `.large` (default) | Baseline |
| `.xxxLarge` | Largest standard size |
| `.accessibility1` | Where many layouts first break |
| `.accessibility5` | Worst case |

```swift
#Preview("Default") {
    MyView()
}

#Preview("AX1") {
    MyView().dynamicTypeSize(.accessibility1)
}

#Preview("AX5") {
    MyView().dynamicTypeSize(.accessibility5)
}
```

In simulator: Settings > Developer > Dynamic Type Sizes > select AX5, then test the app.

## Behavior at AX sizes

| What happens | Recommended response |
|---|---|
| Text grows up to ~310% | System handles -- use system styles |
| HStack items overflow | Switch to VStack (size class branch) |
| Touch targets feel cramped | Use `@ScaledMetric` for padding |
| Inline navigation title truncates | Use `.large` display mode |
| Sticky headers cover focus | Test with Switch Control / Voice Control |
| Tab bar labels truncate | Use Large Content Viewer |

## Common mistakes

| Mistake | Problem | Fix |
|---|---|---|
| `.font(.system(size: 17))` | Doesn't scale | `.font(.body)` |
| `.frame(height: 50)` for cells | Truncates at AX | `.frame(minHeight: 50)` or remove |
| `lineLimit(1)` on names | Truncates user data | Allow wrapping |
| Custom font without `relativeTo:` | Doesn't scale | Add `relativeTo:` |
| Fixed icon sizes | Look tiny at AX5 | `@ScaledMetric` |
| HStack everywhere | Overflows at AX5 | Branch to VStack at AX |
| Truncating nav title | "..." at AX5 | `.toolbarTitleDisplayMode(.large)` |
| Hardcoded VStack spacing | Cramped at AX5 | System spacing or `@ScaledMetric` |
| Not testing AX sizes | Layout breaks discovered in production | Add AX previews |
| Clamping Dynamic Type to avoid layout work | Defeats accessibility | Fix the layout |

## See also

- `01-voiceover-fundamentals.md` -- text labels also scale
- `03-visual-accessibility.md` -- contrast and other visual settings
- `design/03-typography-dynamic-type.md` -- typography reference
