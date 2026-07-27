# Density and Economy

> Owner: `references/review/03-density-and-economy.md` owns the WASTE question: does the screen earn the space and the time it takes. `references/design/06-layout-spacing.md` owns the spacing metrics themselves; `references/usability/05-adaptive-review-method.md` owns whether a layout SURVIVES a large window. This file owns whether it USES one. Cite, don't restate.

Every other dimension in this plugin is a rule against excess: too much motion,
too much contrast, too many accents, too many taps. This is the only one against
waste, and a screen can pass all of them while using half the window and three
times the scroll it needs.

## Why this file exists

`references/design/06-layout-spacing.md` already lists "Same layout iPhone +
iPad -- wastes iPad screen" as an anti-pattern. It has sat there as a sentence
with no threshold and no measurement, which means it has never once produced a
finding, because a reviewer with no number cannot rank a well-rendered screen as
broken. Waste feels like taste. Ranked as taste, it never survives triage, and
the iPad build ships as a stretched phone forever.

The fix is arithmetic. Every rule below carries a number, so the finding carries
a measurement and stops being an opinion.

## The Apple way

Apple does not fill every pixel. `List` has generous margins, text columns are
constrained to a readable measure, and a settings screen on a 13-inch iPad does
not stretch its labels to 1000pt. **Unused width is not automatically waste.**

The rule that distinguishes the two:

> Width is EARNED when it is spent on a reading measure, a second column, or a
> larger presentation of the same content. It is WASTED when the extra width
> produced nothing: the same phone layout, centred, with air on both sides.

A `NavigationSplitView` on iPad spends the width on a sidebar. A detail column
constrained to a readable measure spends it on legibility. A single centred
column of rows, each holding a label and a value 700pt apart, spends it on
nothing.

## The four failures

| Failure | What it looks like on iOS |
|---|---|
| **Window utilisation** | An iPad or Mac window running the iPhone layout: one column, centred, with no sidebar and no second pane, on a device with room for both |
| **Internal distribution** | A row whose label is pinned to a fixed width and whose value is sized by the leftover, so a 6-character value occupies 600pt |
| **Length against content** | A screen that scrolls three window-heights to show nine items, half of it the same nine items rendered a second and third way |
| **Distance** | An action a screen-height away from the thing it acts on, or two controls scoping the same object separated by everything else on the screen |

## Thresholds

Each row is a finding when it is exceeded AND the exemption does not apply.

| Measure | Threshold | Exemption |
|---|---|---|
| Content width as a fraction of window width, regular width class | 60% | A reading measure (prose, a document, a form of single-line fields), or a deliberate second column that is empty in this state |
| Regular-width screen using a single column where the content is list-plus-detail | Any | The detail is genuinely modal, or the list is a single item |
| Any box sized by the LEFTOVER whose content has a known maximum | Any | None. A value that is never longer than 8 characters does not need 600pt |
| Scroll height against window height | 2x | The content is genuinely that long (a document, a long feed) and nothing on it is repeated |
| Same entity set rendered more than once on one screen | 2 renderings | The second is a genuinely different view of it (a chart plus its table), and both are collapsible |
| A non-primary section's share of scroll height | 40% | It is the primary content |
| Words of body copy in front of the first control | 30 | First-run onboarding, once, on one screen |
| Distance from a row's identity to its action | One window width | The action is global, not per-row |
| Sheet detent against content height | Content fits `.medium` but `.large` is the only detent | The content genuinely needs the height |
| Widget content against widget family | `systemLarge` showing what `systemSmall` shows | None |

## The leftover-sizing rule

The most mechanical of the four, and the easiest to find in source.

```swift
// WASTE: the value is sized by what is left over. On a 1024pt iPad the label
// takes 120pt and the value takes 870pt to render "1,240".
HStack {
    Text(label).frame(width: 120)
    Spacer()
    Text(value)
}

// WASTE: maxWidth: .infinity on a control whose content has a known maximum
Button("Save") { }.frame(maxWidth: .infinity)   // a 900pt Save button

// EARNED: the row is as wide as it needs and the surplus is spent, or given back
HStack {
    Text(label)
    Spacer(minLength: 16)
    Text(value).monospacedDigit()
}
.frame(maxWidth: 700)          // a deliberate measure, not a leftover
.frame(maxWidth: .infinity)    // centred inside the window, deliberately
```

`Spacer()` is the leftover operator. Every `Spacer()` between two pieces of
content on a regular-width screen is a decision to spend the surplus on nothing.
Sometimes that is right (a label and its value at opposite ends of a row is a
legible pattern at phone width). At 1024pt it usually is not, and the fix is a
measure cap on the row, not a wider gap.

## The iPad question

The single highest-value check in this file. Ask it on every regular-width
screen:

1. Is the content list-plus-detail? Then it should be a `NavigationSplitView`,
   and a single column is a HIGH finding.
2. Is the content a grid of peers? Then it should gain columns at regular width,
   and a single column is a HIGH finding.
3. Is the content a single document or form? Then a reading measure is correct,
   and the surplus is EARNED. No finding.
4. Is the content one column of rows, each with a label at the left edge and a
   value at the right edge, 700pt apart? Then it is a stretched phone and it is a
   HIGH finding.

```swift
// The structural answer to 1 and 2.
NavigationSplitView {
    WorkoutList(selection: $selected)
} detail: {
    if let selected { WorkoutDetail(workout: selected) }
    else { ContentUnavailableView("Select a Workout", systemImage: "figure.run") }
}

// The structural answer to 2 when there is no detail.
LazyVGrid(columns: columns) { ... }
// where columns adapts:
private var columns: [GridItem] {
    [GridItem(.adaptive(minimum: 280, maximum: 420), spacing: 16)]
}
```

`.adaptive(minimum:)` is the iOS equivalent of a fluid grid: it gains columns as
the window grows without a single breakpoint. A fixed `GridItem(.fixed(300))`
array does not, and a two-column grid on a 13-inch iPad is its own waste finding.

## The repetition failure

A screen that renders the same nine items as a summary card, then a chart, then a
list is three times as long as it needs to be and the operator scrolls past two
copies to reach the one they wanted. The rule:

- Two renderings of one entity set is the maximum, and the second must add
  something the first cannot show.
- Past two, or when the second adds nothing, collapse the extras behind a
  `DisclosureGroup`, a segmented control, or a `Picker` that swaps the view.

```swift
// One region, three presentations, one at a time.
Picker("View", selection: $presentation) {
    Text("Chart").tag(Presentation.chart)
    Text("List").tag(Presentation.list)
}
.pickerStyle(.segmented)
```

## Copy in front of controls

| Surface | Budget |
|---|---|
| Body copy above the primary control on a task screen | 30 words |
| A `Section` footer explaining a toggle | 20 words |
| Onboarding page | 40 words, once |
| An alert message | 25 words |
| An empty-state description | 15 words |

Past the budget the copy is doing work the interface should do. A toggle needing
sixty words of explanation is a toggle whose label is wrong.

## How to measure

**Mode A, runtime.** The accessibility hierarchy carries frames, so window
utilisation is arithmetic:

```
1. snapshot_ui on the screen at the widest supported window
2. Take the union of the content element frames (exclude the window, the
   navigation bar, and the tab bar)
3. utilisation = contentWidth / windowWidth
4. Report both numbers and the difference in points
```

Scroll length: capture the content height from the scroll view's frame in the
hierarchy, divide by the window height.

**Mode B, source.** Three greps find most of it:

```bash
# Leftover sizing: Spacer between content, and infinity frames on bounded content
grep -rn "Spacer()" --include=*.swift . | head -40
grep -rn "frame(maxWidth: .infinity)" --include=*.swift .
# Fixed label widths -- the other half of every leftover row
grep -rn "\.frame(width: [0-9]" --include=*.swift .
# Regular-width structure: is there ANY split view or adaptive grid in the app?
grep -rn "NavigationSplitView\|GridItem(.adaptive" --include=*.swift .
# Fixed column counts that cannot grow
grep -rn "GridItem(.fixed(\|Array(repeating: GridItem" --include=*.swift .
# Reading measures -- these are the EXEMPTIONS; find them before flagging
grep -rn "frame(maxWidth: [0-9]\|readableContentGuide\|\.scenePadding" --include=*.swift .
```

An app with zero `NavigationSplitView` and zero `.adaptive` grids that ships an
iPad target has, structurally, one layout for both, and the finding writes
itself.

**Mode C, screenshots.** Utilisation is the one density measure a screenshot can
support, because the ratio of content to frame is visible without needing point
values. State it as a fraction of the image, not in points.

## Severity calibration

| Severity | Waste |
|---|---|
| CRITICAL | Not a severity this dimension normally reaches. Waste that makes content unreachable is an adaptive finding, not a density one |
| HIGH | An iPad or Mac window running a stretched phone layout; content under 60% of the window with no reading-measure reason and no second column; a screen more than twice its needed length with nothing collapsible; the same entity set rendered three times; a value sized by the leftover at more than 400pt |
| MEDIUM | A section over 40% of the scroll that is not the primary; copy over the budget in front of a control; a fixed-column grid that cannot grow; a `.large`-only sheet for content that fits `.medium`; an action a window-width from its object |
| LOW | Slightly loose proportions with a measurement; a `systemLarge` widget under-using its family |
| NIT | Waste with no measurement attached. If you did not measure it, it is a preference |

**The last row is the discipline.** A density finding without a number is a
taste note wearing a severity tag, and it will be dismissed. With a number it is
unarguable.

## Anti-patterns

| Wrong | Why it fails | Right |
|---|---|---|
| One layout for iPhone and iPad | The iPad gets a stretched phone | `NavigationSplitView`, or an adaptive grid |
| `Spacer()` between a label and its value at regular width | Spends the surplus on nothing | Cap the row to a measure, then centre it |
| `frame(maxWidth: .infinity)` on a bounded control | A 900pt Save button | Size to content, or cap it |
| `GridItem(.fixed(300))` in a fixed-count array | Cannot gain columns | `.adaptive(minimum:maximum:)` |
| Three renderings of one entity set | Two copies to scroll past | One region, a segmented picker |
| A 60-word `Section` footer | The label is doing the wrong job | Fix the label |
| `.large` as the only detent for a 3-field sheet | Covers the context for no reason | Offer `.medium` |
| Answering dead space with more padding | Arranges the waste symmetrically rather than spending it | Spend it on a column, or cap the measure |
| Flagging a reading measure as waste | Legibility is a legitimate use of width | Check the exemption before writing the finding |

## See also

- `references/design/06-layout-spacing.md` -- spacing metrics, margins, content insets
- `references/design/08-adaptive-layout-ipad.md` -- `NavigationSplitView`, size classes, adaptive grids
- `references/usability/05-adaptive-review-method.md` -- whether the layout SURVIVES a large window
- `references/cross-platform/01-ipados-multiplatform.md` -- iPad structure and multi-window
- `references/review/02-evidence-pipeline.md` -- the geometry evidence rule these measurements satisfy
- `references/review/01-finding-format.md` -- the `Measurement:` line every density finding carries
