# Color System

Apple's color system is semantic, not literal. You don't say "use blue" -- you say "use the accent color." This abstraction lets the system adapt automatically to dark mode, increased contrast, tinted mode, and user preferences.

## Semantic text colors

| Color | Use case | Example |
|---|---|---|
| `.primary` | Primary text, headings | Body text in articles |
| `.secondary` | Supporting text | Subtitles, captions |
| `.tertiary` | De-emphasized text | Helper text, timestamps |
| `.quaternary` | Most de-emphasized | Disabled placeholders |

```swift
Text("Title").foregroundStyle(.primary)
Text("Subtitle").foregroundStyle(.secondary)
Text("Date").foregroundStyle(.tertiary)
```

These automatically adapt for:
- Light vs dark mode
- Increased contrast (Settings > Accessibility > Increase Contrast)
- High-contrast appearance variants

## Semantic background colors

| Color | Use case |
|---|---|
| `.systemBackground` | Default screen background |
| `.secondarySystemBackground` | Grouped table cells, cards |
| `.tertiarySystemBackground` | Nested cards within secondary |
| `.systemGroupedBackground` | Grouped table view background |
| `.secondarySystemGroupedBackground` | Cells within grouped tables |
| `.tertiarySystemGroupedBackground` | Nested elements within cells |

In SwiftUI:

```swift
List { ... }
    .scrollContentBackground(.hidden)
    .background(Color(.systemGroupedBackground))

VStack { ... }
    .background(Color(.secondarySystemBackground))
```

For modern SwiftUI (iOS 16+), `.background(.background.secondary)` is available, but it is NOT equivalent to `secondarySystemBackground` -- `BackgroundStyle.secondary` is a hierarchical DIM of the ambient window background, not a calibrated elevation step. For the actual base-vs-grouped elevation ladder, use the `Color(.secondarySystemBackground)` family above:

```swift
Card { ... }
    .background(Color(.secondarySystemBackground), in: .rect(cornerRadius: 16))
```

## Fill colors (for shapes)

| Color | Use case |
|---|---|
| `.fill` | Default shape fill |
| `.fill.secondary` | Less prominent shape |
| `.fill.tertiary` | Most de-emphasized |
| `.fill.quaternary` | Disabled state |

```swift
Circle()
    .fill(.fill.tertiary)

RoundedRectangle(cornerRadius: 8)
    .fill(.regularMaterial)
```

## Accent color

The app's primary brand color. Set ONCE in the asset catalog (`AccentColor` asset), used throughout via `.tint()`:

```swift
ContentView()
    .tint(.accentColor)  // App-wide

Button("Save") { }
    .tint(.green)  // Override for specific button
```

| Where it appears | Behavior |
|---|---|
| Buttons | Tint color |
| Active tab | Tab item icon + label |
| Selected toggle | Switch fill |
| Active links | Underline + color |
| Selected pickers | Highlight |
| Edit cursors | Cursor + selection |

**Important:** Define `AccentColor` in the asset catalog with a dark variant. Hardcoded `Color.blue` doesn't adapt.

## Standard colors (use sparingly)

When you need a specific named color (alert states, status indicators), use system colors that adapt:

```swift
Text("Error").foregroundStyle(.red)        // Adapts to dark mode
Text("Success").foregroundStyle(.green)
Text("Warning").foregroundStyle(.orange)
Image(systemName: "info.circle").foregroundStyle(.blue)
```

System colors:
| `.red` | `.orange` | `.yellow` | `.green` | `.mint` | `.teal` | `.cyan` |
| `.blue` | `.indigo` | `.purple` | `.pink` | `.brown` | `.gray` |

These colors are not raw RGB values -- they adapt to:
- Light/dark mode (slightly different shades)
- Increased contrast
- Color filters

**`Color.black` and `Color.white` are the exception -- they are fixed literals, not semantic colors.** They do NOT adapt to dark mode or any accessibility setting (this is why `.foregroundColor(.black)`/`.foregroundStyle(.black)` goes invisible against a dark background above). Use `.primary`/`.secondary` or an asset-catalog color instead of `.black`/`.white` for anything that must remain legible across appearances.

## Custom colors via asset catalog

For brand colors that need specific values:

1. Create a Color Set in `Assets.xcassets`
2. Set "Any Appearance" and "Dark" variants
3. Optionally set "High Contrast" variants
4. Reference via `Color("BrandPrimary")`

```swift
Text("Brand")
    .foregroundStyle(Color("BrandPrimary"))
```

| Wrong | Right |
|---|---|
| `Color(red: 0.2, green: 0.4, blue: 0.8)` | `Color("BrandPrimary")` from asset catalog |
| `Color(hex: "3366FF")` | `Color("BrandPrimary")` |

Hardcoded color literals do NOT adapt to dark mode.

## Materials (for blur backgrounds)

When you need a translucent material background (pre-Liquid Glass, or as Liquid Glass fallback):

| Material | Translucency |
|---|---|
| `.ultraThinMaterial` | Most transparent |
| `.thinMaterial` | More transparent |
| `.regularMaterial` | Default |
| `.thickMaterial` | Less transparent |
| `.ultraThickMaterial` | Most opaque (still translucent) |

```swift
Text("Floating")
    .padding()
    .background(.regularMaterial, in: .rect(cornerRadius: 12))
```

For iOS 26+, prefer `.glassEffect()` (see `references/design/02-liquid-glass.md`).

## Gradients

Modern SwiftUI provides automatic gradients on system colors:

```swift
Rectangle()
    .fill(.blue.gradient)  // Subtle gradient from .blue to slightly darker

Circle()
    .fill(.purple.gradient)
```

For custom gradients:

```swift
LinearGradient(colors: [.blue, .purple], startPoint: .leading, endPoint: .trailing)

RadialGradient(colors: [.yellow, .orange, .red], center: .center, startRadius: 0, endRadius: 100)
```

**Don't overuse gradients.** Apple's design philosophy favors flat color with subtle depth, not heavy gradients. Use `.blue.gradient` (system-provided subtle gradient) over custom multi-stop gradients.

## Color and accessibility

### Color is never the sole indicator

If color conveys meaning, pair it with text or an icon:

```swift
// VIOLATES accessibility: color alone
HStack {
    Circle().fill(.red).frame(width: 8, height: 8)  // Status indicator
    Text("Server")
}

// COMPLIANT: color + icon + text
HStack {
    Image(systemName: "exclamationmark.circle.fill")
        .foregroundStyle(.red)
    Text("Server offline")
        .accessibilityLabel("Server offline")
}
```

### Contrast minimums

| Use case | Minimum contrast | WCAG criterion |
|---|---|---|
| Normal text | 4.5:1 | 1.4.3 AA |
| Large text (18pt+ or 14pt+ bold) | 3:1 | 1.4.3 AA |
| UI components and graphics | 3:1 | 1.4.11 AA |

Test with the system Accessibility Inspector or third-party tools (Color Contrast Analyzer).

### Increased Contrast adaptation

System semantic colors automatically strengthen when Increased Contrast is enabled. Custom colors don't -- you must provide a "High Contrast" variant in the asset catalog.

```swift
// Test in code
@Environment(\.colorSchemeContrast) var contrast

if contrast == .increased {
    // Use stronger borders, fills
}
```

## Tinted Mode (iOS 26.1+)

Users can apply a system-wide tint to UI elements via Settings > Display & Brightness > Liquid Glass. This is a Settings toggle, not an API -- there is no `EnvironmentValues` key for it. Liquid Glass elements adapt automatically with zero code. To tint glass yourself (independent of the user's system preference), use `Glass.tint(_:)` -- owned by `references/design/02-liquid-glass.md#tint-and-interactivity`.

## Common mistakes

| Mistake | Problem | Fix |
|---|---|---|
| `Color(red:green:blue:)` for brand colors | Doesn't adapt to dark mode | Use asset catalog with dark variant |
| `.foregroundColor(.black)` | Deprecated; also invisible in dark mode | Use `.foregroundStyle(.primary)` |
| `.background(.white)` | Inverted in dark mode | Use `.background(.background)` or system background |
| Color alone for meaning | Inaccessible to colorblind users | Pair with icon and text |
| Custom color without high contrast variant | Invisible at Increased Contrast | Add high contrast asset variant |
| Heavy gradients | Looks dated, unlike Apple | Use subtle `.color.gradient` or solid colors |
| `.tint(Color(hex: ...))` | No system adaptation | Use semantic or system colors |

## See also

- `references/design/02-liquid-glass.md#tint-and-interactivity` -- `Glass.tint(_:)` contract; materials evolved into Liquid Glass
- `references/design/03-typography-dynamic-type.md` -- text colors pair with typography
- `references/accessibility/03-visual-accessibility.md` -- contrast, color, Smart Invert
- `~/Claude/vault/iOS Development/09 - Human Interface Guidelines.md#color`
