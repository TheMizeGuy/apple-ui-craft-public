# Finding Format, Severity, and Confidence

> Owner: `references/review/01-finding-format.md` is the SINGLE SOURCE OF TRUTH for the finding template, the severity scale, the confidence enum, and the dimension registry, across every agent, skill, and consumer in this plugin. An agent body that defines its own field names is a bug in that file, not a local convention: `craft-team-lead` merges and deduplicates on these names, so a specialist emitting a variant has its real findings dropped as non-conforming output. Point at this file; do not restate it.

Five agents write findings and one merges them. That only works if all six agree
on the field names. This file is the agreement.

## The template

```
[SEVERITY] [CONFIDENCE] <Dimension> -- <short title>
Surface: <screen / component / state / configuration>
File: path/to/File.swift:42-58
Issue: <the concrete problem, one or two sentences, no fix here>
Why it matters: <the consequence for a person using the app>
Evidence: <the measurement, the artifact, or the quoted behaviour that proves it>
Current code:
```swift
// minimal extract, 5 to 15 lines
```
Suggested fix:
```swift
// concrete rewrite, verbatim-applicable
```
Reference: references/<topic>/<file>.md#<section>
```

### Field rules

| Field | Required | Rule |
|---|---|---|
| `[SEVERITY]` | Always | Exactly one of CRITICAL, HIGH, MEDIUM, LOW, NIT, in square brackets, spelled as in the scale below |
| `[CONFIDENCE]` | Review paths | Exactly one of the four classes below. The architect's generation path may omit it; review paths may not |
| `<Dimension>` | Always | A registry name below, verbatim. Dedup and per-dimension verdicts key on this string, so a paraphrase silently creates a new dimension |
| `<short title>` | Always | Under ten words. Names the defect, not the fix |
| `Surface:` | Always | Where it appears: screen, component, state, and the configuration if it is configuration-dependent. "Settings > Notifications, AX5, 320pt window" |
| `File:` | Whenever source is in scope | Repo-relative `path:line` or `path:start-end`. With no source, one of `screenshot only`, `runtime only`, or the artifact id. Never invent a line number to fill it |
| `Issue:` | Always | The problem. No fix here |
| `Why it matters:` | Always | The user consequence. Restating the issue in other words is this field's most common failure |
| `Evidence:` | Always on review paths | The measurement, the artifact, or the quoted code and behaviour. "Looks wrong" is not evidence. Numeric and spatial claims follow the geometry rule in `references/review/02-evidence-pipeline.md` |
| `Current code:` | Whenever source is in scope | Minimal extract, enough to locate and no more |
| `Suggested fix:` | Always | Verbatim-applicable SwiftUI, or a specific direction when the fix is structural |
| `Reference:` | Always | The `references/` file and section that grounds the finding. Hard rule 2: no hand-waving |

### Optional dimension lines

Added after `Evidence:`, one per line, only when the dimension calls for one.
Additive; they never replace a required field.

| Line | Used by | Content |
|---|---|---|
| `WCAG:` | Accessibility | Criterion number, name, level: `1.4.3 Contrast (Minimum), AA` |
| `Who is affected:` | Accessibility | `VoiceOver users`, `low vision`, `motor`, `cognitive`, `all` |
| `Availability:` | Anything version-gated | The floor and its registry entry: `iOS 17.0+, version-floor-registry.md#ios-170` |
| `Impact:` | Performance | Metric with a measured or estimated delta: `body re-evaluations 240/scroll -> ~12, measured in Instruments` |
| `Measurement:` | Density, layout, adaptive geometry | The numbers: `content 640pt of 1024pt (62%), 384pt unused` |
| `Configuration:` | Adaptive | Where it reproduces: `AX5, 320pt window, landscape` |
| `Flow step:` | Task flow | Which step of which flow: `Invite teammates, step 2 of 3` |
| `State:` | States and recovery | Which state: `zero results`, `offline`, `partial failure` |
| `Platform:` | Cross-platform, platform integration | `iPadOS`, `watchOS`, `visionOS`, `Catalyst` |

## Severity scale

The same scale `ios-code-review` uses, so findings from the two plugins triage
together.

| Tag | Meaning | Examples |
|---|---|---|
| CRITICAL | Breaks the experience, excludes a user, or destroys work | Crash; accessibility blocker; content unreachable in a supported configuration; irreversible destruction with neither confirmation nor undo; motion that can trigger nausea with no Reduce Motion gate; Liquid Glass obscuring content that must be legible; a deep link that crashes |
| HIGH | Degrades the experience noticeably, or blocks a task | Wrong navigation pattern; typed input lost on back, dismiss, or termination; interactive pop gesture broken; missing empty or error state; no Reduce Motion support; clipping at AX5 on the narrowest supported width; a cold permission prompt; missing haptics on a committed mutation; **and waste at the same scale**: an iPad running a stretched phone layout, a screen more than twice as long as its content needs |
| MEDIUM | Quality gap | Suboptimal spring parameters; generic spacing instead of Apple metrics; a missing SF Symbol where one exists; a haptic on the wrong trigger; label drift between tab, title, and heading; a section that should be collapsed and is not |
| LOW | Polish | Slightly better timing; an additional haptic surface; minor spacing refinement; a newer API that would read better |
| NIT | Taste preference. Use sparingly | Alternate symbol choice; step ordering with no measured cost |

**Waste is not automatically NIT.** Every example above this line except the
noted additions describes something broken, and a reviewer calibrating honestly
against them will rank a perfectly-rendered, badly-proportioned iPad screen as a
stylistic preference. Rank waste by the screen space and time it costs and carry
a measurement, so it survives triage. Anything without a measurement genuinely is
NIT. See `references/review/03-density-and-economy.md`.

## Confidence classes

Four, exactly. The merge gate rejects a fifth.

| Class | Meaning | When to use |
|---|---|---|
| Hard defect | Objective; should be fixed | Clipped text, target below 44pt, unlabeled control, missing Reduce Motion gate, a state that does not exist, a broken gesture |
| Quality defect | Strongly justified; alternatives exist | Weak hierarchy, timing that fights the user, an easing curve where a spring belongs, awkward spacing rhythm |
| Pattern smell | Correlated with poor output, not proven here | Unmodified system defaults everywhere, a port of another platform's navigation, decoration-only haptics |
| Taste note | Advisory only | A different symbol, a different spring feel, an alternative arrangement |

Confidence is not severity. A Hard defect can be LOW (a 2pt alignment offset,
objectively present, barely consequential), and a Quality defect can be HIGH (a
navigation model that fights the platform). Report both.

## Dimension registry

Dedup and per-dimension verdicts key on these strings. Use them verbatim.

| Dimension | Owner agent | Judgeable from one frame? |
|---|---|---|
| Liquid Glass | apple-ui-reviewer | Yes |
| Typography hierarchy | apple-ui-reviewer | Yes |
| Color system | apple-ui-reviewer | Yes |
| SF Symbols | apple-ui-reviewer | Yes |
| Navigation patterns | apple-ui-reviewer | Yes |
| Layout and spacing | apple-ui-reviewer | Yes |
| Micro-interactions | apple-ui-reviewer | Yes |
| Density and economy | apple-ui-reviewer | Yes, with a measurement |
| Task flow and journey | apple-ui-reviewer | **No** |
| Information architecture and navigation structure | apple-ui-reviewer | **No** |
| Error recovery and state integrity | apple-ui-reviewer | **No** |
| Adaptive layout and Dynamic Type | apple-ui-reviewer | **No** |
| Animation | animation-haptics-engineer | Partly; feel needs motion |
| Haptics | animation-haptics-engineer | **No** |
| VoiceOver | accessibility-engineer | **No** |
| Dynamic Type | accessibility-engineer | **No** |
| Visual accessibility | accessibility-engineer | Yes |
| Motor accessibility | accessibility-engineer | Partly |
| Cognitive and hearing accessibility | accessibility-engineer | Partly |
| Rendering performance | performance-engineer | **No** |
| Scroll and list performance | performance-engineer | **No** |
| Launch and memory | performance-engineer | **No** |
| Platform integration | platform-engineer | Partly |
| Cross-platform reach | platform-engineer | Partly |

### The dimensions that cannot be judged from one frame

Ten of the twenty-four are decidable only from a SEQUENCE, a CONFIGURATION
CHANGE, or a MEASUREMENT: two consecutive screens, a back gesture, a relaunch, a
type-size change, a window resize, an Instruments trace.

That asymmetry is why flow and adaptation defects survive screen-by-screen
review. A checkout whose every screen is pixel-correct and whose step 2 discards
step 1's input scores clean on every visual dimension, because the defect is not
in any frame.

The consequence for every reviewer in this plugin:

- **Driven review** (simulator or device available): exercise the sequence and
  the configurations. Findings on these rows are direct observations.
- **Source available, no runtime**: reconstruct from the navigation surface, the
  submit handlers, the state ownership, and the sizing strategy. Label every
  runtime claim inferred and cite the line that supports it.
- **Screenshots only**: the correct verdict on these rows is **not assessed**,
  never clean. Reporting them clean from static frames is a false negative on
  exactly the class the frames cannot contain.

## Praise

Praise is a finding with no severity, and it is not optional filler: it tells the
user what to preserve during a refactor.

```
[PRAISE] <Dimension> -- <what is good>
File: path/to/File.swift:12-30
Why it works: <the specific reason, not "nice job">
```

No "Great work overall". Praise names a specific decision and why it is right.

## Worked examples

```
[HIGH] [Hard defect] Task flow and journey -- back at step 2 discards addresses
Surface: Invite teammates sheet, step 2 of 3
File: Features/Invite/InviteRoleView.swift:18-24
Issue: Step 2 owns its role map in @State and receives no address state; the
  interactive pop gesture returns to step 1 with an empty field list.
Why it matters: A user who goes back to fix one typo retypes every address, and
  a system termination during the sheet loses all of them.
Evidence: InviteRoleView has no reference to the address list; InviteFlow.swift:31
  constructs it with `InviteRoleView(roles: $roles)` only. Reproduced in the
  simulator: three addresses entered, swipe back, field list empty.
Flow step: Invite teammates, step 2 of 3
Current code:
```swift
struct InviteRoleView: View {
    @State private var roles: [Role] = []
```
Suggested fix:
```swift
// Own the draft above the presentation so back, dismiss, and termination
// all find it intact.
struct InviteRoleView: View {
    @Bindable var draft: InviteDraft   // holds addresses AND roles
```
Reference: references/usability/01-task-flows-and-journeys.md#4-state-that-carries-forward
```

```
[HIGH] [Hard defect] Adaptive layout and Dynamic Type -- value label truncates at AX5
Surface: Workout row, 320pt window, .accessibility5
File: Features/Workouts/WorkoutRow.swift:34
Issue: The title is pinned to a fixed 120pt frame inside an HStack, so at AX5 the
  trailing value has 168pt of the 320pt window after padding and truncates.
Why it matters: The value is the row's only quantitative content; a low-vision
  user at the type size the setting exists for cannot read it.
Evidence: Derived: 120pt title + 32pt horizontal padding + 12pt spacing leaves
  156pt for a value that measures 214pt at AX5. Confirmed in the simulator at
  .accessibility5 on a 320pt window: renders "Total car...".
Configuration: AX5, 320pt window
Current code:
```swift
HStack {
    Text(workout.name).frame(width: 120)
    Spacer()
    Text(workout.calories, format: .number)
}
```
Suggested fix:
```swift
let layout = typeSize.isAccessibilitySize
    ? AnyLayout(VStackLayout(alignment: .leading))
    : AnyLayout(HStackLayout())
layout {
    Text(workout.name)
    Spacer(minLength: 8)
    Text(workout.calories, format: .number).layoutPriority(1)
}
```
Reference: references/usability/05-adaptive-review-method.md#4-dynamic-type-is-the-platforms-zoom
```

## Anti-patterns

| Wrong | Why it fails |
|---|---|
| Inventing a dimension name | Dedup misses it; it gets no verdict row |
| Omitting `Evidence:` on a review finding | The verifier cannot distinguish it from a guess |
| `Why it matters:` restating `Issue:` | The field exists to name the user consequence |
| A fifth confidence class | The merge gate rejects it |
| A geometry claim with no measurement | See `references/review/02-evidence-pipeline.md` |
| An invented line number | Destroys trust in every other citation in the report |
| A clean verdict on a sequence dimension from one screenshot | A false negative on the class screenshots cannot contain |
| Restating this template in an agent body | Two copies drift; the merge gate follows only one |

## See also

- `references/review/02-evidence-pipeline.md` -- review modes, the geometry evidence rule, what each mode may claim
- `references/review/03-density-and-economy.md` -- the waste dimension and its measurements
- `references/usability/01-task-flows-and-journeys.md` -- the flow dimensions and their break tests
- `references/usability/05-adaptive-review-method.md` -- the adaptive dimension and its verdict rubric
- `references/_scaffolding/version-floor-registry.md` -- the source for every `Availability:` line
