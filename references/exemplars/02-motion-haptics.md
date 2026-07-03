# Exemplar: Motion + Haptics

> Status: signature-drafted, build-pending (requires Xcode build at iOS 18 + iOS 26 targets).
> Composes: `references/animation/02-spring-physics.md` (spring presets), `references/animation/05-gesture-driven.md` (velocity handoff, direct manipulation), `references/haptics/02-swiftui-sensory-feedback.md` (`.sensoryFeedback`), `references/accessibility/05-motion-accessibility.md` (Reduce Motion double-gate), `references/interaction/01-fluid-smoothness-interruptible.md` (interruptibility).
> Floors: `.interactiveSpring(duration:extraBounce:blendDuration:)` and `SensoryFeedback.impact(flexibility:)` are iOS 17.0+; `.navigationTransition(.zoom)`/`matchedTransitionSource` are iOS 18.0+ (not tvOS).

Four components -- a swipe-to-act row, a hold-to-reorder list, a hero zoom transition, and the haptic-coverage discipline that ties them together -- all sharing ONE spring-token vocabulary and ONE semantic haptic layer. The rule that generates every design decision below: per HIG "Playing haptics," the animation and the haptic fired on the SAME event must come from ONE physical metaphor -- never pair a soft bounce with a hard rigid tap.

## The Apple way

- **The 1:1 rule.** A live drag/gesture offset is applied RAW, never animated -- animating the finger-follow makes the view chase the finger with elastic lag. Only the release/settle transition is animated.
- **Velocity handoff.** `onEnded` reads `predictedEndTranslation` (or `value.velocity`, iOS 17+) so a fast flick commits even if the finger didn't travel the full threshold -- and this intent is preserved under Reduce Motion, not dropped.
- **Haptics map to a committed mutation, never decoration.** One rigid tick the instant a commit threshold is crossed; a medium impact (weight = irreversibility) on the destructive commit itself.
- **Know when NOT to fire a haptic.** Regular push/pop navigation already has system-owned feel; a haptic there is noise, not craft.
- **Swipe/reorder are accelerators, never the only path.** A rotor `accessibilityAction` or `.accessibilityAdjustableAction` gives VoiceOver users the same outcome without the gesture.

## Core APIs

### Part A -- shared motion tokens, semantic haptic vocabulary, swipe-to-act row

```swift
import SwiftUI

// MARK: - Motion tokens (one source of truth; kills per-engineer drift)

enum AppMotion {
    /// Finger-following live tracking. Apple-documented `interactiveSpring` default.
    static let tracking  = Animation.interactiveSpring(duration: 0.15, extraBounce: 0.0, blendDuration: 0.25)
    /// Workhorse settle after a gesture hands off velocity -- reads as mass landing.
    static let settle    = Animation.spring(duration: 0.4, bounce: 0.18)
    /// Reorder neighbor shuffle -- enough bounce to read as "settling into place."
    static let reorder   = Animation.spring(duration: 0.35, bounce: 0.2)
    /// Rubber-band spring-back to origin (shipped production value).
    static let springBack = Animation.spring(response: 0.32, dampingFraction: 0.82)
    /// Layout collapse of vacated space -- MUST NOT bounce (an oscillating hole reads as a bug).
    static let collapse  = Animation.spring(duration: 0.35, bounce: 0.0)
    /// One-shot celebratory bounce -- reserve for rare success moments.
    static let celebrate = Animation.spring(duration: 0.5, bounce: 0.45)
}

// MARK: - Semantic haptic vocabulary (feature code never calls raw .sensoryFeedback)

enum AppHaptic {
    case commitCross, destructiveCommit, lift, slotCross, drop

    var feedback: SensoryFeedback {
        switch self {
        case .commitCross:       .impact(flexibility: .rigid)   // firm click into place
        case .destructiveCommit: .impact(weight: .medium)       // weight = irreversibility
        case .lift:               .impact(flexibility: .soft)   // soft "clunk" leaving the surface
        case .slotCross:          .selection                    // light context tick
        case .drop:                .impact(flexibility: .rigid) // firm landing
        }
    }
}

extension View {
    /// Fires a semantic haptic when `trigger` changes. Bind to an explicit user-action trigger
    /// (a bumped counter, or a Bool that flips only on the event) -- never derived model state,
    /// which fires on unrelated refreshes.
    func haptic<T: Equatable>(_ h: AppHaptic, trigger: T) -> some View {
        sensoryFeedback(h.feedback, trigger: trigger)
    }
}

// MARK: - Swipe-to-act row

struct SwipeToActRow<Content: View>: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let actionLabel: String
    let actionImage: String
    let actionTint: Color
    let onCommit: () -> Void
    @ViewBuilder var content: Content

    @GestureState private var dragX: CGFloat = 0
    @State private var restX: CGFloat = 0
    @State private var commitCount = 0

    private let restingReveal: CGFloat = 88
    private let commitThreshold: CGFloat = 200
    private var translationX: CGFloat { min(0, restX + dragX) }
    private var isPastCommit: Bool { -translationX >= commitThreshold }

    var body: some View {
        ZStack(alignment: .trailing) {
            Button(role: .destructive, action: commit) {
                Image(systemName: actionImage).font(.title3.weight(.semibold))
                    .frame(width: max(restingReveal, -translationX)).frame(maxHeight: .infinity)
            }
            .buttonStyle(.plain).foregroundStyle(.white).background(actionTint)
            .symbolEffect(.bounce, value: isPastCommit)   // icon nudge: "release to fire"

            content
                .frame(maxWidth: .infinity, alignment: .leading).background(.background)
                .offset(x: translationX)                   // RAW 1:1 -- never animated during drag
                .contentShape(.rect)
                .gesture(swipe)
        }
        .clipShape(.rect(cornerRadius: 12))
        // One rigid tick the instant the finger crosses the commit line (false→true only).
        .sensoryFeedback(.impact(flexibility: .rigid), trigger: isPastCommit) { was, now in now && !was }
        .haptic(.destructiveCommit, trigger: commitCount)   // on the committed mutation
        .accessibilityElement(children: .combine)
        .accessibilityAction(named: Text(actionLabel), commit)
    }

    private var swipe: some Gesture {
        DragGesture(minimumDistance: 12)
            .updating($dragX) { value, state, _ in state = value.translation.width }
            .onEnded { value in
                let projected = restX + value.predictedEndTranslation.width   // velocity projection
                withAnimation(reduceMotion ? nil : AppMotion.settle) {
                    if -projected >= commitThreshold { restX = -commitThreshold; commit() }
                    else if -(restX + value.translation.width) >= restingReveal / 2 { restX = -restingReveal }
                    else { restX = 0 }
                }
            }
    }

    private func commit() { commitCount += 1; onCommit() }
}
```

### Part B -- reorderable list (the four-beat rule, jump-free)

```swift
private enum ReorderPhase: Equatable { case idle, pressing, dragging }

private struct ReorderRow<Content: View>: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let content: Content
    let height: CGFloat
    let slot: CGFloat
    let indexShift: Int             // currentIndex − startIndex (0 at rest)
    let onLift: () -> Void
    let onMove: (CGFloat) -> Void
    let onDrop: () -> Void

    @GestureState private var phase: ReorderPhase = .idle
    @GestureState private var translation: CGFloat = 0
    @State private var lifted = false

    var body: some View {
        content
            .frame(height: height).frame(maxWidth: .infinity)
            .background(.background, in: .rect(cornerRadius: 12))
            .scaleEffect(lifted && !reduceMotion ? 1.04 : 1.0)
            .shadow(color: .black.opacity(lifted && !reduceMotion ? 0.22 : 0), radius: 12, y: 6)
            .opacity(lifted ? 0.97 : 1.0)                                       // RM-safe lift cue
            .offset(y: lifted ? translation - CGFloat(indexShift) * slot : 0)   // RAW, compensated
            .zIndex(lifted ? 1 : 0)
            // Dragged item never animates its own slot move -- it must stay pinned under the finger.
            .transaction { if lifted { $0.animation = nil } }
            .gesture(
                LongPressGesture(minimumDuration: 0.3).sequenced(before: DragGesture())
                    .updating($phase) { value, state, _ in
                        switch value {
                        case .first(true):        state = .pressing
                        case .second(true, _):    state = .dragging
                        default:                  state = .idle
                        }
                    }
                    .updating($translation) { value, state, _ in
                        if case .second(true, let drag) = value { state = drag?.translation.height ?? 0 }
                    }
            )
            .onChange(of: phase) { old, new in
                let nowActive = new != .idle, wasActive = old != .idle
                if nowActive && !wasActive {
                    withAnimation(reduceMotion ? nil : AppMotion.reorder) { lifted = true }; onLift()
                } else if !nowActive && wasActive {
                    withAnimation(reduceMotion ? nil : AppMotion.reorder) { lifted = false }; onDrop()
                }
            }
            .onChange(of: translation) { _, t in if lifted { onMove(t) } }
    }
}

struct ReorderableList<Item: Identifiable & Equatable, Row: View>: View {
    @Binding var items: [Item]
    var rowHeight: CGFloat = 56
    var spacing: CGFloat = 8
    @ViewBuilder var row: (Item) -> Row

    @State private var draggingID: Item.ID?
    @State private var startIndex: Int?
    @State private var liftCount = 0, slotCount = 0, dropCount = 0
    private var slot: CGFloat { rowHeight + spacing }

    var body: some View {
        VStack(spacing: spacing) {
            ForEach(items) { item in
                ReorderRow(content: row(item), height: rowHeight, slot: slot,
                           indexShift: shift(for: item),
                           onLift: { draggingID = item.id; startIndex = items.firstIndex { $0.id == item.id }; liftCount += 1 },
                           onMove: { t in move(item, by: t) },
                           onDrop: { draggingID = nil; startIndex = nil; dropCount += 1 })
            }
        }
        .haptic(.lift, trigger: liftCount)
        .haptic(.slotCross, trigger: slotCount)
        .haptic(.drop, trigger: dropCount)
    }

    private func shift(for item: Item) -> Int {
        guard draggingID == item.id, let start = startIndex,
              let cur = items.firstIndex(where: { $0.id == item.id }) else { return 0 }
        return cur - start
    }

    private func move(_ item: Item, by t: CGFloat) {
        guard let start = startIndex, let from = items.firstIndex(where: { $0.id == item.id }) else { return }
        let target = max(0, min(items.count - 1, start + Int((t / slot).rounded())))
        guard target != from else { return }
        withAnimation(AppMotion.reorder) {          // beat 3: neighbors make way (dragged row opts out)
            let moved = items.remove(at: from); items.insert(moved, at: target)
        }
        slotCount += 1
    }
}
```

The four beats: **lift** (animated scale+shadow+zIndex+soft haptic), **follow** (raw 1:1 offset, never animated), **make-way** (neighbors spring into the vacated slot; the dragged row opts out via `.transaction { $0.animation = nil }`), **snap** (settle on release). The compensated offset (`translation − indexShift × slot`) is the fix for the most common shipped reorder bug: without it, the dragged item's layout slot moves as the array reorders mid-drag, so it visibly jumps a full row every time it crosses a boundary.

### Part C -- hero zoom transition (nav `.zoom` vs in-place `matchedGeometryEffect`)

```swift
struct GalleryItem: Identifiable, Hashable { let id = UUID(); let title: String; let symbol: String; let tint: Color }

// Modern hero (iOS 18+): navigation zoom transition -- prefer for list→detail.
struct HeroZoomGallery: View {
    @Namespace private var namespace
    let items: [GalleryItem]
    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 120), spacing: 16)], spacing: 16) {
                    ForEach(items) { item in
                        NavigationLink(value: item) { GalleryTile(item: item) }
                            .buttonStyle(.plain)
                            .matchedTransitionSource(id: item.id, in: namespace)   // the zoom's origin
                    }
                }
                .padding()
            }
            .navigationTitle("Gallery")
            .navigationDestination(for: GalleryItem.self) { item in
                GalleryDetail(item: item)
                    // System honors Reduce Motion (degrades to cross-fade) automatically -- no
                    // explicit gate here. No haptic either: navigation feel is system-owned; a
                    // tap tick on a nav transition is noise, not craft.
                    .navigationTransition(.zoom(sourceID: item.id, in: namespace))
            }
        }
    }
}

// In-place hero (iOS 17+): matchedGeometryEffect expand, RM-gated because YOU own this animation.
struct ExpandableHero: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Namespace private var ns
    @State private var expanded = false
    @State private var openCount = 0
    let item: GalleryItem

    var body: some View {
        ZStack {
            if expanded {
                RoundedRectangle(cornerRadius: 28).fill(item.tint.gradient)
                    .matchedGeometryEffect(id: item.id, in: ns).frame(height: 320)
                    .overlay { Image(systemName: item.symbol).font(.system(size: 96)).foregroundStyle(.white) }
                    .onTapGesture(perform: toggle)
            } else {
                RoundedRectangle(cornerRadius: 20).fill(item.tint.gradient)
                    .matchedGeometryEffect(id: item.id, in: ns).frame(width: 120, height: 120)
                    .overlay { Image(systemName: item.symbol).font(.largeTitle).foregroundStyle(.white) }
                    .onTapGesture(perform: toggle)
            }
        }
        // One optional soft "open" tick -- a deliberate expand is a committed action; fires only
        // on open (false→true), never on collapse.
        .sensoryFeedback(.impact(flexibility: .soft), trigger: expanded) { was, now in now && !was }
    }

    private func toggle() {
        withAnimation(reduceMotion ? .easeInOut(duration: 0.2) : AppMotion.settle) { expanded.toggle() }
        if expanded { openCount += 1 }
    }
}
```

`matchedTransitionSource`/`.navigationTransition(.zoom)` are iOS 18+ and unsupported on tvOS -- gate behind `#available(iOS 18, *)` for a lower deployment target, or ship the `ExpandableHero` `matchedGeometryEffect` path instead. Never leave both the thumbnail and detail visible with the same matched id in one namespace simultaneously.

## Availability + fallbacks

```swift
if #available(iOS 18, *) {
    content.navigationDestination(for: GalleryItem.self) { item in
        GalleryDetail(item: item).navigationTransition(.zoom(sourceID: item.id, in: namespace))
    }
} else {
    content.navigationDestination(for: GalleryItem.self) { item in GalleryDetail(item: item) }
    // pre-18: standard push transition -- system-owned, no gate needed.
}
```

## Accessibility contract

Reduce Motion governs DECORATIVE motion, never feedback or intent. In every component above: (1) direct-manipulation 1:1 tracking stays ungated -- never zero it; (2) haptics stay ungated -- a haptic is feedback, gate it only on the app's own haptic-preference toggle, never on `accessibilityReduceMotion`; (3) velocity-projection decisions (`predictedEndTranslation`) are preserved; (4) decorative overshoot/scale/shadow is dropped -- the settle spring becomes `nil` (instant), reusing the SAME code path with zero interpolation via `withAnimation(reduceMotion ? nil : AppMotion.settle)`. Every gesture-driven interaction ships a matching `accessibilityAction`/`.accessibilityAdjustableAction` so VoiceOver reaches the same outcome without the gesture.

## Anti-patterns

| Wrong | Why it fails | Right |
|---|---|---|
| `.animation(_:value: dragOffset)` on a live drag offset | View chases the finger with elastic lag | Apply the offset raw; animate only the release settle |
| `.impact(weight: .soft)` | `.soft` is a `Flexibility` case, not a `Weight` case -- does not compile | `.impact(flexibility: .soft)` or `.impact(weight: .light/.medium/.heavy)` |
| `withAnimation(.interactiveSpring)` inside `.onChanged` | Restarts the spring every frame -- visible stutter | Attach via `.animation(_:value:)`, or apply the offset raw |
| Haptic bound to `snapshot.isFavorited` (derived model state) | Fires on unrelated background refreshes, not just the user's tap | Bind to an explicit trigger counter or a Bool that flips only on the action |
| Dragged reorder row's slot move left animated | It visibly jumps as the array reorders mid-drag | `.transaction { $0.animation = nil }` on the lifted row |
| A haptic on every push/pop navigation | Navigation feel is already system-owned; the extra tick reads as noise | No haptic on regular nav -- reserve for genuine data mutations |
| `value.predictedEndTranslation` renamed "velocity" in a comment/variable | It's a projected POSITION delta (points), not points/sec -- swapping in `value.velocity` with the same ±50 threshold turns a distance gate into a 50pt/s hair-trigger | Keep the name accurate, or switch to `value.velocity` AND retune thresholds (flicks run 800-3000 pt/s) |

## Severity guide

CRITICAL: a haptic-only signal with no visible pairing (iPad/Mac/silent-mode users get nothing). HIGH: `.impact(weight:)` called with a `Flexibility` case -- compile-breaking. MEDIUM: decorative motion left ungated under Reduce Motion while direct manipulation or haptics are incorrectly gated instead. LOW: a haptic fired on system-owned navigation. NIT: a settle spring using hand-tuned `response`/`dampingFraction` where a named preset (`.snappy`/`.bouncy`/`.smooth`) would do.

## See also

- `references/animation/02-spring-physics.md` -- named spring presets, the house per-interaction table (owner)
- `references/animation/05-gesture-driven.md` -- velocity handoff, direct manipulation (owner)
- `references/interaction/01-fluid-smoothness-interruptible.md` -- interruptibility, velocity normalization (owner)
- `references/interaction/03-direct-manipulation-drag.md` -- deep drag/reorder cookbook + accessibility alternatives (owner)
- `references/haptics/02-swiftui-sensory-feedback.md` -- full `.sensoryFeedback` vocabulary (owner)
- `references/accessibility/05-motion-accessibility.md` -- Reduce Motion double-gate (owner)
