# SF Symbols

6,900+ icons (SF Symbols 7) designed by Apple to integrate visually with the system font (SF Pro). Free to use in any iOS/iPadOS/macOS/watchOS/tvOS/visionOS app. Treat the count as a soft marketing figure, not an authoritative API surface -- it grows every release.

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

### Gradient color rendering (SF Symbols 7, iOS 26+)

Gradient fill is a SEPARATE, opt-in modifier layered on top of rendering mode -- rebuilding against the iOS 26 SDK does NOT automatically add gradients to existing hierarchical/multicolor icons:

```swift
Image(systemName: "heart.fill")
    .symbolRenderingMode(.hierarchical)      // one tint, opacity tiers
    .symbolColorRenderingMode(.gradient)     // each tier now an axial gradient instead of flat
    .foregroundStyle(.pink)
```

`func symbolColorRenderingMode(_ mode: SymbolColorRenderingMode?) -> some View` -- `.flat` (default, solid fill per layer) or `.gradient` (axial gradient per layer). `nil` inherits the environment/system default.

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
| `.drawOn`/`.drawOff` | 26+ (SF Symbols 7) | Handwriting-style stroke-on/off, incl. as a `.transition()` |

## Symbol effects and Reduce Motion

Discrete, one-shot effects (`.bounce`, `.wiggle`, `.rotate` fired via `value:`) are safe by default -- they play once on a real state change and settle. **Indefinite (looping) effects do NOT stop under Reduce Motion automatically.** `.pulse`, `.variableColor.iterative`, `.breathe`, and any effect passed `options: .repeating`/`.repeat(.continuous)` -- including `.rotate` used as a loop -- keep animating regardless of the accessibility setting unless you gate them yourself:

```swift
@Environment(\.accessibilityReduceMotion) private var reduceMotion

Image(systemName: "dot.radiowaves.left.and.right")
    .symbolEffect(.variableColor.iterative.reversing,
                  options: .repeating,
                  isActive: isBroadcasting && !reduceMotion)   // RM folds into isActive
```

Gate via the effect's own `isActive:` parameter -- never an `if reduceMotion { staticImage } else { animatedImage }` branch. The branch remounts the symbol (view-identity churn, spurious transition); `isActive: false` keeps the same view mounted and the effect simply stops on its rest frame. To strip every inherited symbol effect from a subtree at once, use `.symbolEffectsRemoved(_:)` (iOS 17+) as a single escape hatch instead of gating each `.symbolEffect()` call individually.

For a symbol used as an insertion/removal transition, the correct spelling is `.transition(.symbolEffect(.drawOn))` -- there is no bare `.drawOn` case directly on `Transition`/`AnyTransition`.

Icon-only controls (a `Button` whose label is only an `Image`, not wrapped in `Label`) need an explicit `.accessibilityLabel(_:)` -- see Accessibility below.

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
| Reply | `arrowshape.turn.up.backward` (NOT `.left` -- breaks RTL) |
| Forward (message) | `arrowshape.turn.up.forward` |

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
| `arrowshape.turn.up.left` (reply) | `arrowshape.turn.up.backward` |

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

- `references/design/03-typography-dynamic-type.md` -- text styles that pair with symbols
- `references/accessibility/01-voiceover-fundamentals.md` -- accessibility labels for images
- `references/accessibility/05-motion-accessibility.md` -- the general Reduce Motion double-gate contract this file's symbol-effect gating follows
- SF Symbols app: download from Apple developer for full catalog
