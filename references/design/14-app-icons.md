# App Icons

> Owner: `references/design/14-app-icons.md` owns app icon craft end to end -- concept, layering, Icon Composer properties, appearances, canvas and export, the `.icon` package, and icon review. The alternate-icon RUNTIME API (`setAlternateIconName`, the system confirmation alert, the in-app Settings UX) stays with `references/platform/04-system-surfaces-notifications.md#alternate-app-icons-appearances-and-launch-screens`. In-app glyphs are `references/design/05-sf-symbols.md`; an app icon is not a symbol and must never be one.
> Floors: Icon Composer is a toolchain dependency, not a runtime floor -- see `references/_scaffolding/version-floor-registry.md#xcode-27-toolchain-changes-no-runtime-floor`. One `.icon` file back-deploys to every OS version the app supports; Xcode generates the legacy raster ladder at build time.

The app icon is the only piece of an app's design that every user sees before they have decided to care. It is also the one surface where the designer no longer controls the finish: since iOS 26 the system owns specular highlights and translucency, and on the 27 releases refraction as well, and the HIG says outright that those effects "automatically adapt with the size of your icon, apply consistently across platforms, and can appear differently between system versions." The way apps get this wrong is to keep shipping a picture -- a flat 1024 PNG with a baked bevel and a drop shadow -- when the platform now wants a **model**: flat, opaque artwork split into layers, with the depth applied by the renderer at display time. A picture cannot be tinted, cannot go clear, and fights every highlight the system draws on top of it.

## The Apple way

- **One idea, few shapes.** "Find a concept or element that captures the essence of your app or game, make it the core idea of your icon, and express it in a simple, unique way with a minimal number of shapes." Apple's own engineers name excessive complexity as the most common mistake developers make. Leaving canvas empty is a choice, not an omission -- "you don't need to fill the entire icon canvas with content."
- **The silhouette is the identity.** An icon that survives being reduced to white-on-grey is an icon that survives everything else. Design the mono rendition first in your head; if the mark only works because of its colors, it does not work.
- **Flat artwork, system depth.** Ship filled, opaque, hard-edged shapes. "Let the system handle blurring and other visual effects... there's no need to include specular highlights, drop shadows between layers, beveled edges, blurs, glows, and other effects." Custom effects are static; the system's are dynamic, and they collide.
- **Consistent across appearances.** "Keep your icon's core visual features the same in the default, dark, clear, and tinted appearances." Only the treatment changes. Swapping a glyph between variants is a defect, not a variant.
- **Consistent across platforms.** One design, adapted by geometry alone. The watchOS circle is a scale change, not a redraw.
- **No text, no photos, no UI replicas, no Apple hardware.** Text does not localize or scale; photos cannot be layered or tinted; a screenshot of your own UI says nothing at the size it is actually seen; Apple products are copyrighted and cannot be reproduced.
- **Judged at the smallest size, not at 1024.** The system scales one asset down into Settings and notifications. Thin strokes and fine detail die there, and nothing rescues them.
- **Never draw the mask.** No rounded rectangle, no circle, no pre-cropped edges. "Providing layers with pre-defined masking negatively impacts specular highlight effects and makes edges look jagged."

## The icon model

### Layers, groups, and the background

On iOS, iPadOS, macOS and watchOS an app icon is "a background layer and one or more foreground layers that coalesce to create dimensionality." The Icon Composer document is three levels deep:

- **Canvas** -- the icon itself. It owns the background fill. Icon Composer supports solid colors and gradients for backgrounds, "making it unnecessary to import custom background images in most cases," so the background is normally authored as a fill value, not an exported image.
- **Groups** -- "The groups become the layers in the app icon image the platform renders to give the icon its depth. The system renders the layers in the z-plane from the bottom to the top as they appear in the sidebar." A group is the unit of Liquid Glass: material settings live here.
- **Layers** -- the individual SVG or PNG graphics. A layer is the unit of artwork.

**Four groups maximum.** Apple: "organize the layers that appear in the default group into a maximum of four groups to reduce complexity." Icon Composer ships the diagnostic verbatim -- "Too many visible groups. / This icon exceeds the maximum group limit of four." `actool` enforces it: five visible groups fail the build with that exact message plus "Icon validation failed." Only hidden groups are exempt, so a fifth group parked behind `"hidden": true` compiles.

Most icons want **two groups**: background fill plus one foreground group. Reach for a third only when a real z-separation exists (a card behind a mark, a mark in front of it). Four is the ceiling, not a target.

### Six renditions, three authored appearances

iOS, iPadOS and macOS render **six** renditions. The HIG names them "Default, dark, clear light, clear dark, tinted light, tinted dark"; the `.icon` format's internal identifiers are `light-color`, `dark-color`, `light-clear`, `dark-clear`, `light-tint`, `dark-tint`.

You author **three**. The `.icon` schema's `appearance` enum is exactly `light`, `dark`, `tinted` -- `mono` and `clear` are rejected. Apple renamed the annotations at WWDC25 from light/dark/tinted to default, dark and mono, "with the artwork producing all the appearances for clear and for tinted." Clear and tinted are both derived from the mono annotation, and "the system automatically generates variants you don't provide."

The practical consequence: budget three authoring passes, then **verify six**. "It looks fine in dark mode" is a third of the job. Clear-dark over a bright wallpaper is where icons actually fail.

watchOS, tvOS and visionOS have no appearance variants at all -- the HIG Specifications table lists N/A, and Icon Composer states "For watchOS, there are no appearances to preview." Apple Watch shows the light-mode icon. Do not spend design time on a watchOS dark variant; spend it on the circular crop.

### Design generations 26 and 27

Icon Composer 2.0 (Xcode 27) previews two **design generations**, labelled in the toolbar as Design Generation 26 and Design Generation 27 (internally `designGeneration26` / `designGeneration27`), plus a third state, Liquid Glass Effects Disabled. "Icon Composer 2.0" is release-note branding: the shipping app reports version 27.0, so test for the Xcode 27 toolchain, never for a "2.0" string. It is available inside Xcode (Xcode > Open Developer Tool > Icon Composer) and as a standalone download.

Generation 27 is the **current** generation, not a future one. Apple's release note phrase -- "a new sharper rendering mode for upcoming 2027 operating systems with support for refractivity, outside specular, and deeper shadows" -- is the model-year name for the OSes numbered 27, which shipped 2026-09-14. The binding statement is in the Icon Composer doc: "In iOS, iPadOS, macOS, and watchOS versions earlier than 27, specular highlights appear on when you choose Inside or Outside, and Refraction settings have no visible effect."

So refraction and Inside/Outside specular are **live today and inert on 26**: before 27 refraction has no visible effect at all, and choosing Inside or Outside collapses to the highlight simply being on. Treat both as progressive enhancement -- use them, and confirm the icon still reads with them switched off. One asset serves both -- "When your icon looks great in both design generations, add it to your Xcode project to use it with all OS versions."

Generation 27 also reduced translucency system-wide, in Apple's own icons, "to have icons feel sharper and more legible," and legacy flat icons -- which the system segments into minimal internal Icon Composer documents and re-renders -- come out less translucent and more prominent than they did on 26. **An icon nobody touched looks different on 27.** That is reason enough to re-review every shipped icon.

## Designing the concept

### Three directions, judged as silhouettes

Do not start in the app's category. Every note-taking app that starts at "notes" draws a piece of paper, and the Home Screen fills with interchangeable paper. Start at what the app actually does for the person using it, then draw three directions in rough silhouette -- black shapes on grey, no color, no gradient, ten minutes each:

1. **The object.** The thing the app makes or handles, drawn frontally and flat. Concrete, instantly legible, and the most likely to collide with competitors.
2. **The action.** The verb rendered as geometry -- a fold, a cut, a wave, a path. Harder to draw, far harder to confuse with anything else.
3. **The mark.** A constructed abstraction the app can own outright: an interlock, a monogram of one letter, a shape with a memorable negative space. Highest ceiling, highest risk of meaning nothing.

Then choose on two tests, in this order:

- **Recognizability at the smallest size the app is displayed at.** Render each direction small and look at it on the device. The system scales one asset down for Settings and notifications; Icon Composer's "Select preview size" pop-up (with Customize Point Sizes) is where you inspect those sizes deliberately. Apple stopped publishing a per-size ladder -- inspect, do not calculate. The HIG's failure mode is named: "extremely thin line weights and sharp corners... tend to lose detail and crispness in smaller icon sizes at lower resolutions," and "an icon with fine visual features might look busy when rendered with system-provided shadows and highlights."
- **Distinctiveness on a busy Home Screen.** Put the candidate on a screenshot of a real, full Home Screen -- Icon Composer takes a custom background image for exactly this -- and look for it without knowing where it is. An icon you have to hunt for has failed, however elegant it is at 1024.

Neither test is passed by detail. Both are passed by shape and by one decisive color relationship.

The trap at the end of this process is the AI-default icon: a centered outline glyph on a purple-to-blue diagonal gradient. It is legible, inoffensive, and indistinguishable from forty other apps -- and its outline glyph is the single worst shape for Liquid Glass, which needs filled forms to catch light. If the concept survives only because of its gradient, it is not a concept yet.

### What is not negotiable

- **Illustrations, not photos.** "Photos are full of details that don't work well when displayed in different appearances, viewed at small sizes, or split into layers."
- **No UI replicas or screenshots.** "If your app has an interface that people recognize, don't just replicate standard UI components or use app screenshots in your icon."
- **No Apple hardware.** "Apple products are copyrighted and can't be reproduced in your app icons."
- **Frontal and flat.** Realistic 3D objects and perspective compete with the material; Apple's redesigned Chess icon "uses a frontal view and a more flat appearance."
- **Text only when essential.** It does not support accessibility or localization, is usually too small to read, and clutters. Avoid words that tell people what to do ("Watch", "Play") or context terms ("New", "For visionOS"). A single mnemonic letter -- the app's initial -- is legitimate and can help recognition.

## Layering for Liquid Glass

### What goes where

| Slot | Content | Authored as |
|---|---|---|
| Canvas background | One solid color or one gradient | `fill` on the icon, not an SVG |
| Back foreground group | The containing shape or field the mark sits on, if there is one | Full-canvas SVG, flat fill |
| Front foreground group | The mark itself -- the element that must read at the smallest size | Full-canvas SVG, flat fill |

**Split layers by what must change, not by what looks separate.** Apple states it directly: "Separate colors, text, and any other graphics into layers that you want to modify for platforms and appearances in Icon Composer." Apple's Translate icon splits the type from the bubbles specifically so the dark variant needs one fill change. A layer that never varies and never needs its own material setting is a layer you do not need.

Background choice carries more weight than it looks. Apple developed System Light and System Dark gradient presets to be used "instead of pure white or black backgrounds," recommends "softer light-to-dark gradients" that harmonize with the direction of light, and recommends "leaning more into colored backgrounds, so that there is a nicer distinction when switching between modes." A colored background is what keeps dark and mono from turning muddy.

Foreground shapes want to be **filled and overlapping**, with clearly defined edges: "avoid soft and feathered edges on foreground layer shapes," and "overlapping solid shapes in the foreground, particularly when paired with transparency and blurring, can give an icon a sense of depth." Bolder line weights preserve detail at small scale; rounder corners let light travel along the edge.

### What never goes into a layer

The export checklist is Apple's, and every item is individually reviewable:

- No specular highlights, drop shadows between layers, beveled edges, blurs or glows.
- No background colors or gradients baked into a foreground SVG.
- No pre-applied opacity or translucency. "Importing fully opaque layers and adjusting transparency in Icon Composer lets you preview and make adjustments to your design based on how transparency and system effects impact one another." Baked alpha cannot be previewed against system effects and cannot be varied per appearance.
- No mask. No rounded corners, no circle crop, no bleed trimmed to the shape. "We never include the rounded rectangle or circle mask in our exports... this mask is automatically applied later, ensuring the perfect crop."
- No live text. "Because SVG format doesn't preserve fonts, convert text to outlines." Icon Composer flags it: "SVG contains text. / One layer uses an SVG asset that contains text elements. Text should be converted to paths before use in icons."

## Icon Composer properties

The Style inspector has three sections, and an icon spec should be written in the same three buckets: **Color** for per-appearance work, **Liquid Glass** for per-group material, **Composition** for per-platform geometry. A fourth inspector, Document, selects the platforms the document targets.

### Color

| Property | Values | Change it when |
|---|---|---|
| **Fill** | None, Solid, Gradient (default Automatic -- taken from the graphic file) | The color must differ from the source SVG, or must vary by appearance. Gradients expose From/To color wells, each with an opacity percentage and draggable gradient dots on canvas |
| **Opacity** | Percentage | A foreground layer should sit back. "Vary opacity in foreground layers to increase the sense of depth and liveliness" |
| **Blend Mode** | `normal`, `multiply`, `screen`, `overlay`, `darken`, `lighten`, `hard-light`, `soft-light`, `plus-lighter`, `plus-darker` (the `icon.json` values) | Rarely. A blend mode that looks right in default usually breaks in mono |

### Liquid Glass (group properties)

| Property | Values | Default and when to move off it |
|---|---|---|
| **Mode** | Individual, Combined | "To apply the effects to every layer in the group separately, choose Individual. To apply the effects to the layers in the group as one object, choose Combined." Combined for shapes that read as one object; Individual when each shape should catch its own light |
| **Specular** | Off, Automatic, Inside, Outside | Leave on Automatic. Apple's engineers call the automatic placement good defaults that should work without being touched. Inside/Outside is a deliberate override, and before 27 the placement is ignored and the highlight simply appears on |
| **Blur** | Number | For a layer meant to sit softly behind the mark. Blur belongs here, never in the SVG |
| **Refraction** | Toggle plus a strength/depth pair, set by dragging a point in a 2D field or typing percentages | "Refraction lets layers pick up and transmit color and shape from what's behind them." The most sensitive control in the tool: very small moves make a large difference, and the effect is sensitive to how many shapes the icon has, how big they are, and how they overlap. Live on 27, inert on 26 |
| **Translucency** | Toggle plus a value | Sparingly. Generation 27 reduced translucency across Apple's own icons for legibility |
| **Shadow** | Neutral, chromatic, off | Neutral is the preset and "look[s] great on any background." Chromatic ("The color from the artwork spills onto the background") is for saturated artwork against white -- re-check it in dark and mono, where Apple keeps neutral via a per-appearance variant |

A **layer** carries one Liquid Glass control of its own: an **Effects** toggle that turns the material off for that layer alone. Everything else material-related lives on the group.

### Composition

A **Visible** toggle, an **Image** pop-up with **Replace** (swap the graphic backing a layer), and a **Layout** sub-section with **x**, **y** and **scale**. Numeric fields accept equations -- type `35*3`, or `*2` to double the current value -- and arrow keys nudge by one point.

### Specializations: color varies by appearance, geometry by platform

Any property can be varied: select the platform or appearance on the canvas, then click the icon next to the setting in the Style inspector and choose Vary for appearance or Vary for platform. Apple constrains the axes deliberately -- the Composition controls apply only to the selected platform, and "the controls behave in this way so that the appearance of your app icon remains consistent and only the geometry varies across platforms."

That is the rule to design to and to enforce in review:

- **Color varies by appearance.** Fill, opacity and blend mode are pre-configured per appearance.
- **Geometry varies by platform.** Scale and translation are the watchOS circular adaptation.

A spec that changes scale between default and dark, or fill between iOS and watchOS, is fighting the tool.

## Appearances

### Tuning the mono version

Icon Composer generates a mono mapping automatically, and Apple says to tune it: the automatic conversion is a starting point, "but it's important to tune it to get the best contrast."

The rule is concrete enough to review against: **set one element -- the most prominent or recognizable one -- to pure white, and map everything else to tones of grey.** Apple, verbatim: "Setting at least one element of your icon to be white, usually the most prominent or recognizable part, make sure it shows up strong, and the other colors can be mapped to tones of gray."

Clear and tinted are previewed through the Mono appearance's **Options** dialog, which carries a Light/Dark toggle, a **Tinted** toggle and tint color sliders -- not as top-level appearances. Reviewing them means loading a real bright wallpaper as the canvas background image and looking at clear-dark, the rendition Apple guarantees the least about.

### What makes an icon collapse when tinted

Clear and tinted throw away hue and keep luminance. Four things collapse:

1. **A mark separated from its background only by hue** -- equal-luminance color pairs become one flat shape.
2. **A gradient carrying the whole composition** -- a gradient with no shape underneath it reduces to a uniform field.
3. **An outline glyph** -- a hairline that was already marginal at small sizes disappears once it is grey on grey.
4. **Multi-color artwork with no dominant element** -- nothing gets to be the white one, so everything lands mid-grey.

The fix in every case is the same and belongs in the concept, not the tuning: a luminance difference between the mark and its background, and one element that owns the top of the range.

## Canvas, export, and project setup

### Canvas sizes

| Platform | Canvas | System mask |
|---|---|---|
| iOS, iPadOS, macOS | 1024 x 1024 px | Rounded rectangle |
| watchOS | 1088 x 1088 px | Circle |
| visionOS | 1024 x 1024 px | Circle |
| tvOS | 800 x 480 px | Rounded rectangle |

watchOS is 1088 rather than 1024 because it overshoots the rounded rectangle while using the same grid, so the circular crop does not eat the artwork.

Provide square layers for iOS, iPadOS, macOS, visionOS and watchOS, and rectangular layers for tvOS, and let the system mask them. The corner is a continuous curve that "precisely match[es] the curvature of other rounded interface elements throughout the system and the bezel of the physical device itself" -- concentric with the hardware, applied by the system. Never draw it.

**Apple publishes no keyline, margin, safe-area or corner-radius number for app icons.** There is no percentage to cite and none to invent. The published instruction is positional: "Keep primary content centered to avoid truncation when the system adjusts corners or applies masking. Pay particular attention to centering content in visionOS and watchOS icons. To help with icon placement, use the grids in the app icon production templates, which you can find in Apple Design Resources." In-tool, the Grid pop-up (Light or Dark) plus the Grid on/off button is the check. Any spec quoting a numeric margin is quoting something Apple did not say.

### Exporting layers

- **SVG by default.** "Prefer vector graphics when bringing layers into Icon Composer... vector graphics (such as SVG or PDF) scale gracefully and appear crisp at any size." Icon Composer's import path is SVG or PNG, so ship SVG.
- **PNG only for mesh gradients and raster artwork**, "because it's a lossless image format."
- **Full canvas, every layer.** Export at canvas size so layers drop straight into position, unmasked and untrimmed.
- **Fully opaque, flat fills, hard edges.** Opacity and material belong in the tool.
- **Text converted to outlines.** Emit paths, never `<text>`.
- **Names carry order.** "Give the layers meaningful names that include numbers (increment from back to front)."
- **Color space.** App icons support sRGB, Gray Gamma 2.2 and Display P3 (Display P3 is excluded on visionOS). Icon Composer tags colors with a space, and the Document inspector's "Use Display P3 if untagged" switch decides how an untagged SVG is read -- a silent source of color drift between design tool and device. Tag the SVG or set the switch deliberately.

### The `.icon` package

`.icon` is a package (UTI `com.apple.iconcomposer.icon`, conforming to `com.apple.package`) -- a directory containing a required `icon.json` at the root and an `Assets` directory holding the layer graphics.

```
Nocturne.icon/
  icon.json
  Assets/
    01-horizon.svg
    02-moon.svg
```

Top-level `icon.json` keys: `fill`, `groups`, `supported-platforms`, and optionally `features`, `languages`, `canvas-size` and `color-space-for-untagged-svg-colors`.

`supported-platforms` is required. The stock Xcode template ships `{"circles": ["watchOS"], "squares": "shared"}`; `squares` also accepts an explicit array such as `["iOS", "macOS"]`. Turn off platforms the app does not ship -- it cuts the review matrix. For a directional mark, set `"asset-mirroring": {"mirrorable": true}` on the directional group or layer rather than shipping a second icon (it is a group/layer property, not a top-level key -- at top level it is silently ignored); see `references/accessibility/06-localization-rtl.md#rtl-mirroring-what-auto-flips-what-doesnt`.

### Build settings

Drag the `.icon` into the Project navigator, then in the target's General tab, under App Icons and Launch Screen, make the App Icon field match the file's name without its extension. The underlying build settings:

| Build setting | Xcode name | Use |
|---|---|---|
| `ASSETCATALOG_COMPILER_APPICON_NAME` | Primary App Icon Set Name | The primary `.icon` (or asset catalog set) |
| `ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES` | Alternate App Icon Sets | Each alternate icon, named |
| `ASSETCATALOG_COMPILER_INCLUDE_ALL_APPICON_ASSETS` | Include All App Icon Assets | Include every icon asset instead of naming them |

Xcode writes `CFBundleIcons`, `CFBundlePrimaryIcon` and `CFBundleAlternateIcons` into Info.plist from those settings. Apple: "To change the values of CFBundleIcons, CFBundleAlternateIcons, and CFBundlePrimaryIcon, modify their related build settings. Don't edit or remove these keys manually from the Info.plist file."

Two consequences worth checking before hand-over:

- **The `.icon` retires the asset catalog.** "If you add an Icon Composer file to your Xcode project, it replaces any existing icon asset catalog that you previously used to represent your app icon." A project carrying both will use the `.icon`, and edits to the leftover AppIcon set will appear to do nothing. Delete it.
- **The size ladder is obsolete.** Xcode generates legacy raster fallbacks at build time for releases without the new appearances and material. A hand-maintained per-size PNG set is dead weight to delete, not something to update.

There is also **no separate App Store marketing icon upload** for an Icon Composer project: one multilayer file represents the icon "everywhere your app icon appears across iOS, iPadOS, macOS, watchOS, and the App Store," and the store takes it from the build. A legacy asset-catalog project still needs its 1024pt well filled.

### Alternate icons

"For each alternate app icon, the project requires an Icon Composer file." Each alternate is a whole second document with its own three authored appearances -- the HIG states it flatly: "Alternate app icons in iOS and iPadOS require their own dark, clear, and tinted variants. As with your default app icon, all alternate and variant icons are subject to app review and must adhere to the App Review Guidelines." Alternates are available on iOS, iPadOS, tvOS and compatible apps running in visionOS; not macOS, not watchOS. Price the variant burden before promising an icon picker. The runtime switching API is owned by `references/platform/04-system-surfaces-notifications.md#alternate-app-icons-appearances-and-launch-screens`.

### Previewing and validating

Above the Icon Composer canvas: a background color well, a Background Image pop-up (with Add Background for your own wallpaper or Home Screen screenshot), a background toggle, a Grid pop-up (Light or Dark) with an on/off button, a "Select preview size" pop-up, a zoom pop-up, and the Effects buttons that switch design generation. Below the canvas: platform on the left, appearance on the right (Default, Dark, Mono), with Mono's Options dialog holding the Light/Dark toggle, the Tinted toggle and the tint sliders.

When Xcode is installed, a `.icon` can be compiled headlessly, which catches a malformed `icon.json` or a missing asset without opening the app:

```sh
xcrun actool MyApp.icon --compile /tmp/iconout \
    --platform iphoneos --minimum-deployment-target 26.0 \
    --app-icon MyApp \
    --output-partial-info-plist /tmp/iconout/partial.plist \
    --errors --warnings --notices
```

A clean run emits `Assets.car`, the legacy raster fallbacks and a partial Info.plist carrying `CFBundleIcons` > `CFBundlePrimaryIcon`. The rendered PNGs in the output directory are the fastest way to confirm the layers actually composited. Note what `actool` does **not** check: it has no opinion about legibility, concept, or whether the mono rendition was tuned.

## Producing an Icon Composer-ready deliverable

What to hand over, in order. Everything below is emittable by an agent; nothing requires opening Icon Composer.

### 1. Concept rationale

Three to five sentences, not a mood board: what the app does for the person using it, which of the three directions won, what it is that the mark owns, and what was deliberately left out. State the single element that will be white in mono. If the rationale cannot name that element, the concept is not finished.

### 2. Layer inventory

| # | Layer | Group | Content | Fill | Must survive |
|---|---|---|---|---|---|
| -- | (canvas) | -- | Background | `linear-gradient`, deep indigo to violet | Clear-dark over a bright wallpaper |
| 01 | `01-horizon` | Horizon | Curved horizon band, full width | Solid violet, darkened in `dark` | Mono: mid-grey, must stay distinct from background |
| 02 | `02-moon` | Moon | Crescent, upper third | Solid warm white | Mono: **pure white**; smallest preview size; generation 26 with refraction off |

One row per layer plus one for the canvas. "Must survive" is the column that does the work: it is what the reviewer checks, and it forces the appearance question at design time.

### 3. Layer SVGs

One file per layer, named with its order number, on the platform canvas (1024 square for iOS/iPadOS/macOS, 1088 square for watchOS -- tvOS and visionOS are not Icon Composer documents; see Platform notes):

- Full-canvas `width`/`height`/`viewBox`, no mask, no crop, no trimmed bleed.
- Flat solid fills, fully opaque, hard edges.
- No shadow, bevel, glow, blur, baked specular, or background fill.
- Paths only. Convert text to outlines; if a mnemonic letter is unavoidable, it ships as a path.

### 4. `icon.json`

Use only these keys. If a property is not listed here, leave it out rather than guess a name.

**Top level:** `fill`, `groups`, `supported-platforms` (plus the optional `features`, `languages`, `canvas-size`, `color-space-for-untagged-svg-colors`).

**Group:** `name`, `layers`, `hidden`, `opacity`, `blend-mode`, `lighting` (`individual` | `combined` -- the Mode pop-up), `specular` (Bool), `specular-highlight-placement` (`automatic` | `inside` | `outside`), `blur-material` (Number), `translucency` (`{enabled, value}`), `refractivity` (Bool, or `{enabled, strength, depth}`; negative `strength` inverts it), `shadow` (`{kind, opacity}` where `kind` is `neutral` | `layer-color` | `none`, and `layer-color` is the chromatic mode), `position` (`{scale, translation-in-points: [x, y]}`), `asset-mirroring` (`{mirrorable: Bool}` -- the document's Mirror Assets in Right to Left switch).

**Layer:** `name`, `image-name` (the file's name inside `Assets/`, with its extension), `fill`, `glass` (Bool -- the Effects toggle), `hidden`, `opacity`, `blend-mode`, `position`, `asset-mirroring` (`{mirrorable: Bool}`).

**Fill forms:** `{"solid": <color>}`, `{"linear-gradient": [<color>, <color>]}`, `{"automatic-gradient": <color>}`. A color is the string `"<space>:r,g,b,a"` with space one of `srgb`, `extended-srgb`, `display-p3`, `gray`, `extended-gray`.

A minimal complete package, verified by compiling it with `xcrun actool` under Xcode 27:

```json
{
  "fill" : {
    "linear-gradient" : [
      "display-p3:0.06000,0.07000,0.20000,1.00000",
      "display-p3:0.29000,0.24000,0.56000,1.00000"
    ]
  },
  "groups" : [
    {
      "name" : "Horizon",
      "lighting" : "combined",
      "specular" : true,
      "specular-highlight-placement" : "automatic",
      "translucency" : { "enabled" : true, "value" : 0.5 },
      "shadow" : { "kind" : "neutral", "opacity" : 0.5 },
      "layers" : [
        {
          "name" : "01-horizon",
          "image-name" : "01-horizon.svg",
          "glass" : true,
          "opacity" : 0.90,
          "fill" : { "solid" : "display-p3:0.45000,0.40000,0.78000,1.00000" },
          "fill-specializations" : [
            { "value" : { "solid" : "display-p3:0.30000,0.26000,0.58000,1.00000" }, "appearance" : "dark" }
          ]
        }
      ]
    },
    {
      "name" : "Moon",
      "lighting" : "individual",
      "specular" : true,
      "specular-highlight-placement" : "outside",
      "refractivity" : { "enabled" : true, "strength" : 0.35, "depth" : 0.50 },
      "shadow" : { "kind" : "neutral", "opacity" : 0.60 },
      "layers" : [
        {
          "name" : "02-moon",
          "image-name" : "02-moon.svg",
          "fill" : { "solid" : "display-p3:1.00000,0.97000,0.90000,1.00000" },
          "fill-specializations" : [
            { "value" : { "solid" : "display-p3:1.00000,1.00000,1.00000,1.00000" }, "appearance" : "tinted" }
          ],
          "position-specializations" : [
            { "value" : { "scale" : 0.92, "translation-in-points" : [ 0, 12 ] }, "idiom" : "watchOS" }
          ]
        }
      ]
    }
  ],
  "supported-platforms" : {
    "circles" : [ "watchOS" ],
    "squares" : "shared"
  }
}
```

`specular-highlight-placement: "outside"` and `refractivity` above are the generation-27 enhancement: they render on 27 and are inert on 26, which is why the icon still has to be checked with the Effects button set to 26.

### 5. Per-appearance specializations

Overrides are arrays named `<property>-specializations`, each entry `{"value": <v>, "appearance": <a>, "idiom": <i>}` -- either key alone, or both. `appearance` is exactly `light` | `dark` | `tinted`. `idiom` is exactly `square` | `macOS` | `watchOS`. (`mono`, `clear` and `circle` are rejected: the schema is itself the proof that only three appearances are authored.)

The specialization arrays: `fill-specializations`, `opacity-specializations`, `blend-mode-specializations`, `glass-specializations`, `blur-material-specializations`, `translucency-specializations`, `shadow-specializations`, `specular-specializations`, `specular-highlight-placement-specializations`, `refractivity-specializations` (plus `refractivity-strength-specializations` and `refractivity-depth-specializations`), `lighting-specializations`, `position-specializations`, `hidden-specializations`, `image-name-specializations`, `asset-mirroring-specializations` (each `value` is the object `{"mirrorable": Bool}`, not a bare Bool or string).

Keep to the axis rule: color properties get `appearance`, geometry gets `idiom`.

### Hand-over checklist

Run all of it before calling the deliverable done:

1. **Mono preview** inspected, with exactly one element at pure white and the rest grey.
2. **All six renditions** checked, clear-dark last, over a real bright wallpaper.
3. **Smallest preview size** checked on device, not at 1024.
4. **Both design generations** checked -- 27, then 26 with refraction and Inside/Outside specular inert.
5. **Four groups or fewer**, visible in the document.
6. **Every layer** full-canvas, unmasked, opaque, flat, text outlined.
7. **Platforms the app does not ship** turned off in `supported-platforms`.
8. **`xcrun actool` compile clean** when Xcode is available, and the rendered PNGs inspected.
9. **Any leftover AppIcon asset catalog set** identified for deletion.
10. **Each alternate icon**, if any, delivered as its own `.icon` with its own three authored appearances.

## Platform notes

**macOS.** The free-form silhouette is over: a Mac icon is now the same square 1024 canvas masked to the same rounded rectangle as iOS, and the canvas shape acts as a mask, so elements that used to extend past the shape are clipped. An unmigrated icon near the rounded rectangle is auto-masked or extended and given the new material; a uniquely shaped one has its drop shadows removed and is auto-scaled into the squircle, and an irregular icon receives a system-provided background. Apple recommends redrawing, and so should you -- the fallback is rarely good. See `references/cross-platform/04-macos-catalyst.md`.

**watchOS.** 1088 square, masked to a circle, no appearance variants. Adapt by geometry in the Composition section: if elements touch the canvas edge in the square design, scale them up so they touch again in the circle, or design the source art with bleed. Never use black for the background -- lighten it so the icon does not blend into the display. See `references/cross-platform/02-watchos.md`.

**tvOS.** Not Icon Composer. A tvOS icon is a layered image stack in the asset catalog, between two and five layers, 800x480, previewed with the Parallax Previewer app or the Parallax Exporter plug-in (`.lsr`). It is the one platform with an explicit safe zone: the system may crop content around the edges as the focused icon scales and moves, the zone varies with image size, layer depth and motion, and **foreground layers are cropped more than the background** -- inset foreground content further. Apple publishes no number for it. Any text must sit above the other layers so the parallax does not crop it. See `references/cross-platform/03-tvos.md`.

**visionOS.** Not Icon Composer either: an asset-catalog image stack of a background layer plus one or two layers on top, three maximum, 1024 square masked to a circle, exported as `.xlsr` if parallax is tuned. The icon is a three-dimensional object that expands subtly when looked at, and the system uses the alpha channel of the upper layers to create the embossed appearance. Avoid any shape in the background meant to look like a hole or concave area -- the system shadow and specular make it stand out instead of recede. Display P3 is not supported here. See `references/cross-platform/05-visionos.md`.

**iPadOS.** Same 1024 canvas, same rounded rectangle, same six renditions as iOS; nothing separate to author. It is where alternate icons and the Home Screen appearance switch are most visible, so it is the idiom to screenshot when demonstrating the variant set. See `references/cross-platform/01-ipados-multiplatform.md`.

## Reviewing an icon

Run in this order. Each row states what decides it. Severities follow the shared scale in `references/review/01-finding-format.md#severity-scale`.

| Check | Evidence that decides it | Severity if it fails |
|---|---|---|
| Illegible or unrecognizable at the smallest displayed size | Render at the smallest preview size and look on device. Detail dissolving into a smudge, a mark no longer identifiable, hairlines and fine features gone | HIGH |
| Borrows another developer's mark, brand or product name, or breaches the 4+ / family-similarity rules | Guideline 4.1(c): "You cannot use another developer's icon, brand, or product name in your app's icon or name, without approval from the developer." Guideline 2.3.8 requires icons to hold a 4+ rating and to stay similar across the icon family | CRITICAL (App Review risk) |
| Collapses in tinted or clear | Mono > Options with Tinted on, and clear-dark over a bright wallpaper. Mark and background merging, or the whole composition flattening | HIGH |
| Baked effects fighting the system | Inspect the SVGs: a drop shadow, bevel, gradient background, glow, pre-applied alpha, or an embedded mask. The named consequences are broken specular and jagged edges | HIGH |
| Alternate icon missing its dark, clear or tinted variants | The HIG requires each alternate to have its own; a single-variant alternate is broken on every appearance the user can pick, and every variant is subject to App Review | HIGH (MEDIUM when only one appearance of one alternate is missing) |
| No mono tuning -- no element at pure white | Mono preview. Everything landing mid-grey means the automatic conversion was never tuned | MEDIUM |
| More than four visible groups | The document sidebar, or `groups` in `icon.json`. `actool` fails the build with "Too many visible groups" | HIGH |
| Features swap between appearances | Compare default against dark and mono. A glyph present in one and absent in another | MEDIUM |
| Refraction too strong for the shape count | Generation 27 preview. Edges smearing, or the mark reading differently than at generation 26. Refraction is sensitive to how many shapes an icon has, how large they are and how they overlap | MEDIUM |
| Never checked against generation 26 | Effects button set to 26. If the icon only works with refraction and Inside/Outside specular on, it does not work on iOS 26 | MEDIUM |
| Leftover AppIcon asset catalog alongside a `.icon` | Both present in the project. The `.icon` wins and catalog edits silently do nothing | MEDIUM |
| Hand-maintained per-size PNG ladder still in the project | The asset catalog. Xcode generates those at build time now | LOW |
| Pure white or pure black background instead of the system gradients | The background fill. Apple developed System Light and System Dark gradients for this | LOW |
| Untagged SVG colors with no deliberate color-space decision | The SVGs plus the Document inspector's "Use Display P3 if untagged" switch. Silent color drift between design tool and device | LOW |
| A word, rather than a single mnemonic letter, in the icon | The artwork. Text does not localize or scale; one initial is legitimate | LOW |
| Platforms the app does not ship left enabled in `supported-platforms` | `icon.json`. Costs review time, not correctness | NIT |
| Layer names without order numbers | `icon.json`. Apple's convention is to increment back to front | NIT |

An icon that has never been looked at on iOS 27 gets a finding on its own: generation 27 reduced translucency and sharpened specular system-wide, including for legacy flat icons the system re-renders, so a shipped icon nobody touched now looks different from the one that was approved.

## Accessibility contract

The icon carries no VoiceOver semantics of its own -- the app's display name is what is spoken, which is one more reason a word baked into the artwork buys nothing. What the icon does owe:

- **Luminance contrast, not hue contrast.** Clear and tinted discard hue. A mark separated from its background only by color is invisible to those renditions and to a user with a color-vision deficiency at the same time; this is the icon's form of `references/accessibility/03-visual-accessibility.md#color-is-never-the-only-indicator`.
- **No reliance on the system effects to carry meaning.** Refraction has no visible effect on generation 26, an Inside/Outside specular choice is ignored there, and generation 27 reduced translucency. If a shape only separates from its neighbour because of a highlight, it does not separate.
- **Directional marks mirror in the document**, via `"asset-mirroring": {"mirrorable": true}` on the group or layer, rather than reading backwards in right-to-left locales.
- **Alternate icon switching is user-initiated and reversible**, never a surprise -- owned by `references/platform/04-system-surfaces-notifications.md#alternate-app-icons-appearances-and-launch-screens`.

## Anti-patterns

| Wrong | Why it fails | Right |
|---|---|---|
| A flat 1024 PNG for a new iOS/macOS/watchOS icon | Forfeits every appearance the system can render and every material control; the system segments it into a minimal internal document and renders it with settings nobody chose | A `.icon` with a background fill and foreground groups |
| Drop shadow, bevel or specular baked into the SVG | Collides with the system's dynamic effects; static where the system is dynamic | Flat opaque artwork; Shadow and Specular set on the group |
| Layer exported pre-masked to the rounded rectangle | "Negatively impacts specular highlight effects and makes edges look jagged" | Full-canvas square layers; the system applies the mask |
| Alpha baked into the artwork | Cannot be previewed against system effects, cannot vary per appearance | Export opaque, set Opacity in Icon Composer |
| An outline glyph as the mark | Hairlines vanish at small sizes and in mono, and outlines give Liquid Glass nothing to light | Filled, overlapping shapes with bold weights |
| Gradient carrying the composition with no shape underneath | Flattens to a uniform field in clear and tinted | A shape that reads in one value, with the gradient as support |
| Designing six appearance variants by hand | Invites the inconsistency the HIG forbids, and triples the work | Author three (default, dark, mono), verify six |
| Swapping elements between appearances | "May make it harder for people to find your app when they switch appearances" | Same features throughout; only the treatment changes |
| A margin percentage or corner radius quoted in the spec | Apple publishes no such number | Center the primary content; check against the Apple Design Resources template grid and the Grid overlay |
| Gating a design on refraction | It has no visible effect on generation 26, so every device still on 26 sees a different icon | Progressive enhancement; verify in both generations |
| A recoloured PNG as an "alternate icon" | Each alternate needs its own `.icon` and its own dark, clear and tinted variants, and all of them are reviewed | A second Icon Composer document, fully specified |
| Hand-editing `CFBundleIcons` / `CFBundleAlternateIcons` in Info.plist | Apple says explicitly not to; Xcode regenerates them from build settings | Set `ASSETCATALOG_COMPILER_APPICON_NAME` and `ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES` |
| A separate flattened App Store marketing PNG on an Icon Composer project | No separate upload exists; the store takes the icon from the build | One `.icon`; keep the 1024pt well only for legacy asset-catalog projects |
| Photo, app screenshot, or Apple hardware in the icon | Cannot be layered or tinted; hardware is copyrighted and cannot be reproduced | A frontal, flat illustration |

## Severity guide

CRITICAL: an icon that borrows another developer's mark or breaches 2.3.8 -- the App Review failure modes, cited to Guideline 4.1(c) or 2.3.8. There is no Guideline requiring an icon to represent the app; a weak-concept finding is craft (MEDIUM), not a rejection risk. HIGH: illegible or unrecognizable at the size it is actually displayed; collapses in tinted or clear; more than four visible groups (the build fails); effects baked into the artwork that fight the system's; an alternate icon shipped without its dark, clear and tinted variants. MEDIUM: mono never tuned; features swapping between appearances; refraction tuned past what the shape count supports; never checked against generation 26; a leftover AppIcon catalog shadowing the `.icon`. LOW: a dead per-size PNG ladder; pure white or black background where the system gradients belong; untagged SVG colors; a word instead of a mnemonic letter. NIT: unshipped platforms left enabled; layer names without order numbers.

## See also

- `references/platform/04-system-surfaces-notifications.md#alternate-app-icons-appearances-and-launch-screens` -- the alternate-icon runtime API, the confirmation alert, and the Settings UX (owner)
- `references/design/02-liquid-glass.md#design-properties` -- the same material, in the app's UI rather than its icon
- `references/design/01-apple-design-philosophy.md#what-apples-design-philosophy-is-not` -- the design-generation misconception, corrected
- `references/design/04-color-system.md#tinted-mode-ios-261` -- the user-owned tint the icon's tinted rendition answers to
- `references/design/05-sf-symbols.md` -- in-app glyphs; an app icon is never an SF Symbol on a gradient
- `references/accessibility/03-visual-accessibility.md#color-is-never-the-only-indicator` -- why a hue-only separation fails in clear and tinted
- `references/cross-platform/02-watchos.md`, `references/cross-platform/03-tvos.md`, `references/cross-platform/05-visionos.md`, `references/cross-platform/04-macos-catalyst.md` -- the platforms whose icon pipelines differ
- `references/_scaffolding/version-floor-registry.md#xcode-27-toolchain-changes-no-runtime-floor` -- Icon Composer as a toolchain, not a runtime, dependency
