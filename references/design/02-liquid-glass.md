# Liquid Glass (iOS 26+)

> Owner: `references/design/02-liquid-glass.md` owns the Liquid Glass API surface, including the `Glass.tint(_:)` contract. visionOS's separate glass modifier (`glassBackgroundEffect`) is owned by `references/cross-platform/05-visionos.md`.
> Floors: see `references/_scaffolding/version-floor-registry.md#ios-26x` for the full availability matrix cited below.

Apple's most significant visual redesign since iOS 7. Replaces the flat/material design language with a translucent glass metaphor across all platforms, shipping since iOS 26.0.

iOS 27 added, renamed and deprecated exactly zero `Glass` symbols. Every API below still reports a 26.0 floor, so gating a glass call site behind `#available(iOS 27, *)` is wrong and demanding new glass call sites in a 27-era codebase is wrong. What iOS 27 changed is the escape hatch: the system now ignores `UIDesignRequiresCompatibility`, so a rebuild against the 27 SDK renders with Liquid Glass whether the app opted in or not. Glass-layer correctness is shipping-blocking, not a migration plan. Get the variant set and the container model wrong and glass either won't compile or won't blend -- both are common, both are covered below.

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

### Clear glass needs a dimming layer

`.clear` is not a lighter `.regular`. It is the variant for a component floating over visually rich content -- a photo, video, or map -- and the HIG attaches a number to it: "If the underlying content is bright, consider adding a dark dimming layer of 35% opacity. If the underlying content is sufficiently dark, or if you use standard media playback controls from AVKit that provide their own dimming layer, you don't need to apply a dimming layer."

The dimming layer belongs on the content, underneath the glass -- not stacked on top of the control:

```swift
ZStack(alignment: .bottom) {
    Image("hero")
        .resizable()
        .scaledToFill()
        .overlay(alignment: .bottom) {
            LinearGradient(colors: [.clear, .black.opacity(0.35)],   // the HIG's 35%
                           startPoint: .center, endPoint: .bottom)
                .allowsHitTesting(false)
        }

    PlaybackControls()
        .padding(12)
        .glassEffect(.clear, in: .capsule)
        .padding(.bottom, 24)
}
```

Anything text-heavy -- alerts, sidebars, popovers -- takes `.regular`. `.clear` over bright media with neither a dimming layer nor AVKit's own controls is a concrete contrast finding, not a taste call.

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

Match a glass capsule or card to the container's real curvature instead of a literal radius: `ConcentricRectangle` (iOS 26.0) draws it, and on iOS 27 `GeometryProxy.concentricCornerRadii` reads the resolved radii back so a shadow, stroke inset, or nested element can use the same number. `references/design/06-layout-spacing.md#concentric-corners` owns both.

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

`GlassEffectContainer(spacing:)` is a sampling/morph group, not a layout container -- it performs no layout of its own. `spacing` sets the blend-distance threshold: glass shapes within `spacing` of each other merge into one continuous blob. `.glassEffectID(_:in:)` pairs a shape across insertion/removal within the same `Namespace` so SwiftUI morphs one shape into another instead of fading; apply `.glassEffectTransition(.matchedGeometry)` explicitly on the paired views, as Apple's own example does, to drive that morph -- never rely on a default; `.materialize` fades independently, `.identity` disables the transition. Drive every insert/remove inside `withAnimation` -- the morph rides the transaction's spring. Limit a screen to one hero morphing cluster; several independent morphing blobs read as chaos and are GPU-expensive. Gate glass morphs under Reduce Motion (fall back to a plain fade) -- this is developer-owned, never automatic.

### Glass buttons

```swift
Button("Secondary") { }
    .buttonStyle(.glass)            // Translucent glass button

Button("Primary") { }
    .buttonStyle(.glassProminent)   // Opaque, primary action
    .tint(.blue)
```

Parameterized styling through the factory -- `.buttonStyle(.glass(_:))` with `.glass(.clear)` or a tinted `Glass` -- ships at the same iOS 26.0 floor as the no-argument `.glass`/`.glassProminent` styles above. The one exception is the explicit initializer `GlassButtonStyle.init(_:)`, which is iOS 26.1: write `.buttonStyle(.glass(.clear))`, not `.buttonStyle(GlassButtonStyle(.clear))`, and a 26.0 floor needs no split.

```swift
Button("Overlay") { }
    .buttonStyle(.glass(.clear))     // iOS 26.0+, same gate as .glass
```

### Scroll edge effects

The effect that keeps a floating bar's controls visually distinct from the content scrolling under it. `scrollEdgeEffectStyle(_ style: ScrollEdgeEffectStyle?, for edges: Edge.Set)` is iOS 26.0 and unchanged in iOS 27; the HIG guidance around it is not.

```swift
ScrollView { content }
    .scrollEdgeEffectStyle(.automatic, for: .top)   // iOS 26.0+
```

- **Prefer `.automatic`.** It is more opaque for a top toolbar carrying many controls, for text outside Liquid Glass controls, and for pinned table headers. A hand-picked non-automatic style (`.soft`, say) shipped without contrast testing is a finding, not a style choice.
- **Only where something floats.** "Scroll edge effects aren't decorative. They don't block or darken like overlays; they exist to ensure controls stay visually distinct." No floating chrome above the scroll view means no effect.
- **One effect per view**, and each pane of an iPad or Mac split view keeps its own at a consistent height. Mismatched heights across panes read as a bug.

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

### The user owns the glass appearance

iOS 27 replaced iOS 26.1's binary Clear/Tinted toggle with a continuous slider in Settings, running from ultraclear to fully tinted. It ships with **no API on any platform**. Nothing reads it, nothing branches on it, and there is no environment value for it -- reaching for one means inventing a symbol. Author `.glassEffect(.regular, ...)` normally and the system applies the user's position for you.

What this changes is the test matrix, not the code. A custom glass surface now has to stay legible across a continuous transparency range as well as under Reduce Transparency and Increase Contrast -- a range to sweep, not two discrete looks to screenshot.

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
| App-wide `.tint` or a brand-colored toolbar / tab bar | The functional layer must stay neutral so glass can sample and refract the content scrolling beneath it; broad brand color dilutes its own impact | Reserve the accent for primary actions, the selected tab's symbol, and unread badges; express brand in the content layer (`references/design/04-color-system.md#accent-color`) |
| `.glassEffect(.clear)` over bright media with no dimming layer | Controls lose contrast against the brightest frames | 35% black dimming layer on the content beneath, or `.regular` (see Clear glass needs a dimming layer) |

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
// iOS 26.0+. The entire Liquid Glass surface -- glassEffect, Glass.regular/.clear/.identity,
// .tint(_:)/.interactive(_:), GlassEffectContainer, glassEffectID/Union/Transition, both the
// no-argument and parameterized .buttonStyle(.glass/.glassProminent), backgroundExtensionEffect(),
// scrollEdgeEffectStyle -- ships at the unified "26" floor across iOS/iPadOS/macOS Tahoe/watchOS/
// tvOS. iOS 27 added nothing here: one gate, and never #available(iOS 27, *).
@ViewBuilder
func adaptiveGlass(_ shape: some Shape) -> some View {
    if #available(iOS 26.0, *) {
        Color.clear.glassEffect(.regular, in: shape)
    } else {
        shape.fill(.regularMaterial)   // Materials auto-respect Reduce Transparency too
    }
}
```

### `UIDesignRequiresCompatibility` is dead configuration

The Info.plist escape hatch that let an iOS 26 app keep the pre-Liquid-Glass look no longer does anything. Apple: "The system ignores this key when you build for iOS 27 or later, iPadOS 27 or later, Mac Catalyst 27 or later, macOS 27 or later, or tvOS 27 or later."

So an app rebuilt against the iOS 27 SDK renders with Liquid Glass regardless of what it declares, and "we set the compatibility key, we'll adopt later" is not a plan anymore. Treat glass-layer correctness -- custom bar backgrounds, glass-on-glass nesting, contrast under `.clear` -- as shipping-blocking for any 27-SDK build, and flag a lingering `UIDesignRequiresCompatibility` entry as dead configuration to delete.

## Performance

Glass rendering is GPU-composited. iOS 26's device floor (approximately A13 / iPhone 11 and later) makes per-device-era frame-rate warnings moot -- any hardware that can install iOS 26 can run Liquid Glass. For screens with many independent glass elements, profile with Instruments on real hardware and coalesce the elements into one `GlassEffectContainer` (see above) instead of nesting standalone `.glassEffect()` calls -- that consolidation, not a device-generation table, is the actual performance lever.

## See also

- `references/design/01-apple-design-philosophy.md#deference` -- why Liquid Glass exists
- `references/accessibility/03-visual-accessibility.md#reduce-transparency` -- a11y adaptation
- `references/cross-platform/05-visionos.md` -- `glassBackgroundEffect` and visionOS-native glass
