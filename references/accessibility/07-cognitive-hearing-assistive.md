# Cognitive, Hearing, and Assistive-Technology Accessibility

> Owner: `references/accessibility/07-cognitive-hearing-assistive.md` owns cognitive accessibility (AssistiveAccess, plain language, timing), Braille, Voice Control custom vocabulary, Full Keyboard Access, and hearing/audio accessibility (captions, Sound Recognition, mono audio). `references/accessibility/04-motor-interaction.md#switch-control` and `#voice-control` own the motor/physical-input baseline (testing protocol, `accessibilityInputLabels` basics) -- this file adds depth those sections don't cover.
> Floors: cite `references/_scaffolding/version-floor-registry.md` for anything version-gated. Headline floors stated inline below. iOS 27.0 additions in this file: `MACaptionAppearanceDomain.videoConferencing` (not watchOS) and AVKit's `AVPlaybackUserInterfaceMediaSelectionControllable` (iOS / iPadOS / Mac Catalyst only). `AVMediaCharacteristic.signLanguageInterpretationForAccessibility` is iOS 27.1 and still marked Beta by Apple -- the one symbol here that stays out of shipping code.

Cognitive and hearing accessibility have no single API to flip on -- they are a design discipline plus a handful of SwiftUI/UIKit/C hooks that only work when wired correctly. This file makes an agent able to ship the `AssistiveAccess` scene without mis-gating it, make custom UI reachable by Voice Control/Switch Control/Full Keyboard Access with one interaction contract, keep Braille users from panning cell-by-cell through a wall of prose, and honor a user's caption style and hearing preferences in a custom video player. The single most common defect: conflating the `AssistiveAccess` **scene** (iOS 26) with the `accessibilityAssistiveAccessEnabled` **environment value** (iOS 18) -- they shipped one WWDC apart, with version numbers that jumped because iOS moved to year-based naming.

## The Apple way

Reduce what a user must remember, keep language plain, avoid time pressure, make errors recoverable, keep navigation shallow and predictable (HIG, Accessibility > Cognitive). Concretely: default selections over blank forms, `Menu` over a wall of buttons, one primary action per screen, and every timed interaction gets an extend-or-disable path.

## Accessibility contract

This file has no animation surface of its own -- Reduce Motion obligations for autoplay/looping content are owned by `references/accessibility/05-motion-accessibility.md`; this file only points to the specific independent Motion setting (`isVideoAutoplayEnabled`) that governs hero-video autoplay. Braille output rides entirely on VoiceOver semantics: every `accessibilityLabel`/`accessibilityValue`/trait rule in `references/accessibility/01-voiceover-fundamentals.md` is also a braille rule, with no separate API to author. Custom caption overlays must honor Dynamic Type on top of the user's `MediaAccessibility` size preference -- multiply your base point size by `relativeSize` AND respect the system's larger-text setting, never one alone.

## Cognitive accessibility

### Guided Access, Assistive Access, and the `AssistiveAccess` scene -- three eras, do not conflate

| Feature | What it is | Developer touch point |
|---|---|---|
| Guided Access | User/caregiver locks the device into a single app, can disable screen regions/buttons/timer (Settings > Accessibility > Guided Access) | None -- but never make the *only* exit an edge-swipe a caregiver could region-disable |
| Assistive Access | System-wide simplified mode: large high-contrast targets, reduced choices, shallow navigation (Settings > Accessibility > Assistive Access) | `accessibilityAssistiveAccessEnabled` environment value, **iOS 18.0+** |
| `AssistiveAccess` scene | A purpose-built root view the system swaps in automatically when Assistive Access is on | `struct AssistiveAccess<Content>: Scene`, **iOS 26.0+** |

The environment value and the scene are one release apart -- do not collapse both into "iOS 18" or "iOS 26."

```swift
// iOS 18.0+. Detect-and-adapt: fewer buttons, larger targets, flatter navigation.
@Environment(\.accessibilityAssistiveAccessEnabled) private var isAssistiveAccess

// iOS 26.0+. Purpose-built scene: the system swaps this in automatically -- no runtime
// `if isAssistiveAccess` branching needed inside your normal WindowGroup.
// Requires Info.plist `UISupportsAssistiveAccess = true`.
@main
struct MyApp: App {
    var body: some Scene {
        WindowGroup { ContentView() }                    // normal experience
        AssistiveAccess { AssistiveAccessRootView() }     // stripped-down, large-target experience
    }
}
```

`AssistiveAccess` is a `Scene`, and that is the prerequisite most often missed: a UIKit app still on the app-delegate life cycle cannot adopt it at all. iOS 27 forces the issue -- apps built with the iOS 27, iPadOS 27, Mac Catalyst 27, tvOS 27 or visionOS 27 SDK must adopt the scene-based life cycle or they fail to launch. Migrate the life cycle first, then add the scene.

Apple's design rules for `AssistiveAccessRootView` (WWDC25 session 238): distill the app to one or two core tasks, touch zones well above the 44pt floor, minimize navigation depth (flat single-level lists, no deep `NavigationStack` pushes), prefer system-standard components (`Button`, `Toggle`, `List` already carry correct large-content and high-contrast behavior), and never require a gesture more complex than a single tap. Preview with the `.assistiveAccess` trait passed to `#Preview`.

### Timing Adjustable (WCAG 2.2.1) -- the concrete testable requirement

Any auto-advancing, auto-logout, or countdown UI must let the user turn off, adjust, or extend the limit before it expires (warn ~20s ahead, allow extending ~10x), unless the limit is essential (a real auction close). Never silently log the user out or lose their form input on a timer -- preserve entered data across the timeout (WCAG 2.2.6 Timeouts is AAA -- an enhancement, not a required criterion; the required one is 2.2.1).

```swift
@available(iOS 18.0, *)
struct SessionTimeoutModifier: ViewModifier {
    let timeout: Duration                      // e.g. .seconds(120)
    let onExpire: () -> Void
    @State private var showWarning = false
    @State private var task: Task<Void, Never>?

    func body(content: Content) -> some View {
        content
            .task { restart() }
            .alert("Are you still there?", isPresented: $showWarning) {
                Button("Keep me signed in") { restart() }
                Button("Sign out", role: .destructive) { onExpire() }
            } message: {
                Text("Your session will end in 30 seconds to keep your account safe.")
            }
    }

    private func restart() {
        task?.cancel()
        task = Task {
            try? await Task.sleep(for: timeout - .seconds(30))   // warn 30s before the real limit
            guard !Task.isCancelled else { return }
            showWarning = true
            try? await Task.sleep(for: .seconds(30))
            guard !Task.isCancelled else { return }
            onExpire()
        }
    }
}
```

### Plain language, reduced choice, and error recovery

- Reduced choice / progressive disclosure lowers cognitive load: prefer a guided sequence over one dense screen with every option visible at once.
- Keep labels concrete and literal; avoid idiom and jargon in primary actions ("Send," not "Fire off").
- `.speechSpellsOutCharacters` / `.speechAlwaysIncludesPunctuation` (iOS 15+) fix how codes and acronyms are read aloud. On iOS 27 one `AXSpeechAttributeSSML` fragment replaces the whole stack of single-purpose speech attributes, without altering the visible or Braille text (`references/accessibility/01-voiceover-fundamentals.md#speech-control-with-ssml-ios-27`).
- Confirm destructive or costly actions; make them reversible where possible; keep validation messages specific and adjacent to the field (WCAG 3.3.4 Error Prevention, AA; 3.3.6 Error Prevention (All) is AAA and an enhancement). A two-step confirm beats a hold-timer -- also a motor win.
- `accessibilityShowsLargeContentViewer()` (iOS 15+) lets a user press-and-hold a small tab/toolbar item to see a large HUD label -- helps users who struggle to read small controls:

```swift
Image(systemName: "bell.fill").accessibilityShowsLargeContentViewer()
TabItemView().accessibilityShowsLargeContentViewer { Label("Notifications", systemImage: "bell.fill") }
```

## Braille

There is **no braille-specific SwiftUI/UIKit API**. When a user pairs a refreshable braille display (or uses Apple's own Braille access), VoiceOver drives it: whatever VoiceOver would *speak* -- `accessibilityLabel`, `accessibilityValue`, traits, `accessibilityHint` -- is what renders as braille cells. Every VoiceOver best practice is automatically a braille best practice; there is nothing extra to turn on.

Braille displays are short, typically **14 to 40 cells**. Speech tolerates verbosity; braille does not (the user physically pans across cells):

```swift
struct PhotoCell: View {
    let photo: Photo
    var body: some View {
        Image(photo.name)
            .accessibilityLabel(photo.title)                          // concise, front-loaded: primary braille line
            .accessibilityCustomContent("Orientation", Text(photo.orientation))      // .default: off the main line, rotor-reachable
            .accessibilityCustomContent("People", Text("\(photo.faceCount)"), importance: .high)   // .high: rendered inline
    }
}
```

`accessibilityLabel("Delete, Invoice 4021")` beats `"Button to permanently delete the invoice numbered 4021 from your account"` -- the verbose label reads fine aloud but wastes an entire braille line. Move supplementary facts to `accessibilityCustomContent` (iOS 15+) at `.default` importance so they render off the primary line and are pulled in on demand via the rotor's "More Content" entry; use `.high` only when the value belongs inline with the label.

Headings (`.accessibilityAddTraits(.isHeader)` or `.accessibilityHeading(.h1)`...`.h6)`, iOS 15+), landmarks, and custom rotors (`references/accessibility/01-voiceover-fundamentals.md#custom-rotor-entries`) let a braille user jump structurally instead of panning cell-by-cell through the whole screen. Hand-styled `Text` that only *looks* like a heading is invisible to the rotor and therefore to structured braille navigation. On a long-form reading surface, structure is not enough on its own -- separate paragraph elements also need linking so continuous reading does not stop at every one (`references/accessibility/01-voiceover-fundamentals.md#long-form-reading-surfaces`).

Braille Screen Input (BSI) lets a VoiceOver user type braille by tapping the touchscreen with six fingers -- no hardware. It is a rotor-selected input method that feeds the standard text-input system; the app requirement is passive: use a real `TextField`/`TextEditor`/`SecureField` and let the system deliver text. You break BSI (and hardware-braille typing) if you build a custom keystroke-capture control instead of a real text field, reformat the field's text on every keystroke, or steal focus / dismiss the keyboard programmatically mid-entry.

## Voice Control, Switch Control, and Full Keyboard Access

### One contract, three technologies

Switch Control, Voice Control, and Full Keyboard Access all consume the **same** accessibility interaction properties. Wire an element correctly once and all three work:

| Property | Serves |
|---|---|
| `accessibilityLabel` + `.isButton`/control trait | All three (focus target + spoken name + braille) |
| `accessibilityInputLabels([...])` | Voice Control **and** Full Keyboard Access |
| `accessibilityAction {}` / `accessibilityAction(named:)` | Switch Control + VoiceOver + FKA activation |
| `accessibilityRespondsToUserInteraction(_:)` | Switch Control, Voice Control, Full Keyboard Access |
| `.focusable(interactions: .activate)` | FKA (and keyboard-emulating switches) |

The fix for "custom chip row built from `Text` + `.onTapGesture` is unreachable" is one block that satisfies every input method, not per-technology patches.

### Voice Control custom vocabulary

"Custom vocabulary" is a **user-side** feature (Settings > Accessibility > Voice Control > Vocabulary) -- the user teaches Voice Control words it mishears. Apps cannot inject vocabulary. The app's job is to make sure phrases a user would naturally speak already resolve: Voice Control matches a spoken name against **visible text first, then `accessibilityLabel`**. For icon-only controls, register every plausible phrasing in descending importance:

```swift
Button { compose() } label: { Image(systemName: "square.and.pencil") }
    .accessibilityLabel("Compose")
    .accessibilityInputLabels(["Compose", "New message", "Write", "New"])
```

"Show Names" overlays each control's resolved name; "Show Numbers" degrades an unlabeled control to "Tap 7" when names are missing or ambiguous; "Show Grid" is the pixel-coordinate last resort. A fully labeled UI keeps users in name mode, the fastest path.

iOS 27's Flexible Item Names loosens the matching -- a user can describe an element in natural language instead of reciting its label -- which raises the cost of a label that disagrees with the visible text and leaves an unnamed icon exactly as broken as before (`references/accessibility/04-motor-interaction.md#flexible-item-names-ios-27`).

### Switch Control -- scanning and timing (WCAG 2.2.1 tie-in)

Switch Control scans the accessibility tree; anything absent from the tree is unreachable (baseline requirements: `references/accessibility/04-motor-interaction.md#switch-control`). Two scan modes: **item scanning** highlights elements/groups in sequence (group related controls with `.accessibilityElement(children: .contain)` to cut scan steps -- a flat 30-item list is 30 steps, grouped it's a handful); **point scanning** sweeps a crosshair for anything the tree can't target, slow and imprecise. Switch Control users may need many seconds per action -- any auto-advance, auto-dismiss, or hold-to-confirm timing (see WCAG 2.2.1 above) is a Switch Control barrier too. Prefer two-tap confirm over hold-timers.

### Full Keyboard Access -- distinct from keyboard shortcuts

Full Keyboard Access (Settings > Accessibility > Keyboards > **Full Keyboard Access**, iOS 15.2+) is a system mode that drives the *entire* UI from a hardware keyboard with a visible focus ring: Tab/arrow keys move focus, Space/Return activates, holding Tab exposes a command mode. It shares its focus/interaction plumbing with Switch Control and Voice Control, and it is a **different feature from `.keyboardShortcut()`** (which wires discrete chords to specific commands).

System controls (`Button`, `Toggle`, `TextField`, `NavigationLink`) participate in FKA for free. A custom tappable view is invisible to FKA unless you opt it in:

```swift
// FocusInteractions.activate = "focusable only when the user enabled keyboard navigation
// system-wide" -- the exact FKA convention Apple documents for button-like custom views.
MyTapControl()
    .accessibilityAddTraits(.isButton)
    .accessibilityLabel("Toggle favorite")
    .focusable(interactions: .activate)         // iOS 17.0+; participates in FKA focus + activation
    .accessibilityAction { toggleFavorite() }
```

Use `accessibilityRespondsToUserInteraction(_:)` (iOS 14+) to explicitly declare interactivity when SwiftUI can't infer it from traits/gestures, or to remove a non-actionable decorative element from the FKA/Switch/Voice scan list:

```swift
DecorativeBadge().accessibilityRespondsToUserInteraction(false)
```

`onKeyPress(_:action:)` (iOS 17+) handles hardware-key input for a focused custom view, paired with `@FocusState` + `.focused()`.

`focusSection()` is documented **macOS 13.0+ / tvOS 15.0+ only** -- it has no listed iOS availability. Do not use it for iOS FKA grouping; drive iOS focus traversal with `@FocusState` + `.focusable(interactions:)` + logical layout order instead.

## Hearing accessibility

### System flags (read-only, `import UIKit`)

| Flag | Floor | Meaning |
|---|---|---|
| `UIAccessibility.isClosedCaptioningEnabled` | iOS 5.0+ | User turned on "Closed Captions + SDH" globally |
| `UIAccessibility.isMonoAudioEnabled` | iOS 5.0+ | Both channels routed to both ears (single-sided hearing loss) -- OS mixes to mono for free; only matters if you deliberately pan info across L/R (provide a non-spatial equivalent) |
| `UIAccessibility.isVideoAutoplayEnabled` | iOS 13.0+ | Gate silent hero-video autoplay -- its own independent Motion setting, not combined with Reduce Motion; see `references/accessibility/05-motion-accessibility.md#autoplay-and-flashing-content-gates----the-other-motion-settings` |

There is **no** public API to detect whether **Live Captions** (system-wide real-time transcription, iOS 16+), **Sound Recognition**, or a connected **Made-for-iPhone (MFi) hearing device** is active -- these are private/system-owned. Do not gate behavior on them; design so the app is correct regardless (captions present, never sound-only).

### Captions: reading the user's style with MediaAccessibility

If you use `VideoPlayer`/`AVPlayerViewController`, the system applies the user's caption style for free -- don't reimplement. If you draw your own caption overlay, read the style from `import MediaAccessibility` (a C framework; iOS 7.0+, tvOS 9.0+, macOS 10.9+, Mac Catalyst 13.0+, visionOS 1.0+ -- **not available on watchOS**).

Almost every getter takes an `MACaptionAppearanceDomain` (`.user` -- the preference you want -- `.default`, or `.videoConferencing`, added in iOS 27.0) and an `inout MACaptionAppearanceBehavior` out-parameter telling you *why* you got that value: `.useValue` (user explicitly set this, honor it strictly) or `.useContentIfAvailable` (prefer a value baked into the media/content if it has one, else use the returned value as fallback).

`Copy`-prefixed functions follow Core Foundation ownership: they return `Unmanaged<CGColor>` / `Unmanaged<CTFontDescriptor>` in Swift -- call `.takeRetainedValue()`. There is **no** `MACaptionAppearanceGetForegroundColor`; the Get-family is scalar-only (opacity, display type, relative size). Color and font accessors are always `Copy`-prefixed:

```swift
import MediaAccessibility
import CoreText

@available(iOS 7.0, tvOS 9.0, *)
struct UserCaptionStyle {
    var foreground: CGColor
    var foregroundOpacity: CGFloat
    var background: CGColor
    var backgroundOpacity: CGFloat
    var fontDescriptor: CTFontDescriptor
    var relativeSize: CGFloat                 // multiplier; ~1.0 = default
    var edgeStyle: MACaptionAppearanceTextEdgeStyle
    var displayType: MACaptionAppearanceDisplayType

    static func current() -> UserCaptionStyle {
        let d: MACaptionAppearanceDomain = .user
        var b = MACaptionAppearanceBehavior.useValue        // getters overwrite this

        let fg   = MACaptionAppearanceCopyForegroundColor(d, &b).takeRetainedValue()
        let fgO  = MACaptionAppearanceGetForegroundOpacity(d, &b)
        let bg   = MACaptionAppearanceCopyBackgroundColor(d, &b).takeRetainedValue()
        let bgO  = MACaptionAppearanceGetBackgroundOpacity(d, &b)
        let font = MACaptionAppearanceCopyFontDescriptorForStyle(d, &b, .default).takeRetainedValue()
        let size = MACaptionAppearanceGetRelativeCharacterSize(d, &b)
        let edge = MACaptionAppearanceGetTextEdgeStyle(d, &b)
        let disp = MACaptionAppearanceGetDisplayType(d)      // display type takes NO behavior out-param

        return .init(foreground: fg, foregroundOpacity: fgO, background: bg,
                      backgroundOpacity: bgO, fontDescriptor: font, relativeSize: size,
                      edgeStyle: edge, displayType: disp)
    }
}
```

`MACaptionAppearanceDisplayType`: `.forcedOnly` (only forced-narrative subtitles), `.automatic` (show per media/route default), `.alwaysOn` (user turned Closed Captions + SDH ON globally -- force-show captions). `MACaptionAppearanceDidDisplayCaptions(_:)` tells the system you actually rendered captions when your overlay presents them.

Live updates: observe `kMACaptionAppearanceSettingsChangedNotification`, a `CFString` posted to the **local** CFNotificationCenter when the user edits any caption style. `CFNotificationCenter` is **not** toll-free bridged to `NotificationCenter` -- the canonical observer is `CFNotificationCenterGetLocalCenter()`, not `NotificationCenter.default`:

```swift
let name = CFNotificationCenterName(kMACaptionAppearanceSettingsChangedNotification)
CFNotificationCenterAddObserver(
    CFNotificationCenterGetLocalCenter(), observerPtr, { _, _, _, _, _ in
        // hop to main + reload UserCaptionStyle.current()
    }, name.rawValue, nil, .deliverImmediately)
```

On **iOS 26.4+**, `AccessibilitySettings.Feature.captionStyles` (Accessibility framework) with `AccessibilitySettings.openSettings(for:)` deep-links the user straight to Subtitles & Captioning style -- prefer it over a raw `UIApplication.openSettingsURLString`.

#### `.videoConferencing`, the third domain (iOS 27)

`MACaptionAppearanceDomain.videoConferencing` (iOS 27.0; not watchOS, where MediaAccessibility is unavailable) joins `.default` and `.user`. An app that draws its own caption overlay in a call or conferencing context reads from that domain instead of reusing the media-playback preference, because a user can now want a different caption style for live conversation than for watching video. Apple's symbol page carries no abstract beyond the case declaration, so that is the whole verified surface -- pass it to the same `MACaptionAppearanceCopy*`/`Get*` functions and do not invent behavior for it.

```swift
// A conferencing overlay reads its own domain; a video player keeps reading .user.
let domain: MACaptionAppearanceDomain
if #available(iOS 27, *) { domain = isInCall ? .videoConferencing : .user } else { domain = .user }
```

### Automatic caption track selection

Let `AVPlayer` pick the right legible track itself instead of hand-rolling selection:

```swift
import AVFoundation

player.appliesMediaSelectionCriteriaAutomatically = true      // iOS 7.0+
let criteria = AVPlayerMediaSelectionCriteria(
    preferredLanguages: Locale.preferredLanguages,
    preferredMediaCharacteristics: UIAccessibility.isClosedCaptioningEnabled
        ? [.transcribesSpokenDialogForAccessibility, .describesMusicAndSoundForAccessibility] : nil)
player.setMediaSelectionCriteria(criteria, forMediaCharacteristic: .legible)   // iOS 7.0+
```

When `isClosedCaptioningEnabled` is on, biasing toward the accessibility characteristics selects SDH (captions that describe non-dialog sound) rather than plain translation subtitles.

### Custom playback engines get the system caption menu (iOS 27)

A player built on a custom or non-`AVPlayer` engine used to have no way into the system playback UI, so it hand-rolled a subtitle picker -- and inherited responsibility for its VoiceOver semantics, its localized language names, and honoring the user's caption styling. `AVPlaybackUserInterfaceMediaSelectionControllable` (AVKit, iOS 27.0 / iPadOS 27.0 / Mac Catalyst 27.0 **only** -- not macOS, tvOS, visionOS or watchOS) closes that gap: the engine publishes its audio and legible options and the system renders the menu.

```swift
import AVKit

@available(iOS 27, *)
@MainActor @Observable
final class StreamPlayer: AVPlaybackUserInterfaceMediaSelectionControllable {
    let engine: CustomPlaybackEngine          // your non-AVPlayer engine
    init(engine: CustomPlaybackEngine) { self.engine = engine }

    // Six required members: audio, audio description, and legible (subtitle).
    var audioOptions: [AVPlaybackUserInterfaceMediaSelectionOption] = []
    var currentAudioOption: AVPlaybackUserInterfaceMediaSelectionOption? {
        didSet { engine.selectAudioTrack(currentAudioOption?.identifier) }
    }
    var audioDescriptionOptions: [AVPlaybackUserInterfaceMediaSelectionOption] = []
    var currentAudioDescriptionOption: AVPlaybackUserInterfaceMediaSelectionOption? {
        didSet { engine.selectAudioDescriptionTrack(currentAudioDescriptionOption?.identifier) }
    }
    var legibleOptions: [AVPlaybackUserInterfaceMediaSelectionOption] = [
        .init(displayName: "English (CC)", identifier: "en-cc",
              language: Locale.Language(identifier: "en"),
              mediaCharacteristics: [.transcribesSpokenDialogForAccessibility,
                                     .describesMusicAndSoundForAccessibility])
    ]
    var currentLegibleOption: AVPlaybackUserInterfaceMediaSelectionOption? {
        didSet { engine.selectSubtitleTrack(currentLegibleOption?.identifier) }
    }
}
```

`AVPlaybackUserInterfaceContentMetadata` gained a `subtitle` property and a matching initializer in the same release. On iOS 27 a hand-rolled subtitle picker inside a custom player is a finding with a named replacement; below iOS 27 it remains the only option, and the app owns every accessibility obligation it carries.

A sign-language characteristic is coming but is not here yet: `AVMediaCharacteristic.signLanguageInterpretationForAccessibility` is **iOS 27.1, still marked Beta in Apple's documentation** and absent from the shipping 27.0 SDK. Do not put it in a primary example or ship it ungated. Until it lands, a sign-language track can only be surfaced through app-specific UI.

Apps that author or transcode captions rather than consume them have an iOS 27.0 deprecation to absorb: `AVAssetReaderOutputCaptionAdaptor` (use `AVAssetReader.outputCaptionProvider(for:validationDelegate:)`), `AVAssetWriterInputCaptionAdaptor` (use `AVAssetWriter.inputCaptionReceiver(for:)`), and `AVRenderedCaptionImage.pixelBuffer` (use `readOnlyPixelBuffer`). All three shipped in iOS 18 and were deprecated one release later.

### Sound Recognition and building your own sound-to-visual feature

Two distinct things: system **Sound Recognition** (Settings > Accessibility > Sound Recognition -- the OS listens for doorbells/alarms/crying and alerts the Deaf/HoH user; no developer API to read or hook it) and the **SoundAnalysis** framework, which is what you use to build your *own* in-app sound-to-visual feature:

```swift
import SoundAnalysis
import AVFAudio

@available(iOS 13.0, *)
final class DoorbellWatcher: NSObject, SNResultsObserving {
    private let engine = AVAudioEngine()
    private var analyzer: SNAudioStreamAnalyzer?
    let onDetect: @MainActor (String) -> Void

    init(onDetect: @escaping @MainActor (String) -> Void) { self.onDetect = onDetect }

    func start() throws {
        let format = engine.inputNode.outputFormat(forBus: 0)
        let analyzer = SNAudioStreamAnalyzer(format: format)
        let request = try SNClassifySoundRequest(classifierIdentifier: .version1)
        try analyzer.add(request, withObserver: self)
        self.analyzer = analyzer
        engine.inputNode.installTap(onBus: 0, bufferSize: 8192, format: format) { [weak self] buf, when in
            self?.analyzer?.analyze(buf, atAudioFramePosition: when.sampleTime)
        }
        try engine.start()
    }

    func request(_ request: SNRequest, didProduce result: SNResult) {
        guard let r = result as? SNClassificationResult,
              let top = r.classifications.first, top.confidence > 0.7,
              ["doorbell", "knock"].contains(top.identifier) else { return }
        Task { @MainActor in onDetect(top.identifier) }
    }
}
```

Needs `NSMicrophoneUsageDescription`; classification is on-device. Threshold on `.confidence` (0.7+ typical) to cut false positives. Available iOS 13.0+/tvOS 13.0+/macOS 10.15+/watchOS 6.0+/visionOS 1.0+.

### What NOT to build

The 27 cycle adds system features that describe or transcribe content the app did not: generated subtitles auto-transcribe spoken audio in video on-device (iPhone, iPad, Mac, Apple TV, Apple Vision Pro), and Accessibility Reader on macOS 27 handles complex layouts, multi-column text, images and tables with summaries and translation. None is a developer API, and none discharges an obligation. Generated subtitles do not replace a real caption track -- they carry no speaker attribution, no non-dialog sound description, no authored timing -- and they are not something the app provides, so they are not a basis for claiming Captions in an Accessibility Nutrition Label: that claim needs captions the app ships for its video, or text transcripts for audio-only content (which Apple says need not be time-synchronized).

Don't try to detect or gate on Live Captions, system Sound Recognition, or MFi hearing-device connection -- no public API, and the OS already handles routing/alerting. Don't pan critical information across stereo channels (lost under Mono Audio). Don't bake caption text into video pixels -- unreadable to braille displays, doesn't scale, blurs. Do: ship real captions, honor `MACaptionAppearance` in custom players, gate autoplay on `isVideoAutoplayEnabled`, and give every meaningful sound a visual twin:

```swift
func signalSuccess() {
    withAnimation { state = .success }                                    // 1. VISUAL: mandatory, sufficient alone
    UINotificationFeedbackGenerator().notificationOccurred(.success)       // 2. HAPTIC: iPhone-only, no-op elsewhere
    if soundEffectsEnabled { player.play("success") }                     // 3. SOUND: optional garnish, never required
}
```

## Availability + fallbacks

```swift
if #available(iOS 26.4, *) {
    AccessibilitySettings.openSettings(for: .captionStyles)
} else {
    if let url = URL(string: UIApplication.openSettingsURLString) {
        UIApplication.shared.open(url)
    }
}
```

`accessibilityAssistiveAccessEnabled` (iOS 18), `accessibilityCustomContent`/`accessibilityHeading` (iOS 15), `focusable(interactions:)`/`onKeyPress` (iOS 17), `accessibilityRespondsToUserInteraction`/`accessibilityInputLabels` (iOS 14), and every `MediaAccessibility`/`UIAccessibility` hearing flag except `isVideoAutoplayEnabled` (iOS 13) sit below the 18/26 deployment floor -- no gating needed on those. What needs `#available`: the `AssistiveAccess` scene (iOS 26.0), the `captionStyles` deep link (iOS 26.4), and the iOS 27.0 additions -- `MACaptionAppearanceDomain.videoConferencing` and `AVPlaybackUserInterfaceMediaSelectionControllable` (the latter iOS / iPadOS / Mac Catalyst only). `AVMediaCharacteristic.signLanguageInterpretationForAccessibility` is iOS 27.1 and still marked Beta: keep it out of shipping code entirely rather than gating it.

## Anti-patterns

| Wrong | Why it fails | Right |
|---|---|---|
| Tagging the `AssistiveAccess` scene "iOS 18" | Scene is iOS 26; only the env value is iOS 18 | `#available(iOS 26, *)` on the scene; env var needs no gate at the 18/26 floor |
| `MACaptionAppearanceGetForegroundColor` | Doesn't exist -- Get-family is scalar-only | `MACaptionAppearanceCopyForegroundColor(_:_:)` + `.takeRetainedValue()` |
| Bridging `kMACaptionAppearanceSettingsChangedNotification` straight to `NotificationCenter.default` | `CFNotificationCenter` is not toll-free bridged | Observe via `CFNotificationCenterGetLocalCenter()` |
| `focusSection()` for iOS FKA grouping | macOS 13+ / tvOS 15+ only -- no iOS availability | `@FocusState` + `.focusable(interactions:)` + layout order |
| Assuming `.keyboardShortcut()` covers Full Keyboard Access | Different features; FKA needs explicit `.focusable(interactions: .activate)` opt-in for custom views | Wire both independently |
| Baking caption text into video pixels | Unreadable to braille displays, doesn't scale, blurs | Real `Text` overlay honoring `MACaptionAppearance` + Dynamic Type |
| Gating behavior on Live Captions / Sound Recognition / MFi hearing-device state | No public API to read any of these | Design so the app is correct regardless |
| Verbose VoiceOver label ("Button to permanently delete...") | Wastes an entire braille line (14-40 cells) | Concise, front-loaded label; move detail to `accessibilityCustomContent` |
| Custom keystroke-capture control instead of a real text field | Breaks Braille Screen Input and hardware-braille typing | Use `TextField`/`TextEditor`/`SecureField` |
| Auto-logout / countdown with no extension path | WCAG 2.2.1 violation; hostile to Switch Control users needing many seconds per action | Warn ahead, offer extend, preserve entered data |
| Injecting Voice Control vocabulary from app code | No such API -- vocabulary is user-side only | Register plausible phrasings via `accessibilityInputLabels` |
| Adding the `AssistiveAccess` scene to an app-delegate-life-cycle UIKit app | The scene cannot attach; on iOS 27 the app does not launch at all | Migrate to the scene-based life cycle first |
| Counting system generated subtitles as the app's captions | No attribution, no non-dialog sound, and not something the app provides, so not a basis for a Captions Nutrition Label claim | Ship a real caption track (or transcripts for audio-only content) |
| Hand-rolled subtitle picker in a custom player on iOS 27 | Loses system caption styling, localized language names and VoiceOver semantics | `AVPlaybackUserInterfaceMediaSelectionControllable` (iOS/iPadOS/Catalyst 27) |
| `AVMediaCharacteristic.signLanguageInterpretationForAccessibility` in shipping code | iOS 27.1, still marked Beta; absent from the 27.0 SDK | Wait for it to ship; app-specific UI until then |

## Severity guide

- **CRITICAL**: sound-only or gesture-only outcome with no accessible path; captions baked into video pixels (unreadable to braille, doesn't scale).
- **HIGH**: `AssistiveAccess` scene/env-var floor mixed up (phantom availability or compile error); `MACaptionAppearanceGetForegroundColor` or NSNotificationCenter-bridging shipped for caption-change observation (wrong API, silently never fires).
- **MEDIUM**: verbose VoiceOver label wasting a braille line; missing WCAG 2.2.1 timeout extension; `focusSection()` misused on iOS; custom tappable view with no `.focusable(interactions:)` (invisible to FKA).
- **LOW**: no `accessibilityCustomContent` for supplementary detail; no `captionStyles` deep link on 26.4+; missing `.speechSpellsOutCharacters` on an acronym-heavy label.

## See also

- `references/accessibility/01-voiceover-fundamentals.md#custom-rotor-entries` -- rotor/heading navigation Braille users rely on
- `references/accessibility/04-motor-interaction.md#switch-control` and `#voice-control` -- baseline coverage this file adds depth to
- `references/accessibility/05-motion-accessibility.md#autoplay-and-flashing-content-gates----the-other-motion-settings` -- the independent Motion settings table (autoplay, flashing lights, animated images)
- `references/haptics/04-sound-audio-ux.md#accessibility-contract` -- sound-design decisions (never-sole-channel, Silent Mode) this file's hearing section builds on
