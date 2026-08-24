# Motion Choreography: One Personality, One Palette, One Budget

> Owner: this file owns SYSTEM-level motion doctrine -- the locked motion palette (three-spring maximum), the frequency-gated motion budget, the asymmetric-timing principle, numeric stagger rules, and converting web/designer spring specs (mass/stiffness/damping) to SwiftUI. It does NOT own: spring API mechanics and per-interaction parameter tuples (`references/animation/02-spring-physics.md`), retargeting/interruptibility (`references/interaction/01-fluid-smoothness-interruptible.md`), landing choreography and hero-then-secondary reveal mechanics (`references/interaction/02-fluid-transitions.md`), or press-in/press-out timing mechanics (`references/interaction/05-press-feedback-states.md`) -- cite, don't restate.
> Floors: `references/_scaffolding/version-floor-registry.md#ios-170` for the `Spring` type (`init(mass:stiffness:damping:allowOverDamping:)`, `init(response:dampingRatio:)`, derived `duration`/`bounce`).
> Adapted from [VibeCurb](https://github.com/Yu-369/VibeCurb) (MIT, Copyright (c) 2026 Yu-369), curated and merged with apple-ui-craft conventions.

A screen where every animation belongs to one motion family reads as designed by one hand; a screen that mixes crisp utility snaps, playful bounces, and theatrical reveals reads as assembled by a committee. The most common failure is not a bad spring -- it is twelve slightly different good springs, added one feature at a time, with no palette holding them together. Cohesion with fewer animations always beats variety with full coverage.

## The Apple way

- First-party apps commit to ONE motion personality and hold it everywhere. The personality axis runs from utility (fast, minimal overshoot -- Calculator, Settings) through standard tactile (visible spring settle -- Home Screen, Sheets, Dynamic Island) to expressive (pronounced bounce reserved for content and celebration -- Journal onboarding, Fitness rings). Pick the point on that axis that matches the app's job, then stop picking.
- The palette is at most THREE springs: quick feedback, standard interaction, expressive settle. Every `withAnimation`/`.animation` call site uses one of the three. A fourth spring in the codebase means one of the first three was chosen wrong. Within the palette, elements still vary by weight and role (`references/animation/02-spring-physics.md#composing-springs`) -- variation happens INSIDE the locked palette, never outside it.
- Motion earns its slot by frequency: the more often a person triggers a surface, the less it may animate. Rare moments get the delight budget; hundred-times-a-day paths get speed.

## The locked palette as tokens

Declare the palette once; call sites reference tokens, never inline tuples. Drift becomes grep-able.

```swift
// iOS 17+. One personality, three springs, zero inline spring literals at call sites.
enum Motion {
    /// Quick feedback: press states, toggles, small selections.
    static let quick = Animation.spring(duration: 0.25, bounce: 0.0)
    /// Standard interaction: sheets, cards, expansion, most UI.
    static let standard = Animation.spring(duration: 0.4, bounce: 0.2)
    /// Expressive settle: success states, celebration, first-run moments only.
    static let expressive = Animation.spring(duration: 0.5, bounce: 0.4)
}
```

The three values above are the standard-tactile personality; a utility-personality app compresses them (0.2/0.3/0.4 with bounce 0.0/0.1/0.2). Whichever personality is chosen, the TOKEN NAMES and the three-spring cap stay.

## Converting web/designer spring specs

Design handoffs and web motion specs describe springs as mass/stiffness/damping (Framer Motion, CSS `linear()` spring exports, Core Animation's `CASpringAnimation`). SwiftUI's `Spring` type takes those parameters directly and derives the modern duration/bounce form:

```swift
// iOS 17+. A designer hands you "stiffness 400, damping 30".
let spec = Spring(mass: 1, stiffness: 400, damping: 30)
let (duration, bounce) = (spec.duration, spec.bounce)
// Feed the derived values to the palette token:
// .spring(duration: duration, bounce: bounce)
```

The derivation, for checking a handoff by hand (mass m, stiffness k, damping c):

- natural frequency `w = sqrt(k/m)`; response/duration `= 2 * .pi / w`
- damping fraction `z = c / (2 * sqrt(k * m))`; bounce `= 1 - z`

Checksum against Apple's own documentation example: `Spring(mass: 1, stiffness: 100, damping: 10)` yields `(duration: 0.63, bounce: 0.5)` -- the formulas above give `2π/10 = 0.63` and `1 − 10/20 = 0.5` exactly.

The four triads that dominate web motion specs, pre-converted:

| Web spec (m=1) | Character | duration | bounce | Palette slot |
|---|---|--:|--:|---|
| stiffness 400, damping 30 | snappy arrival, ~2% overshoot | 0.31 | 0.25 | standard |
| stiffness 200, damping 24 | smooth position change, gentle settle | 0.44 | 0.15 | standard (large surfaces) |
| stiffness 300, damping 22 | emphasized container morph (Material 3) | 0.36 | 0.36 | expressive |
| stiffness 500, damping 18 | playful pop, visible bounce | 0.28 | 0.60 | see warning |

The 500/18 triad converts to bounce 0.60 -- above this library's production ceiling (`references/animation/02-spring-physics.md#anti-patterns` caps production UI at bounce 0.5). Accept it only for a rare celebration moment, or clamp to 0.5. A web spec is a starting point, not an exemption from the house ceiling.

## The frequency-gated motion budget

Assign every animated surface a frequency class before assigning it a spring. This is the quantitative form of `references/animation/01-animation-fundamentals.md#animation-purpose`: purpose says WHY a thing may move; the budget says HOW MUCH.

| Trigger frequency | Budget | iOS examples |
|---|---|---|
| 100+ times/day | ZERO animation. Speed IS the experience | Tab switches, hardware-keyboard actions, list arrow-key navigation, menu commands |
| Tens of times/day | Minimal, near-imperceptible feedback from `Motion.quick` | Press states, toggles, row selection, disclosure chevrons |
| Occasional | `Motion.standard` | Sheets, popovers, card expansion, settings panes, toasts |
| Rare / first-time | Full delight budget: `Motion.expressive`, stagger, haptic pairing | Onboarding, empty-state arrival, success/completion, paywall celebration |

Hard rule: an action initiated from a hardware keyboard never animates. A command palette or shortcut-driven navigation that plays a 0.4s spring two hundred times a day trains the user to resent it. This gate binds even when the same surface animates on touch.

## Asymmetric timing

Deliberate user actions run slow; system responses run fast. A hold-to-delete overlay fills over a long, linear 2s press (the slowness is the safety margin -- the user is still deciding) and snaps back in ~200ms with `Motion.quick` on release (the system answering). Symmetric timing in either direction feels mechanical: a fast fill destroys the safety margin, a slow snap-back makes the cancel feel ignored. Press-in/press-out mechanics and their timing values are owned by `references/interaction/05-press-feedback-states.md`.

## Stagger system rules

Landing choreography mechanics (z-order, hero-then-secondary reveal, interruption contract) are owned by `references/interaction/02-fluid-transitions.md`; the numbers that keep any stagger coherent are these:

- Increment 80-120ms between elements. Below 80ms reads as simultaneous; above 150ms reads as buffering.
- Order by VISUAL HIERARCHY -- container, then primary content, then supporting text, then actions, then decoration -- never by view-tree order.
- Stagger at most 6-8 elements individually; bring the remainder in as one batch. A 12-step stagger is a 1.2s wait.
- The whole entry sequence completes inside ~800ms. Longer reads as loading, not revealing.
- A stagger plays once per arrival, never on every state refresh.

```swift
// iOS 17+. Stagger indexed by hierarchy rank, gated to first appearance.
ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
    ItemRow(item)
        .opacity(hasAppeared ? 1 : 0)
        .offset(y: hasAppeared ? 0 : 12)
        .animation(Motion.standard.delay(Double(min(index, 7)) * 0.08),
                   value: hasAppeared)
}
```

## Accessibility contract

Everything in this file is developer-gated motion -- nothing here is system-auto-gated. Under Reduce Motion: the palette collapses to opacity-only fades, staggers collapse to a single batch (no per-element delays, no offsets), and the delight budget is zero. Gate through the shared `Animation?` accessor pattern in `references/animation/01-animation-fundamentals.md#reduce-motion-critical`; substitution catalog in `references/accessibility/05-motion-accessibility.md`.

## Anti-patterns

| Wrong | Why it fails | Right |
|---|---|---|
| Per-feature inline spring tuples accreted over months | Twelve uncoordinated curves; the app feels committee-built | Three palette tokens; call sites reference tokens |
| Mixing personalities (utility snap here, theatrical reveal there) | Each is fine alone; together they break the "one hand" illusion | Lock one personality; audit call sites against the palette |
| Animating hardware-keyboard-initiated actions | Punishes the highest-frequency users with cumulative waiting | Zero animation on keyboard paths, always |
| Delight-budget springs on everyday surfaces | Bounce on a toggle hit 40x/day stops being delightful by day two | Budget by trigger frequency, not by how good the demo looks |
| 10+ element stagger on list arrival | Over a second of forced watching before content is usable | Stagger 6-8, batch the rest, total entry under 800ms |
| Stagger ordered by view-tree position | The eye is led by layout order, not code order | Rank elements by visual hierarchy, delay by rank |
| Symmetric hold-to-confirm timing | Fast fill removes the safety margin; slow release feels unresponsive | Slow deliberate fill, fast system response |
| Web spring spec pasted without conversion or ceiling check | stiffness 500 / damping 18 lands at bounce 0.60, past the production cap | Convert via `Spring`, clamp bounce to 0.5 outside celebration moments |

## Severity guide

- HIGH -- animation on a 100+/day or keyboard-initiated path; entry choreography that blocks interaction past ~800ms.
- MEDIUM -- personality drift (call sites bypassing the palette with inline tuples); stagger ordered against visual hierarchy; delight-budget motion on everyday surfaces.
- LOW -- a converted web spec left unclamped on a rare surface; stagger increment marginally outside 80-120ms.

## See also

- `references/animation/02-spring-physics.md` -- spring APIs, house parameter tuples, the bounce ceiling
- `references/animation/01-animation-fundamentals.md#animation-purpose` -- what each animation must communicate
- `references/interaction/01-fluid-smoothness-interruptible.md` -- retargeting; why palette springs stay interruptible
- `references/interaction/02-fluid-transitions.md` -- landing choreography mechanics this file's stagger numbers plug into
- `references/interaction/05-press-feedback-states.md` -- asymmetric press-in/press-out mechanics
- `references/accessibility/05-motion-accessibility.md` -- Reduce Motion substitution catalog
