# SF Symbols

5,000+ icons designed by Apple to integrate visually with the system font (SF Pro). Free to use in any iOS/iPadOS/macOS/watchOS/tvOS/visionOS app.

## Why SF Symbols

| Property | Benefit |
|---|---|
| Designed alongside SF Pro | Visual harmony with system text |
| 9 weights, 3 scales | Match surrounding text weight automatically |
| Variable color values | Communicate state (battery 25%, wifi signal strength) |
| Symbol effects (iOS 17+) | Bounce, pulse, replace, variableColor for state changes |
| Hierarchical/multicolor/palette rendering | Express emphasis or brand color |
| Localized variants | Right-to-left mirrored automatically |
| Updated yearly | New symbols every iOS release |

## Basic usage

```swift
Image(systemName: "heart.fill")
Image(systemName: "house")
Image(systemName: "magnifyingglass")
Image(systemName: "person.crop.circle")
```

## Sizing

Symbols inherit from surrounding text font:

```swift
Label("Home", systemImage: "house")
    .font(.body)        // Symbol matches body text size

Image(systemName: "star.fill")
    .font(.title)       // Symbol matches title size

Image(systemName: "bolt")
    .font(.system(size: 24))  // Explicit size
```

For non-text contexts (toolbar buttons), use system images directly:

```swift
Button {
    save()
} label: {
    Image(systemName: "checkmark")
}
```

## Weight

```swift
Image(systemName: "heart.fill")
    .fontWeight(.bold)       // .ultraLight through .black
```

Match weight to surrounding text. A bold heading next to a thin icon looks wrong.

## Rendering modes

Four rendering modes provide different visual treatments:

### `.monochrome` (default)

Single color. The icon adopts the foreground style.

```swift
Image(systemName: "heart.fill")
    .symbolRenderingMode(.monochrome)
    .foregroundStyle(.red)
```

Use for: toolbars, navigation, list rows, anywhere icons should be visually quiet.

### `.hierarchical`

Single color with multiple opacity levels. Provides automatic emphasis hierarchy.

```swift
Image(systemName: "exclamationmark.triangle.fill")
    .symbolRenderingMode(.hierarchical)
    .foregroundStyle(.orange)
```

Use for: warning/error indicators, emphasized status, when you want depth without using multiple colors.

### `.multicolor`

Apple's designed color palette for the icon. Each symbol has a defined palette.

```swift
Image(systemName: "heart.fill")
    .symbolRenderingMode(.multicolor)
    // Apple's chosen colors for "heart.fill"

Image(systemName: "thermometer.sun.fill")
    .symbolRenderingMode(.multicolor)
    // Sun is yellow, thermometer is red, etc.
```

Use for: emotional/status icons (weather, health, achievements) where Apple's color choice serves communication.

### `.palette`

You provide multiple foreground styles, one per layer.

```swift
Image(systemName: "person.fill.checkmark")
    .symbolRenderingMode(.palette)
    .foregroundStyle(.blue, .green)  // Person blue, checkmark green
```

Use for: brand-tinted icons, status communication with custom colors.

## Variable values (iOS 16+)

Some symbols accept a 0.0-1.0 value that changes their appearance:

```swift
@State private var batteryLevel = 0.6

Image(systemName: "battery.100", variableValue: batteryLevel)
    // Animates as batteryLevel changes
```

Common variable-value symbols:
- `battery.100` (level)
- `wifi` (signal strength)
- `cellularbars` (signal bars)
- `speaker.wave.3` (volume)
- `chart.bar.fill` (data level)

## Symbol effects (iOS 17+)

Animate symbols with built-in, symbol-aware effects:

```swift
Image(systemName: "bell.fill")
    .symbolEffect(.bounce, value: notificationCount)

Image(systemName: "wifi")
    .symbolEffect(.variableColor.iterative)

Image(systemName: "heart.fill")
    .symbolEffect(.pulse)

// State-based
Image(systemName: "checkmark.circle.fill")
    .symbolEffect(.appear, isActive: isComplete)

// Replace transition between two symbols
Image(systemName: isPlaying ? "pause.fill" : "play.fill")
    .contentTransition(.symbolEffect(.replace))
```

| Effect | iOS | Use |
|---|---|---|
| `.bounce` | 17+ | Notification, achievement |
| `.pulse` | 17+ | Active/listening state |
| `.variableColor` | 17+ | Loading, signal |
| `.scale` | 17+ | Selection, emphasis |
| `.appear/.disappear` | 17+ | State transitions |
| `.replace` | 17+ | Symbol swap (play/pause) |
| `.wiggle` | 18+ | Attention (alert, error) |
| `.breathe` | 18+ | Ongoing activity |
| `.rotate` | 18+ | Loading, refresh |

## Choosing the right symbol

| Common need | Symbol |
|---|---|
| Add | `plus`, `plus.circle`, `plus.circle.fill` |
| Edit | `pencil`, `square.and.pencil`, `pencil.circle` |
| Delete | `trash`, `trash.fill`, `xmark.circle.fill` |
| Share | `square.and.arrow.up` |
| Settings | `gearshape`, `gear` (avoid; use gearshape) |
| Profile | `person.crop.circle`, `person.circle.fill` |
| Search | `magnifyingglass` |
| Back | `chevron.backward` (NOT `arrow.left` -- breaks RTL) |
| More | `ellipsis`, `ellipsis.circle` |
| Favorite | `heart`, `heart.fill`, `star`, `star.fill` |
| Bookmark | `bookmark`, `bookmark.fill` |
| Filter | `line.3.horizontal.decrease.circle` |
| Sort | `arrow.up.arrow.down` |
| Done | `checkmark`, `checkmark.circle.fill` |
| Cancel | `xmark`, `xmark.circle.fill` |
| Info | `info.circle`, `info.circle.fill` |
| Warning | `exclamationmark.triangle.fill` |
| Error | `xmark.octagon.fill` |
| Calendar | `calendar` |
| Time | `clock`, `clock.fill` |
| Location | `location`, `location.fill`, `mappin.and.ellipse` |
| Camera | `camera`, `camera.fill` |
| Photo | `photo`, `photo.fill` |
| Send | `paperplane`, `paperplane.fill` |
| Reply | `arrowshape.turn.up.left` |

## Localization

SF Symbols includes RTL-mirrored variants automatically:

```swift
// In LTR (English): chevron points right
// In RTL (Arabic): chevron points left
Image(systemName: "chevron.forward")
```

ALWAYS use directional symbols (`forward`/`backward`) instead of absolute (`left`/`right`):

| Wrong | Right |
|---|---|
| `chevron.left` | `chevron.backward` |
| `chevron.right` | `chevron.forward` |
| `arrow.left` | `arrow.backward` |
| `arrow.right` | `arrow.forward` |

## Custom symbols

If a symbol genuinely doesn't exist in SF Symbols (rare), create a custom symbol via SF Symbols app:
1. Export an existing symbol as template
2. Modify in vector tool (Illustrator, Sketch, Figma)
3. Re-import into SF Symbols app
4. Export as `.svg` with proper anatomy
5. Add to asset catalog as Symbol Set

```swift
Image("CustomSymbol")  // Custom SF Symbol from asset catalog
    .font(.body)        // Same modifiers as system symbols
```

## Accessibility

Symbols generally need accessibility labels when they're standalone (not in a `Button` or `Label`):

```swift
// Button automatically uses its title
Button("Settings", systemImage: "gearshape") { }
// VoiceOver: "Settings, button"

// Label ditto
Label("Home", systemImage: "house")
// VoiceOver: "Home"

// Standalone Image needs explicit label
Image(systemName: "exclamationmark.triangle.fill")
    .accessibilityLabel("Warning")
// VoiceOver: "Warning"

// Decorative icon (e.g., next to text that already says it)
HStack {
    Image(systemName: "envelope.fill")
        .accessibilityHidden(true)  // VoiceOver skips
    Text("Mail")
}
```

## Common mistakes

| Mistake | Problem | Fix |
|---|---|---|
| Custom icon when SF Symbol exists | Inconsistent visual weight | Use SF Symbol |
| `chevron.left` for back | Doesn't mirror in RTL | `chevron.backward` |
| Symbol weight doesn't match text | Visually mismatched | Add `.fontWeight()` matching surrounding text |
| Standalone symbol without label | VoiceOver reads "icon" | `.accessibilityLabel("descriptive text")` |
| Multicolor on toolbar | Visually noisy | `.monochrome` (default) for toolbars |
| Tiny custom symbol | Doesn't scale with Dynamic Type | Use system symbol or `@ScaledMetric` for size |
| Decorative icon read aloud | Redundant for VoiceOver | `.accessibilityHidden(true)` |

## See also

- `03-typography-dynamic-type.md` -- text styles that pair with symbols
- `accessibility/01-voiceover-fundamentals.md` -- accessibility labels for images
- SF Symbols app: download from Apple developer for full catalog
- `~/Claude/vault/iOS Development/09 - Human Interface Guidelines.md#sf-symbols`
