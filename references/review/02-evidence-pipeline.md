# Evidence Pipeline

> Owner: `references/review/02-evidence-pipeline.md` is the SINGLE SOURCE OF TRUTH for review modes, what a Simulator run can and cannot show, the geometry evidence rule, state and configuration coverage, capture validity, and what each mode is permitted to claim. Every agent and the team lead cite this file; do not restate the rule elsewhere.

A finding is a claim about an app. This file decides which claims the evidence in
hand can actually support. Its purpose is to stop the two failures that destroy a
review's credibility: asserting a measurement nobody measured, and returning a
clean verdict on a dimension the evidence could not see.

## Review modes

| Mode | Available when | Evidence | What it may claim |
|---|---|---|---|
| **A. Runtime** | Simulator or device, XcodeBuildMCP or Xcode available | Screenshots, accessibility hierarchy with frames, Instruments traces, build and test output | Geometry, sequence, configuration and layout on either target; the claims in `references/review/02-evidence-pipeline.md#simulator-and-device` only on a device |
| **B. Source** | Repository, no runtime | Swift source, project config, asset catalogs | Structure, API usage, state ownership, sizing strategy, derived geometry with the arithmetic shown. Runtime behaviour only as explicitly labelled inference |
| **C. Screenshots** | Images only | Images, and whatever the user said | What is visible in the frames. No measurement, no sequence, no runtime claim |
| **D. Design file** | Mockups, no code | Exported frames or specs | Visual and structural critique. Every runtime, accessibility, and performance claim stays soft |

**State the mode at the top of every review, and state the coverage:** which
screens, which states, which configurations. A review that does not say what it
looked at cannot be trusted about what it did not find.

In Runtime mode, name the target:
`Runtime (Simulator: <device>, iOS <x>, UDID <udid>)` or
`Runtime (device: <model>, iOS <x>)`, and when a run used both, which claim came
from which. Close the coverage line with `Untested:` and the claim
classes this run could not reach: the rows of the table below when no device ran,
and every configuration recorded `not exercised`. `Untested: none` is a claim too;
only a device run that exercised the whole matrix can make it. The review ledger
and the CI verdict artifact carry the bare mode token (`Runtime`), never the
target; the target lives in the report header and `manifest.json`
(`references/review/04-run-artifacts.md#review-ledger-schema-v1`).

## Simulator and device

The Simulator renders through the Mac's GPU and display, has no Taptic Engine,
and runs none of VoiceOver, Switch Control or Assistive Access. A Simulator run is
therefore Runtime evidence for layout and sequence, and only Source-grade
evidence for these claims:

| Claim | Needs a device because | Owner |
|---|---|---|
| Haptic feel: intensity, sharpness, timing against the motion, a doubled fire | The Simulator has no Taptic Engine | `references/haptics/01-haptic-design-principles.md` |
| Scroll hitches, frame pacing, thermal throttling | The Mac's GPU hides the device's GPU and thermal limits, and can over- or under-report | `references/performance/03-launch-memory-instruments.md` |
| ProMotion cadence, P3 saturation, EDR headroom | Frames render at the Mac display's rate and gamut | `references/performance/05-display-promotion-color.md` |
| Launch-path clearance | Builds that crash at first render on a device launch cleanly on the Simulator; clearance is a Release build on a device running the oldest supported iOS, cold and with restored state | `references/performance/03-launch-memory-instruments.md#launch-crash-stack-exhaustion-at-first-render` |
| VoiceOver, Switch Control and Assistive Access behaviour: announcements, focus after navigation, rotor, scanning | None of the three runs on the Simulator (Apple, Performing accessibility testing for your app) | `references/accessibility/01-voiceover-fundamentals.md` |
| Gesture feel, and a system interruption mid-gesture: multi-finger input, edge-swipe feel, an incoming call or Control Center during a drag | A driven gesture proves the path exists, not the feel, and the Simulator cannot place a call | `references/interaction/03-direct-manipulation-drag.md#returning-cleanly-gesturestate-reset-transactions` |
| Reduce Motion teardown timing beside gestures | It differs from the Simulator | `references/accessibility/05-motion-accessibility.md` |

What the Simulator does prove: geometry from `snapshot_ui` at every width, size
class and Dynamic Type size; Light, Dark and Increase Contrast set through
`simctl`; Reduce Motion, Reduce Transparency and Bold Text set through Simulator
Settings or Xcode environment overrides; sequences (push, edge-swipe pop, dismiss,
background, relaunch); state coverage; and the accessibility structure VoiceOver
would read (labels, traits, frames, element order).

A claim from the table made on Simulator or Source evidence is labelled inferred
and capped at Quality defect, unless the source alone proves it (a haptic on
scroll, a missing `accessibilityLabel`, an ungated loop), which stays a Hard
defect from source. The Haptics verdict on Simulator evidence rests on placement
read from source (INTENTIONAL, SPARSE, ABSENT or NOISY), with haptic feel on the
`Untested:` line. A VoiceOver row exercised only through `snapshot_ui` or
Accessibility Inspector on the Simulator reads
`not exercised (structure checked)`. A screenshot or `snapshot_ui` proves
layout, never a gesture: a gesture claim names the input that drove it (the
`swipe` or `gesture` call, or a touch on a device).

Adapted from impeccable (Apache-2.0): `skill/reference/ios.md`, `skill/reference/harden.md`.

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
| iPad, if supported | Split view, or its absence -- and arbitrary window sizes, since apps built with the iOS 27.0 SDK resize continuously whatever orientations they declare |
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
| Screen image | `screenshot` (XcodeBuildMCP), or `xcrun simctl io <UDID> screenshot <path>` |
| Element frames, labels, traits | `snapshot_ui` (XcodeBuildMCP) -- this is the geometry source, not the screenshot |
| Build and warning output | `build_sim` |
| Test results | `test_sim` |
| Dynamic Type, appearance, Increase Contrast | `xcrun simctl ui <UDID> content_size <category>` (`extra-small` through `accessibility-extra-extra-extra-large`), `xcrun simctl ui <UDID> appearance dark`, `xcrun simctl ui <UDID> increase_contrast enabled`; `set_sim_appearance` (XcodeBuildMCP) for appearance |
| Reduce Motion, Reduce Transparency, Bold Text | Simulator Settings > Accessibility, or Xcode environment overrides. None has a `simctl` switch; an unexercised one is reported `not exercised` |
| VoiceOver, Switch Control, Assistive Access | A device only. On the Simulator, `snapshot_ui` and Accessibility Inspector show the structure VoiceOver reads, never its behaviour (`references/review/02-evidence-pipeline.md#simulator-and-device`) |
| Sequences: push, pop by edge swipe, dismiss, background, relaunch | `tap`, `swipe`, `gesture`, `button`, `stop_app_sim` + `launch_app_sim` (XcodeBuildMCP) |
| Body re-evaluation counts | `Self._printChanges()` in the view body, plus the SwiftUI Instruments template |
| Scroll hitches, frame timing | Instruments, Animation Hitches |
| Launch time, memory | Instruments, App Launch and Allocations |
| Network conditions | Network Link Conditioner |
| Every state, cheaply | Xcode Previews, one per state; see the preview harness in `references/usability/04-states-feedback-and-affordances.md` |

Address the simulator by UDID, never `booted`. With more than one simulator
booted, `simctl` picks one of them for `booted`, so an AX5 or Dark setting can
land on a device nobody captured, and the verdict then describes a configuration
nobody saw. Take the UDID from `session_show_defaults` (the XcodeBuildMCP
session's simulator) or `xcrun simctl list devices booted`, use the same UDID for
every capture and setting in the run, and record it in `manifest.json`.

`snapshot_ui` is the single highest-value capture in an iOS review: it returns
the accessibility hierarchy with frames, which simultaneously answers "what does
VoiceOver see", "is this target 44pt", and "does this clip".

## Run directory

Normalise artifacts so the team lead and the user see the same evidence:

```
review-run/
  manifest.json          scope, mode, runtime target and UDID, configurations
                         exercised and not exercised, untested claims, invalid
                         captures, commit
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

## Capture validity

Before a capture is graded, check that it shows what its name says.

| Check | Invalid when |
|---|---|
| Rendered | Black, blank, or the launch screen; or taken before `wait_for_ui` saw the screen's first element |
| Right screen and state | The `snapshot_ui` hierarchy taken at the same moment lacks the screen's identifying element, or the state the file name claims (empty, error) is not on screen |
| Right configuration | `xcrun simctl ui <UDID> appearance` or `content_size`, read back with no argument, differs from the file name's claim |
| At rest | Taken mid-transition (a push, a sheet presenting, a spring still settling), or while a loading or redacted placeholder covers the state the file name claims, unless that motion or placeholder is the state under test |
| Unobstructed | A keyboard, alert, permission prompt or system sheet covers the content, unless that overlay is the state under test |
| Right device class | The pixel size does not match the named device (a phone capture in an iPad run) |

An invalid capture is recaptured once, after fixing the cause: wait for the
element, re-apply the setting by UDID, let the motion settle, dismiss the
overlay. If the second capture is also invalid, record that screen and
configuration `not exercised` in `manifest.json` with the reason, and never grade
it. An invalid capture is a configuration nobody saw, so it feeds NOT ASSESSED
exactly as an absent one does.

Adapted from impeccable (Apache-2.0): `skill/agents/impeccable-finish-reviewer.md`.

## Evidence rules per claim

| Claim type | Minimum evidence |
|---|---|
| "This clips at AX5" | A hierarchy snapshot at AX5, or derived arithmetic |
| "This target is under 44pt" | The element frame; never a screenshot estimate |
| "Contrast is insufficient" | Resolved colour values plus a computed ratio, per trait collection, printed to two decimals and never rounded up to the threshold (4.46:1 fails 4.5:1) |
| "This animation is not Reduce-Motion gated" | The source line, both gates checked (`withAnimation` AND `.animation(_:value:)`) |
| "Scrolling janks" | An Instruments hitch measurement on a device, or a body re-evaluation count (a Simulator trace is an estimate) |
| "Back loses input" | The observed sequence, or the state-ownership line in source |
| "This state does not exist" | The exhaustive branch in source, or the forced state at runtime |
| "The iPad layout wastes the window" | Measured content width against window width; see `references/review/03-density-and-economy.md` |
| "The haptic feels wrong" | A device run; from source, only the trigger and the pairing |
| "This feels wrong" | Not a claim. Either name what is wrong with evidence, or drop it |

## Confidence calibration

Map evidence quality onto the confidence enum in
`references/review/01-finding-format.md`:

| Evidence | Highest confidence permitted |
|---|---|
| Observed at runtime on a target that can show it (`references/review/02-evidence-pipeline.md#simulator-and-device`), with a measurement | Hard defect |
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
| A haptic, hitch, VoiceOver or launch claim graded from a Simulator run as if observed | The Simulator cannot show any of the four |
| Grading a blank, wrong-screen or mid-transition capture | It shows a configuration nobody saw; recapture once, then record it `not exercised` |

## See also

- `references/review/01-finding-format.md` -- the finding template, severity, and confidence enum
- `references/review/03-density-and-economy.md` -- measurement recipes for the waste dimension
- `references/usability/05-adaptive-review-method.md` -- the configuration matrix in depth
- `references/usability/04-states-feedback-and-affordances.md` -- the state set and how to force each one
- `references/performance/03-launch-memory-instruments.md` -- Instruments workflows
- `references/methodology/02-previews-design-qa.md` -- preview-driven state and configuration coverage
