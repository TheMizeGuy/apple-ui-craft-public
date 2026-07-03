# Build and Compile-Time Performance

> Owner: `references/performance/07-build-performance.md` owns Swift type-checker blowups ("unable to type-check this expression in reasonable time"), the `AnyView` compile-time-vs-runtime tradeoff, compile-time-motivated body decomposition, compilation-mode/incremental-build tuning, and the measurement flag set. `references/performance/01-swiftui-rendering.md` owns RUNTIME body-evaluation cost -- an extracted `View` struct is a re-render boundary there; it is ALSO a separately type-checked expression here. The two goals often share a fix (extract a child `View` struct) but are orthogonal: a fix can help one, both, or neither.
> Floors: none of this file is iOS-version-gated -- every flag and build setting below is a Swift-toolchain/Xcode-build-setting concern, set per build configuration, independent of deployment target. See `references/_scaffolding/version-floor-registry.md#build-tool-floors-performance07-cites-this` for the exact flag spellings.

Build time is a performance surface with its own budget: edit-build-run loop speed, CI wall-clock, and archive-timeout risk. The dominant real-world trigger is SwiftUI itself -- a `body` is one enormous generic expression, and the type-checker's constraint solver pays a cost that is COMBINATORIAL in the number of unannotated, overloaded, or literal-typed sub-terms in that expression, not linear in line count.

## Why "unable to type-check this expression" happens

Swift's solver does bidirectional type inference with overload resolution. Each overloaded operator, untyped numeric literal, or initializer in an expression multiplies the candidate set the solver must explore. Two things push a `body` over budget:

1. **Breadth** -- many un-typed terms in ONE expression: long ternary/nil-coalescing chains, mixed numeric-literal arithmetic (`a + b * 2 + c / 3`), large heterogeneous collection literals, `+`-concatenated strings, long `.map/.filter/.reduce` chains with inferred element types.
2. **SwiftUI depth** -- deeply nested view/modifier trees whose generic parameters all resolve together; conditional modifiers injecting `_ConditionalContent`; ternaries whose two branches are different concrete `View` types.

## The fix hierarchy (apply top-down; each shrinks the solver's search)

1. **Add explicit type annotations at the seams.** `let total: Double = a + b + c`, `let cols: [GridItem] = [GridItem(.adaptive(minimum: 120))]`. An annotation collapses a subtree from "solve for T" to "check against T" -- the single highest-leverage, lowest-risk fix.
2. **Break one giant expression into named sub-expressions.** Pull inner computations into typed `let`s BEFORE the view tree; pull view fragments into `@ViewBuilder` helpers or child `View` structs (each is separately type-checked against its own budget).
3. **Replace mixed-type ternaries with `@ViewBuilder` `if`/`else`.** SwiftUI wraps it in `_ConditionalContent` in ONE place instead of forcing the solver to unify two branch types inline.
4. **Isolate conditional modifiers in a `ViewModifier`** so the call site sees one concrete `ModifiedContent` step.
5. **Qualify inferred namespaces** (`Color.accentColor`, not bare `.accentColor`) when a parameter type can't cheaply infer the enclosing type.
6. **Avoid `+`-chains for both arithmetic and strings** -- use string interpolation; for numeric sums, annotate the result type or split into typed intermediates.

## Catalogue of blow-up patterns

```swift
// 1. Mixed numeric-literal arithmetic
// BAD -- solver explores Int/Double/CGFloat overloads across every term
let x = a + b * 2 + c / 3 + d - 4
// GOOD -- each term checked AGAINST a type, not solved for one
let x: CGFloat = a + b * 2 + c / 3 + d - 4

// 2. Long ternary/nil-coalescing chains
// BAD -- nested ?: with heterogeneous branches -> near-exponential branch unification
let color = flagA ? .red : flagB ? .orange : flagC ? .yellow : isNight ? .indigo : .primary
// GOOD -- typed helper
func statusColor() -> Color { if flagA { .red } else if flagB { .orange } else { .primary } }

// 3. SwiftUI: deeply nested tree + inline conditional modifiers (the dominant real-world case)
// BAD -- one ~150-line body; conditional modifiers + ternary-typed subviews all unify together
// GOOD -- extract typed helpers; if/else in @ViewBuilder; Group for conditional backgrounds
@ViewBuilder private var bodyContent: some View { /* smaller expression */ }

// 4. SwiftUI: ternary returning different View types
// BAD -- also drags in AnyView if "fixed" the wrong way
Group { showList ? AnyView(ListView(items)) : AnyView(EmptyStateView()) }
// GOOD
@ViewBuilder private var content: some View {
    if showList { ListView(items) } else { EmptyStateView() }
}
```

If a single statement has MANY of {overloaded operators, untyped numeric literals, heterogeneous collection literals, different-typed conditional branches, inferred closure element types}, it is a type-check risk regardless of line count. The fix is always the same shape: cut it into smaller, explicitly-typed pieces.

## AnyView: the compile-time crutch that is a runtime tax

Developers reach for `AnyView` to SILENCE the type-checker ("unable to type-check," "return types don't match"), trading a compile-time problem for a runtime one -- almost always the wrong trade.

```swift
@frozen nonisolated struct AnyView   // iOS 13.0+
init<V: View>(_ view: V)
init<V: View>(erasing view: V)
```

Apple's own documentation states the cost verbatim: "Whenever the type of view used with an `AnyView` changes, the old hierarchy is destroyed and a new hierarchy is created for the new type." Type erasure discards the static view type SwiftUI's diff algorithm needs to prove a subtree is unchanged across an update -- it CANNOT cheaply diff in place, so it tears down and rebuilds. In a `List`/`ForEach` cell, this converts a cheap reuse into a full rebuild on every update touching that row.

What to reach for instead (each keeps the static type AND fixes the compile issue):

1. **`@ViewBuilder`** on the property/func/init param -- branches return different concrete types with no erasure; SwiftUI wraps them in `_ConditionalContent`/`TupleView`. The single best `AnyView` replacement.
2. **`Group { if ... else ... }`** where a modifier must apply to a conditional block.
3. **Opaque `some View`** return -- one concrete underlying type, inferred once.
4. **A generic parameter** -- `struct Card<Content: View>: View { let content: Content }` defers the concrete type to the caller with zero erasure.
5. **Restructure so both branches share a type** -- compute a value and feed ONE view, branching on data instead of view type.

`AnyView` is genuinely justified only for: a heterogeneous, RUNTIME-determined collection where the element type truly varies and cannot be enumerated at compile time (a router/registry); breaking an otherwise-infinitely-typed recursive view; a deliberate `.id()`-style reset where you WANT teardown. Even then, push the erasure to the smallest leaf and keep parents/containers statically typed so diffing survives above the erased node. Reviewer heuristic: flag every `AnyView(` in a cell/row builder or `? AnyView(..) : AnyView(..)` ternary; require a written justification for any that remain.

## Body decomposition: compile-time and runtime are DIFFERENT levers

Do not conflate the two effects of "extracting a helper":

- **Runtime invalidation** (`references/performance/01-swiftui-rendering.md#view-decomposition`): only an extracted `View` STRUCT is a re-render boundary. A computed `some View` property or a `@ViewBuilder` func is INLINED by the compiler -- zero runtime benefit.
- **Compile-time type-checking**: a computed `some View`, a `@ViewBuilder` func, AND a child `View` struct are each their own SEPARATELY type-checked expression -- all three cap the solver's per-expression cost, even the ones that do nothing for runtime.

A refactor that serves both: extract into a CHILD `VIEW STRUCT` with a minimal, explicitly-typed input list -- an independent invalidation boundary AND a smaller expression to type-check.

```swift
// BEFORE: one ~200-line body over budget
struct DashboardView: View {
    @State private var vm = DashboardModel()
    var body: some View {
        ScrollView { VStack(spacing: 16) { /* header, stats grid, chart, activity list, footer inline */ } }
    }
}

// AFTER: each fragment is its own expression AND its own invalidation boundary
struct DashboardView: View {
    @State private var vm = DashboardModel()
    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                DashboardHeader(user: vm.user)
                StatsGrid(stats: vm.stats)
                ActivityChart(points: vm.chartPoints)
                ActivityList(items: vm.recentActivity)
            }
        }
    }
}
struct StatsGrid: View {
    let stats: [Stat]                                                        // minimal, POD-ish input
    private let columns: [GridItem] = [GridItem(.adaptive(minimum: 120))]     // explicit type
    var body: some View { LazyVGrid(columns: columns) { ForEach(stats) { StatCell(stat: $0) } } }
}
```

Extraction that changes nothing at runtime is still the correct fix for a SwiftLint `function_body_length` breach or a type-checker warning -- compile-time craft and lint-length limits reinforce the same instinct: small, typed, single-purpose view pieces.

## Measuring compile time

All flags below are Swift-toolchain flags (`swiftlang/swift docs/CompilerPerformance.md`), not SwiftUI APIs -- stable across iOS SDK versions, set per build configuration.

| Flag | What it does | Start value |
|---|---|---|
| `-Xfrontend -warn-long-function-bodies=<ms>` | Warns per function/`body` whose TYPE-CHECK exceeds N ms | 100 |
| `-Xfrontend -warn-long-expression-type-checking=<ms>` | Warns per slow EXPRESSION, with exact line:col | 100 |
| `-Xfrontend -debug-time-function-bodies` | Dumps every function's type-check time, sorted by duration | -- |
| `-Xfrontend -debug-time-expression-type-checking` | Dumps every expression's time -- finest granularity | -- |
| `-driver-time-compilation` | High-level per-job timing (compile vs link) -- finds the slow FILE | -- |
| `-stats-output-dir <dir>` | Unified stats reporter: full compiler counters/timers to a directory | -- |

Wire the two threshold warnings via **Build Settings -> Other Swift Flags** (`OTHER_SWIFT_FLAGS`), Debug configuration only:

```
OTHER_SWIFT_FLAGS = $(inherited) -Xfrontend -warn-long-function-bodies=100 -Xfrontend -warn-long-expression-type-checking=100
```

Each flag is individually `-Xfrontend`-prefixed -- `-warn-long-function-body-type-checking` is not a real flag; exact spelling is load-bearing.

Workflow: turn on both `-warn-long-*=100` flags in Debug and rebuild -- the warnings ARE your ranked worklist. For a stubborn file, add `-debug-time-expression-type-checking`, rebuild that file, read the top lines for the exact `line:col`. Apply the fix hierarchy above; re-measure. Xcode-native, no flags: **Product -> Perform Action -> Build With Timing Summary** for per-phase build times, and the **Build Timeline** in the Report navigator after any build (shows parallelism and the long pole).

Two gotchas: SourceKit's INTERACTIVE type-check budget (the editor) is smaller than `xcodebuild`'s -- a body can show "unable to type-check" live in the editor yet build clean from the command line, which is the authoritative check. And the reported line MIGRATES after a fix -- the same error reappearing on a different line of an already-oversized body means it was pre-existing, not caused by your edit; confirm by building at the prior commit before assuming a regression.

## Compilation mode and incremental builds

| Mode | Setting | Use for |
|---|---|---|
| Incremental (batch) | `SWIFT_COMPILATION_MODE = singlefile` (Xcode: "Incremental") | Debug edit-build-run: only changed files + dependents recompile |
| Whole-module (WMO) | `SWIFT_COMPILATION_MODE = wholemodule` | Release: one frontend job over the whole module -- best runtime codegen, but ANY edit recompiles the ENTIRE module |

Rule: **Debug = Incremental, Release = Whole Module.** WMO in Debug is a self-inflicted slow-build regression. Debug also defaults to `-Onone` (no optimizer) -- keep it; don't add `-O` to Debug "to test perf," it wrecks the edit loop.

Reduce the recompilation blast radius:
- **`private`/`fileprivate`/`final`.** Shrinks what an edit invalidates for the compiler; `final` also enables direct dispatch. Broad `public`/`open` on app-internal types forces wider re-checking.
- **Explicit types at module/large-file boundaries.** An un-annotated `public`/`internal` computed property forces callers to re-infer; an explicit return type caps propagation.
- **Split into modules / local SwiftPM packages.** Only the edited module and its dependents rebuild; siblings stay cached. The highest-leverage STRUCTURAL fix for a large app -- convert stable, leaf-y code (design system, models, networking) into local packages.
- **Declare input/output files on every Run Script build phase** (SwiftGen, SwiftLint, R.swift, etc.). Without them the phase runs on EVERY build and serializes the graph; with them Xcode skips the phase when inputs are unchanged.

## Cross-module optimization (Release, opt-in)

Enable via `OTHER_SWIFT_FLAGS -cross-module-optimization` in Xcode (SwiftPM: `-Xswiftc -cross-module-optimization`), paired with `@inlinable` on the APIs you want inlined across module boundaries. This is a build-setting flag, not a named Xcode toggle -- lets the optimizer inline across module boundaries for better runtime performance at the cost of longer, coarser-grained Release builds. Release-only; never Debug.

## Anti-patterns

| Wrong | Why it fails | Right |
|---|---|---|
| `AnyView(..) : AnyView(..)` ternary in a cell builder | Runtime rebuild-on-every-update tax to fix a compile-time symptom | `@ViewBuilder` `if`/`else` |
| One 150+ line `body` with inline conditional modifiers | Blows the per-expression type-check budget | Extract typed child `View` structs |
| `let cfg = ["a": 1, "b": 2.0, "c": "x"]` | Untyped heterogeneous literal | `let cfg: [String: Any] = [...]` |
| `"Hello, " + name + " you have " + String(count)` | `+`-chain forces overload resolution across types | String interpolation |
| Whole-Module Optimization in Debug | Any edit recompiles the entire module | `SWIFT_COMPILATION_MODE = singlefile` in Debug |
| A Run Script phase with no declared input/output files | Runs and serializes the build graph on every build | Declare inputs/outputs so Xcode can skip it |
| `-O` added to Debug "to test performance" | Wrecks the incremental edit loop | Profile a Release/Instruments build instead |
| Chasing an editor-only "unable to type-check" squiggle | SourceKit's interactive budget is smaller than `xcodebuild`'s | Confirm against a clean command-line build first |

## See also

- `references/performance/01-swiftui-rendering.md#view-decomposition` -- runtime re-render boundary, the sibling half of body decomposition
- `references/performance/04-state-architecture.md` -- `@Observable`/`@ViewBuilder` patterns that keep bodies small by construction
- `~/Claude/vault/iOS Development/` -- Swift compiler internals deep source
