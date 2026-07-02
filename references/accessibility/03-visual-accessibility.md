# Visual Accessibility

Beyond text size, users have other visual needs: high contrast, reduced motion, reduced transparency, color filters, smart invert. Your app must respect every one.

## Color contrast

WCAG 2.1 AA requires:

| Use case | Minimum contrast |
|---|---|
| Normal text (< 18pt or < 14pt bold) | 4.5:1 |
| Large text (18pt+ or 14pt+ bold) | 3:1 |
| UI components (buttons, form fields, icons) | 3:1 |
| Graphical objects (charts, icons) | 3:1 |

### Measuring contrast

- **Accessibility Inspector** (Xcode > Open Developer Tool > Accessibility Inspector) -- run audit on your app
- **Color Contrast Analyzer** (Mac app, free)
- **Stark** (Figma plugin) -- check designs before code

### Semantic colors handle most cases

System semantic colors (`.primary`, `.secondary`, etc.) automatically adjust contrast for:
- Light vs dark mode
- Increased contrast (Settings > Accessibility > Increase Contrast)

```swift
Text("Body")
    .foregroundStyle(.primary)        // Adapts to maintain contrast
    .background(Color(.systemBackground))
```

For custom colors, provide:
- A standard variant
- A dark mode variant
- A high contrast variant

In Asset Catalog: Color Set > Appearances: Any, Dark + Increased Contrast, Increased Contrast Dark.

## Color is never the only indicator

If color conveys meaning, pair it with text or icon:

```swift
// VIOLATES: color alone
HStack {
    Circle().fill(.green).frame(width: 8, height: 8)
    Text("Server")
}

// COMPLIANT: color + text + icon
HStack {
    Image(systemName: "checkmark.circle.fill")
        .foregroundStyle(.green)
    Text("Server online")
}

// For colorblind users:
HStack {
    Label("Online", systemImage: "checkmark.circle.fill")
        .foregroundStyle(.green)
}
```

### Common color-only failures

| Issue | Fix |
|---|---|
| Red status dot for "error" | Add icon (`xmark.circle.fill`) and text |
| Blue underline for link | Bold the text or add icon |
| Green / yellow / red traffic light | Add labels (Pass/Warning/Fail) |
| Color-coded categories | Add label or shape (square/circle/triangle) |
| Color-coded chart | Add patterns or labels per series |

## Reduce Motion

Users with vestibular disorders can be made nauseous by motion. iOS has a system setting for Reduce Motion.

```swift
@Environment(\.accessibilityReduceMotion) var reduceMotion

var body: some View {
    Image(systemName: "star.fill")
        .scaleEffect(animate ? 1.5 : 1.0)
        .animation(
            reduceMotion ? nil : .spring(duration: 0.4, bounce: 0.3),
            value: animate
        )
}
```

### What to do when Reduce Motion is on

| Default behavior | Reduce Motion fallback |
|---|---|
| Slide / push transition | Crossfade (`.opacity`) |
| Scale / bounce animation | Instant or shorter duration |
| Parallax scroll effect | No parallax |
| Hero matchedGeometry transition | Crossfade |
| Spring physics | None or minimal |
| Auto-play video / animation | Don't auto-play |
| Particle effects | Disable |
| Decorative looping animation | Disable |

```swift
// Conditional transition
.transition(reduceMotion ? .opacity : .slide.combined(with: .opacity))

// Conditional animation
withAnimation(reduceMotion ? nil : .spring(duration: 0.4)) {
    showDetail = true
}

// Conditional video autoplay
.onAppear {
    if !reduceMotion {
        player.play()
    }
}
```

### What system features auto-respect Reduce Motion

| System | Behavior |
|---|---|
| Liquid Glass | No specular animation |
| `.symbolEffect(.bounce)` | Reduced or none |
| Sheet presentation | System uses cross-fade variant |
| Navigation push | System uses cross-fade variant |

You don't need to handle these manually.

## Reduce Transparency

Users can disable translucent backgrounds. iOS has a system setting for Reduce Transparency.

```swift
@Environment(\.accessibilityReduceTransparency) var reduceTransparency

Text("Floating")
    .padding()
    .background {
        if reduceTransparency {
            Color(.systemBackground)
        } else {
            .ultraThinMaterial
        }
    }
```

### What auto-respects Reduce Transparency

| System | Behavior |
|---|---|
| Liquid Glass (`.glassEffect()`) | Becomes opaque |
| Material backgrounds (`.ultraThinMaterial` etc.) | Becomes opaque |

You don't need to handle these manually.

### Custom translucency

If you have custom translucent UI (e.g., custom blur views), check `accessibilityReduceTransparency` and provide an opaque alternative.

## Increased Contrast

Users with low vision can enable Increased Contrast (Settings > Accessibility > Display & Text Size > Increase Contrast).

System semantic colors strengthen automatically. Custom colors don't unless you provide a high contrast variant.

```swift
@Environment(\.colorSchemeContrast) var contrast

if contrast == .increased {
    // Use stronger borders, fills
    Rectangle()
        .strokeBorder(.primary, lineWidth: 2)
} else {
    Rectangle()
        .strokeBorder(.secondary, lineWidth: 1)
}
```

### What to strengthen at high contrast

| Default | Increased Contrast |
|---|---|
| 1pt borders | 2pt borders |
| Subtle backgrounds | Solid contrasting backgrounds |
| Light gray dividers | Dark dividers |
| `.tertiary` text | `.primary` text |
| Disabled state via 50% opacity | Disabled state via different color |

## Smart Invert

Users with light sensitivity can enable Smart Invert -- inverts colors EXCEPT for images, media, and elements explicitly excluded.

For user content (photos, videos, maps, charts), exclude from inversion:

```swift
Image("user-photo")
    .accessibilityIgnoresInvertColors()

VideoPlayer(player: player)
    .accessibilityIgnoresInvertColors()

MapView()
    .accessibilityIgnoresInvertColors()
```

Without this, photos look wrong (negatives), maps look inverted, etc.

## Color filters

Users can enable system-wide color filters (Settings > Accessibility > Display & Text Size > Color Filters):
- Greyscale
- Red/Green Filter (Protanopia)
- Green/Red Filter (Deuteranopia)
- Blue/Yellow Filter (Tritanopia)
- Color Tint

Your app doesn't need to handle these explicitly -- system semantic colors adapt. But test with each filter to ensure your UI remains usable.

## Differentiate Without Color (system setting)

Users can enable Differentiate Without Color (Settings > Accessibility > Display & Text Size).

When enabled:
```swift
@Environment(\.accessibilityDifferentiateWithoutColor) var differentiateWithoutColor

if differentiateWithoutColor {
    // Show shapes, icons, or labels in addition to color
    HStack {
        Image(systemName: "checkmark.circle.fill")  // Add icon
        Text("Online")
    }
} else {
    Text("Online")
}
```

## Bold Text (system setting)

Users can enable Bold Text. System fonts respect this automatically. Custom fonts may not.

If you use custom fonts:

```swift
@Environment(\.legibilityWeight) var legibilityWeight

Text("Brand")
    .font(.custom(legibilityWeight == .bold ? "BrandFont-Bold" : "BrandFont-Regular", size: 17, relativeTo: .body))
```

## Testing visual accessibility

Settings > Accessibility > Display & Text Size:
- Enable Increase Contrast
- Enable Reduce Transparency
- Enable Reduce Motion
- Enable Smart Invert
- Enable Differentiate Without Color
- Enable Bold Text
- Try each color filter

Test your app with each. Many real users have multiple of these enabled.

## Common mistakes

| Mistake | Problem | Fix |
|---|---|---|
| Color alone for status | Inaccessible to colorblind users | Pair with icon and text |
| Hardcoded brand colors without high contrast variant | Invisible at Increased Contrast | Add high contrast asset |
| Missing Reduce Motion check | Vestibular nausea, accessibility violation | Always check `accessibilityReduceMotion` |
| Custom blur without Reduce Transparency check | Defeats system setting | Provide opaque alternative |
| Photos invert under Smart Invert | Look wrong (negative) | `.accessibilityIgnoresInvertColors()` |
| Custom font ignores Bold Text | Less legible | Check `legibilityWeight` |
| Light gray text on white | Below 4.5:1 contrast | Use `.secondary` or darker |
| Custom translucent UI without fallback | Breaks Reduce Transparency | Conditional opaque background |

## See also

- `01-voiceover-fundamentals.md` -- text labels for screen readers
- `02-dynamic-type-adaptation.md` -- text scaling
- `04-motor-interaction.md` -- physical/motor accessibility
- `design/04-color-system.md` -- semantic colors auto-adapt
- `~/Claude/vault/iOS Development/10 - Accessibility.md`
