# Liquid Glass (iOS 26+)

Apple's most significant visual redesign since iOS 7. Replaces the flat/material design language with a translucent glass metaphor across all platforms. Announced at WWDC 2025.

## Design properties

| Property | Description |
|---|---|
| **Translucency** | Real-time rendering with specular highlights that react to movement |
| **Refraction** | Content behind glass elements is visible but softly distorted |
| **Adaptive color** | Glass color is informed by surrounding content; adapts between light/dark |
| **Physical basis** | Designers fabricated actual glass samples to match interface properties to real glass |

## SwiftUI API

### Basic glass effect

```swift
Text("Label")
    .padding()
    .glassEffect()  // Default: .regular variant, capsule shape
```

### Variants

```swift
.glassEffect(.regular)      // Default
.glassEffect(.thin)         // More transparent, less weight
.glassEffect(.thick)        // More opaque, more presence
.glassEffect(.identity)     // No effect (use for accessibility fallback)
```

### Custom shape

```swift
Text("Tag")
    .padding(.horizontal, 12)
    .padding(.vertical, 6)
    .glassEffect(.regular, in: RoundedRectangle(cornerRadius: 8))

Image(systemName: "heart.fill")
    .padding(16)
    .glassEffect(.regular, in: Circle())
```

### Glass buttons

```swift
Button("Secondary") { }
    .buttonStyle(.glass)            // Translucent glass button

Button("Primary") { }
    .buttonStyle(.glassProminent)   // Opaque, primary action
    .tint(.blue)
```

### Tab bar with glass

```swift
TabView {
    Tab("Home", systemImage: "house") { HomeView() }
    Tab("Search", systemImage: "magnifyingglass", role: .search) { SearchView() }
    Tab("Profile", systemImage: "person.circle") { ProfileView() }
}
.tabBarMinimizeBehavior(.onScrollDown)  // Minimizes on scroll
.tabViewBottomAccessory {
    NowPlayingBar()  // Content above tab bar
}
```

### Accessibility auto-adaptation

Liquid Glass automatically adapts for:

| Accessibility setting | Glass behavior |
|---|---|
| Reduce Transparency | Becomes opaque |
| Increased Contrast | Stronger borders and fills |
| Reduce Motion | No specular animation |
| Tinted Mode (iOS 26.1+) | Respects tint preferences |

No code needed for these adaptations. For manual control:

```swift
@Environment(\.accessibilityReduceTransparency) var reduceTransparency

Text("Label")
    .padding()
    .glassEffect(reduceTransparency ? .identity : .regular)
```

## Where to use Liquid Glass

| Context | Use glass? | Why |
|---|---|---|
| Floating overlays (now playing, alerts) | YES | Provides context without obscuring background |
| Tab bars and navigation bars | YES | System default in iOS 26+ |
| Toolbar buttons (`.glass`/`.glassProminent`) | YES | Communicates floating action |
| Card containers in lists | NO | Lists already have appropriate background |
| Body text backgrounds | NO | Hurts legibility |
| Form fields | NO | User needs clear input affordances |
| Full-screen modals | NO | Modal already separates from content |
| Photos / media | NO | Content should not be filtered |

## Where to AVOID Liquid Glass

These are CRITICAL misuses:

| Misuse | Why it's wrong | Fix |
|---|---|---|
| Glass over text the user must read | Translucency reduces contrast | Use `.background(.regularMaterial)` or solid background |
| Glass over interactive controls users must aim at | Refraction obscures hit targets | Solid background |
| Glass on every surface | Loses meaning when overused | Reserve for floating/contextual elements |
| Glass with low contrast tint | Becomes invisible in some lighting | Test with Increased Contrast enabled |
| Glass as decoration without function | Violates deference principle | Remove |

## Migration from `.background(.ultraThinMaterial)` etc.

```swift
// OLD (iOS 15-25): Materials API
Text("Label")
    .padding()
    .background(.ultraThinMaterial)
    .clipShape(.capsule)

// NEW (iOS 26+): Liquid Glass
Text("Label")
    .padding()
    .glassEffect()
```

Materials API still works but doesn't respond to the same accessibility controls or render with specular highlights.

## Multi-platform availability

| Platform | Glass support |
|---|---|
| iOS 26+ | Full support |
| iPadOS 26+ | Full support |
| macOS 15+ | Full support (named "Sequoia Glass") |
| watchOS 11+ | Limited (smaller surfaces) |
| tvOS 18+ | Full support |
| visionOS 2+ | Native (RealityKit materials) |

## Performance considerations

Glass rendering uses GPU. On older devices (iPhone XS and earlier), heavy glass usage can drop frame rates.

| Glass usage | Frame rate impact |
|---|---|
| 1-2 glass elements per screen | Negligible |
| 5-10 glass elements per screen | < 5% on A12+ |
| 20+ glass elements per screen | Visible drops on A12; significant on A11 |
| Glass on scrolling cells | Can cause hitches; profile with Instruments |

If targeting iPhone XS or earlier, conditionally apply glass:

```swift
@Environment(\.accessibilityReduceTransparency) var reduceTransparency

Text("Label")
    .padding()
    .glassEffect(reduceTransparency ? .identity : .regular)
    // accessibilityReduceTransparency is also enabled when system performance is low
```

## See also

- `01-apple-design-philosophy.md#deference` -- why Liquid Glass exists
- `accessibility/03-visual-accessibility.md#reduce-transparency` -- a11y adaptation
- `~/Claude/vault/iOS Development/09 - Human Interface Guidelines.md` -- full HIG section
