# WCAG 2.2 Mapping for iOS

> Owner: `references/accessibility/08-wcag-2-2-mapping.md` owns the CRITERION-TO-MECHANISM map: every WCAG 2.2 Level A and AA success criterion, what satisfies it on iOS, and which reference owns the detail. It does not restate those references. `accessibility/01`..`07` own the mechanisms; this file owns the completeness check.
> Floors: `AccessibilityFocusState` iOS 15.0+, `.accessibilityAddTraits(.isHeader)` iOS 13.0+, `.textContentType` iOS 10.0+. The assistive-technology floors (Full Keyboard Access, `accessibilityRespondsToUserInteraction`, `accessibilityInputLabels`) are owned by `accessibility/07-cognitive-hearing-assistive.md`; everything version-gated defers to `references/_scaffolding/version-floor-registry.md`.

Before this file the plugin cited 29 distinct success criteria scattered across
seven references with no index, so `accessibility-engineer`'s standing
instruction to "cite the WCAG criterion where applicable" could not be
discharged systematically: there was no way to tell an unmet criterion from an
uncited one. Several of the most iOS-central criteria -- `accessibilityLabel`
(1.1.1), `navigationTitle` (2.4.2), Voice Control naming (2.5.3), and announced
status changes (4.1.3) -- were covered in prose and mapped to nothing.

**How to use this file.** It is the audit checklist, not the teaching material.
Walk it once per audit, mark each row met / not met / not applicable, and follow
the owner column for the actual rule. A criterion marked not applicable needs a
reason.

## The three ways WCAG and iOS disagree

Read these before applying any row, or you will file findings the platform
already answers.

1. **Several criteria are satisfied by using the system control at all.** A
   `Button`, `Toggle`, `Picker` or `NavigationLink` arrives with its role, its
   traits, its focus behaviour, its pressed state and its Voice Control name
   already correct. The finding is almost never "the Toggle fails 4.1.2"; it is
   "this hand-rolled tap target replaced a Toggle and lost all of it".
2. **Target size: two criteria, two numbers, and Apple's own rule wins.**
   2.5.8 Target Size (Minimum) is **AA and asks for 24**; 2.5.5 Target Size
   (Enhanced) is **AAA and asks for 44**. Apple's HIG requires 44pt
   independently of either. Ship 44pt and cite the HIG; cite 2.5.8 only when you
   mean the AA floor. Do not report 2.5.8 as requiring 44.
   (`references/accessibility/04-motor-interaction.md`)
3. **The "keyboard" criteria are real on iOS.** 2.1.1 and 2.1.2 are not
   web-only: iPad with a hardware keyboard, Full Keyboard Access, and Switch
   Control all drive the same focus system. A custom control unreachable by Full
   Keyboard Access fails 2.1.1 exactly as a web widget would.

## 1. Perceivable

| SC | Level | iOS mechanism | Owner |
|---|---|---|---|
| 1.1.1 Non-text Content | A | `.accessibilityLabel` on every meaningful image, icon and icon-only control; `.accessibilityHidden(true)` on decorative content and on `.redacted` placeholders | `accessibility/01-voiceover-fundamentals.md` |
| 1.2.1 Audio-only / Video-only | A | Transcript or description alongside media | `design/11-media-content.md` |
| 1.2.2 Captions (Prerecorded) | A | `AVPlayer` legible-media captions; do not burn captions into the video | `design/11-media-content.md` |
| 1.2.3 Audio Description or Alternative | A | Alternative track, or a text alternative | `design/11-media-content.md` |
| 1.2.4 Captions (Live) | AA | Live caption track on streamed media | `design/11-media-content.md` |
| 1.2.5 Audio Description (Prerecorded) | AA | Described-audio track | `design/11-media-content.md` |
| 1.3.1 Info and Relationships | A | Structure carried by traits, not by layout: `.accessibilityElement(children:)`, `.accessibilityAddTraits(.isHeader)`, `Section` rather than a styled `Text` acting as a heading | `accessibility/01-voiceover-fundamentals.md` |
| 1.3.2 Meaningful Sequence | A | VoiceOver reading order matches visual order; `.accessibilitySortPriority` only where the layout genuinely reorders meaning | `accessibility/01-voiceover-fundamentals.md` |
| 1.3.3 Sensory Characteristics | A | Instructions never depend on shape, size or position alone ("tap the round button" fails) | `design/10-content-and-writing.md` |
| 1.3.4 Orientation | AA | Do not lock orientation unless essential; the layout survives both | `usability/05-adaptive-review-method.md` |
| 1.3.5 Identify Input Purpose | AA | `.textContentType` on every personal-data field. This is the criterion behind the AutoFill rule | `usability/02-forms-and-error-recovery.md` |
| 1.4.1 Use of Color | A | Colour never the sole carrier: pair with a symbol, a label, or a shape | `design/04-color-system.md` |
| 1.4.2 Audio Control | A | Nothing auto-plays audio past 3s without a control | `haptics/04-sound-audio-ux.md` |
| 1.4.3 Contrast (Minimum) | AA | 4.5:1 body, 3:1 large text. Resolve semantic colours against the trait collection before claiming a ratio | `accessibility/03-visual-accessibility.md` |
| 1.4.4 Resize Text | AA | **Dynamic Type is this criterion on iOS.** Text scales to AX5 without loss of content or function | `accessibility/02-dynamic-type-adaptation.md` |
| 1.4.5 Images of Text | AA | Real text, never a rasterised label; SF Symbols rather than image assets of glyphs | `design/05-sf-symbols.md` |
| 1.4.10 Reflow | AA | **The Dynamic Type analogue**: no loss of content or function, and no two-dimensional scrolling, at AX5 on the narrowest supported width | `usability/05-adaptive-review-method.md` |
| 1.4.11 Non-text Contrast | AA | 3:1 for control boundaries, focus indicators, meaningful graphics, and chart marks | `accessibility/03-visual-accessibility.md` |
| 1.4.12 Text Spacing | AA | Line height, paragraph and letter spacing survive being increased; avoid fixed-height text containers | `design/03-typography-dynamic-type.md` |
| 1.4.13 Content on Hover or Focus | AA | Applies to iPad pointer hover and to popovers: dismissible, hoverable, persistent | `references/interaction/05-press-feedback-states.md` |

## 2. Operable

| SC | Level | iOS mechanism | Owner |
|---|---|---|---|
| 2.1.1 Keyboard | A | Every control reachable and operable via Full Keyboard Access and a hardware keyboard on iPad; custom gestures carry an accessibility action | `accessibility/04-motor-interaction.md` |
| 2.1.2 No Keyboard Trap | A | Focus can always leave. **The number-pad trap is the common iOS instance**: `.numberPad` with no keyboard toolbar and no interactive dismissal | `usability/02-forms-and-error-recovery.md` |
| 2.1.4 Character Key Shortcuts | A | Single-character `keyboardShortcut` needs a modifier, or must be remappable or focus-scoped | `platform/02-app-intents-system.md` |
| 2.2.1 Timing Adjustable | A | Any timeout is extendable or disableable; sessions warn before expiry | `accessibility/07-cognitive-hearing-assistive.md` |
| 2.2.2 Pause, Stop, Hide | A | Auto-advancing carousels, marquees and looping animation have a control; looping symbol effects gate on Reduce Motion | `accessibility/05-motion-accessibility.md` |
| 2.3.1 Three Flashes | A | Nothing flashes more than 3x/second; respect `accessibilityDimFlashingLights` | `accessibility/05-motion-accessibility.md` |
| 2.4.1 Bypass Blocks | A | The VoiceOver rotor and heading traits are the iOS equivalent of skip links; a screen with no headings has no bypass | `accessibility/01-voiceover-fundamentals.md` |
| 2.4.2 Page Titled | A | **`navigationTitle` on every screen.** An untitled screen fails this and simultaneously gives its children a back button reading "Back" | `usability/03-navigation-and-information-architecture.md` |
| 2.4.3 Focus Order | A | Focus follows meaning on push, on sheet present, and on wizard step change; `AccessibilityFocusState` moves it deliberately | `usability/01-task-flows-and-journeys.md` |
| 2.4.4 Link Purpose (In Context) | A | The label says where it goes; "Learn more" repeated eight times fails | `design/10-content-and-writing.md` |
| 2.4.5 Multiple Ways | AA | More than one route to key content: browse plus `.searchable`, or a deep link, or Spotlight | `usability/03-navigation-and-information-architecture.md` |
| 2.4.6 Headings and Labels | AA | Headings carry `.isHeader` and describe their section; field labels describe their field | `accessibility/01-voiceover-fundamentals.md` |
| 2.4.7 Focus Visible | AA | Full Keyboard Access and Switch Control focus is visible; custom controls do not suppress the system indicator | `accessibility/04-motor-interaction.md` |
| 2.4.11 Focus Not Obscured (Min) | AA | The focused control is not covered by the keyboard, a sticky bar, or a `safeAreaInset` overlay | `usability/05-adaptive-review-method.md` |
| 2.5.1 Pointer Gestures | A | Every multipoint or path-based gesture (pinch, rotate, swipe-to-delete, drag-to-reorder) has a single-pointer alternative | `accessibility/04-motor-interaction.md` |
| 2.5.2 Pointer Cancellation | A | Action fires on up, not down, and dragging off cancels. `Button` gives this free; a `DragGesture` acting on `onChanged` does not | `interaction/05-press-feedback-states.md` |
| 2.5.3 Label in Name | A | **The Voice Control criterion.** The accessibility label must CONTAIN the visible text, or "tap Send" fails on a button labelled "Submit message" | `accessibility/01-voiceover-fundamentals.md` |
| 2.5.4 Motion Actuation | A | Shake-to-undo and other motion triggers have a UI equivalent and can be disabled | `accessibility/04-motor-interaction.md` |
| 2.5.7 Dragging Movements | AA | Drag-to-reorder and sliders have a non-dragging path: `accessibilityAdjustableAction`, or explicit move controls | `accessibility/04-motor-interaction.md` |
| 2.5.8 Target Size (Minimum) | AA | **24pt is the AA floor. Apple's own rule is 44pt** and is what this plugin enforces; see the disagreement note above | `accessibility/04-motor-interaction.md` |

## 3. Understandable

| SC | Level | iOS mechanism | Owner |
|---|---|---|---|
| 3.1.1 Language of Page | A | Correct localisation and `Locale`; VoiceOver pronounces in the right language | `accessibility/06-localization-rtl.md` |
| 3.1.2 Language of Parts | AA | `.accessibilitySpeechLanguage` (or an attributed-string language attribute) on foreign-language spans | this row states the mechanism; `accessibility/06-localization-rtl.md` for the locale context |
| 3.2.1 On Focus | A | Focusing a control does not navigate, submit, or present | `usability/02-forms-and-error-recovery.md` |
| 3.2.2 On Input | A | Changing a `Picker` or `Toggle` does not navigate without warning | `usability/02-forms-and-error-recovery.md` |
| 3.2.3 Consistent Navigation | AA | Tab bar, toolbar placements and back semantics stay put across screens | `usability/03-navigation-and-information-architecture.md` |
| 3.2.4 Consistent Identification | AA | The same function carries the same label and symbol everywhere; no label drift between tab, title and heading | `usability/03-navigation-and-information-architecture.md` |
| 3.2.6 Consistent Help | A | Help, contact, or support sits in the same place on every screen that offers it | `patterns/06-settings.md` |
| 3.3.1 Error Identification | A | The failing field is identified in text, not by colour alone, and is associated with its error | `usability/02-forms-and-error-recovery.md` |
| 3.3.2 Labels or Instructions | A | Every field is labelled; placeholder text is not a label | `usability/02-forms-and-error-recovery.md` |
| 3.3.3 Error Suggestion | AA | The error says what to do next, not only what went wrong | `usability/02-forms-and-error-recovery.md` |
| 3.3.4 Error Prevention (Legal, Financial, Data) | AA | Reversible, checked, or confirmed before commit | `usability/02-forms-and-error-recovery.md` |
| 3.3.7 Redundant Entry | A | **A flow criterion, not a form one.** No step re-asks for data an earlier step supplied | `usability/01-task-flows-and-journeys.md` |
| 3.3.8 Accessible Authentication (Min) | AA | No cognitive function test without an alternative; **paste must work** on password and OTP fields; `.oneTimeCode` and `.password` content types wired | `usability/02-forms-and-error-recovery.md` |

## 4. Robust

| SC | Level | iOS mechanism | Owner |
|---|---|---|---|
| 4.1.2 Name, Role, Value | A | System controls satisfy this by construction. A hand-rolled control needs `.accessibilityLabel`, the right `.accessibilityAddTraits` role, and `.accessibilityValue` for its state | `accessibility/01-voiceover-fundamentals.md` |
| 4.1.3 Status Messages | AA | **A change announced only visually is silent.** `UIAccessibility.post(notification: .announcement)` for transient status, `.screenChanged` for a new screen, `.layoutChanged` for an in-place change | `usability/04-states-feedback-and-affordances.md` |

4.1.1 Parsing was **removed** in WCAG 2.2 and has no iOS analogue. Do not cite it.

## The new criteria in WCAG 2.2

WCAG 2.2 added nine success criteria. Eight are A or AA and tabled below; the ninth,
3.3.9 Accessible Authentication (Enhanced), is AAA and out of this map's scope. Worth a
dedicated pass, because they postdate most accessibility habits and four of them land
squarely on patterns iOS apps get wrong:

| SC | Why it bites on iOS |
|---|---|
| 2.4.11 Focus Not Obscured (Minimum), AA | The keyboard covering the focused field, and the `.overlay(alignment: .bottom)` bar that never insets scroll content |
| 2.4.12 Focus Not Obscured (Enhanced), AAA | Aspirational; note it, do not gate on it |
| 2.4.13 Focus Appearance, AAA | Aspirational |
| 2.5.7 Dragging Movements, AA | Drag-to-reorder lists and custom sliders with no adjustable action |
| 2.5.8 Target Size (Minimum), AA | See the disagreement note; Apple's 44pt already exceeds it |
| 3.2.6 Consistent Help, A | Support entry points that move between screens |
| 3.3.7 Redundant Entry, A | Multi-step flows that lose carried state -- the single most common flow defect |
| 3.3.8 Accessible Authentication (Minimum), AA | Blocked paste on password and OTP fields, which apps still ship as a "security" measure |

## Beyond WCAG: iOS-only obligations

WCAG has no criterion for these and they exclude real users, so the audit covers
them regardless. They are graded on the same severity scale.

| Obligation | Owner |
|---|---|
| Reduce Motion double-gate on all non-essential motion | `accessibility/05-motion-accessibility.md` |
| Reduce Transparency fallback for `glassEffect` and `Material` | `design/02-liquid-glass.md` |
| Increase Contrast behaviour | `accessibility/03-visual-accessibility.md` |
| Bold Text and its metric shifts | `accessibility/03-visual-accessibility.md` |
| Switch Control and Voice Control operability | `accessibility/04-motor-interaction.md` |
| Assistive Access | `accessibility/07-cognitive-hearing-assistive.md` |
| Large Content Viewer for small toolbar controls | `accessibility/07-cognitive-hearing-assistive.md` |
| VoiceOver rotor, custom actions, and custom rotors | `accessibility/01-voiceover-fundamentals.md` |
| Haptics never the sole feedback channel | `haptics/01-haptic-design-principles.md` |

## Reporting

Cite the criterion number, name and level on the `WCAG:` line of the finding:

```
WCAG: 2.4.2 Page Titled, A
```

Rules:

- **Cite the criterion that is actually failed**, not the nearest famous one.
  Wrong citations are worse than none: they get argued rather than fixed.
- **Never cite a AAA criterion as required.** Note it as an enhancement.
- **A criterion covered but unverified is `not exercised`, not met.** The
  settings matrix in `agents/accessibility-engineer.md` has that third value for
  exactly this reason.
- Criteria this plugin cannot evaluate from the available evidence follow the
  evidence rule in `references/review/02-evidence-pipeline.md`.

## See also

- `references/accessibility/01-voiceover-fundamentals.md` -- labels, traits, order, announcements, rotor
- `references/accessibility/02-dynamic-type-adaptation.md` -- the 1.4.4 and 1.4.10 mechanism
- `references/accessibility/03-visual-accessibility.md` -- contrast, and how to resolve a semantic colour before claiming a ratio
- `references/accessibility/04-motor-interaction.md` -- targets, gestures, Switch and Voice Control
- `references/accessibility/05-motion-accessibility.md` -- Reduce Motion, flashing, the double-gate
- `references/accessibility/06-localization-rtl.md` -- language, layout direction
- `references/accessibility/07-cognitive-hearing-assistive.md` -- cognitive, hearing, Assistive Access
- `references/usability/02-forms-and-error-recovery.md` -- the 3.3.x cluster
- `references/review/01-finding-format.md` -- the `WCAG:` line
