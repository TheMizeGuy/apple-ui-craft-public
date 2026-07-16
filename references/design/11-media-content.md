# Media and Rich Content

> Owner: `references/design/11-media-content.md` owns video playback (`VideoPlayer`/AVKit, Picture in Picture), Live Photos, HDR still-image display, and Photos import (`PhotosPicker`), per the ARCHITECTURE ownership map. `AsyncImage` semantics and list-cell image loading/caching are owned by `references/performance/02-scroll-list-performance.md` -- cite it, don't restate. Swift Charts is owned by `references/design/09-swift-charts.md`.
> Floors: `VideoPlayer` iOS 14.0+; `PhotosPicker` iOS 16.0+; `Image.DynamicRange`/`allowedDynamicRange` iOS 17.0+; `AVCaptureSlider` **AVFoundation** iOS 18.0+ (not AVKit -- see below). See `references/_scaffolding/version-floor-registry.md` for the full matrix.

Apple ships a system player, picker, and Live Photo view for nearly every media surface -- the craft failure is almost always reaching for a custom bridge (or a raw `AVPlayerLayer`) when the system component already gives correct transport, captions, and accessibility for free, or forgetting the one accessibility contract every media surface shares: no autoplay without a motion check, and no silent color-inversion trap.

## The Apple way

- Default to the system component: `VideoPlayer`, `PhotosPicker`, `PHLivePhotoView`. Each gives you correct transport UI, AirPlay, PiP, caption rendering, and VoiceOver support with zero extra code -- re-implementing scrubbing or a custom photo grid is a code-review red flag unless you have a concrete reason (full-library management, bespoke capture UI).
- Autoplay is opt-in to accessibility, never opt-out of it: check `UIAccessibility.isVideoAutoplayEnabled` (hero loops, inline previews) and `\.accessibilityReduceMotion` before starting anything that moves without a tap.
- HDR content (`allowedDynamicRange(.high)`) should be reserved for a single focused hero image -- a feed/grid item at `.high` can look painfully brighter than adjacent SDR text and chrome.
- A muted, looping hero video never grabs the `.playback` audio session -- it must not duck the user's music.

## Core APIs

### VideoPlayer and the AVKit transport

```swift
// iOS 14.0+
import AVKit

struct PlayerScreen: View {
    @State private var player = AVPlayer(url: clipURL)
    var body: some View {
        VideoPlayer(player: player)
            .aspectRatio(16/9, contentMode: .fit)
            .onAppear { player.play() }
            .onDisappear { player.pause() }   // a still-playing off-screen AVPlayer keeps the
                                               // audio session + Now Playing info alive
    }
}
```

`VideoPlayer(player:)` gives the full Apple transport for free: scrubber, play/pause, PiP button, AirPlay route picker, subtitle/audio-track menu, and (via the `AVPlayerViewController` underneath) trick-play. Layer your own SwiftUI content above the video but below the system chrome with the overlay initializer:

```swift
VideoPlayer(player: player) {
    VStack {
        HStack { Label("LIVE", systemImage: "dot.radiowaves.left.and.right")
            .font(.caption.bold()).padding(6).background(.red, in: .capsule).padding()
            Spacer() }
        Spacer()
    }
    .allowsHitTesting(false)   // let taps fall through to the system scrubber
}
```

Drop to `AVPlayerViewController` (`UIViewControllerRepresentable`) only when you need knobs `VideoPlayer` hides: `allowsPictureInPicturePlayback`, `entersFullScreenWhenPlaybackBegins`, `showsPlaybackControls = false` (silent looping hero), `speeds`, or `videoGravity` control. **Gotcha**: `AVPlayerViewController.updatesNowPlayingInfoCenter` defaults `true` and pushes its own metadata into Control Center/Lock Screen; if you also drive `MPNowPlayingInfoCenter` yourself, or run more than one player, set it `false` on every controller you manage manually.

### Silent hero loops (gapless)

The naive loop (`NotificationCenter` on `.AVPlayerItemDidPlayToEndTime` → `player.seek(to: .zero)`) visibly stutters at the wrap -- the last frame holds during the seek/re-buffer. Use `AVPlayerLooper` over an `AVQueuePlayer` for a frame-accurate wrap:

```swift
@available(iOS 17.0, *)
@MainActor @Observable
final class HeroLoopModel {
    let player = AVQueuePlayer()
    private var looper: AVPlayerLooper?   // MUST retain -- deallocating stops the loop

    init(url: URL) {
        let template = AVPlayerItem(url: url)
        looper = AVPlayerLooper(player: player, templateItem: template)
        player.isMuted = true                              // never hijack the audio session
        player.actionAtItemEnd = .advance
        player.preventsDisplaySleepDuringVideoPlayback = false
    }
}
```

Gate the autoplay start, not the loop mechanics, under motion + power settings -- see the accessibility contract below.

### Picture in Picture

`VideoPlayer`/`AVPlayerViewController` show the PiP button automatically once the audio session allows it -- nothing to write. For a custom `AVPlayerLayer`-based player, use `AVPictureInPictureController` manually:

```swift
// iOS 15.0+ ContentSource initializer (prefer over the legacy playerLayer: init)
let source = AVPictureInPictureController.ContentSource(playerLayer: playerLayer)
let controller = AVPictureInPictureController(contentSource: source)
controller.canStartPictureInPictureAutomatically = true   // iOS 14.2+
controller.delegate = self
```

Hard requirements or PiP silently no-ops: (1) Background Modes → "Audio, AirPlay, and Picture in Picture" capability; (2) `AVAudioSession` category `.playback`, activated; (3) the `AVPlayerLayer` attached to an on-screen view actually rendering at the moment PiP starts; (4) `AVPictureInPictureController.isPictureInPictureSupported()` checked first -- false on unsupported iPads/Simulator. Implement the delegate's `pictureInPictureController(_:restoreUserInterfaceForPictureInPictureStopWithCompletionHandler:)` (do not abbreviate the selector) to re-present your player UI and always call the completion handler.

### Live Photos

`PHLivePhoto` is `Transferable` -- load it straight from a picker filtered to `.livePhotos`. There is still no SwiftUI-native Live Photo view; `PHLivePhotoView` (PhotosUI) is a `UIView`:

```swift
struct LivePhotoView: UIViewRepresentable {
    let livePhoto: PHLivePhoto
    var playback: PHLivePhotoViewPlaybackStyle = .full   // .hint (brief shimmer) | .full (motion+audio)
    func makeUIView(context: Context) -> PHLivePhotoView { PHLivePhotoView() }
    func updateUIView(_ v: PHLivePhotoView, context: Context) {
        v.livePhoto = livePhoto
        v.startPlayback(with: playback)
    }
}
```

`PHLivePhotoView.livePhotoBadgeImage(options: .overContent)` draws the canonical "LIVE" corner glyph. Gate the auto `.hint` shimmer behind `!accessibilityReduceMotion`; never auto-`.full` without a user gesture (long-press is built in).

### HDR still images

```swift
Image("hero")
    .allowedDynamicRange(.standard)   // clamp to SDR -- feeds/grids, beside text
    // .constrainedHigh -- some extended range, balances against nearby SDR
    // .high            -- full headroom, a single full-bleed hero photo only
```

`Image.DynamicRange` (iOS 17.0+): `.standard`, `.constrainedHigh`, `.high`. Default a feed/grid to `.standard`; reserve `.high` for a single focused photo. Wide-gamut assets cost roughly 2× the memory of sRGB -- downsample aggressively for thumbnails, reserve full-gamut decode for the full-screen view.

### PhotosPicker (iOS 16)

`PhotosPicker` runs out-of-process -- your app receives only the user's chosen assets, so it needs **no `NSPhotoLibraryUsageDescription`, no authorization prompt, no Info.plist key**. Reaching for `PHPhotoLibrary.requestAuthorization` + a custom grid is a red flag unless you genuinely need full-library management.

```swift
import PhotosUI

@State private var selection: PhotosPickerItem?
@State private var image: Image?

PhotosPicker(selection: $selection, matching: .images) {
    Label("Choose Photo", systemImage: "photo")
}
.onChange(of: selection) { _, newItem in
    Task { image = try? await newItem?.loadTransferable(type: Image.self) }
}
```

Multiple selection + filtering:

```swift
PhotosPicker(selection: $items, maxSelectionCount: 5, selectionBehavior: .ordered,
             matching: .any(of: [.images, .not(.videos)]),
             preferredItemEncoding: .compatible)   // transcode HEIC → JPEG for portability
```

`PHPickerFilter` composes `.images`, `.videos`, `.livePhotos`, `.screenshots`, `.panoramas`, `.bursts`, `.cinematicVideos`, `.slomoVideos`, `.depthEffectPhotos`, `.timelapseVideos` via `.any(of:)`/`.all(of:)`/`.not(_:)`. `loadTransferable(type: Image.self)` is convenient for display; for anything you upload, resize, or persist, load `Data`/a custom `Transferable` -- `Image.self` can't be resized/inspected and drops silently on failure.

### Camera capture surfaces

There is still no pure-SwiftUI camera preview -- bridge `AVCaptureVideoPreviewLayer` via `UIViewRepresentable`. The physical Camera Control surface (iPhone 16+) exposes app parameters through **`AVFoundation`**, not AVKit:

```swift
// iOS 18.0+, AVFoundation (NOT AVKit -- AVCaptureEventInteraction IS in AVKit, different framework)
let slider = AVCaptureSlider("Exposure", symbolName: "plusminus.circle", in: -2.0...2.0)
session.controls.append(slider)
```

`AVCaptureSystemZoomSlider`/`AVCaptureSystemExposureBiasSlider` mirror the built-in Camera app for free; `AVCaptureSlider(_:symbolName:in:)` (continuous) or `AVCaptureSlider(_:symbolName:values:)` (discrete) expose a custom parameter. `.onCameraCaptureEvent { }` (SwiftUI, AVKit, iOS 18+) is the hardware-button hook (volume buttons, Camera Control press, AirPods H2 stem click on iOS 26) -- always ship an on-screen shutter too, since Switch Control/VoiceOver users and unsupported hardware need it.

## Text over images: scrim and progressive blur

Text set directly on a photo is a legibility defect: contrast depends on whatever pixels sit behind each glyph. A full-frame dim (`Color.black.opacity(0.5)` over everything) reads, but dulls the very image the layout is built around. The two shipping-grade treatments:

**Gradient scrim** — the default. The image displays untouched, then converges into a text-readable zone behind the copy:

```swift
Image("hero")
    .resizable()
    .aspectRatio(contentMode: .fill)
    .overlay(alignment: .bottom) {
        LinearGradient(
            stops: [
                .init(color: .clear, location: 0),
                .init(color: .black.opacity(0.35), location: 0.55),
                .init(color: .black.opacity(0.82), location: 1)
            ],
            startPoint: .top, endPoint: .bottom
        )
    }
    .overlay(alignment: .bottomLeading) { heroCopy.padding() }
```

**Progressive blur (masked material)** — the premium layer on top of the scrim. There is no public "variable blur" modifier; the sanctioned form is a material fill masked by a `LinearGradient`, so blur ramps up toward the text zone while the rest of the image stays sharp (this is the pattern Apple's own media-catalog sample uses):

```swift
.overlay {
    Rectangle()
        .fill(.regularMaterial)
        .mask {
            LinearGradient(
                stops: [
                    .init(color: .clear, location: 0.45),
                    .init(color: .black, location: 0.85)
                ],
                startPoint: .top, endPoint: .bottom
            )
        }
}
```

Rules: verify the copy's contrast against the *darkest converged region* of the scrim, not the image average; keep the gradient's onset below the focal subject so the transition never bands across a face; a Reduce Transparency check matters here — materials collapse to near-opaque, so the masked-material variant degrades gracefully by design (see `references/accessibility/03-visual-accessibility.md`).

## Availability + fallbacks

```swift
// allowedDynamicRange is iOS 17.0+; feeds default to .standard regardless of floor.
if #available(iOS 17.0, *) {
    heroImage.allowedDynamicRange(.high)
} else {
    heroImage   // pre-17: SDR only, no dynamic-range lever -- this is already correct
}
```

`AVCaptureSlider`/Camera Control APIs are iOS 18.0+ only -- gate behind `#available(iOS 18.0, *)` and fall back to on-screen controls only; there is no pre-18 equivalent to degrade to.

## Accessibility contract

1. **Image alt text**: `Image("chart").accessibilityLabel("Bar chart: Q3 revenue up 18% over Q2")` -- describe the MEANING, not "image." Purely decorative → `Image(decorative:)` (hides it), never a labeled ornament.
2. **Video captions**: the system player renders CC UI automatically and honors the user's caption style (Settings → Accessibility → Subtitles & Captioning) with zero code -- a strong reason to prefer `VideoPlayer`/`AVPlayerViewController`. Select tracks programmatically via `AVMediaSelectionGroup` and auto-enable on `UIAccessibility.isClosedCaptioningEnabled`. A custom-overlaid caption must be real `Text` (not baked into pixels) so it scales with Dynamic Type.
3. **Audio descriptions**: expose the `.describesVideoForAccessibility` track and auto-select it when `UIAccessibility.isAudioDescriptionEnabled`.
4. **Autoplay and motion gating** -- the rules, in one table:

| Content | Gate | Behavior when OFF |
|---|---|---|
| Inline video preview autoplay | `UIAccessibility.isVideoAutoplayEnabled` (no SwiftUI env -- read the static, observe `videoAutoplayStatusDidChangeNotification`) | Show poster frame + explicit Play button; never call `player.play()` |
| GIF / animated WebP / stickers | `\.accessibilityPlayAnimatedImages` (iOS 17+) | Freeze on first frame; require a tap |
| Animated SF Symbols (decorative loops) | `\.accessibilityReduceMotion` | `.symbolEffect(..., options: .nonRepeating)` or `.symbolEffectsRemoved()` |
| Live Photo auto shimmer | `\.accessibilityReduceMotion` | Don't auto-`.hint`; show static frame + LIVE badge |
| Any large motion/parallax transition | `\.accessibilityReduceMotion` | Cross-fade instead (system nav already does this) |

5. **Flashing content**: honor `\.accessibilityDimFlashingLights` (iOS 17+) / `UIAccessibility.isDimFlashingLightsEnabled` for any strobing media -- dim or replace the flashing segment. This is a seizure-safety requirement, not a nicety.
6. **Smart Invert**: a decoded `Image(uiImage:)` and any web/video host are NOT auto-exempt -- add `.accessibilityIgnoresInvertColors()` on photos, video, maps, and charts, or Smart Invert paints an inverted, unusable frame.
7. Group a media card's image + caption + metadata into ONE element: `.accessibilityElement(children: .combine)` so VoiceOver reads "Sunset over bay. Photo by Ana. 2 hours ago" as a unit.

## Anti-patterns

| Wrong | Why it fails | Right |
|---|---|---|
| Custom scrubber/transport instead of `VideoPlayer` | Never matches system feel, silently drops accessibility | `VideoPlayer(player:)`, drop to `AVPlayerViewController` only for extra knobs |
| `player.play()` on `.onAppear` for a hero loop with no gate | Ignores Reduce Motion + Auto-Play Video Previews | Check `UIAccessibility.isVideoAutoplayEnabled` and `!reduceMotion` first |
| Seek-to-zero loop (`NotificationCenter` on end) | Visible stutter at the wrap | `AVPlayerLooper` over `AVQueuePlayer` |
| `.allowedDynamicRange(.high)` on every grid thumbnail | Blinding relative to adjacent SDR chrome | `.standard` for feeds; `.high` for one focused hero |
| `PHPhotoLibrary.requestAuthorization` + custom grid for "attach a photo" | Unnecessary permission prompt + Info.plist key | `PhotosPicker` (out-of-process, zero authorization) |
| Decoded `Image(uiImage:)` with no `.accessibilityIgnoresInvertColors()` | Smart Invert paints an inverted photo | Add the modifier on every photo/video/map/chart |
| `AVCaptureSlider` imported from `AVKit` | Wrong framework -- compile error | `import AVFoundation` |
| Caption text straight on a photo, or a full-frame 50% dim | Legibility is luck / the dim kills the image | Bottom-weighted `LinearGradient` scrim; masked-material progressive blur for the premium treatment (see Text over images) |

## Severity guide

CRITICAL: autoplay with no motion/setting gate, or flashing media with no `accessibilityDimFlashingLights` check -- seizure-safety and vestibular violations. HIGH: custom scrubber replacing `VideoPlayer` with no accessibility parity; `AVCaptureSlider` imported from the wrong framework (compile error); text set directly on a photo with no scrim securing contrast. MEDIUM: missing `.accessibilityIgnoresInvertColors()` on photo/video content; naive seek-to-zero loop shipped as "looping"; full-frame dim overlay where a gradient scrim was warranted. LOW: `.high` dynamic range on a grid thumbnail. NIT: legend/caption text not wrapped in real `Text` for Dynamic Type.

## See also

- `references/performance/02-scroll-list-performance.md` -- `AsyncImage` caveats, custom cached/downsampled image loaders for lists (owner)
- `references/design/09-swift-charts.md` -- Swift Charts data visualization (owner)
- `references/accessibility/03-visual-accessibility.md` -- Reduce Transparency, Smart Invert, seizure safety (owner)
- `references/accessibility/05-motion-accessibility.md` -- Reduce Motion double-gate (owner)
- `references/platform/01-widgets-live-activities.md` -- Now Playing / `MPNowPlayingInfoCenter` integration for audio apps
