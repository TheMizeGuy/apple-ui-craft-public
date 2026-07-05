# visionOS Spatial Craft

> Owner: `references/cross-platform/05-visionos.md` owns visionOS spatial UI -- scene types (windows/volumes/immersive spaces), `glassBackgroundEffect(in:displayMode:)`, ornaments, gaze+pinch hover/gesture input, z-axis layout, and `RealityView` UI attachments -- per the ARCHITECTURE ownership map. `references/design/02-liquid-glass.md` owns the cross-platform `glassEffect()`/`Glass` material and points here for the visionOS delta. `references/interaction/03-direct-manipulation-drag.md` owns general drag semantics; this file covers only spatial/3D-entity gestures.
> Floors: `glassBackgroundEffect(in:displayMode:)` = **visionOS 1.0+** (`.automatic` display mode = visionOS 2.4+); visionOS does **not** get `glassEffect()` -- see `references/_scaffolding/version-floor-registry.md#not-ios-the-1-mis-gate-class`. Object Manipulation API and 90 Hz hand tracking = visionOS 26. `RealityView` `@Observable` entities and `breakthroughEffect(_:)` = visionOS 26. `perspectiveRotationEffect(_:axis:anchor:perspective:)` is Apple's recommended replacement for `rotation3DEffect` on this platform (M17).

An unmodified iPhone/iPad app runs on visionOS automatically in a flat 2D Compatibility Mode window -- that is the floor, not the goal. The single biggest tell separating "it launches" from "it feels native" is hover: every custom tappable view needs `.hoverEffect()` because the system never tells your process where the user is looking, only that a pinch landed. The second biggest tell is treating 2D shadow tricks as depth instead of real z.

## The Apple way

- Gaze targets an element; a pinch confirms it. Your process receives the pinch event only -- raw gaze position is private, so every custom tappable view MUST carry a hover effect or it gives zero feedback that it's live.
- Windows are the default; promote to a Volume only for content genuinely 3D that users benefit from circling; reserve Immersive Space for experiences that earn taking over the room.
- Depth is expressed with real z (`offset(z:)`, `frame(depth:)`), never a 2D drop shadow -- `.shadow()` reads flat and wrong in a headset. Grounding shadows under windows/volumes are automatic.
- Author spatial controls as SwiftUI `RealityView` attachments, not hand-built RealityKit meshes, so they inherit glass, hover, Dynamic Type, and VoiceOver for free.

## Scene types: Windows, Volumes, Immersive Spaces

All three are `Scene`s declared in the `App` body and can coexist; the user (or your code) moves between them at runtime.

| Container | Declaration | Space | Bounds | Use for |
|---|---|---|---|---|
| Window | `WindowGroup { }` (default `.plain`/glass) | Shared | 2D panel, resizable | Standard app UI, documents, settings |
| Volume | `WindowGroup { }.windowStyle(.volumetric)` | Shared | Fixed 3D box, viewable from all sides | A 3D object users walk around (globe, model, board game) |
| Immersive Space | `ImmersiveSpace(id:) { }` | Full | Unbounded, world-scale | Environments, full presence, world-anchored content |

Shared Space = your windows/volumes coexist with other apps and full passthrough. Full Space = only your app is visible; passthrough is controlled by immersion style.

```swift
WindowGroup(id: "detail") { DetailView() }
    .windowStyle(.plain)                                // glass panel is the visionOS default
    .defaultSize(width: 800, height: 600)
    .windowResizability(.contentSize)                    // hug content instead of free-resizing

WindowGroup(id: "globe") { GlobeView() }
    .windowStyle(.volumetric)
    .defaultSize(Size3D(width: 1, height: 1, depth: 0.5), in: .meters)   // permanent -- specify in meters
```

Immersive spaces are async and must handle every result -- never fire-and-forget:

```swift
@Environment(\.openImmersiveSpace) private var openImmersiveSpace
@Environment(\.dismissImmersiveSpace) private var dismissImmersiveSpace

Button("Enter") {
    Task {
        switch await openImmersiveSpace(id: "solarSystem") {
        case .opened: break
        case .userCancelled, .error: break
        @unknown default: break
        }
    }
}
Button("Exit") { Task { await dismissImmersiveSpace() } }   // no id -- only one can be open
```

`.immersionStyle(selection:in: .mixed/.progressive/.full)` -- `.progressive` lets the Digital Crown dial passthrough in/out; `.full` is fully virtual. Control the user's own hands with `.upperLimbVisibility(.automatic/.hidden/.visible)` and room dimming with `.preferredSurroundingsEffect(.dark)` in full/progressive scenes.

## `glassBackgroundEffect` -- the visionOS material (owner)

visionOS glass is a **background material with real physical thickness that participates in z-layout** -- distinct from iOS 26's `.glassEffect()`, a flat foreground material with specular highlights. Apply it to an explicit `ZStack` wrapping siblings, never to a single child inside an `overlay`/`background` closure, or the depth renders incorrectly (Apple's own docs warning).

```swift
ZStack {
    ContentStack()
}
.glassBackgroundEffect(in: .rect(cornerRadius: 24), displayMode: .automatic)   // visionOS 1.0+
```

`displayMode: .automatic` (visionOS 2.4+) lets the system decide when to show/hide the material contextually; earlier floors pass an explicit `.always`/`.never`. Because visionOS glass has thickness, most attachment and ornament content wants its own `.glassBackgroundEffect()` even when it's nested inside a window that already has one -- treat each floating slab as its own material surface, not an inherited one.

## Ornaments -- floating UI outside window bounds

An ornament floats just outside a window's or volume's bounds, staying reachable regardless of the window's own scroll position -- the visionOS equivalent of a floating toolbar, rendered as a discrete glass slab.

```swift
func ornament<Content>(
    visibility: Visibility = .automatic,
    attachmentAnchor: OrnamentAttachmentAnchor,
    contentAlignment: Alignment3D = .back,     // default is .back, not .center
    @ViewBuilder ornament: () -> Content
) -> some View where Content: View
```

```swift
MainContent()
    .ornament(attachmentAnchor: .scene(.bottom)) {
        HStack(spacing: 20) { Button("Play"){}; Button("Pause"){}; Button("Stop"){} }
            .padding()
            .glassBackgroundEffect()          // ornaments almost always want their own glass slab
    }
```

`.scene(_:)` takes a `UnitPoint` relative to the scene bounds (`.bottom`, `.top`, `.leading`, `.topTrailing`, …); bottom-center is the canonical media-controls position. Put persistent/primary controls in an ornament; keep per-row actions and anything with its own scroll region inside the window. Ornaments are visionOS-only -- branch by platform (`#if os(visionOS)`) rather than shipping one nobody sees on iOS.

## Spatial layout: the z-axis is real

Two distinct categories, and confusing them is a common bug: **visual-only z translation** (moves pixels forward, reserves no space) vs. **layout-participating depth** (reserves a box, pushes siblings).

```swift
func offset(z: CGFloat) -> some View                                       // visual-only; visionOS 1.0+
func frame(depth: CGFloat?, alignment: DepthAlignment = .center) -> some View  // reserves depth
func padding3D(_ insets: EdgeInsets3D) -> some View
func rotation3DEffect(_ angle: Angle, axis: (x,y,z), anchor:, anchorZ:, perspective:) -> some View
```

`offset(z:)` for subtle feedback pops (hover/selection, floating badges) -- siblings don't move, exactly like 2D `.offset(x:y:)`. `frame(depth:)` + `DepthAlignment` (`.front`/`.center`/`.back`) when depth must affect layout; combine with `padding3D(EdgeInsets3D(...))` to control the gap between stacked layers. A `ZStack` on visionOS stacks children in actual front-to-back z-space, not just paint order. Never fake elevation with `.shadow()` here -- grounding shadows under windows/volumes are automatic; keep total depth modest (tens of points), since large forward offsets on many elements cause visual fatigue.

`Model3D` loads a single USDZ asset asynchronously with a placeholder and participates in SwiftUI layout like `Image` -- reach for it over `RealityView` when you need one static/rotatable hero asset in a window, not a full scene.

## Hover effects -- the gaze+pinch input model

Phase 1: the user's eyes target an element; the system renders the hover highlight automatically -- your app is never told where the user is looking. Phase 2: a pinch confirms, delivering a tap/drag. Because gaze is private, EVERY interactive element needs a hover effect or it gives zero feedback that it's live -- this is the #1 visionOS review flag.

```swift
Text("Tap me").padding().hoverEffect()              // default = .automatic
Image(systemName: "star").hoverEffect(.highlight)    // fill highlight -- list rows, small controls
CardView().hoverEffect(.lift)                        // raises toward viewer in z -- image-forward tiles
```

Custom closure form (visionOS 2.0+), invoked for both phases -- `isActive` tells you which:

```swift
Text(title).hoverEffect { effect, isActive, _ in
    effect.scaleEffect(isActive ? 1.1 : 1.0)   // visuals only -- isActive can't be read as @State
}
```

`HoverEffectGroup` coordinates several sub-views so gazing at any member activates all (an icon + its label lighting up together). `hoverEffectDisabled(_:)` suppresses the system morph for a subtree (ancestor wins over descendant); `@Environment(\.isHoverEffectEnabled)` lets custom-built hover chrome match the same suppressed policy instead of fighting it. Minimum comfortable gaze target is **60x60 pt** (larger than iOS's 44 pt) with generous spacing so imprecise gaze doesn't ambiguate between neighbors.

## Spatial gestures

2D SwiftUI gestures on window/attachment views just work, driven by gaze+pinch with zero visionOS-specific code (`onTapGesture`, `LongPressGesture`, `DragGesture`). `SpatialTapGesture` additionally reports WHERE the tap landed.

3D entity-targeted gestures on `RealityView` content require the entity to be hit-testable -- forgetting this is the most common "why won't my model respond" bug:

```swift
model.components.set(InputTargetComponent(allowedInputTypes: .all))   // opt into input
model.components.set(CollisionComponent(shapes: [.generateBox(size: [0.2, 0.2, 0.2])]))
// then:
.gesture(DragGesture().targetedToAnyEntity().onChanged { value in
    value.entity.position = value.convert(value.location3D, from: .local, to: value.entity.parent!)
})
.gesture(RotateGesture3D(constrainedToAxis: .y).targetedToAnyEntity().onChanged { rotation = $0.rotation })
.gesture(MagnifyGesture().targetedToAnyEntity().onChanged { scale = $0.magnification })
```

`RotateGesture3D`/`MagnifyGesture`/`SpatialEventGesture` are visionOS 1.0+ 3D-native gesture types. Prefer the **Object Manipulation API** (visionOS 26) over hand-rolling drag/rotate/magnify -- opting an entity in grants system-consistent two-hand move/rotate/scale with zero gesture code, and 90 Hz hand tracking (visionOS 26, 3x v1) makes it responsive with no app changes.

## `RealityView` UI attachments

Attachments bridge ordinary SwiftUI views into 3D space as RealityKit entities -- labels floating beside a model, a glass control panel anchored to an object.

```swift
RealityView { content, attachments in
    let model = try? await Entity(named: "Robot")
    if let model { content.add(model) }
    if let label = attachments.entity(for: "nameLabel") {
        label.position = [0, 0.25, 0]           // METERS, not points -- off-by-1000 bugs come from treating this as points
        model?.addChild(label)
    }
} attachments: {
    Attachment(id: "nameLabel") {
        Text("R2 Unit").padding().glassBackgroundEffect()
    }
}
```

`breakthroughEffect(_:)` (visionOS 26, `.subtle`/stronger) lets an attachment "break through" occluding 3D content so a persistent control overlay stays legible in a busy scene. visionOS 26 RealityKit entities are `@Observable` -- reading `entity.position` inside a SwiftUI view body auto-updates it, no manual glue.

## Adapting an existing iOS/iPadOS app

Compatibility (automatic, flat 2D) → Optimized (glass + hover + depth on controls) → Designed for Spatial (volumes, ornaments, 3D) → Full Spatial (immersive, hand tracking, world anchoring). Concrete checklist to move up a rung: delete opaque backgrounds so system glass shows through; add `.hoverEffect()` to every bespoke tappable view; bump hit targets to 60x60 pt; replace `.shadow()` elevation with real z; avoid pure-white large fills (headset glare); lift persistent controls into a platform-branched `.ornament`; add the visionOS destination and gate spatial code with `#if os(visionOS)`. Test glass legibility and glare on real hardware -- the Simulator does not surface either.

## Availability + fallbacks

```swift
#if os(visionOS)
MainContent()
    .ornament(attachmentAnchor: .scene(.bottom)) { PlaybackControls().glassBackgroundEffect() }
#else
MainContent()
    .toolbar { ToolbarItem(placement: .bottomBar) { PlaybackControls() } }   // iOS/iPad equivalent
#endif
```

`glassBackgroundEffect(displayMode:)` needs `#available(visionOS 2.4, *)` only for the `.automatic` display mode; the base modifier is visionOS 1.0+ and needs no gate on a visionOS-only target. Object Manipulation and 90 Hz tracking are visionOS 26 -- hand-rolled `DragGesture`/`RotateGesture3D`/`MagnifyGesture` remain the correct fallback below that floor.

## Accessibility contract

None of this file's hover/lift motion is system-auto-gated for CUSTOM closures -- gate a hand-built `.hoverEffect { }` transform on `@Environment(\.accessibilityReduceMotion)` per `references/accessibility/05-motion-accessibility.md`'s double-gate; built-in `.highlight`/`.lift` presets already respect it. VoiceOver adds spatial audio cues for element position in 3D -- verify focus order still makes spatial sense after any custom layout. Audit **Dwell Control** (look-to-select) and **Head Pointer** as first-class eye-tracking alternatives, not VoiceOver-only concerns. Reduce Motion on visionOS separately limits immersive-space transitions from 2D Reduce Motion. Increase Contrast strengthens glass material contrast, not just text/borders -- test glass panels with it on.

## Anti-patterns

| Wrong | Why it fails | Right |
|---|---|---|
| Custom tappable view with no hover effect | Zero feedback the target is live -- the #1 review flag | `.hoverEffect()` on every bespoke tappable view |
| `.shadow()` to fake elevation | Reads flat and wrong in a headset | `offset(z:)` / `frame(depth:)` + automatic grounding shadows |
| `glassBackgroundEffect()` on a single child inside `overlay`/`background` | Depth renders incorrectly (Apple docs warning) | Apply to an explicit `ZStack` wrapping siblings |
| Entity renders but ignores input | Missing `InputTargetComponent` + `CollisionComponent` | Both are mandatory for gesture hit-testing |
| Attachment positions treated as points | Off-by-1000 bug -- RealityKit space is meters | `0.25` = 25 cm, not 25 pt |
| Shipping an `.ornament` on iOS | Renders nowhere | Platform-branch spatial-only affordances |
| Pure-white full-bleed backgrounds | Glare in the headset | Vibrant, saturated system colors |

## Severity guide

CRITICAL: a pinch-targetable custom view with no `.hoverEffect()` or hit-test components -- functionally broken/invisible input. HIGH: `.shadow()`-faked elevation, or `glassBackgroundEffect()` misapplied inside `overlay`/`background`. MEDIUM: attachment positions off by orders of magnitude (points vs. meters), or a gaze target under 60x60 pt. LOW: an unhedged claim about an SDK-unverified visionOS 26 selector. NIT: `.lift` applied to a tiny chrome control where `.highlight` reads correctly.

## See also

- `references/design/02-liquid-glass.md#multi-platform-availability` -- the cross-platform `glassEffect()` material this file's `glassBackgroundEffect()` is deliberately distinct from (owner)
- `references/design/03-typography-dynamic-type.md` -- `.extraLargeTitle`/`.extraLargeTitle2` are visionOS-only text styles (owner)
- `references/interaction/03-direct-manipulation-drag.md` -- general drag/manipulation semantics this file's 3D-entity gestures extend
- `references/accessibility/05-motion-accessibility.md` -- the Reduce Motion double-gate (owner)
- `references/accessibility/04-motor-interaction.md#touch-targets` -- the 44pt baseline this file's 60pt gaze-target floor extends
- `references/cross-platform/01-ipados-multiplatform.md#pointer-and-hover` -- contrast with iPad's touch-hardware hover model
