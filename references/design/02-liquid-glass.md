# Liquid Glass (iOS 26+)

> Owner: `references/design/02-liquid-glass.md` owns the Liquid Glass API surface, including the `Glass.tint(_:)` contract. visionOS's separate glass modifier (`glassBackgroundEffect`) is owned by `references/cross-platform/05-visionos.md`.
> Floors: see `references/_scaffolding/version-floor-registry.md#ios-26x` for the full availability matrix cited below.

Apple's most significant visual redesign since iOS 7. Replaces the flat/material design language with a translucent glass metaphor across all platforms, announced at WWDC 2025 and shipping since iOS 26.0. Get the variant set and the container model wrong and glass either won't compile or won't blend -- both are common, both are covered below.

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

`Glass` has exactly three variants -- there is no `.thin`/`.thick` (those are `Material` names and will not compile on `Glass`):

```swift
.glassEffect(.regular)      // Default
.glassEffect(.clear)        // Maximally transparent, minimal blur -- less refractive distortion than .regular
.glassEffect(.identity)     // No effect -- use only on a view that already has its own opaque background
```

### Tint and interactivity

`Glass` exposes exactly two chaining calls:

```swift
Button("Delete", role: .destructive) { }
    .buttonStyle(.glass)
    .tint(.red)                                              // Glass reads the view's tint

Text("Live")
    .padding()
    .glassEffect(.regular.tint(.blue.opacity(0.4)).interactive())
```

- `tint(_ color: Color?) -> Glass` -- applies a tint; the parameter is optional (`nil` clears an inherited tint).
- `interactive(_ isEnabled: Bool = true) -> Glass` -- makes the glass react to touch/pointer (scale + highlight on press) the way system controls do. Use it on anything the user taps; omit it on purely decorative chrome.

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

### GlassEffectContainer (multi-element glass)

A bare `.glassEffect()` never blends or morphs with a sibling -- each renders as an isolated island. Any screen with two or more glass shapes that should visually relate (a floating toolbar cluster, an expand/collapse control pair) needs `GlassEffectContainer`:

```swift
@Namespace private var glassNamespace

GlassEffectContainer(spacing: 40) {
    HStack(spacing: 40) {
        Image(systemName: "scribble.variable")
            .frame(width: 80, height: 80)
            .font(.system(size: 36))
            .glassEffect()
            .glassEffectID("pencil", in: glassNamespace)

        if isExpanded {
            Image(systemName: "eraser")
                .frame(width: 80, height: 80)
                .font(.system(size: 36))
                .glassEffect()
                .glassEffectID("eraser", in: glassNamespace)
        }
    }
}
```

`GlassEffectContainer(spacing:)` is a sampling/morph group, not a layout container -- it performs no layout of its own. `spacing` sets the blend-distance threshold: glass shapes within `spacing` of each other merge into one continuous blob. `.glassEffectID(_:in:)` pairs a shape across insertion/removal within the same `Namespace` so SwiftUI morphs one shape into another instead of fading; `.glassEffectTransition(.matchedGeometry)` (the default when a namespace pairing exists) is what drives that morph, `.materialize` fades independently, `.identity` disables the transition. Drive every insert/remove inside `withAnimation` -- the morph rides the transaction's spring. Limit a screen to one hero morphing cluster; several independent morphing blobs read as chaos and are GPU-expensive. Gate glass morphs under Reduce Motion (fall back to a plain fade) -- this is developer-owned, never automatic.

### Glass buttons

```swift
Button("Secondary") { }
    .buttonStyle(.glass)            // Translucent glass button

Button("Primary") { }
    .buttonStyle(.glassProminent)   // Opaque, primary action
    .tint(.blue)
```

Parameterized styling -- `.buttonStyle(.glass(_:))`, `GlassButtonStyle.init(_:)`, `.glass(.clear)` -- is iOS 26.1+; the no-argument `.glass`/`.glassProminent` styles above are 26.0. `#available(iOS 26.0, *)` is not sufficient to compile the parameterized form -- see Availability below.

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

## Accessibility auto-adaptation

Liquid Glass automatically adapts for:

| Accessibility setting | Glass behavior |
|---|---|
| Reduce Transparency | Becomes near-opaque with zero code |
| Increased Contrast | Stronger borders and fills |
| Reduce Motion | No specular animation |

No manual `.identity` swap is needed for Reduce Transparency -- the system already frosts `.glassEffect()` under that setting. Manually forcing `.identity` there is a bug, not a fix: `.identity` renders no material at all, so a floating control that relies on glass for its fill becomes fully invisible instead of opaque. Reserve `.identity` for a view that already has its own opaque background and only needs glass optionally layered on top of it.

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

Materials API still works but doesn't participate in Liquid Glass's accessibility auto-adaptation or specular-highlight rendering.

## Multi-platform availability

| Platform | Glass support |
|---|---|
| iOS 26.0+ | Full support |
| iPadOS 26.0+ | Full support |
| macOS 26.0+ (Tahoe) | Full support |
| watchOS 26.0+ | Limited (smaller surfaces) |
| tvOS 26.0+ | Full support |
| visionOS | N/A -- visionOS uses the separate `glassBackgroundEffect(in:displayMode:)` modifier, not `.glassEffect()`. See `references/cross-platform/05-visionos.md`. |

## Availability + fallbacks

```swift
// iOS 26.0+. Base Liquid Glass APIs (glassEffect, Glass.regular/.clear/.identity, .tint(_:)/
// .interactive(_:), GlassEffectContainer, no-argument .buttonStyle(.glass/.glassProminent))
// ship at the unified "26" floor across iOS/iPadOS/macOS Tahoe/watchOS/tvOS.
@ViewBuilder
func adaptiveGlass(_ shape: some Shape) -> some View {
    if #available(iOS 26.0, *) {
        Color.clear.glassEffect(.regular, in: shape)
    } else {
        shape.fill(.regularMaterial)   // Materials auto-respect Reduce Transparency too
    }
}
```

The parameterized button styles described above need `#available(iOS 26.1, *)`, not `iOS 26.0` -- SDK-verify the exact minor before shipping against a fresh Xcode release.

## Performance

Glass rendering is GPU-composited. iOS 26's device floor (approximately A13 / iPhone 11 and later) makes per-device-era frame-rate warnings moot -- any hardware that can install iOS 26 can run Liquid Glass. For screens with many independent glass elements, profile with Instruments on real hardware and coalesce the elements into one `GlassEffectContainer` (see above) instead of nesting standalone `.glassEffect()` calls -- that consolidation, not a device-generation table, is the actual performance lever.

## See also

- `references/design/01-apple-design-philosophy.md#deference` -- why Liquid Glass exists
- `references/accessibility/03-visual-accessibility.md#reduce-transparency` -- a11y adaptation
- `references/cross-platform/05-visionos.md` -- `glassBackgroundEffect` and visionOS-native glass
