# <Title: the capability, not the API name>

> Owner: `references/<topic>/<file>.md` owns <concept(s)> per the ARCHITECTURE ownership map. Cite, don't restate.
> Floors: cite `references/_scaffolding/version-floor-registry.md#<section>` for anything version-gated. State a floor inline only for the file's headline APIs.

One-paragraph thesis: what this file makes an agent able to DO, and the single most common way apps get it wrong.

## The Apple way

What first-party apps do, stated as testable rules. Declarative, specific. No hedging.

## Core APIs

```swift
// iOS <floor>+. Verbatim-applicable. Availability comments on any line above the file floor.
```

Tables for parameter/variant matrices only when the axis count demands it; prose otherwise.

## Availability + fallbacks

```swift
if #available(iOS 26, *) {
    // iOS-26 surface
} else {
    // Material / pre-26 fallback -- always shown, never "left as an exercise"
}
```

iOS-27 beta symbols: fence behind `#available(iOS 27, *)` with a `// SDK-verify` comment; never in the primary example.

## Accessibility contract

The file's Reduce Motion / VoiceOver / Dynamic Type obligations. If motion: state whether the system auto-gates it (rare -- Glass specular, default nav/sheet transitions, one-shot discrete symbol effects) or the developer owns the gate (everything else).

## Anti-patterns

| Wrong | Why it fails | Right |
|---|---|---|

## Severity guide

What CRITICAL/HIGH/MEDIUM/LOW looks like in this domain -- 1 line each, only where reviewers need calibration beyond the shared scale.

## See also

- `references/<topic>/<file>.md#<heading-slug>` -- <why>
- `~/Claude/vault/iOS Development/<file>.md` -- deep source
