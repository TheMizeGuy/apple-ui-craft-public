# Adaptive Review Method

> Owner: `references/usability/05-adaptive-review-method.md` owns the METHOD for reviewing adaptation: classify the sizing strategy, enumerate the size matrix, declare the evidence mode, return a verdict. `references/design/08-adaptive-layout-ipad.md` owns the adaptive APIs (`ViewThatFits`, `AnyLayout`, size classes, `containerRelativeFrame`); `references/accessibility/02-dynamic-type-adaptation.md` owns Dynamic Type mechanics. This file owns the review procedure that uses them. Cite, don't restate.
> Floors: `containerRelativeFrame` iOS 17.0+, `AnyLayout` iOS 16.0+, `ViewThatFits` iOS 16.0+, `.scenePadding` iOS 16.0+, `@Environment(\.dynamicTypeSize)` iOS 15.0+ (`references/_scaffolding/version-floor-registry.md`).

"It looks fine on my phone" is the most expensive sentence in iOS layout review,
because the reviewer's phone is one point in a space with five independent axes.
This file replaces the device checklist with a method: **classify how the layout
decides its own size before hunting for places it breaks.** A layout's sizing
strategy predicts its failures. Reviewing failures first means finding the ones
you happened to look for.

## The Apple way

SwiftUI's layout system is negotiation: a parent proposes a size, a child
reports what it wants, the parent places it. **Every adaptation defect is a place
where someone refused to negotiate.** A hardcoded `.frame(width: 320)` answers
the proposal with a number, so the proposal stopped mattering, and every context
that proposes something else is now broken.

First-party apps hold three rules:

1. **Intrinsic by default.** Let text be as wide as it wants to be; constrain
   only where the design genuinely requires it.
2. **Branch on the size class, not on the device.** There is no device check in
   a correct SwiftUI layout.
3. **The window is not the screen.** Under Split View, Slide Over, Stage
   Manager, and on the Mac, `UIScreen` describes hardware the app does not own.

## 1. Classify the sizing strategy first

For each significant container, decide which of the four it uses. Put the table
in the review; it is the artifact that makes the findings predictable.

| Strategy | What it looks like | Survives | Fails at |
|---|---|---|---|
| **Intrinsic** | `Text`, `Label`, `HStack` of intrinsic children, no frame | Dynamic Type, localization, every width | Nothing structural. Can overflow if a sibling is fixed |
| **Proposed / fill** | `.frame(maxWidth: .infinity)`, `.frame(minWidth:idealWidth:maxWidth:)` | Width changes | Nothing, if the min is honest |
| **Container-driven** | `containerRelativeFrame`, size-class branches, `GeometryReader` | Width changes, if the fractions are sane | AX sizes, because a fraction of the width says nothing about how tall the text became |
| **Adaptive / branching** | `ViewThatFits`, `AnyLayout`, `dynamicTypeSize` branches | Everything, when the fallback is real | Nothing, if the last candidate genuinely fits |
| **Fixed** | `.frame(width:)`, `.frame(height:)`, `UIScreen.main.bounds`, magic numbers | The reviewer's device | Everything else |

```swift
// FIXED -- the failure signature. Survives exactly one context.
.frame(width: 320)
.frame(width: UIScreen.main.bounds.width - 32)     // also wrong under Split View
HStack { Text(title).frame(width: 120); Spacer(); Text(value) }

// INTRINSIC + PROPOSED -- the default that survives
HStack {
    Text(title)
    Spacer(minLength: 12)
    Text(value).layoutPriority(1)
}

// ADAPTIVE -- an honest fallback, not decoration
ViewThatFits(in: .horizontal) {
    HStack { label; Spacer(); value }        // preferred
    VStack(alignment: .leading) { label; value }   // must actually fit at AX5
}
```

**`ViewThatFits` whose last candidate also does not fit is not adaptive.** The
system renders the last candidate regardless, so an over-wide final option
produces exactly the clipping the modifier was added to prevent. The last
candidate must be the one that always fits, usually the fully stacked one.

**`GeometryReader` is a sizing strategy with a cost.** It takes all the space
offered and reports it, so a `GeometryReader` used to size a child inside a
`VStack` usually collapses the layout around it. Prefer `containerRelativeFrame`
for fractions of a container and `ViewThatFits` for branching; reach for
`GeometryReader` only when you need the geometry itself.

## 2. The five axes

Adaptation on iOS is not one axis. Each of these varies independently, and a
layout can pass four and fail the fifth.

| Axis | Range | The failure it produces |
|---|---|---|
| **Window width** | 320pt (Slide Over, smallest supported) to arbitrary (Stage Manager, Mac) | Horizontal clipping, truncation, a phone layout centred in a large window |
| **Dynamic Type** | `.xSmall` to `.accessibility5` (12 steps) | Vertical overflow, truncated labels, controls pushed off-screen, overlapping text |
| **Orientation** | Portrait, landscape, and on iPad both at any split | Fixed-height content becoming unscrollable; a landscape keyboard covering the field |
| **Display Zoom** | Standard or Zoomed, a device setting | Every width assumption shifts down one device class |
| **Layout direction** | LTR, RTL | Leading/trailing violations, mirrored asymmetry |

**Display Zoom is the axis almost nobody reviews.** A user who enables it makes a
large iPhone report the logical size of a smaller one, so a layout that fits
exactly at the largest width breaks on the largest device. Combined with AX5 it
is the harshest realistic configuration on the platform, and it is a setting a
low-vision user is likely to have on.

## 3. The size matrix

Review widths as families, not as a device list that goes stale every September.
Read exact point sizes from the simulator rather than from memory.

| Family | Width class | Why it is in the matrix |
|---|---|---|
| Slide Over / narrowest supported | Compact | ~320pt. The narrowest thing the app must survive. Everything that clips, clips here first |
| Smallest current iPhone | Compact | The real floor for phone-only apps |
| Standard iPhone | Compact | The reviewer's device; the one that always passes |
| Largest iPhone, portrait | Compact | Where "fills the window" designs start looking empty |
| iPhone landscape | Compact width, compact height | Compact HEIGHT is the forgotten one: sheets, keyboards, and vertical stacks all break here and nowhere else |
| iPad portrait, full screen | Regular | Where a stretched phone layout becomes obvious |
| iPad landscape, full screen | Regular | Widest common regular width; the split view must earn it |
| iPad Split View, half | Regular or compact depending on device | The size class can CHANGE mid-session with no relaunch |
| iPad Split View, one third | Compact | A regular-width layout must collapse here, not clip |
| Stage Manager / Mac | Arbitrary, resizable live | Continuous resize; no breakpoint is safe |

**Compact height is the axis most reviews skip entirely.** An iPhone in landscape
is `.compact` in both dimensions. A sheet designed at `.medium` detent, a
vertically-centred layout, and any `Spacer()`-padded stack all fail there and
nowhere else.

**The size class can change without a relaunch.** Split View resizing and Stage
Manager both change `horizontalSizeClass` live. A layout that reads the size
class once in `init` or caches a branch decision will not update.

## 4. Dynamic Type is the platform's zoom

Web reflow at 320px and 200% zoom has a direct iOS analogue, and it is stricter:
Dynamic Type at `.accessibility5` scales body text roughly 3.1x, and every
layout obligation follows from that.

| Requirement | Rule |
|---|---|
| Nothing is clipped or truncated at AX5 on the narrowest supported width | Truncation of a label that carries meaning is a HIGH finding |
| Horizontal stacks of text become vertical past `.xxxLarge` | Branch on `dynamicTypeSize.isAccessibilitySize` or use `ViewThatFits` |
| Every screen scrolls at AX5 | Content that fit at default no longer fits; a non-scrolling container becomes unreachable content |
| Custom fonts scale | `Font.custom(_:size:relativeTo:)`, never a bare `size:` |
| Custom dimensions scale | `@ScaledMetric` for padding, icon sizes, and fixed heights that sit beside text |
| Tap targets stay at least 44pt | They usually grow; the failure is a fixed-height control beside grown text |
| `minimumScaleFactor` is not the answer | It shrinks text back down, which defeats the accessibility setting the user chose |

```swift
@Environment(\.dynamicTypeSize) private var typeSize
@ScaledMetric(relativeTo: .body) private var iconSize: CGFloat = 24

var body: some View {
    let layout = typeSize.isAccessibilitySize
        ? AnyLayout(VStackLayout(alignment: .leading))
        : AnyLayout(HStackLayout(alignment: .firstTextBaseline))

    layout {
        Image(systemName: "flame").font(.system(size: iconSize))
        Text(title)
        Spacer(minLength: 0)
    }
}
```

**Capping Dynamic Type is a finding unless it is justified in the code.**
`.dynamicTypeSize(...DynamicTypeSize.xxxLarge)` on a screen with real content
excludes the users the setting exists for. It is defensible on a dense chart
axis or a fixed-geometry control; it is not defensible on body content, and the
reviewer should ask which of the two it is.

## 5. Safe areas are two rules, not one

| Rule | Detail |
|---|---|
| Content respects the safe area by default | Do not fight it with manual padding |
| Backgrounds extend past it deliberately | `.ignoresSafeArea()` on the BACKGROUND layer only, never on the content layer |
| Custom bars join the safe area | `.safeAreaInset(edge:)` so scroll content insets correctly, rather than being overlaid and hiding the last row |
| The keyboard is a safe-area change | `.ignoresSafeArea(.keyboard)` is occasionally right and usually a bug |

The recurring defect: a custom bottom bar added with `.overlay(alignment:
.bottom)` instead of `.safeAreaInset(edge: .bottom)`. Content scrolls under it
permanently, so the final row of every list is unreachable. It looks correct in
every screenshot, because screenshots do not scroll to the end.

## 6. Evidence modes

State which mode produced the findings; the confidence differs and so does what
may be claimed.

**Mode A, driven (simulator or device).** Run the matrix: resize, rotate, switch
Dynamic Type in the Accessibility Inspector or the environment override, enable
Display Zoom, run in Slide Over and Split View. Findings are direct
observations, and every geometry claim carries a measured number.

**Mode B, source reconstruction.** Classify the sizing strategy of each container
from code and derive the failures. Every claim is labelled inferred and cites the
line that supports it. Derived geometry is allowed when it is arithmetic from
values in the source (a fixed 120pt label plus a fixed 200pt value plus 32pt of
padding cannot fit 320pt) and must show the arithmetic.

```bash
# Fixed sizing -- the highest-yield grep in this file
grep -rn "\.frame(width:\|\.frame(height:\|UIScreen\.main\|\.frame(minWidth: [0-9]\{3,\}" --include=*.swift .
# Type that cannot scale
grep -rn "\.font(\.system(size:\|Font\.custom(\"[^\"]*\", size:" --include=*.swift . | grep -v relativeTo
# Truncation and scale-down hiding a reflow failure
grep -rn "lineLimit(1)\|minimumScaleFactor\|\.truncationMode" --include=*.swift .
# Dynamic Type caps
grep -rn "dynamicTypeSize(\.\.\.\|dynamicTypeSize(\." --include=*.swift .
# Device branching instead of size-class branching
grep -rn "UIDevice.current.userInterfaceIdiom\|idiom ==" --include=*.swift .
# Safe-area misuse: overlay bars and content-layer ignores
grep -rn "ignoresSafeArea\|overlay(alignment: .bottom" --include=*.swift .
# Adaptive APIs actually present
grep -rn "ViewThatFits\|AnyLayout\|containerRelativeFrame\|horizontalSizeClass\|@ScaledMetric" --include=*.swift .
```

**Mode C, screenshots only.** The verdict is limited to what the frames show. If
the frames are one device at default type size, the correct adaptive verdict is
**not assessed**, never ROBUST. A clean adaptive verdict from a single screenshot
is a false negative on precisely the class a single screenshot cannot contain.

## 7. Verdict rubric

One token, chosen against the matrix actually exercised. State the coverage
alongside it.

| Verdict | Meaning |
|---|---|
| **ROBUST** | Survives the full matrix including AX5 at the narrowest width, compact height, and RTL. Sizing is intrinsic or adaptive throughout; no fixed geometry on content |
| **ADEQUATE** | Survives the common matrix. Isolated fixed geometry exists but is bounded and does not clip content anywhere exercised |
| **FRAGILE** | Passes at default settings and fails at a real configuration: AX sizes, compact height, one-third Split View, or Display Zoom. Content is readable but degraded |
| **BROKEN** | Content is clipped, unreachable, or overlapping in a supported configuration. A fixed-width layout on a screen that must adapt |
| **NOT ASSESSED** | Evidence mode did not permit a judgement. The honest answer for a single screenshot |

## Anti-patterns

| Wrong | Why it fails | Right |
|---|---|---|
| `.frame(width:)` on content | Answers the size proposal with a number | Intrinsic sizing, or `maxWidth` |
| `UIScreen.main.bounds` | Describes hardware the app may not own; wrong under Split View, Stage Manager, and Mac | The window's own geometry, or `containerRelativeFrame` |
| `UIDevice.current.userInterfaceIdiom` branching | The idiom does not change when the window does | `horizontalSizeClass` |
| `ViewThatFits` whose last candidate overflows | The system renders it anyway | The last candidate is the always-fits one |
| `GeometryReader` to size a child | Takes all offered space; collapses the surrounding layout | `containerRelativeFrame`, or `ViewThatFits` |
| `minimumScaleFactor` on body text | Undoes the accessibility setting the user chose | Reflow with `ViewThatFits` or `AnyLayout` |
| `lineLimit(1)` on a meaningful label | Truncates meaning at AX sizes | Allow wrapping, or `ViewThatFits` |
| `Font.custom(_:size:)` without `relativeTo:` | Frozen at one size forever | Always pass `relativeTo:` |
| Fixed padding beside scaling text | Proportions collapse at AX5 | `@ScaledMetric` |
| Capping Dynamic Type on body content | Excludes the users the feature exists for | Reflow instead |
| `.overlay(alignment: .bottom)` for a custom bar | Content scrolls under it permanently; the last row is unreachable | `.safeAreaInset(edge: .bottom)` |
| `.ignoresSafeArea()` on the content layer | Content under the Dynamic Island and home indicator | Background layer only |
| Same layout on iPhone and iPad | A stretched phone; see `references/review/03-density-and-economy.md` | `NavigationSplitView` or a size-class branch |
| Reviewing one device at default type size and calling adaptation clean | Four of five axes unexercised | State the coverage; verdict NOT ASSESSED if it is one frame |

## Severity guide

| Severity | Example |
|---|---|
| CRITICAL | Content unreachable in a supported configuration: a control off-screen at AX5 with no scroll, a form field permanently under the keyboard, the last list row permanently under an overlay bar |
| HIGH | Clipping or overlapping at AX5 on the narrowest supported width; a fixed-width layout on an adaptive surface; `ViewThatFits` with no fitting candidate; Dynamic Type capped on body content; a stretched phone layout on iPad; `UIScreen.main.bounds` driving layout |
| MEDIUM | `minimumScaleFactor` masking a reflow failure; `lineLimit(1)` truncating a meaningful label; fixed padding beside scaled text; compact-height layout untested; missing `@ScaledMetric` on an icon beside text |
| LOW | Slightly loose proportions at one width; a magic number that happens not to clip |
| NIT | Preference about where a breakpoint sits |

Adaptive findings carry the configuration and the number: "At AX5 on a 320pt
window the value label truncates to 'Total car...'; the row is a fixed
`HStack` with `.frame(width: 120)` on the title (WorkoutRow.swift:34)" is a
finding. "Does not scale well" is not.

## See also

- `references/design/08-adaptive-layout-ipad.md` -- the adaptive APIs themselves
- `references/accessibility/02-dynamic-type-adaptation.md` -- Dynamic Type mechanics, the 12 sizes, `@ScaledMetric`
- `references/design/06-layout-spacing.md` -- safe areas, margins, content insets
- `references/cross-platform/01-ipados-multiplatform.md` -- Split View, Stage Manager, multi-window
- `references/review/03-density-and-economy.md` -- whether a large window is EARNED, not merely survived
- `references/review/02-evidence-pipeline.md` -- evidence modes and geometry claims
- `references/accessibility/06-localization-rtl.md` -- layout direction
- `references/review/01-finding-format.md` -- the canonical finding template
