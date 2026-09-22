# Dynamic Type Adaptation

Users can adjust text size system-wide. Your layouts must survive everything from xSmall to AX5 (~312% of default -- body text grows from 17pt to 53pt). This isn't a "nice to have" -- many users genuinely need AX5 to read your app.

## The 12 sizes

| Category | Identifier | Scale factor (vs. `.large`) | Use |
|---|---|---|---|
| xSmall | `.xSmall` | ~0.82x | Smallest standard |
| Small | `.small` | ~0.88x | |
| Medium | `.medium` | ~0.94x | |
| Large | `.large` | 1.0x | DEFAULT |
| Extra Large | `.xLarge` | ~1.12x | |
| Extra Extra Large | `.xxLarge` | ~1.23x | |
| Extra Extra Extra Large | `.xxxLarge` | ~1.35x | Largest standard |
| AX 1 | `.accessibility1` | ~1.64x | Accessibility tier begins |
| AX 2 | `.accessibility2` | ~1.94x | |
| AX 3 | `.accessibility3` | ~2.35x | |
| AX 4 | `.accessibility4` | ~2.76x | |
| AX 5 | `.accessibility5` | ~3.12x | Largest -- body 17pt -> 53pt |

Scale factors are computed from the `.body` text style's point ramp (14/15/16/17/19/21/23/28/33/40/47/53pt) relative to `.large`. Other text styles (e.g. `.largeTitle`) scale by different absolute point amounts but the same relative curve. Standard sizes (`xSmall` through `xxxLarge`) typically don't break layouts. AX1-AX5 are where most layouts fail.

## Reading current size

```swift
@Environment(\.dynamicTypeSize) var typeSize

if typeSize >= .accessibility1 {
    // Switch to vertical layout, increase touch targets
}
```

`DynamicTypeSize` (iOS 15+) is the only spelling to write. SwiftUI's `ContentSizeCategory` -- the whole enum, every `accessibility*` case, and `isAccessibilityCategory` -- is soft-deprecated: Apple's documentation marks it deprecated and says to use `DynamicTypeSize` instead, with no compiler break today. The mechanical map is `@Environment(\.sizeCategory)` -> `@Environment(\.dynamicTypeSize)`, `ContentSizeCategory.isAccessibilityCategory` -> `dynamicTypeSize.isAccessibilitySize`, and `.environment(\.sizeCategory, .accessibilityExtraExtraExtraLarge)` -> `.dynamicTypeSize(.accessibility5)`. With an iOS 15 floor there is no deployment-target reason left to use the old type. UIKit's `UIContentSizeCategory` is a different type and is NOT deprecated -- `traitCollection.preferredContentSizeCategory.isAccessibilityCategory` stays current in UIKit code.

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

## Dynamic Type on tvOS (tvOS 27)

tvOS 27 adds a system-wide text size control -- Settings > Accessibility > Display > Text Size, from Large through Accessibility XXXL -- and it behaves exactly as it does on iOS. A tvOS target is no longer exempt from the Dynamic Type audit.

Nothing new to call: standard SwiftUI and UIKit components scale automatically, and the adaptation patterns above are the same ones a shelf or card layout needs on Apple TV. The failures are the same too, and they are worse on a 10-foot display: hard-coded `.font(.system(size:))`, fixed-height cards, and a column count that never drops.

```swift
@Environment(\.dynamicTypeSize) private var typeSize

// Same switch as iPhone -- the shelf reflows instead of clipping the titles.
var body: some View {
    let shelf = typeSize.isAccessibilitySize
        ? AnyLayout(VStackLayout(alignment: .leading, spacing: 24))
        : AnyLayout(HStackLayout(spacing: 40))

    shelf { ForEach(shows) { ShowCard(show: $0) } }
}
```

This also unlocks a claim a TV app could not previously make: App Store Connect's Larger Text criteria now carry a tvOS clause, satisfied by supporting the largest Dynamic Type size or an equivalent size through your own implementation.

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
| Inline navigation title at AX5 | Becomes "..." | Shorten the title, or carry the long form as a heading in the content; never `.large` past the root -- it breaks the depth cue (`references/usability/03-navigation-and-information-architecture.md`) |

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

When a user running an accessibility text size touches and holds the control, a large preview pops up -- VoiceOver is not the trigger, and the population served is large-text users who do not run it (`references/accessibility/07-cognitive-hearing-assistive.md` owns the assistive-technology contract). Essential for tab bars, toolbar buttons, and other fixed-size UI.

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

### The Larger Text claim

Apple's Accessibility Nutrition Label criteria put a number on this: Larger Text may be claimed only if text enlarges to **at least 200%** of the default size (or the system maximum) and users can still complete every common task -- primary functionality, first launch, login, purchase, settings. Relying on Zoom or Hover Text to satisfy it is explicitly forbidden, and so is clamping the app below the accessibility sizes and calling the result supported. Larger Text is claimable on iPhone, iPad, Apple TV (tvOS 27+), Apple Watch and Apple Vision Pro, but not on Mac. The full label contract: `references/accessibility/08-wcag-2-2-mapping.md#app-store-accessibility-nutrition-labels`.

## Behavior at AX sizes

| What happens | Recommended response |
|---|---|
| Text grows up to ~310% | System handles -- use system styles |
| HStack items overflow | Switch to VStack (size class branch) |
| Touch targets feel cramped | Use `@ScaledMetric` for padding |
| Inline navigation title truncates | Shorter title, or the long form as an in-content heading; `.large` only on a root |
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
| Truncating nav title | "..." at AX5 | Shorter title or an in-content heading; `.large` only on a root |
| Hardcoded VStack spacing | Cramped at AX5 | System spacing or `@ScaledMetric` |
| Not testing AX sizes | Layout breaks discovered in production | Add AX previews |
| Clamping Dynamic Type to avoid layout work | Defeats accessibility | Fix the layout |
| `ContentSizeCategory` / `\.sizeCategory` / `isAccessibilityCategory` in SwiftUI | Soft-deprecated in favor of `DynamicTypeSize` | `\.dynamicTypeSize`, `isAccessibilitySize` (UIKit's `UIContentSizeCategory` is unaffected) |
| Treating a tvOS target as exempt from Dynamic Type | tvOS 27 has system-wide Larger Text; fixed sizes clip | Same `AnyLayout` / column-count adaptation as iPhone |

## See also

- `references/accessibility/01-voiceover-fundamentals.md` -- text labels also scale
- `references/accessibility/03-visual-accessibility.md#reduce-motion` -- contrast and other visual settings
- `references/accessibility/08-wcag-2-2-mapping.md#app-store-accessibility-nutrition-labels` -- the Larger Text claim criteria
- `references/design/03-typography-dynamic-type.md` -- typography reference
