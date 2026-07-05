# Sound & Audio UX

> Owner: `references/haptics/04-sound-audio-ux.md` owns UI sound design, `AVAudioSession` category choice for interface sound, System Sound Services, spatial/directional audio cues, and sound-haptic pairing. Cite, don't restate.
> Floors: cite `references/_scaffolding/version-floor-registry.md` for anything version-gated. Most APIs here predate iOS 13 and need no floor.

Sound is the one feedback channel a user can be actively hostile toward -- muted, routed to disconnected AirPods, or off by policy in a meeting. Apple's Human Interface Guidelines set the bar: interface sound must be **purposeful, sparing, and expected**; the default for a well-behaved app is silence. This file makes an agent able to decide whether a sound earns its place, pick the right playback API for it (`AudioServicesPlaySystemSound` vs `AVAudioPlayer` vs `AVAudioEngine`), configure `AVAudioSession` so Silent Mode and system volume are honored automatically, and pair sound with haptics so both read as one physical event. The single most common defect: shipping a decorative UI sound under the `.playback` category, which defeats Silent Mode and interrupts the user's music.

## The Apple way

Before adding any sound, answer four questions -- fail any one and don't ship it:

1. **Does it carry information the user doesn't already have?** A visible state change plus a haptic often already says it. Sound must add a *distinct* signal, not restate the obvious.
2. **Is it tied to an explicit user action or a genuinely important event?** Sounds on send/purchase/capture are welcome; sounds on background/automatic events are startling.
3. **Would it be tolerable on the 100th repetition?** Anything that fires on routine navigation or per-keystroke fatigues fast.
4. **Is it acceptable in a quiet room?** If the honest answer is "that would be embarrassing," it should be off by default and Silent-Mode-muted -- it will be, if you use `.ambient`.

Frequency governs volume and character: the more often a sound fires, the quieter, shorter, and softer it must be. A rare payment-success chime can be a confident two-note motif; a frequently-fired selection tick must be a near-subliminal blip, or better, just a haptic.

## Core APIs

### System Sound Services -- the default choice for short UI sound

```swift
import AudioToolbox

// iOS 2.0+. Fire-and-forget, no session management, Silent Mode honored automatically.
typealias SystemSoundID = UInt32

func AudioServicesPlaySystemSound(_ inSystemSoundID: SystemSoundID)
func AudioServicesCreateSystemSoundID(_ inFileURL: CFURL, _ outSystemSoundID: UnsafeMutablePointer<SystemSoundID>) -> OSStatus
func AudioServicesDisposeSystemSoundID(_ inSystemSoundID: SystemSoundID) -> OSStatus
```

Constraints on your bundled file: <= 30 seconds, one audio track, Linear PCM or IMA4, in `.caf`/`.aif`/`.wav`. Compressed formats (mp3/aac) silently fail -- convert with `afconvert`.

```swift
final class UISoundPlayer {
    static let shared = UISoundPlayer()
    private var ids: [String: SystemSoundID] = [:]

    // Cache the SystemSoundID -- AudioServicesCreateSystemSoundID does file I/O + allocation;
    // calling it on every play is a documented performance mistake.
    private func id(for name: String, ext: String = "caf") -> SystemSoundID {
        if let existing = ids[name] { return existing }
        guard let url = Bundle.main.url(forResource: name, withExtension: ext) else { return 0 }
        var soundID: SystemSoundID = 0
        AudioServicesCreateSystemSoundID(url as CFURL, &soundID)
        ids[name] = soundID
        return soundID
    }

    func play(_ name: String) { AudioServicesPlaySystemSound(id(for: name)) }
    deinit { ids.values.forEach { AudioServicesDisposeSystemSoundID($0) } }
}
```

`kSystemSoundIDVibrate` (value `4095`) is the one publicly documented sound constant. Never ship the private `/System/Library/Audio/UISounds/` numeric IDs (`1104`, `1057`, ...) -- undocumented, version-unstable, App Store review risk. Bundle your own assets.

### AVAudioSession -- pick `.ambient`, never `.playback`, for interface sound

The category you choose is what decides whether Silent Mode mutes your sound.

| Category | Silenced by Ring/Silent switch | Silenced by screen lock | Default mixing |
|---|---|---|---|
| `.ambient` | Yes | Yes | Mixes (never interrupts Music/Podcasts) |
| `.soloAmbient` (system default) | Yes | Yes | Interrupts (takes over) |
| `.playback` | No | No | Interrupts (add `.mixWithOthers` to mix) |
| `.record` | Yes | No | Interrupts |
| `.playAndRecord` | No | No | Interrupts (add `.mixWithOthers`) |
| `.multiRoute` | No | No | Interrupts |

`.playback` is exclusively for content that IS the point of the app (a media player, a game whose audio is core) -- using it for chrome sounds makes the app non-compliant with the user's mute intent.

```swift
import AVFAudio

func configureUISoundSession() {
    let session = AVAudioSession.sharedInstance()
    do {
        try session.setCategory(.ambient, mode: .default, options: [.mixWithOthers])
        try session.setActive(true)
    } catch {
        print("UI-sound session config failed: \(error)")
    }
}
```

Set the category **once** (app launch), not per sound -- re-setting it on every effect causes audible route glitches and can duck other audio momentarily. You generally do not need `setActive(false)` between UI sounds; leave the ambient session active.

### AVAudioPlayer for a short custom UI sound

Use when you need per-sound volume, rate, looping, or precise overlap that System Sound Services doesn't offer.

```swift
final class EffectPlayer {
    static let shared = EffectPlayer()
    private var players: [String: AVAudioPlayer] = [:]

    func preload(_ name: String, ext: String = "caf") {
        guard players[name] == nil,
              let url = Bundle.main.url(forResource: name, withExtension: ext),
              let p = try? AVAudioPlayer(contentsOf: url) else { return }
        p.prepareToPlay()          // fills buffers; removes first-play latency
        players[name] = p
    }

    func play(_ name: String, volume: Float = 1.0) {
        let p = players[name]
        p?.volume = volume
        p?.currentTime = 0
        p?.play()
    }
}
```

A single `AVAudioPlayer` cuts itself off if retriggered before it finishes. For genuinely overlapping effects (rapid coin pickups), pool players or use `AVAudioEngine` + `AVAudioPlayerNode` scheduling.

### Semantic sound layer

Mirror the haptic vocabulary pattern: feature code names *what happened*, never a file.

```swift
enum AppSound {
    case sent, received, purchaseSucceeded, scanConfirmed, errorOccurred

    var resourceName: String {
        switch self {
        case .sent: "swoosh_up"
        case .received: "swoosh_down"
        case .purchaseSucceeded: "chime_success"
        case .scanConfirmed: "tick_confirm"
        case .errorOccurred: "thunk_error"
        }
    }
}

func play(_ sound: AppSound) {
    guard soundEffectsEnabled, !UIAccessibility.isVoiceOverRunning else { return }
    UISoundPlayer.shared.play(sound.resourceName)
}
```

One gate, honored everywhere: the in-app Sound Effects toggle and VoiceOver suppression both live in this single function.

## Spatial and directional audio

Most 2D iOS chrome does **not** need spatialized sound -- a flat, centered UI sound is correct for a phone lying on a desk. Reach for spatial audio only for visionOS, AirPods head-tracked Spatial Audio contexts, or games.

```swift
import RealityKit

// RealityKit. SpatialAudioComponent has NO bare init(gain:) -- the full label set is required.
var audio = SpatialAudioComponent(
    gain: -6.0,                    // Audio.Decibel, 0 dB = unity (NOT a 0.0-1.0 linear factor)
    directLevel: 0.0,              // Audio.Decibel
    reverbLevel: 0.0,              // Audio.Decibel
    directivity: .beam(focus: 0.5) // 0 = omnidirectional ... 1 = tightly focused beam
    // distanceAttenuation: omit to accept the type's default rolloff
)
entity.components.set(audio)

// AmbientAudioComponent / ChannelAudioComponent DO take the bare single-label form.
let ambient = AmbientAudioComponent(gain: -3.0)   // Audio.Decibel -- fixed-direction background bed
let channel = ChannelAudioComponent(gain: 0.0)    // Audio.Decibel -- non-spatialized, head-locked
```

| Component | Behavior | UI use |
|---|---|---|
| `SpatialAudioComponent` | Positioned point source, directivity + room reverb | A control emits its confirmation sound from its own location |
| `AmbientAudioComponent` | Fixed-direction, non-attenuating background bed | Room ambience that stays put as the user moves |
| `ChannelAudioComponent` | Non-spatialized multichannel | Head-locked interface sounds that shouldn't move |

For a 3D-positioned UI sound in a normal iOS app without RealityKit (rare -- e.g. an accessibility "radar" cue), use `AVAudioEngine` + `AVAudioEnvironmentNode` with an HRTF rendering algorithm; the source buffer must be **mono** to spatialize:

```swift
let engine = AVAudioEngine()
let env = AVAudioEnvironmentNode()
engine.attach(env)
engine.connect(env, to: engine.mainMixerNode, format: nil)

let player = AVAudioPlayerNode()
engine.attach(player)
player.renderingAlgorithm = .HRTFHQ
engine.connect(player, to: env, format: monoFormat)

player.position = AVAudio3DPoint(x: 1.5, y: 0, z: 0)   // to the user's right
env.listenerPosition = AVAudio3DPoint(x: 0, y: 0, z: 0)
```

Avoid directional cues on flat iPhone/iPad UI: device orientation is unknown and unstable, so "left/right" sound has no reliable meaning and just sounds like a bug.

## Availability + fallbacks

RealityKit's `SpatialAudioComponent`/`AmbientAudioComponent`/`ChannelAudioComponent` compile on iOS 17.0+/macOS 14.0+/visionOS 1.0+, but full head-tracked spatialization is the visionOS story -- see `references/cross-platform/05-visionos.md` for platform depth. On ordinary iPhone/iPad UI, don't reach for RealityKit spatial audio at all:

```swift
if hasRealityViewEntity {
    // Positioned confirmation sound: SpatialAudioComponent full-label init (above).
} else {
    // Flat 2D chrome: .ambient AVAudioSession + AudioServicesPlaySystemSound.
    // This is the correct default, not a fallback to apologize for.
}
```

`AudioServicesPlaySystemSound` (iOS 2+), `AVAudioSession` categories (iOS 3+), `AVAudioPlayer` (iOS 2.2+), and `CHHapticEngine` audio events (iOS 13+, see `references/haptics/03-core-haptics-engine.md#audio-and-haptic-sync`) all predate this file's practical floor -- no `#available` gating needed for any of them.

## Pairing sound with haptics

HIG (Playing haptics): match the intensity and sharpness of haptics with accompanying animations, and synchronize sound with haptics for a richer experience. For a tap/impact, sound and haptic must fire within roughly **20-30ms** of each other to read as one event; past ~50ms the brain separates them.

- **Tightest sync**: one `CHHapticEngine` plays both -- `audioCustom`/`audioContinuous` events scheduled on the same timeline as `hapticTransient`/`hapticContinuous`. Mechanics owned by `references/haptics/03-core-haptics-engine.md#audio-and-haptic-sync`; this file is the sound side of that coupling.
- **Looser but fine for slow events**: fire `.sensoryFeedback(.success, trigger:)` and `AudioServicesPlaySystemSound` from the same state change -- acceptable when the user isn't parsing a single tactile click.
- **Match the physical metaphor** across animation, haptic, and sound character: a `.snappy` spring pairs with `.impact(flexibility: .rigid)` and a short bright tick, never a soft warm sound.
- **Don't double up** where a system control already has its own haptic/sound (picker detents, toggles) -- a second custom sound on top produces clutter.

On devices without a Taptic Engine (iPad, Apple TV, Vision Pro) the haptic silently no-ops while the sound still plays -- a paired design degrades gracefully to sound-only, but never make the haptic the *only* channel.

## Accessibility contract

`accessibilityReduceMotion` does **not** cover audio -- there is no first-party "reduce audio" environment value. Gating a sound on Reduce Motion is a category error; it governs animation/parallax only. The correct levers:

- **Silent Mode / system volume**: honored automatically by the `.ambient` category and `AudioServicesPlaySystemSound` -- never query a flag, never try to defeat the mute.
- **`UIAccessibility.isVoiceOverRunning`**: suppress decorative sounds while VoiceOver speaks; they collide with spoken output. Keep only sounds that carry unique information.
- **An in-app Sound Effects toggle**: the single most important accessibility affordance for app sound. Persist it and honor it at every call site (the semantic layer above makes this one `if`).
- **Never make sound the sole channel**: pair every meaningful sound with a visible state change, and a haptic where apt. Audit rule: flag any success/error/warning path that plays a sound but produces no on-screen change.
- Camera **shutter** and **screenshot** sounds are legally mandated in some regions (Japan, South Korea) and cannot be silenced regardless of Silent Mode -- don't design a flow assuming you can mute them.

Hearing-specific accessibility depth (captions, `MediaAccessibility`, Sound Recognition, mono audio, MFi hearing devices) is owned by `references/accessibility/07-cognitive-hearing-assistive.md#hearing-accessibility` -- this file covers the sound-design decision, that file covers the platform hearing-accessibility surface.

## Anti-patterns

| Wrong | Why it fails | Right |
|---|---|---|
| `.playback` category for a decorative UI sound | Ignores Silent Mode; interrupts the user's music | `.ambient` + `.mixWithOthers` |
| Calling `AudioServicesCreateSystemSoundID` on every play | File I/O + allocation each time | Register once, cache the `SystemSoundID` |
| Shipping private `/System/Library/Audio/UISounds/` numeric IDs | Undocumented, version-unstable, App Store risk | Bundle your own asset; only `kSystemSoundIDVibrate` is public |
| Feeding mp3/aac to System Sound Services | Silently fails (needs PCM/IMA4, <=30s) | Convert with `afconvert` to a `.caf` |
| Gating sound on `accessibilityReduceMotion` | That flag governs motion, not audio | Gate on an in-app Sound Effects toggle + `isVoiceOverRunning` |
| `SpatialAudioComponent(gain:)` bare call | Not the real initializer -- full label set required | `SpatialAudioComponent(gain:directLevel:reverbLevel:directivity:)` |
| Treating spatial `gain:` as 0.0-1.0 | It's `Audio.Decibel` (0 dB = unity) | Pass dB values (e.g. `-6.0`); a "0.8" is nearly full volume, not 80% |
| Spatializing a stereo source in `AVAudioEnvironmentNode` | Only mono sources spatialize | Provide a mono buffer/format to the player node |
| Re-setting `AVAudioSession` category per effect | Route glitches, momentary ducking of other audio | Set once at launch; leave the ambient session active |
| Single `AVAudioPlayer` for rapidly retriggered effects | Cuts itself off mid-sound | Pool players or use `AVAudioEngine` + `AVAudioPlayerNode` |
| Normalizing effects to be loud at low system volume | Fights the user | Author at a sane level; never set `outputVolume` |
| Sound as the sole outcome signal | Inaccessible when muted, routed away, or for Deaf/HoH users | Always pair with a visible state change |
| Duplicating a system sound the OS already plays (picker, keyboard) | Doubled, cluttered audio | Don't add -- the platform already speaks |

## Severity guide

- **CRITICAL**: sound is the only signal for a success/error/destructive outcome -- inaccessible when muted or for Deaf/HoH users.
- **HIGH**: `.playback` used for chrome sound (defeats Silent Mode); fabricated bare `SpatialAudioComponent(gain:)` signature shipped.
- **MEDIUM**: category re-set per effect (route glitches); `AudioServicesCreateSystemSoundID` called per play (perf); sound not suppressed under VoiceOver.
- **LOW**: sound/haptic sync drift beyond ~50ms; directional cue on flat iPhone/iPad UI; missing in-app mute toggle for a low-frequency, non-critical sound.

## See also

- `references/haptics/01-haptic-design-principles.md#match-haptic-to-weight-of-action` -- haptic weight vocabulary this file's pairing table mirrors
- `references/haptics/02-swiftui-sensory-feedback.md#built-in-feedback-types` -- `.sensoryFeedback` cases used in loose sound-haptic pairing
- `references/haptics/03-core-haptics-engine.md#audio-and-haptic-sync` -- tight-sync `audioCustom` pattern mechanics
- `references/accessibility/07-cognitive-hearing-assistive.md#hearing-accessibility` -- captions, Sound Recognition, mono audio, MFi hearing devices
- `references/cross-platform/05-visionos.md` -- spatial audio in the broader visionOS surface
