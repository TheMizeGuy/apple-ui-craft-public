# Exemplar: Liquid Glass Screen

> Status: signature-drafted, build-pending (requires Xcode build at iOS 18 + iOS 26 targets).
> Composes: `references/design/02-liquid-glass.md` (owner of the Glass API), `references/design/07-navigation-patterns.md` (Tab/toolbar), `references/animation/02-spring-physics.md` (spring presets), `references/haptics/02-swiftui-sensory-feedback.md` (`.sensoryFeedback`), `references/accessibility/05-motion-accessibility.md` (Reduce Motion double-gate). This file demonstrates composition -- it does not own any concept it uses.
> Floors: base file targets iOS 18+; every Liquid Glass API is gated `#available(iOS 26.0, *)` with a `.regularMaterial`/`.thinMaterial` fallback per `references/_scaffolding/version-floor-registry.md#ios-26x`.

A content-detail screen where a floating glass functional layer (tab bar, action cluster, toolbar) sits above a scrolling content layer, glass is grouped in one `GlassEffectContainer` per cluster, and every surface degrades correctly under accessibility settings and pre-iOS-26 SDKs. This is the reference an agent should hold up as the target when reviewing a Liquid Glass screen.

## The Apple way

- **Two-layer contract.** Liquid Glass is the FUNCTIONAL layer (tab bar, floating action cluster, toolbar pill). Body copy and cards live on the CONTENT layer using `.regularMaterial`/solid fills -- never on glass, since translucency drops text contrast. This is the deference principle made concrete.
- **The system already provides glass** for the tab bar and nav bar on iOS 26 -- never paint a manual translucent slab behind system chrome (glass-on-glass muddies sampling). Only hand-apply glass to your own floating controls.
- **One container per cluster.** Sibling glass shapes that touch must share a `GlassEffectContainer` so they sample ONE background region and can morph between each other.

## Core APIs

### Part A -- model, tab shell, content-detail scaffold

```swift
// GoldStandardGlassScreen.swift
// Target: iOS 18+ (Liquid Glass gated behind #available(iOS 26); .regularMaterial fallback below).
import SwiftUI

// MARK: - Model

struct Exhibit: Identifiable, Hashable {
    let id = UUID()
    let title: String
    let dateline: String
    let heroSymbol: String
    let body: String
}

extension Exhibit {
    static let sample = Exhibit(
        title: "Luminous Forms",
        dateline: "Gallery 4 · Through Nov 30",
        heroSymbol: "circle.hexagongrid.fill",
        body: "Light is treated here not as illumination but as material -- poured, bent, and set."
    )
}

// MARK: - Root tab shell (system tab bar IS glass in iOS 26 -- no opt-in needed)

struct RootTabView: View {
    var body: some View {
        // Fix 1: the two iOS-26-only tab-bar hooks (.tabBarMinimizeBehavior, .tabViewBottomAccessory)
        // are ungated in the source pattern this exemplar corrects -- both gated here.
        if #available(iOS 26.0, *) {
            tabs
                .tabBarMinimizeBehavior(.onScrollDown)     // collapses to a floating glass pill on scroll
                .tabViewBottomAccessory { MiniPlayerAccessory() }   // docks a glass accessory above the bar
        } else {
            tabs
        }
    }

    private var tabs: some View {
        TabView {
            Tab("Visit", systemImage: "map") { ExhibitDetailView(exhibit: .sample) }
            Tab("Collection", systemImage: "square.grid.2x2") { Text("Collection").font(.largeTitle) }
            // role: .search gives the search tab the dedicated iOS 26 placement + glass field.
            Tab("Search", systemImage: "magnifyingglass", role: .search) { Text("Search").font(.largeTitle) }
        }
    }
}

// MARK: - Content-detail screen

struct ExhibitDetailView: View {
    let exhibit: Exhibit
    @State private var isFavorite = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    hero
                    Text(exhibit.title).font(.largeTitle.bold())
                    Text(exhibit.body).font(.body).foregroundStyle(.secondary)
                        // CONTENT layer: material, NOT glass -- readable, opaque enough for body copy.
                        .padding()
                        .background(.regularMaterial, in: .rect(cornerRadius: 16))
                }
                .padding(.horizontal)
                .padding(.bottom, 120)   // clearance for the floating cluster
            }
            .navigationTitle(exhibit.title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { toolbarContent }
            // Floating FUNCTIONAL layer -- glass, above content, bottom-anchored.
            .safeAreaInset(edge: .bottom) {
                ActionClusterBar(isFavorite: $isFavorite).padding(.bottom, 8)
            }
        }
    }

    // Fix 1 continued: ToolbarSpacer (iOS 26.0+) gated; pre-26 keeps one grouping, no spacer.
    @ToolbarContentBuilder
    private var toolbarContent: some ToolbarContent {
        ToolbarItem(placement: .topBarTrailing) {
            Button("Info", systemImage: "info.circle") { }
        }
        if #available(iOS 26.0, *) {
            ToolbarSpacer(.fixed)   // breaks the shared glass background into two capsules
            ToolbarItemGroup(placement: .topBarTrailing) {
                Button("Map", systemImage: "map") { }
                Button("Hours", systemImage: "clock") { }
            }
        } else {
            ToolbarItemGroup(placement: .topBarTrailing) {
                Button("Map", systemImage: "map") { }
                Button("Hours", systemImage: "clock") { }
            }
        }
    }

    // Hero bleeds edge-to-edge under translucent chrome so glass has real content to refract.
    private var hero: some View {
        Image(systemName: exhibit.heroSymbol)
            .resizable().scaledToFit()
            // Fix 3: .tint.gradient does not compile -- TintShapeStyle has no .gradient member.
            .foregroundStyle(Color.accentColor.gradient)
            .frame(height: 240)
            .frame(maxWidth: .infinity)
            .background(Color.accentColor.opacity(0.12), in: .rect(cornerRadius: 24))
            .modifier(BackgroundExtensionIfAvailable())
            .accessibilityLabel("\(exhibit.title). \(exhibit.dateline)")
    }
}

private struct BackgroundExtensionIfAvailable: ViewModifier {
    func body(content: Content) -> some View {
        if #available(iOS 26.0, *) { content.backgroundExtensionEffect() } else { content }
    }
}
```

### Part B -- `AdaptiveGlass` helper, floating action cluster, glass polarity

```swift
// Fix 2: constrained to InsettableShape -- strokeBorder(_:lineWidth:) requires InsettableShape,
// and Shape alone does not provide it. Also fixes the AdaptiveGlass RT fallback: the system
// already auto-frosts .glassEffect() under Reduce Transparency (see design/02) -- never hand-swap
// to Glass.identity there, since .identity renders NO material and makes a floating control that
// relies on glass for its fill fully invisible.
struct AdaptiveGlass<S: InsettableShape>: ViewModifier {
    let shape: S
    var tint: Color? = nil
    var interactive: Bool = true

    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    @Environment(\.colorSchemeContrast) private var contrast

    func body(content: Content) -> some View {
        Group {
            if #available(iOS 26.0, *) {
                content.glassEffect(glass, in: shape)          // system auto-frosts under RT
            } else {
                content.background(
                    reduceTransparency ? AnyShapeStyle(.background) : AnyShapeStyle(.regularMaterial),
                    in: shape
                )
            }
        }
        .overlay {
            if contrast == .increased { shape.strokeBorder(.primary.opacity(0.55), lineWidth: 1) }
        }
    }

    @available(iOS 26.0, *)
    private var glass: Glass {
        var g: Glass = .regular
        if let tint { g = g.tint(tint) }
        if interactive { g = g.interactive() }
        return g
    }
}

extension View {
    func adaptiveGlass<S: InsettableShape>(in shape: S, tint: Color? = nil, interactive: Bool = true) -> some View {
        modifier(AdaptiveGlass(shape: shape, tint: tint, interactive: interactive))
    }
}

// One GlassEffectContainer per cluster; an explicit HStack inside (the container does NOT lay
// out children itself); glassProminent for the primary action.
@available(iOS 26.0, *)
struct GlassActionCluster: View {
    @Binding var isFavorite: Bool
    @State private var didPurchase = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        GlassEffectContainer(spacing: 12) {
            HStack(spacing: 12) {
                secondary(symbol: "heart", filled: isFavorite,
                          label: isFavorite ? "Remove from favorites" : "Add to favorites") {
                    withAnimation(reduceMotion ? nil : .bouncy(duration: 0.35)) { isFavorite.toggle() }
                }
                secondary(symbol: "square.and.arrow.up", filled: false, label: "Share") { }

                Button { didPurchase = true } label: {
                    Label("Tickets", systemImage: "ticket.fill")
                        .font(.headline).frame(maxWidth: .infinity).padding(.vertical, 8)
                }
                .buttonStyle(.glassProminent)
                .tint(.accentColor)
                // Glyph polarity is automatic: system picks a contrasting label color for the
                // tint (dark on a bright tint, white on a saturated one) -- never hardcode
                // .foregroundStyle(.white), it vanishes on a bright tint.
                .accessibilityLabel("Get tickets")
            }
            .padding(6)
        }
        .frame(maxWidth: 460).padding(.horizontal)
        .sensoryFeedback(.impact(flexibility: .soft), trigger: isFavorite)
        .sensoryFeedback(.success, trigger: didPurchase)
    }

    private func secondary(symbol: String, filled: Bool, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: filled ? "\(symbol).fill" : symbol)
                .font(.title3).frame(width: 52, height: 52)
                .contentTransition(.symbolEffect(.replace))
        }
        .buttonStyle(.glass)
        .accessibilityLabel(label)
    }
}

// Pre-iOS-26 fallback cluster -- Materials, no glass.
struct FallbackActionCluster: View {
    @Binding var isFavorite: Bool
    var body: some View {
        HStack(spacing: 12) {
            Button { isFavorite.toggle() } label: {
                Image(systemName: isFavorite ? "heart.fill" : "heart")
                    .font(.title3).frame(width: 52, height: 52)
            }
            .background(.regularMaterial, in: .circle)
            .accessibilityLabel(isFavorite ? "Remove from favorites" : "Add to favorites")

            Button { } label: { Image(systemName: "square.and.arrow.up").font(.title3).frame(width: 52, height: 52) }
                .background(.regularMaterial, in: .circle)
                .accessibilityLabel("Share")

            Button { } label: { Label("Tickets", systemImage: "ticket.fill").font(.headline)
                .frame(maxWidth: .infinity).padding(.vertical, 8) }
                .buttonStyle(.borderedProminent)
        }
        .padding(6).background(.thinMaterial, in: .capsule)
        .frame(maxWidth: 460).padding(.horizontal)
    }
}

struct ActionClusterBar: View {
    @Binding var isFavorite: Bool
    var body: some View {
        if #available(iOS 26.0, *) { GlassActionCluster(isFavorite: $isFavorite) }
        else { FallbackActionCluster(isFavorite: $isFavorite) }
    }
}
```

### Part C -- bottom accessory (haptics + springs table)

```swift
// Fix 1 continued: this type reads @Environment(\.tabViewBottomAccessoryPlacement), an
// iOS-26-only key -- the type itself is gated, not just its call site.
@available(iOS 26.0, *)
struct MiniPlayerAccessory: View {
    @State private var isPlaying = false
    @Environment(\.tabViewBottomAccessoryPlacement) private var placement

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "waveform.circle.fill").font(.title2)
                .symbolEffect(.variableColor, isActive: isPlaying)
                .foregroundStyle(.tint)

            if placement != .inline {
                VStack(alignment: .leading, spacing: 1) {
                    Text("Audio Guide · Stop 4").font(.subheadline.weight(.medium)).lineLimit(1)
                    Text("Luminous Forms").font(.caption).foregroundStyle(.secondary).lineLimit(1)
                }
            }
            Spacer(minLength: 0)

            Button { isPlaying.toggle() } label: {
                Image(systemName: isPlaying ? "pause.fill" : "play.fill")
                    .font(.title3).contentTransition(.symbolEffect(.replace))
                    .frame(width: 44, height: 44)   // 44pt minimum hit target
            }
            .buttonStyle(.plain)
            .accessibilityLabel(isPlaying ? "Pause audio guide" : "Play audio guide")
        }
        .padding(.horizontal, 12)
        // Never .glassEffect() here -- the accessory container is ALREADY glass; nesting is
        // glass-on-glass (muddy sampling).
        .sensoryFeedback(.impact(flexibility: .rigid), trigger: isPlaying)
        .accessibilityElement(children: .combine)
    }
}
```

| Interaction | Spring | Haptic | Why |
|---|---|---|---|
| Favorite toggle (glass symbol swap) | `.bouncy(duration: 0.35)` | `.impact(flexibility: .soft)` | Playful, non-critical -- a little overshoot rewards the tap |
| Cluster expand / morph | `.snappy` or `.bouncy(duration: 0.4)` | -- | Fast settle, reads as physical glass fusing |
| Primary purchase confirm | `.snappy` | `.success` | Decisive, no overshoot on a committing action |
| Any of the above under Reduce Motion | `nil` (hard cut) | unchanged | `withAnimation(reduceMotion ? nil : …)` -- haptics are feedback, never gated on RM |

## Availability + fallbacks

```swift
if #available(iOS 26.0, *) {
    content.glassEffect(.regular, in: shape)
} else {
    content.background(.regularMaterial, in: shape)
}
```

`GlassEffectContainer`, `.glassEffect`, `.buttonStyle(.glass/.glassProminent)`, `backgroundExtensionEffect()`, `ToolbarSpacer`, `.tabBarMinimizeBehavior`, `.tabViewBottomAccessory` are ALL iOS 26.0+ -- every call site above is gated behind `#available(iOS 26.0, *)` with a Materials fallback, never left ungated.

## Accessibility contract

Every position/scale/morph animation gates through `withAnimation(reduceMotion ? nil : …)` per the double-gate contract (`references/accessibility/05-motion-accessibility.md`) -- haptics are NOT gated, since they're feedback, not motion. Every control is ≥44pt; every icon-only button carries `.accessibilityLabel`; header text carries `.accessibilityAddTraits(.isHeader)`. Reduce Transparency is handled by the system's automatic glass frosting -- never a manual `.identity` swap, which removes the surface entirely.

**Fix 4 -- previewing get-only accessibility state.** `accessibilityReduceTransparency`, `colorSchemeContrast`, and `accessibilityReduceMotion` are **get-only** environment keys (`KeyPath`, not `WritableKeyPath`) -- `.environment(\.accessibilityReduceMotion, true)` is a compile error, not a valid preview technique. Verify those three states via the Simulator's Settings → Accessibility toggles or a physical device, not via code-injected `#Preview`s:

```swift
#Preview("Default") { RootTabView() }

#Preview("Dark") { RootTabView().preferredColorScheme(.dark) }   // colorScheme IS writable

#Preview("Accessibility XXXL") { RootTabView().dynamicTypeSize(.accessibility5) }   // writable

// Reduce Transparency / Increase Contrast / Reduce Motion: verify via Simulator → Settings →
// Accessibility (or a device), NOT via .environment(\.accessibilityReduceMotion, true) -- that
// key, accessibilityReduceTransparency, and colorSchemeContrast are get-only and will not compile
// as a preview injection.
```

## Anti-patterns

| Wrong | Why it fails | Right |
|---|---|---|
| `.glassEffect(.thin)` / `.glassEffect(.thick)` | Won't compile -- `Glass` has no such members | `.regular` / `.clear` / `.identity` |
| Two or more touching `.glassEffect()` calls with no enclosing container | Inconsistent tint, hard seams, no morph | Wrap in `GlassEffectContainer` + an explicit `HStack`/`VStack` |
| `.glassEffect(reduceTransparency ? .identity : .regular)` on a floating control | Invisible under Reduce Transparency -- `.identity` renders no material | Let the system auto-frost; `.identity` only for a view with its own opaque background |
| `.foregroundStyle(.white)` on `.glassProminent` with a bright tint | Label vanishes | Remove it -- the system auto-contrasts |
| `.glassEffect()` behind a system tab/nav bar | Glass-on-glass, muddy | Delete -- the system bar is already glass |
| Body text on a `.glassEffect()` background | Fails contrast | `.background(.regularMaterial)` |
| `AdaptiveGlass<S: Shape>` calling `.strokeBorder` | `strokeBorder` requires `InsettableShape` -- compile error | Constrain `<S: InsettableShape>` |

## Severity guide

CRITICAL: a floating control invisible under Reduce Transparency because of a manual `.identity` swap. HIGH: an ungated iOS-26 API shipped at a stated iOS-18 floor (compile failure on the real deployment target). MEDIUM: glass-on-glass nesting inside a system bar or tab accessory. LOW: hardcoded `.foregroundStyle(.white)` on a prominent glass button. NIT: `.hoverEffect(.lift)` on a tiny chrome control where `.highlight` reads correctly.

## See also

- `references/design/02-liquid-glass.md` -- Liquid Glass API surface (owner)
- `references/animation/02-spring-physics.md` -- named spring presets (owner)
- `references/haptics/02-swiftui-sensory-feedback.md` -- `.sensoryFeedback` vocabulary (owner)
- `references/accessibility/05-motion-accessibility.md` -- Reduce Motion double-gate (owner)
- `references/design/07-navigation-patterns.md` -- `TabView`, toolbar mechanics (owner)
