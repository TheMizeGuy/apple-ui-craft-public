# Evidence Pipeline

> Owner: `references/review/02-evidence-pipeline.md` is the SINGLE SOURCE OF TRUTH for review modes, the geometry evidence rule, state and configuration coverage, and what each mode is permitted to claim. Every agent and the team lead cite this file; do not restate the rule elsewhere.

A finding is a claim about an app. This file decides which claims the evidence in
hand can actually support. Its purpose is to stop the two failures that destroy a
review's credibility: asserting a measurement nobody measured, and returning a
clean verdict on a dimension the evidence could not see.

## Review modes

| Mode | Available when | Evidence | What it may claim |
|---|---|---|---|
| **A. Runtime** | Simulator or device, XcodeBuildMCP or Xcode available | Screenshots, accessibility hierarchy with frames, Instruments traces, build and test output | Everything, including geometry, timing, and sequence |
| **B. Source** | Repository, no runtime | Swift source, project config, asset catalogs | Structure, API usage, state ownership, sizing strategy, derived geometry with the arithmetic shown. Runtime behaviour only as explicitly labelled inference |
| **C. Screenshots** | Images only | Images, and whatever the user said | What is visible in the frames. No measurement, no sequence, no runtime claim |
| **D. Design file** | Mockups, no code | Exported frames or specs | Visual and structural critique. Every runtime, accessibility, and performance claim stays soft |

**State the mode at the top of every review, and state the coverage:** which
screens, which states, which configurations. A review that does not say what it
looked at cannot be trusted about what it did not find.

## Geometry evidence rule (canonical)

A finding that asserts spatial or numeric precision -- alignment offsets, point
distances, spacing values, target sizes, overlap or clipping amounts, contrast
ratios, frame timings -- requires geometry evidence.

| Source | Acceptable geometry evidence |
|---|---|
| Runtime | Element frames from the accessibility hierarchy (`snapshot_ui`, `XCUIElement.frame`), which carry real coordinates |
| Source | Arithmetic from values present in the source, with the arithmetic shown |
| Instruments | Trace measurements for timing, hitches, and allocation claims |
| Screenshot | None. A screenshot is never geometry evidence |

**A screenshot alone is never geometry evidence.** Estimating point distances
from pixels is unreliable, and a confident wrong number in a report poisons every
correct one beside it.

**Contrast follows the same rule.** Sampling colours from a screenshot measures
the compressed image, not the app. A contrast claim needs the resolved colour
values plus a calculated ratio, and semantic colours must be resolved against the
trait collection they render in:

```swift
// Semantic colours resolve differently per appearance and per Increase Contrast.
// A single hex value is not a contrast claim.
let traits = UITraitCollection(traitsFrom: [
    .init(userInterfaceStyle: .dark),
    .init(accessibilityContrast: .high)
])
let resolved = UIColor.label.resolvedColor(with: traits)
```

Without geometry evidence, cap the claim at `[Quality defect]` with the
measurement named as needed, or state it qualitatively without the number. Never
invent the number.

## Derived geometry (Mode B)

Source-only reviews may still make numeric claims, provided the arithmetic is in
the finding and every input is a literal in the code:

```
Evidence: Derived: 120pt fixed title frame (WorkoutRow.swift:34) + 32pt horizontal
  padding (.padding() default 16 x 2) + 12pt HStack spacing = 164pt committed,
  leaving 156pt of a 320pt window for the value.
```

That is a legitimate finding at `[Hard defect]`. This is not:

```
Evidence: The label looks about 120pt wide and the value gets cut off.
```

## Configuration coverage

An iOS review has a configuration matrix as well as a state matrix, and the
default configuration is the one that always passes. State which were exercised.

| Configuration | Why it belongs in the matrix |
|---|---|
| Light and Dark | Custom colours without dark variants fail only here |
| Dynamic Type: default and `.accessibility5` | Three-quarters of layout defects appear only at AX sizes |
| Narrowest supported width (~320pt) | Clipping appears here first |
| Landscape (compact height) | Sheets, keyboards, and vertical stacks fail only here |
| Increase Contrast | Glass, tints, and low-contrast secondary text |
| Reduce Motion | Every ungated animation |
| Reduce Transparency | Every `glassEffect` and `Material` |
| Bold Text | Metrics shift; fixed-width labels clip |
| VoiceOver on | Labels, order, focus, announcements |
| RTL | Leading and trailing violations |
| iPad, if supported | Split view, or its absence |
| Display Zoom | Shifts every width assumption down a device class |

**A review that exercised only the default configuration says so in the report,
and its accessibility and adaptive verdicts are NOT ASSESSED, not clean.**

## State coverage

Per screen, from `references/usability/04-states-feedback-and-affordances.md`:
idle, loading, refreshing, loaded, empty, zero results, error, offline, partial,
permission denied. Record which were reachable and which were assumed.

A state that could not be forced is reported as unreached, not as absent and not
as fine.

## Capture, Mode A

| Need | Tool |
|---|---|
| Screen image | `screenshot` (XcodeBuildMCP), or `xcrun simctl io booted screenshot` |
| Element frames, labels, traits | `snapshot_ui` (XcodeBuildMCP) -- this is the geometry source, not the screenshot |
| Build and warning output | `build_sim` |
| Test results | `test_sim` |
| Dynamic Type, appearance, accessibility settings | Xcode environment overrides, or Accessibility Inspector |
| Body re-evaluation counts | `Self._printChanges()` in the view body, plus the SwiftUI Instruments template |
| Scroll hitches, frame timing | Instruments, Animation Hitches |
| Launch time, memory | Instruments, App Launch and Allocations |
| Network conditions | Network Link Conditioner |
| Every state, cheaply | Xcode Previews, one per state; see the preview harness in `references/usability/04-states-feedback-and-affordances.md` |

`snapshot_ui` is the single highest-value capture in an iOS review: it returns
the accessibility hierarchy with frames, which simultaneously answers "what does
VoiceOver see", "is this target 44pt", and "does this clip".

## Run directory

Normalise artifacts so the team lead and the user see the same evidence:

```
review-run/
  manifest.json          scope, mode, configurations exercised, commit
  screens/
    workouts/
      default-light.png
      ax5-320.png
      landscape.png
      empty.png
      error.png
  hierarchy/
    workouts.default.json      snapshot_ui output (geometry source)
    workouts.ax5.json
  traces/
    scroll-workouts.trace
  build/
    build.log
    tests.log
```

`manifest.json` records what was NOT exercised as explicitly as what was. An
absent configuration is a limit on the verdict, and the verdict must carry it.

## Evidence rules per claim

| Claim type | Minimum evidence |
|---|---|
| "This clips at AX5" | A hierarchy snapshot at AX5, or derived arithmetic |
| "This target is under 44pt" | The element frame; never a screenshot estimate |
| "Contrast is insufficient" | Resolved colour values plus a computed ratio, per trait collection |
| "This animation is not Reduce-Motion gated" | The source line, both gates checked (`withAnimation` AND `.animation(_:value:)`) |
| "Scrolling janks" | An Instruments hitch measurement, or a body re-evaluation count |
| "Back loses input" | The observed sequence, or the state-ownership line in source |
| "This state does not exist" | The exhaustive branch in source, or the forced state at runtime |
| "The iPad layout wastes the window" | Measured content width against window width; see `references/review/03-density-and-economy.md` |
| "This feels wrong" | Not a claim. Either name what is wrong with evidence, or drop it |

## Confidence calibration

Map evidence quality onto the confidence enum in
`references/review/01-finding-format.md`:

| Evidence | Highest confidence permitted |
|---|---|
| Observed at runtime, with a measurement | Hard defect |
| Derived from source with arithmetic shown | Hard defect |
| Source structure, unambiguous (a missing gate, an absent state branch) | Hard defect |
| Source structure, behaviour-dependent | Quality defect |
| Pattern recognised, not verified here | Pattern smell |
| Preference with no measured cost | Taste note |

The verifier and the team lead downgrade anything above its cap.

## Anti-patterns

| Wrong | Why it fails |
|---|---|
| A point measurement estimated from a screenshot | Unreliable; one wrong number discredits the report |
| Contrast sampled from an image | Measures the image, not the resolved colour |
| A single hex value as a contrast claim | Semantic colours resolve per appearance and per Increase Contrast |
| Claiming a runtime behaviour from source without labelling it inferred | Presents a guess as an observation |
| A clean accessibility or adaptive verdict from one default-configuration screenshot | The evidence could not contain the defect class |
| Not stating the mode | The reader cannot calibrate anything in the report |
| Reporting an unreached state as absent | Two different findings; only one is true |

## See also

- `references/review/01-finding-format.md` -- the finding template, severity, and confidence enum
- `references/review/03-density-and-economy.md` -- measurement recipes for the waste dimension
- `references/usability/05-adaptive-review-method.md` -- the configuration matrix in depth
- `references/usability/04-states-feedback-and-affordances.md` -- the state set and how to force each one
- `references/performance/03-launch-memory-instruments.md` -- Instruments workflows
- `references/methodology/02-previews-design-qa.md` -- preview-driven state and configuration coverage
