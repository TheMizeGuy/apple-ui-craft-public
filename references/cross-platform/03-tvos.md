# tvOS Craft

> Owner: `references/cross-platform/03-tvos.md` owns the tvOS focus engine, `.card`/focus-feedback styling, 10-foot layout/overscan, Siri Remote input, and the Top Shelf extension, per the ARCHITECTURE ownership map. Liquid Glass material rules are owned by `references/design/02-liquid-glass.md`; this file states only tvOS's focus-driven consequences. Dynamic Type is owned by `references/design/03-typography-dynamic-type.md`.
> Floors: `.card` (`CardButtonStyle`) = tvOS 14.0+. `.focusable(interactions:)` = tvOS 17.0+. `.glass`/`.glassProminent` button styles and custom `glassEffect` = tvOS 26.0+ (2nd-generation Apple TV 4K or later for the real-time lensing). `focusSection()` = **macOS 13.0+ / tvOS 15.0+ ONLY -- it does not exist on iOS or iPadOS**, per `references/_scaffolding/version-floor-registry.md#not-ios-the-1-mis-gate-class`. Overscan safe margins are **80 pt leading/trailing, 60 pt top/bottom** (not 90 pt).

There is no touch and no cursor on tvOS: the focus engine is the entire interaction model, and every navigable element is either focusable or unreachable. The most common craft failure is designing tap targets instead of focus paths -- shipping iOS-sized type and spacing that reads as a blur from the couch, or a focusable wrapper with no action that becomes a dead stop the remote lands on.

## The Apple way

- Design focus paths, not tap targets -- every screen needs a seeded initial focus and no focusable dead-ends.
- The focused element must be unmistakable from 10 feet; let `.card` and `.hoverEffect(.highlight)` supply the lift, never stack a manual `.scaleEffect` on top.
- The Menu/Back button is a contract: it must always pop or dismiss. Trapping it is an automatic App Review rejection and the single most-hated tvOS bug.
- Essential content stays inside the overscan-safe title area; full-bleed art can ignore it, overlaid text cannot.

## Focus engine

SwiftUI grants focusability automatically to `Button`, `NavigationLink`, `Toggle`, and list rows. Custom views opt in explicitly and should only do so when landing on them is meaningful:

```swift
struct CustomFocusableView: View {
    @FocusState private var isFocused: Bool
    var body: some View {
        Text("Custom Item")
            .padding(40)
            .background(isFocused ? Color.blue : Color.clear)
            .focusable()             // opt into the focus engine
            .focused($isFocused)
    }
}
```

`@FocusState` is Bool for "is this one view focused" or `Hashable?` for "which of several." Seed initial focus -- a screen that appears with nothing focused strands the remote:

```swift
@FocusState private var focusedItem: MediaItem.ID?
ScrollView(.horizontal) {
    HStack(spacing: 40) {
        ForEach(items) { PosterButton($0).focused($focusedItem, equals: $0.id) }
    }
}
.onAppear { focusedItem = items.first?.id }
// or, tvOS 15+: prefer .defaultFocus($focusedItem, items.first?.id) -- re-establishes
// correctly across view-identity changes instead of a one-shot onAppear assignment.
```

`@Environment(\.isFocused)` lets a reusable child view react to its nearest focusable ancestor's state without owning a binding -- the right tool for a card component library.

### `focusSection()` -- macOS/tvOS only, never iOS

`focusSection()` fixes "focus won't cross this gap": when two focusable groups are geometrically offset, a directional swipe can fall into the empty space between them and refuse to cross. Wrapping the target group jumps the gap and hands focus to its first focusable child.

```swift
HStack {
    VStack { Button("1"){}; Button("2"){}; Button("3"){} }
    Spacer()
    VStack { Spacer(); Button("A"){}; Button("B"){}; Button("C"){} }
        .focusSection()             // reachable despite the vertical offset
}
```

`focusSection()` is **macOS 13.0+ / tvOS 15.0+ ONLY** -- there is no iOS or iPadOS equivalent; do not document it as an iPad focus-grouping API (there, size-class-driven layout and `.focusable()` alone govern focus order).

## `.card` and focus feedback

`.buttonStyle(.card)` (tvOS 14.0+) is the workhorse for posters and image-forward tiles: no intrinsic padding, and as of tvOS 26 it explicitly applies the Liquid Glass lift-and-specular effect on focus.

```swift
Button { navigate(to: item) } label: {
    VStack(alignment: .leading) {
        AsyncImage(url: item.artworkURL) { $0.resizable().aspectRatio(16/9, contentMode: .fill) }
            placeholder: { Color.gray }
            .frame(height: 220).clipped()
        Text(item.title).font(.callout).lineLimit(2)
    }
}
.buttonStyle(.card)   // system supplies focus lift + glass; no manual scaleEffect
```

Never stack `.scaleEffect(isFocused ? 1.1 : 1.0)` on a `.card` button -- it double-animates and fights the system lift. Reserve manual `@Environment(\.isFocused)` scaling for genuinely custom, non-card focusable views. For those, attach `.hoverEffect(.highlight)` so custom content still participates in the same focus feedback the remote's trackpad drives -- the modifier name is a legacy of iPad pointer hover, but on tvOS it drives focus lift.

Layered Image (`.lsr`) asset-catalog parallax -- layers shifting independently as a thumb glides the remote's touch surface -- is a property of the asset, not a view modifier; there is no `.parallax()` API. App icons are required to be layered; content posters benefit but are optional. Give rows generous inter-item spacing (40 pt baseline) so a lifted, shadow-casting card doesn't clip against neighbors.

## Siri Remote input

The remote is deliberately minimal: a clickpad (directional + swipe), Menu/Back, Play/Pause, Siri, and volume -- no cursor, no keyboard.

| Modifier | Trigger | Floor |
|---|---|---|
| (default `Button` action) | Click / select | all |
| `.onMoveCommand { dir in }` | Edge taps / directional swipes | tvOS 13.0+ |
| `.onExitCommand { }` | Menu / Back | tvOS 13.0+ |
| `.onPlayPauseCommand { }` | Play/Pause | tvOS 13.0+ |

`NavigationStack` pops on Menu automatically -- only implement `.onExitCommand` for a manually-presented overlay the stack doesn't own, and always give it a real dismissal. There is no `.onSelectCommand`; select is the focused control's normal `Button`/`.onTapGesture` action. Use the system player (`AVPlayerViewController` via `UIViewControllerRepresentable`, or SwiftUI's `VideoPlayer`) for transport UI -- it gives scrubbing, the 2nd-gen remote's jog-ring, chapter markers, and accessibility for free; hand-rolled transport controls will not match the system feel. Raw touch-surface coordinates require the GameController framework (`GCMicroGamepad`) and bypass the focus engine -- reach for it only in games, never for ordinary navigation.

## 10-foot layout and overscan

The logical canvas is 1920x1080 pt. SwiftUI's default safe area already accounts for overscan, so most layouts are automatically safe; the explicit inset matters for content you deliberately push toward an edge, or any view under `.ignoresSafeArea()`.

```swift
ZStack {
    HeroArtwork().ignoresSafeArea()                          // art fills the panel; edge crop is fine
    VStack { Text(title); PlayButton() }
        .padding(.horizontal, 80).padding(.bottom, 60)        // text stays title-safe
}
```

Overscan safe margins: **80 pt leading/trailing, 60 pt top/bottom**. Type floor: body/button text below **29 pt** is a HIGH review finding at 10-foot viewing distance -- prefer semantic styles (`.body`, `.headline`) over `.system(size:)` so Dynamic Type and Bold Text still apply. Text over artwork always needs a scrim (`.ultraThinMaterial` or a gradient); tvOS design is dark-first because a bright full-screen UI is fatiguing in a dim room.

## Navigation containers

`TabView`'s default appearance is a **top** bar, collapsed while browsing and expanded on an upward swipe from content -- there is no bottom tab bar on tvOS. `.tabViewStyle(.sidebarAdaptable)` (tvOS 18+) renders a persistent sidebar; per Apple, macOS and tvOS "always show a sidebar" under this style, unlike iPhone's bottom bar or iPad's adaptable top bar. Choose by section count: ≤6 flat sections keep the top bar, many sections or a grouped hierarchy earn the sidebar. `NavigationStack`/`NavigationSplitView` both work identically to iOS aside from the Menu-pops-automatically behavior above.

## Top Shelf extension

A separate `TVServices` extension target renders the large content banner above the icon row when your app sits in the Home Screen's top row -- it is Apple-curated real estate, not requestable UI.

```swift
class ContentProvider: TVTopShelfContentProvider {
    override func loadTopShelfContent() async throws -> (any TVTopShelfContent)? {
        let items = await store.continueWatching().map { media -> TVTopShelfSectionedItem in
            let item = TVTopShelfSectionedItem(identifier: media.id)
            item.title = media.title
            item.imageShape = .poster                          // .poster / .square / .hdtv -- pick one per row
            item.setImageURL(media.artworkURL, for: .screenScale1x)
            item.setImageURL(media.artwork2xURL, for: .screenScale2x)
            item.displayAction = TVTopShelfAction(url: media.deepLinkURL)   // click opens detail
            item.playAction = TVTopShelfAction(url: media.playURL)          // remote Play starts playback
            return item
        }
        return TVTopShelfSectionedContent(sections: [TVTopShelfItemCollection(items: items)])
    }
}
```

Actions are URL-based (`TVTopShelfAction(url:)`), not `AppIntent`s -- a deliberate difference from iOS widgets/controls. Handle the URL cold-launch and idempotently in `onOpenURL`. The system refreshes periodically, not on a live push channel; post `TVTopShelfContentDidChange` when content genuinely changes rather than assuming an instant update, and keep `loadTopShelfContent()` fast -- a slow or throwing implementation yields a blank shelf.

## Availability + fallbacks

```swift
extension View {
    @ViewBuilder
    func adaptiveGlassCard() -> some View {
        if #available(tvOS 26, *) { self.buttonStyle(.glass) }
        else { self.background(.ultraThinMaterial, in: .rect(cornerRadius: 12)) }
    }
}
```

`.card` itself needs no gate back to tvOS 14; only the standalone `.glass`/`.glassProminent` styles and custom `glassEffect()` calls need `#available(tvOS 26, *)` with a material fallback for older Apple TV hardware, which also lacks the GPU headroom for real-time lensing.

## Accessibility contract

VoiceOver and Switch Control drive the same focus engine the remote does -- a view reachable by directional swipe is reachable by assistive navigation, and vice versa; a focusable dead-end blocks both equally. Focus-lift and Liquid Glass specular motion are automatic system behavior for standard `.card`/`.hoverEffect` -- not developer-owned per `references/accessibility/05-motion-accessibility.md`'s double-gate. Any CUSTOM focus animation you author (a hand-rolled scale/glow beyond `.card`) is developer-owned and must respect `@Environment(\.accessibilityReduceMotion)`.

## Anti-patterns

| Wrong | Why it fails | Right |
|---|---|---|
| Trapping the Menu button with no exit | Automatic App Review rejection | Always pop/dismiss; `NavigationStack` handles this for free |
| `.scaleEffect` stacked on a `.card` button | Double-animates, fights the system lift | Remove it; `.card` supplies the lift |
| `focusSection()` used on iPad/iPhone | Doesn't exist there -- macOS/tvOS only | Gate layout on `horizontalSizeClass` instead |
| Body text below 29 pt | Illegible at 10-foot viewing distance | Semantic styles at the tvOS type scale |
| Text pushed to the raw screen edge | Physically clipped by overscan on older TVs | Keep inside 80 pt / 60 pt title-safe inset |
| Hand-rolled video transport controls | Won't match system scrubbing feel or accessibility | `AVPlayerViewController` / `VideoPlayer` |
| Focusable decorative wrapper with no action | Dead stop for the remote | Only make a view focusable if landing on it does something |

## Severity guide

CRITICAL: a trapped Menu button with no dismissal path. HIGH: body/button text under 29 pt, or a focusable dead-end that strands the remote. MEDIUM: `.scaleEffect` stacked on `.card`, or content genuinely clipped by overscan. LOW: `focusSection()` missing where a directional swipe should cross an offset gap. NIT: mixed `imageShape` values within one Top Shelf collection.

## See also

- `references/design/02-liquid-glass.md` -- the Liquid Glass material `.card` builds on in tvOS 26 (owner)
- `references/design/03-typography-dynamic-type.md` -- the shared Dynamic Type system this file's 29 pt floor extends
- `references/design/07-navigation-patterns.md` -- cross-platform `NavigationStack`/`NavigationSplitView` container guidance
- `references/accessibility/01-voiceover-fundamentals.md` -- VoiceOver navigates the same focus engine the remote drives
- `references/accessibility/05-motion-accessibility.md` -- the Reduce Motion double-gate (owner)
- `references/platform/02-app-intents-system.md` -- iOS deep-link surfaces use App Intents; Top Shelf uses URL actions instead
