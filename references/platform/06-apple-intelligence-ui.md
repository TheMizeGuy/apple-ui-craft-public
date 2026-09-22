# Apple Intelligence UI

> Owner: `references/platform/06-apple-intelligence-ui.md` owns Foundation Models UI (`LanguageModelSession`, streaming, tool-calling UI), Writing Tools, Genmoji, Image Playground, Visual Intelligence, and the cross-cutting design/availability/privacy doctrine that ties them together, per the ARCHITECTURE ownership map. It does NOT own `AppShortcutsProvider` registration, Assistant Schemas, or Interactive Snippets plumbing -- those are `references/platform/02-app-intents-system.md#assistant-schemas-ios-26` and `#interactive-snippets-ios-26` (owner); this file cites them and adds only the AI-discoverability UI layer on top.
> Floors: Foundation Models = iOS 26.0+ (`import FoundationModels`, on Apple-Intelligence-capable hardware); `LanguageModelSession` reaches watchOS at **27.0** and is absent from tvOS on every version. The iOS 27.0 Foundation Models surface -- `LanguageModel`, `PrivateCloudComputeLanguageModel`, `Attachment`, Dynamic Profiles, `GenerationOptions.ToolCallingMode`, `LanguageModelError` -- is iOS/iPadOS/Mac Catalyst/macOS/visionOS/watchOS 27.0, no tvOS. Writing Tools = iOS 18.0+ / visionOS 2.4+. The ImagePlayground framework and the `imagePlaygroundSheet` modifiers = iOS **18.1**+ / macOS 15.1+ / visionOS 2.4+; `ImagePlaygroundStyle`/`ImageCreator` = 18.4; `ImagePlaygroundOptions` + `.imagePlaygroundOptions(_:)` = **26.4**; `ImagePlaygroundStyle.any` = **27.0**. Genmoji type (`NSAdaptiveImageGlyph`) = iOS 18.0+; creation = iOS 18.2+. Visual Intelligence `semanticContentSearch` schema = iOS 26.0+ / iPadOS 26.0+ / Mac Catalyst 26.0+ / macOS 27.0+. See `references/_scaffolding/version-floor-registry.md#ios-26x` for the unified 26.0 boundary and `#ios-180` for the 18-era surfaces.

Apple Intelligence UI done well has almost no visible "AI chrome" at all -- Writing Tools lives inside the text-selection menu, Image Playground is a plain button next to compose, and the best Foundation Models feature reads as the OS being unusually helpful, not as a chatbot bolted onto your screen. The single most common way this goes wrong: a sparkle button that is always visible and throws when tapped, because nobody gated it on whether the model is actually available on this device, in this region, with this setting, right now.

## The seven rules of native-feeling AI UI

1. **Availability-gate the entry point, don't error it.** Hide or disable the affordance when the surface's runtime gate says unavailable -- never show-then-throw.
2. **Stream, never freeze.** Render partials as they arrive. A blocked sheet for more than a second reads as a hang.
3. **Label generated content, quietly.** A subtle sparkle glyph or "Generated" chip -- never a loud banner.
4. **Draft, don't commit.** AI output lands in an editable state the user confirms, with Regenerate and Undo. Never auto-insert into the user's document.
5. **Fail into a manual path.** Every AI feature must still be fully usable manually where the model is absent -- older device, region, or the user has Apple Intelligence off.
6. **Respect the private-by-default contract.** The on-device model never leaves the phone; say so where users expect it, and disclose explicitly the moment a surface routes off-device.
7. **Use system surfaces over custom chrome.** Writing Tools, Image Playground, Genmoji, and Siri snippets are pre-designed -- presenting them beats reinventing a chat bubble.

## Availability: the gate every AI surface starts with

Apple Intelligence hardware floor: iPhone 15 Pro/Pro Max, the full iPhone 16 and 17 lines, A17 Pro+/M1+ iPad and Mac. A device that meets hardware can still be unavailable while the model downloads, in an unsupported region/language, or with Apple Intelligence toggled off in Settings -- never assume `.available`.

Two gates, both must pass: a **compile-time** `#available`/`@available` check (the symbol must exist -- per-surface floors differ, see the header), and a **runtime** capability check (the feature is present AND enabled AND ready on this device right now). Only Foundation Models exposes a rich, reason-bearing runtime switch; the others degrade implicitly:

| Surface | Runtime gate | Fallback when unavailable |
|---|---|---|
| Foundation Models, on-device (`SystemLanguageModel`) | `SystemLanguageModel.default.availability` switch (`.available` / `.unavailable(reason)`) | Manual entry: type it yourself, preset picker, template |
| Foundation Models, Private Cloud Compute (`PrivateCloudComputeLanguageModel`, iOS 27) | Its OWN `isAvailable` / `availability`, plus `quotaUsage`; requires `com.apple.developer.private-cloud-compute` | Fall back to `SystemLanguageModel`, then to the manual path |
| Image Playground | `@Environment(\.supportsImagePlayground) var supportsImagePlayground: Bool` | `PhotosPicker` / camera / bundled sticker set |
| Writing Tools (standard text views) | None needed -- the modifiers/traits are inert no-ops when unavailable | The plain field IS the fallback |
| Writing Tools (custom text engine) | `UIWritingToolsCoordinator.isWritingToolsAvailable` (static `Bool`) | Ship the plain editor |
| Genmoji | No env flag -- the keyboard omits the Genmoji button when unavailable | Standard Unicode emoji always remain |
| Visual Intelligence (App Intents contribution) | No runtime "isAvailable" API -- `@available(iOS 26.0, *)`-gate the types; the system simply never invokes them | Your normal in-app search UI + lexical Spotlight index, shipped unconditionally |

```swift
import FoundationModels
import SwiftUI

struct GenerativeEntryView: View {
    private let model = SystemLanguageModel.default   // reference type, cheap to hold

    var body: some View {
        switch model.availability {
        case .available:
            SummarizeButton()                                    // show the AI affordance
        case .unavailable(.deviceNotEligible):
            ManualComposeView()                                  // hardware can't run it -- full non-AI path
        case .unavailable(.appleIntelligenceNotEnabled):
            SettingsNudge(url: URL(string: "App-Prefs:")!)        // ask the user to enable it; still dismissible
        case .unavailable(.modelNotReady):
            ProgressView("Preparing…")                            // downloading; resolves to the AI UI
        case .unavailable(let other):
            ManualComposeView()                                  // unknown/future reason -- never dead-end
        }
    }
}
```

Rule: every non-`.available` branch routes to a COMPLETE manual path, never a disabled shell or a dead-end alert. `.appleIntelligenceNotEnabled` may nudge to Settings, but stays dismissible -- the manual path works right now, with or without the nudge.

From iOS 27 "the device is Apple-Intelligence capable" is no longer a sufficient gate, because a session can be backed by any `LanguageModel`. Gate on the specific model the session holds: `SystemLanguageModel.default.availability` for the on-device path, `PrivateCloudComputeLanguageModel`'s own `availability` and `quotaUsage` for the PCC path, and your own reachability check for a third-party model.

## Foundation Models: sessions, streaming, and tool-calling UI

`SystemLanguageModel.default` is on-device, private, and has no network round-trip, no API key, no per-token cost.

**Never hardcode the context window.** Apple documents three distinct on-device model versions -- 26.0-26.3, 26.4, and 27.0 -- so any fixed token figure is wrong by construction across the installed base. Read `SystemLanguageModel.default.contextSize`, budget with `SystemLanguageModel.default.tokenCount(for:)`, and read `SystemLanguageModel.default.variant` when you need to know which model you have -- instance members, readable on a 26.0 target (`contextSize` is back-deployed before 26.4). Apple's instruction is a release-checklist item, not a footnote: "Because the model changes when a person updates to iOS 27, iPadOS 27, macOS 27, and visionOS 27, test your prompts with the new model to verify your app's behavior." A prompt tuned on 26.x can produce differently-shaped output on 27, and a `@Generable` struct whose fields shift changes the rendered UI.

```swift
import FoundationModels

@State private var session = LanguageModelSession(instructions: "You are a travel planner.")

// Non-streaming
let out = try await session.respond(to: prompt, generating: Recipe.self).content

// Streaming -- ResponseStream<Content> is an AsyncSequence of Snapshot values
let stream = session.streamResponse(generating: Itinerary.self) { "Plan a 3-day trip to Kyoto." }
for try await snapshot in stream {
    withAnimation(.smooth) { itinerary = snapshot.content }   // .content is Itinerary.PartiallyGenerated
}
```

`@Generable` conforms a type for constrained decoding; `@Guide(description:)` steers each field in natural language, or `@Guide(_ guides: GenerationGuide...)` applies hard constraints (`.count`, `.range`, `.pattern(Regex)`, `.anyOf`). Streaming yields a `PartiallyGenerated` mirror where every property is optional and fills in progressively -- guard each field so half-arrived structs render cleanly, and wrap assignments in `withAnimation` so fields ease in rather than pop:

```swift
@Generable struct Itinerary {
    @Guide(description: "A short, catchy title") var title: String
    @Guide(description: "Day-by-day plan", .maximumCount(7)) var days: [DayPlan]
}
```

`session.isResponding` is `true` while a call is in flight -- disable the send/regenerate control on it, since a second call while one is running throws `.concurrentRequests`. Call `session.prewarm()` the instant the user signals intent (focuses the field, opens the sheet) to precompute the KV cache and cut first-token latency. If generating in the background (e.g. a `BGTask`), use non-streaming `respond(to:options:)` -- streaming in the background raises `.rateLimited`.

**Errors are a UI concern, and iOS 27 silently breaks the old catch.** `LanguageModelSession.GenerationError` (iOS 26.0) is deprecated at **27.0** and split three ways:

| New type | Floor | Covers |
|---|---|---|
| `LanguageModelError` (`@nonexhaustive`) | 27.0, incl. watchOS | Model-level failures: `contextSizeExceeded`, `rateLimited`, `refusal`, `timeout`, `guardrailViolation`, `unsupportedCapability`, `unsupportedTranscriptContent`, `unsupportedGenerationGuide`, `unsupportedLanguageOrLocale` |
| `SystemLanguageModel.Error` | 27.0, no watchOS | `assetsUnavailable` -- specific to the on-device model |
| `LanguageModelSession.Error` | 27.0, incl. watchOS | Session misuse: `concurrentRequests`, `transcriptMutationWhileResponding` |

Apple's deprecation note is about binary behavior, which is what makes this the highest-risk item here: "Apps built with Xcode 26 will continue to catch this error until you rebuild with Xcode 27. You must update to Xcode 27 to catch the new error types before submitting your app." An app rebuilt on Xcode 27 with only a `GenerationError` catch path silently stops matching, and every model failure falls through to the generic handler -- a spinner that never resolves, which is the exact failure the error UI exists to prevent.

Two things the case list demands: `decodingFailure` is **not** a `LanguageModelError` case, and because the enum is `@nonexhaustive` the `switch` needs a `default` arm. Write both catch paths while the deployment target still includes 26.x:

A `catch let error as LanguageModelError` clause cannot be availability-gated, so with a deployment target that still includes 26.x, catch generically and branch inside:

```swift
do {
    itinerary = try await session.respond(to: prompt, generating: Itinerary.self).content
} catch {
    state = .failed(copy(for: error))
}

private func copy(for error: any Error) -> FailureCopy {
    if #available(iOS 27, *), let error = error as? LanguageModelError {
        switch error {
        case .guardrailViolation:     return .cantHelp        // never echo the raw prompt
        case .refusal:                return .rephrase        // carries an async .explanation
        case .contextSizeExceeded:    return .shorten         // then start a fresh session, seeded with a summary
        case .timeout, .rateLimited:  return .retryInAMoment
        default:                      return .retryInAMoment  // @nonexhaustive: a default arm is mandatory
        }
    }
    if let error = error as? LanguageModelSession.GenerationError { return legacyCopy(for: error) }
    return .generic                                            // always a real path, never a dead end
}
```

`assetsUnavailable` moved to `SystemLanguageModel.Error`, so check that type too when the on-device model is the one in play. Every failure branch needs a visible Retry alongside the copy, and the manual path behind it.

**Tool-calling produces UI, not just text.** The model can call your `Tool`s mid-generation:

```swift
struct WeatherTool: Tool {
    let name = "getWeather"
    let description = "Get current weather for a city"
    @Generable struct Arguments { @Guide(description: "City name") var city: String }
    @concurrent func call(arguments: Arguments) async throws -> some PromptRepresentable {
        let w = try await WeatherService.current(arguments.city)
        return "\(w.tempF)°F, \(w.summary)"   // fed back to the model; ALSO drive your own UI here
    }
}
```

A tool call is a chance to render a native card (a map, a live value, a fetched row) instead of dumping text -- surface tool activity ("Checking weather…") so the pause is legible, then show the tool's real result as a first-party view with the model's prose wrapped around it. Errors thrown inside `call(arguments:)` are wrapped in `LanguageModelSession.ToolCallError` and rethrown at the `respond`/`streamResponse` call site.

### What iOS 27 adds to Foundation Models

Five additions, each with a UI consequence rather than just an API one. All are iOS/iPadOS/Mac Catalyst/macOS/visionOS/watchOS 27.0 unless noted, and none is on tvOS -- exclude tvOS with `#if os`, not `#available`.

**Any model behind the same session API.** `LanguageModel` is a protocol; `LanguageModelSession(model:)` takes any conforming model, with the real translation work living in a `LanguageModelExecutor`. Apple's own off-device variant is `PrivateCloudComputeLanguageModel` -- larger, more reasoning capability, bigger `contextSize`, stateless Apple-silicon servers, gated by the `com.apple.developer.private-cloud-compute` entitlement, and with its own `isAvailable`, `availability`, `quotaUsage`, `supportedLanguages` and `supportsLocale(_:)`. Developers in the App Store Small Business Program with under 2 million total first-time downloads get it at no cloud API cost.

The craft consequence is a privacy one: **which model the session holds now decides what the app must disclose** (see the trust tiers below). It is no longer settled by whether you imported `FoundationModels`.

**Prompts can carry images.** `Attachment` goes into a `Prompt` or `Instructions` alongside text:

```swift
let response = try await session.respond {
    "Describe this image:"
    Attachment(cgImage).label("before")
    Attachment(imageURL: editedURL).label("after")
}
```

An on-device model that can see the photo the user is already looking at changes where the entry point belongs: next to the image -- a context menu on the photo, a button in the viewer -- not in a separate chat sheet. Label every attachment when passing more than one, or the model's output cannot be mapped back to a specific image for the UI to highlight. Below iOS 27, prompts are text-only: run Vision yourself and feed a description.

**Vision ships tools the model can call.** `OCRTool` and `BarcodeReaderTool` conform to `Tool` and run on-device: `LanguageModelSession(tools: [OCRTool()])`. Treat the call as a UI event -- show "Reading text…", then render the extracted text as selectable, correctable first-party content rather than letting it dissolve into the model's prose. `OCRTool` has no watchOS availability (`BarcodeReaderTool` does reach watchOS 27.0), so a watch target needs `#if !os(watchOS)` around the OCR path. `OCRTool` is **unavailable in Simulator**, so a feature built on it cannot be demoed or snapshot-tested there and needs device verification before anyone claims it works.

**Dynamic Profiles keep one conversation alive across screens.** `DynamicInstructions` declares what content and tools the model sees; a `LanguageModelSession.Profile` binds that to how one configuration runs (`model(_:)`, `temperature(_:)`, `samplingMode(_:)`, `reasoningLevel(_:)`, `maximumResponseTokens(_:)`, `toolCallingMode(_:)`, `historyTransform(_:)`); a `DynamicProfile` picks which Profile is active as app state changes. The framework re-evaluates the body before every request.

This is the fix for the most jarring failure in a long-lived AI feature: tearing down the session when the user moves from editing an image to editing an animation, and losing the history with it. The lifecycle hooks -- `onActivate`, `onPrompt`, `onResponse`, `onReasoning`, `onToolCall`, `onToolOutput` -- are the correct place to drive UI state like "Checking weather…" instead of scraping the token stream. `historyTransform(_:)` is the principled answer to context growth, replacing the old "start a fresh session when it overflows" hack.

**Tool calling is now steerable.** `GenerationOptions.ToolCallingMode` is `.allowed` (default), `.required`, or `.disallowed`. Use `.disallowed` for a deliberately offline, fast path (a quick rewrite, a local summarization) so the UI never shows a tool-activity state it does not need. `.required` carries a warning that is really a UI failure mode: it needs an explicit exit condition -- a tool that throws, or a `DynamicProfile` that flips the mode after the first call -- or the model keeps calling tools indefinitely behind a spinner the user cannot cancel.

**Foundation Models reaches watchOS at 27.0.** `LanguageModelSession` and the whole 27.0 type set list watchOS 27.0; `SystemLanguageModel` itself is still documented without it. A watch screen has no room for a spinner and no patience for one, so the streaming and partial-render discipline above matters more there, not less.

One budgeting note: on iOS 27 Neural Engine memory is attributed to the app that caused it, so an on-device generative feature now shows up in the app's own memory footprint. The measurement detail belongs to `references/performance/03-launch-memory-instruments.md`; the consequence here is that a generative surface is a memory decision as well as a latency one.

## Writing Tools

Writing Tools (proofread, rewrite, summarize, compose, key-points, lists, tables) is the highest-leverage AI surface because it is free on any standard text view -- you get it by doing nothing.

```swift
TextEditor(text: $draft)
    .writingToolsBehavior(.complete)      // .automatic (default) | .complete | .limited | .disabled
```

`.limited` (overlay panel only, suggestions not applied inline) is iOS 18.0+/visionOS **2.4+** -- gate the visionOS case. On UIKit, `UITextView.writingToolsBehavior: UIWritingToolsBehavior` (`.none`/`.default`/`.limited`/`.complete`) and `writingToolsAllowedInputOptions: UIWritingToolsResultOptions` (`.plainText`/`.richText`/`.list`/`.table`) constrain what comes back -- a plain-`String` field must set `[.plainText]` or Writing Tools may hand back structure your storage silently drops. The property is `writingToolsAllowedInputOptions`, not `allowedWritingToolsResultOptions`.

Opt OUT (`.disabled`) where rewriting corrupts meaning: code/syntax and monospace exact-input fields; legal/contractual/medical exact text; username/password/2FA/promo-code/credential fields (also set the matching `.textContentType`); identifier/SKU/serial/command strings. Everywhere else -- notes, messages, captions, bios, reviews -- leave it on; opting out of a genuine free win is the more common mistake. Never build a custom "Rewrite with AI" button next to a field that already has Writing Tools -- it duplicates the system affordance.

A fully custom (non-`UITextView`) text engine adopts `UIWritingToolsCoordinator` as a `UIInteraction`, implementing its delegate to supply context ranges and apply replacements -- the only correct path when you don't use TextKit; never fake it by swapping text under the system's feet. The system's own rewrite shimmer already honors Reduce Motion; if you draw your own "generating" decoration on the coordinator's returned bounding paths, gate it yourself per the double-gate owned by `references/accessibility/05-motion-accessibility.md`.

## Genmoji

Genmoji (user-generated emoji) round-trips through text as `NSAdaptiveImageGlyph` -- a resolution-adaptive image that behaves like a character inline and scales with the run's font. The number-one real-world bug is data loss: storing plain `String` silently drops every Genmoji a user types.

```swift
textView.supportsAdaptiveImageGlyph = true   // UITextInput, iOS 18.0+; opt in ONLY if you handle it correctly
```

The glyph lives in the attributed string as the `.adaptiveImageGlyph` attribute (`NSAdaptiveImageGlyphAttributeName` in Obj-C) -- if your code filters or rewrites attributes, you MUST preserve this one unchanged or the emoji vanishes. `NSAdaptiveImageGlyph` exposes `imageContent: Data` (save this), `contentIdentifier: String`, `contentDescription: String` (the VoiceOver label), and `contentType: UTType`; recreate with `NSAdaptiveImageGlyph(imageContent:)`.

Persist as attributed data -- never plain `String`:

```swift
static func data(from attributed: NSAttributedString) throws -> Data {
    try attributed.data(from: NSRange(location: 0, length: attributed.length),
                         documentAttributes: [.documentType: NSAttributedString.DocumentType.rtfd])
}
```

Display with `Text(attributedString)`, never a fixed-size `Image` -- the glyph must track Dynamic Type. Before sending field text to Foundation Models or any server, substitute each glyph's `contentDescription` for the glyph itself; the model cannot see image bytes. The single test that catches nearly every Genmoji bug: type one, background the app, relaunch, confirm it re-renders at the correct size.

## Image Playground

Image Playground gives a complete first-party image- and Genmoji-generation UI with zero model work: present a sheet, receive a `URL` (or an `NSAdaptiveImageGlyph`).

```swift
@Environment(\.supportsImagePlayground) private var supportsImagePlayground

if supportsImagePlayground {
    Button("Create Image") { showSheet = true }
        .imagePlaygroundSheet(
            isPresented: $showSheet,
            concepts: [.text("A cozy cabin in the snow")],     // [ImagePlaygroundConcept] -- an ARRAY
            sourceImageURL: seedImageURL,                       // a URL, not an Image, on this overload
            onCompletion: { tempURL in persist(tempURL) },      // temp file -- copy it out synchronously
            onAdaptiveImageGlyphCreation: { glyph in insert(glyph) },  // user made a Genmoji instead
            onCancellation: nil
        )
} else {
    PhotoImportButton()   // mandatory non-AI fallback: PhotosPicker / camera
}
```

Two overload families exist and are NOT interchangeable: a singular form (`concept: String`, `sourceImage: Image?`) for one seed phrase, and the plural form above (`concepts: [ImagePlaygroundConcept]`, `sourceImageURL: URL`) for richer seeding plus the Genmoji-creation callback. `ImagePlaygroundConcept.text(_:)` is an explicit phrase; `.extracted(from:title:)` has the system pull salient concepts out of a longer body of text. `onCompletion` hands you a URL to a **temporary** file inside your container -- copy it to permanent storage immediately, it can be reclaimed.

**Style and size are partly yours to set.** `.imagePlaygroundGenerationStyle(_:in:)` sets the selected style and the allowed set; `.imagePlaygroundOptions(_:)` (**iOS 26.4+**) supplies an `ImagePlaygroundOptions` carrying `sizeSpecification`, `creationStrategy`, `creationVariety` and `personalization` -- which matters when the generated image has to fit a fixed slot in your layout. The style set is `animation`, `illustration`, `sketch`, `emoji`, `externalProvider`, `all`, and, new at **iOS 27.0**, `any`:

```swift
Button("Create Image") { showSheet = true }
    .imagePlaygroundSheet(isPresented: $showSheet, concepts: concepts, onCompletion: persist)
    .imagePlaygroundOptions(options)                       // iOS 26.4+: size, variety, personalization
    .imagePlaygroundGenerationStyle(defaultStyle, in: allowedStyles)
```

`.any` yields "images in a style inferred from the prompt," which is the surface behind photorealistic generation. That sharpens rule 3 rather than relaxing it: a photoreal output that reads as a photograph needs the Generated marker far more than a cartoon did. Below iOS 27 offer the 18.4-era style set; below 26.4 there is no size or variety control -- take what the sheet returns and lay out around it.

Content is safety-filtered by the system with no visibility into rejections. Keep the trigger a plain, honest button -- the sheet itself carries the Apple Intelligence identity, so don't over-brand the entry point.

**`ImageCreator` is deprecated at iOS 27.0.** Apple's replacement note: "Use `ImagePlaygroundViewController` or `imagePlaygroundSheet`." Apple is closing the headless-generation path, which is the position this file already took -- the sheet carries the identity, the safety filtering and the style picker. A codebase generating images silently in the background is not looking at a symbol swap; it needs a real user-facing presentation. `ImageCreator` still works without warning below iOS 27, but write new code against the sheet on every version.

## Visual Intelligence

Visual Intelligence lets the user point the camera or circle something on screen; the system finds matching content across apps. Your app becomes a destination through two cooperating App Intents pieces:

```swift
// 1. Return matching entities for what Visual Intelligence saw.
struct LandmarkVisualQuery: IntentValueQuery {
    func values(for input: SemanticContentDescriptor) async throws -> [LandmarkEntity] {
        guard let pixelBuffer = input.pixelBuffer else { return [] }
        return try await LandmarkService.shared.match(pixelBuffer)   // your ranking
    }
}

// 2. Let the user tap through into a richer in-app result set.
// iOS 26.0+ / macOS 27.0+
@AppIntent(schema: .visualIntelligence.semanticContentSearch)
struct ShowVisualSearchResultsIntent: AppIntent {
    @Parameter var semanticContent: SemanticContentDescriptor
    @MainActor func perform() async throws -> some IntentResult { .result() }
}
```

Each returned `AppEntity`'s `displayRepresentation` becomes a result card the system renders inside its own Visual Intelligence sheet, branded to your app -- that representation IS your UI here; invest in a real title, concise subtitle, and a representative thumbnail. Keep `values(for:)` fast (favor on-device matching or a warm index) -- a multi-second query means the app simply never appears before the user moves on. Return only high-confidence matches; a pile of weak results reads as spam and gets down-ranked. You do not build a camera, scanner, or circle-to-search UI -- the system owns capture and presentation.

## Siri and assistant reach

The App Intents plumbing behind Apple Intelligence's Siri surface -- `AppShortcutsProvider`, `@AppIntent(schema:)` domain conformance, and Interactive Snippets (`ShowsSnippetView` static vs `ShowsSnippetIntent` live) -- is owned in full by `references/platform/02-app-intents-system.md#assistant-schemas-ios-26` and `#interactive-snippets-ios-26`; the `openAppWhenRun` → `supportedModes`/`IntentModes` execution-model migration is owned by `#opening-the-app-from-a-control-ios-26`. (`@AssistantIntent(schema:)` and its siblings are deprecated in the iOS 27 SDK -- do not pair them with `@AppIntent(schema:)` as equals.) This file adds only the discoverability UI layer that makes those mechanics visible to a user.

Siri AI shipped with iOS 27 as a beta: English only at launch, with a dedicated Siri app, and absent in the EU and China initially. That makes rule 5 load-bearing rather than aspirational for this surface -- a feature reachable only through Siri is dead for most of the install base.

**One piece of onscreen awareness is genuinely a UI obligation**, because the annotation lives on the view rather than the intent: `.appEntityIdentifier(_:)` / `.appEntityIdentifier(forSelectionType:identifier:)` / `.appEntityUIElements(_:)` are what let Siri resolve "this" against what the user is looking at. They are iOS 18.4+ modifiers that became load-bearing in iOS 27, so a 26-floor app needs no gate -- it needs the annotations. The three-tier pattern and the "annotate only views that genuinely show that entity" rule are in `references/platform/02-app-intents-system.md#onscreen-awareness-annotating-views-with-entities` (owner).

`SiriTipView(intent:isVisible:)` (SwiftUI) and `SiriTipUIView(style:)` (UIKit) show the exact phrase for an intent inline, near the feature it triggers -- not on a generic settings screen -- and dismiss once the user has used the phrase:

```swift
SiriTipView(intent: LogWaterIntent(), isVisible: .constant(!didUseSiriPhrase))
    .accessibilityHint("Tells Siri to log a glass of water")
ShortcutsLink()   // opens this app's page in the Shortcuts app
```

Rule: never make `SiriTipView`/`ShortcutsLink` (or a schema-only, `isAssistantOnly` intent) the ONLY path to a feature -- they are discovery accelerators layered over a normal in-app control. Provide 3-5 natural phrase variants on every `AppShortcut`, most-natural first; every phrase must interpolate `\(.applicationName)` or it is rejected. A schema intent contributes your entities to Siri/Spotlight's on-device semantic index -- do not adopt a schema on anything you would not show in Spotlight, and never place a password/token/PII in an `AppEntity.displayRepresentation`.

## Privacy: the three trust tiers

1. **On-device** (default `SystemLanguageModel.default`, Writing Tools' on-device path, Genmoji, Visual Intelligence matching, Image Playground): content never leaves the phone. No network, no API key, no per-token cost. **No app-authored privacy disclosure or Private Cloud Compute banner is needed** -- the system owns that trust story; re-explaining it reads as clutter, not reassurance.
2. **Private Cloud Compute (PCC)**: stateless, cryptographically-verifiable Apple-silicon servers. Two distinct routes reach them. The SYSTEM may route Writing Tools, Siri and system Apple Intelligence there for requests too large for on-device -- that routing is system-managed and system-disclosed, so an app using `.writingToolsBehavior` presents no PCC UI of its own. Separately, from iOS 27 an app may hold a `PrivateCloudComputeLanguageModel` deliberately, which is still Apple-operated PCC and still carries Apple's trust story; what it adds is an availability and quota surface your UI has to respect. `SystemLanguageModel.default` is 100% on-device and never uses PCC.
3. **Your own cloud / third-party model** -- the ONLY tier the app owes a disclosure for. If your app sends user content to your server or a third-party LLM, disclose in-context before first send AND reflect it in the App Privacy nutrition label. This is the ordinary app-privacy obligation, not an Apple Intelligence feature. From iOS 27 that model can sit behind the `LanguageModel` protocol and drive the same `LanguageModelSession` API as the on-device one -- the familiar call site changes nothing about the obligation.

The tier is decided by which model the session holds, not by which framework you imported. A surface built on `SystemLanguageModel`, system Writing Tools, Genmoji, Image Playground, or Visual Intelligence should carry zero bespoke "your data is private" copy. A surface that calls out to a third-party network model MUST disclose it. Mixing the two up -- badging an on-device feature as "private cloud," or staying silent on a real network call -- is a real, review-visible tell, and a single `LanguageModelSession(model:)` line is now enough to move a feature between tiers without anything else in the file changing.

## Probabilistic-output UI states

AI output is non-deterministic, streamed, and fallible. Four states, one primitive each:

1. **Loading** -- `.redacted(reason: .placeholder)` on the output region, never a full-screen spinner; the skeleton preserves the final layout so the shape of the result is visible immediately.
2. **Streaming** -- reveal `PartiallyGenerated` fields as they fill; gate any typewriter/shimmer crawl on `@Environment(\.accessibilityReduceMotion)` (owner `references/accessibility/05-motion-accessibility.md`) -- when reduced, content appears in place with no crawl. Disable resend/regenerate while `session.isResponding`.
3. **Error/refusal** -- specific and recoverable, never a raw stack or the enum name: refusal → "Try rephrasing"; context exceeded → "Shorten the input"; rate-limited/assets unavailable → "Try again in a moment" plus the manual path.
4. **Result** -- a draft. Quietly label it ("Generated" chip or sparkle), land it in an EDITABLE surface with Regenerate + Undo, and never auto-commit into the user's document or send queue.

Announce stream completion ONCE via `AccessibilityNotification.Announcement`, not per token -- firing on every partial floods the VoiceOver rotor. Mark generated regions with a subtle accessibility label ("AI generated") so non-visual users get the same "this is a draft" signal the sparkle gives sighted users.

## The sparkle affordance

`sparkles` is the conventional Apple Intelligence glyph; surface-specific system glyphs exist too (`apple.image.playground` for Image Playground, iOS 18.2+). Use the sparkle to mark genuinely generative actions only -- badging ordinary buttons with it is an AI-slop tell that dilutes the signal every other AI affordance depends on. There is no public API for the system's own multicolor Siri screen-edge glow; do not fake it with a private-looking gradient border -- use the standard `sparkles` symbol and let system surfaces own their own glow.

## Availability + fallbacks

```swift
// Foundation Models is iOS 26.0+; Writing Tools/Genmoji/Image Playground are iOS 18-era.
// State the real per-surface floor -- never blanket-label everything "iOS 26" or "iOS 27".
if #available(iOS 26, *) {
    FoundationModelsEntry()             // LanguageModelSession-backed
} else if #available(iOS 18.1, *) {
    ImagePlaygroundEntry()              // Image Playground sheet is 18.1, not 18.2
} else {
    ManualComposeView()                 // pre-18.1: fully manual, no AI affordance at all
}
```

Four floors in this file are easy to get wrong in the same direction -- reaching for 27 when the symbol landed earlier, or for 18.2 when it landed at 18.1:

| Symbol | Real floor |
|---|---|
| ImagePlayground framework + `imagePlaygroundSheet` | iOS 18.1 (not 18.2) |
| `ImagePlaygroundOptions` + `.imagePlaygroundOptions(_:)` | iOS 26.4 (not 27) |
| `ImagePlaygroundStyle.any` | iOS 27.0 |
| `LanguageModelSession` on watchOS | watchOS 27.0 (absent in 26.x); no tvOS on any version |

## Accessibility contract

Streaming and Reduce Motion are covered above and gated per `references/accessibility/05-motion-accessibility.md` (owner of the double-gate). Every AI button needs a meaningful label ("Summarize article," never a bare sparkle) -- VoiceOver users must know what the glyph does before activating it. `Text(AttributedString)` for any Genmoji-bearing content so glyphs scale with Dynamic Type. `contentDescription` is mandatory on every Genmoji run; a glyph with no alt text is invisible to VoiceOver. None of this doubles as color-only signaling -- pair the sparkle glyph with a text label per Differentiate Without Color.

## Anti-patterns

| Wrong | Why it fails | Right |
|---|---|---|
| Sparkle button always visible, errors on tap | Ignores availability | Gate on the surface's runtime capability |
| Full-screen spinner during generation | Reads as a hang | Stream partials into a redacted skeleton |
| Auto-inserting AI text into the user's document | Ships hallucinations without review | Draft state + confirm + Undo |
| Custom "Rewrite with AI" next to a field with Writing Tools | Duplicates the system affordance | Use the system entry point |
| Custom Genmoji picker or hand-built image generator | Reinvents system UI you get for free | `imagePlaygroundSheet` + `supportsAdaptiveImageGlyph` |
| Badging an on-device feature as "sending to private cloud" | Contradicts the actual trust tier | On-device features carry zero bespoke privacy copy |
| No manual fallback for an unavailable branch | Feature dead on non-AI devices/regions | Every branch routes to a complete manual path |
| VoiceOver announcement fired per streamed token | Floods the rotor | Announce completion once |
| Only a `GenerationError` catch path after rebuilding on Xcode 27 | The catch stops matching; every failure falls through to a spinner that never resolves | Catch `LanguageModelError` (with a `default` arm) alongside the legacy path |
| A hardcoded context-window constant | Wrong across three shipping on-device model versions | `SystemLanguageModel.default.contextSize` + `.tokenCount(for:)` |
| `ImageCreator` generating images headlessly | Deprecated at iOS 27.0; no user-facing presentation, no style picker, no visible safety story | `imagePlaygroundSheet` / `ImagePlaygroundViewController` |
| `.toolCallingMode(.required)` with no exit condition | The model calls tools indefinitely behind an uncancellable spinner | A throwing tool, or a `DynamicProfile` that flips the mode after the first call |
| Gating a PCC-backed feature on `SystemLanguageModel.default.availability` | Wrong model's gate; PCC has its own availability and a quota | Gate on `PrivateCloudComputeLanguageModel.availability` / `quotaUsage` |
| A photoreal `.any` result shown with no Generated marker | It reads as a photograph | Label it; `.any` raises the stakes on rule 3, it does not relax them |

## Severity guide

CRITICAL: an AI entry point renders with no availability check and crashes/errors on tap for a real fraction of users (older hardware, region, setting off); an app rebuilt on Xcode 27 whose only catch path is `GenerationError`, so every model failure falls through to a hung spinner. HIGH: auto-committed AI output with no edit/undo step; a Genmoji-bearing field persisted as plain `String` (silent data loss); `.toolCallingMode(.required)` with no exit condition. MEDIUM: full-screen spinner instead of streaming; missing manual fallback branch; a hardcoded context-window constant; a PCC-backed feature gated on the on-device model's availability. LOW: sparkle badge on a non-generative button; `ImageCreator` still in use below iOS 27. NIT: AI-generated content unlabeled but otherwise fully functional and reviewable.

## See also

- `references/platform/02-app-intents-system.md#assistant-schemas-ios-26` -- `@AppIntent(schema:)` domain conformance and the deprecated `@AssistantIntent(schema:)` migration (owner)
- `references/platform/02-app-intents-system.md#onscreen-awareness-annotating-views-with-entities` -- `appEntityIdentifier`/`appEntityUIElements` view annotation (owner)
- `references/platform/02-app-intents-system.md#interactive-snippets-ios-26` -- `ShowsSnippetView`/`ShowsSnippetIntent` (owner)
- `references/platform/02-app-intents-system.md#opening-the-app-from-a-control-ios-26` -- `supportedModes`/`IntentModes`, the `openAppWhenRun` migration (owner)
- `references/accessibility/05-motion-accessibility.md` -- Reduce Motion double-gate for streaming/generation animation (owner)
- `references/patterns/04-loading-empty-error.md` -- `ContentUnavailableView`/`redacted` primitives reused for AI loading states (owner)
