# Color System

Apple's color system is semantic, not literal. You don't say "use blue" -- you say "use the accent color." This abstraction lets the system adapt automatically to dark mode, increased contrast, tinted mode, and user preferences.

iOS 27 added no semantic colors and no new `Material` thicknesses, and the HIG Color, Dark Mode and Materials pages carry no 2026 change-log entry. Every value below is current; a "new in iOS 27" semantic color is a hallucination. What *did* change is guidance on where to spend the accent color -- see Accent color.

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

### Brand color belongs in the content layer

Setting the accent once is necessary but not sufficient -- where you *spend* it is the craft decision, and the HIG is explicit: "Apply your app's accent color judiciously. Using your brand color too broadly can overwhelm your interface and dilute its impact. Minimize its use on controls and instead use it intentionally for primary actions or status indicators, like badges for unread content or an icon for the selected tab in a tab bar. To express your brand through color, consider moving it into the content layer, where it scrolls beneath Liquid Glass controls and gets picked up dynamically."

This follows from the two-layer glass model. The functional layer stays neutral so glass can sample and refract the content passing under it; a brand-tinted toolbar or tab bar gives it nothing to sample and reads as a skin over the system.

| Spend the accent on | Leave neutral |
|---|---|
| The one primary action on a screen | Toolbar and tab-bar backgrounds |
| The selected tab's symbol | Every button on the screen |
| Unread / status badges | Form controls and list chrome |
| Content-layer artwork, headers, chart series | Nav bars and sheets |

If you do color one of those elements, use a system color or an asset-catalog color with light, dark, and increased-contrast variants -- never a literal.

### Sidebar and menu icon color

Two HIG rules that catch a common iPad defect. Sidebars: "Make sure any sidebar icon colors you choose serve a clear purpose. By default, sidebar icons use your app's App accent colors... if you use them sparingly, fixed colors can help clarify the meaning of an icon or draw attention to it." A rainbow sidebar where every row gets its own hue for decoration is wrong; a fixed color reserved for meaning (Mail's yellow VIP) is right. On macOS, sidebar icons must respect a user-chosen system accent color rather than overriding it.

Menus: "Use menu item icons sparingly and with purpose... Apply a uniform visual treatment across menu items in the same group. For visual consistency and balance, provide icons for all menu items in a group, or none of them." All or none, per group, is a binary test that needs no judgement. The platform side of this -- iPadOS 27 and macOS 27 now hide most menu item symbol images by default -- is owned by `references/design/07-navigation-patterns.md#menu-item-icons-are-hidden-by-default-on-ipados-27`.

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

Users can apply a system-wide tint to UI elements from Settings (a Clear/Tinted toggle in iOS 26.1, a continuous slider in iOS 27). This is a Settings control, not an API -- there is no `EnvironmentValues` key for it. Liquid Glass elements adapt automatically with zero code. To tint glass yourself (independent of the user's system preference), use `Glass.tint(_:)` -- owned by `references/design/02-liquid-glass.md#tint-and-interactivity`.

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
