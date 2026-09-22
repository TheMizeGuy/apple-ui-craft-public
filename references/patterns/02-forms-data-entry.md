# Forms and Data Entry

> Owner: `references/patterns/02-forms-data-entry.md` owns `Form`/`Section` structure, general text/secure entry, the non-auth `textContentType`/`keyboardType` input-semantics matrix, `@FocusState` orchestration, keyboard avoidance, and validation UX. Selection controls (`Picker`/`DatePicker`/`ColorPicker`/`Toggle`/`Stepper`/`Slider`) get a light pass here for data-entry contexts; the settings-row vocabulary for the SAME controls in a preferences screen is owned by `references/patterns/06-settings.md#row-vocabulary`. Login/signup credential-field semantics (`.username` vs. `.emailAddress`, `.newPassword`, the password reveal-toggle accessibility contract) are owned by `references/patterns/09-auth-account.md#credential-field-stack` -- this file covers `SecureField` only for non-auth entry (a PIN, an app-lock passphrase). Deep Full Keyboard Access / tvOS focus-engine mechanics are out of scope.
> Floors: see `references/_scaffolding/version-floor-registry.md#ios-160` for the corrected `.lineLimit(_:reservesSpace:)` floor cited below; `.textFieldStyle(.bordered)` / `textInputBorderShape(_:)` / `.pickerStyle(.tabs)` / `dismissalConfirmationDialog(_:shouldPresent:actions:)` are iOS 27.0, and the item- and error-driven `alert` modifiers are an Xcode 27 requirement with an iOS 15 runtime floor (`references/_scaffolding/version-floor-registry.md`).

`Form` is a semantic container, not a `VStack` styling shortcut -- it renders inset-grouped chrome on iOS, adopts platform styling elsewhere, and gives every row correct insets, separators, and Dynamic Type growth for free. Reach for it on any create/edit screen. The single most common data-entry mistake is threading validation, focus, and dismissal as ad hoc booleans instead of the three coordinated systems below.

## Structure

Section footer is the validation slot -- not a floating hand-positioned error `Text`:

```swift
Form {
    Section {
        TextField("Name", text: $name)
        TextField("Email", text: $email)
            .textContentType(.emailAddress)
            .keyboardType(.emailAddress)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
    } header: {
        Text("Profile")
    } footer: {
        if let msg = emailError {
            Text(msg).foregroundStyle(.red)          // error -> footer, in red
        } else {
            Text("We'll never share your email.")    // otherwise, helper text
        }
    }

    Section {
        Toggle("Notifications", isOn: $notifications)
        LabeledContent("Version", value: appVersion)  // read-only row: label left, value right
    }
}
.formStyle(.grouped)   // iOS 16+; forces the inset-grouped look explicitly
```

`LabeledContent(_:value:)` (iOS 16+) is the correct read-only row -- never fake it with `HStack { Text; Spacer(); Text }`, which reads as two disjoint VoiceOver elements instead of one "label: value" pairing. Row alignment inside `Form` is automatic; wrapping fields in a manual `HStack` to align labels fights the container. Apply NO `.textFieldStyle` to a `TextField` inside a `Form` -- the row already supplies background and border, and a bordered style double-borders it.

### Text field style and border shape

Outside a `Form`, a field needs its own chrome. As of iOS 27 that chrome is two separate axes instead of one baked-in style:

```swift
TextField("Search", text: $query)
    .textFieldStyle(.bordered)              // iOS 27.0+, all platforms
    .textInputBorderShape(.capsule)         // .automatic / .capsule / .roundedRectangle
```

`.textFieldStyle(.roundedBorder)` (and macOS's `.squareBorder`) are soft-deprecated -- write "soft-deprecated; use `.bordered`" with no version range, since the stamp on that class of symbol tracks whatever SDK built the docs. Splitting shape out of style is the right decomposition: `.capsule` is the honest way to match a Liquid Glass search field, where the pre-27 answer was a `.plain` field overlaid on a hand-drawn `Capsule`. On an app still supporting iOS 26, gate it:

```swift
if #available(iOS 27, *) {
    field.textFieldStyle(.bordered).textInputBorderShape(.capsule)
} else {
    field.textFieldStyle(.plain)
        .padding(.horizontal, 12).padding(.vertical, 8)
        .background(.quaternary, in: .capsule)
}
```

## Text entry

A comment/bio field should grow with content, not sit in a fixed-height box:

```swift
TextField("Add a note…", text: $note, axis: .vertical)   // iOS 16+
    .lineLimit(1...5)                                      // grows 1 -> 5 lines, then scrolls
```

Return in a vertical `TextField` inserts a newline, not a submit -- ship an explicit Send button rather than relying on `.onSubmit` for a multiline composer. Reserve layout space so a growing field doesn't jump the rows below it:

```swift
Text(placeholder).lineLimit(2, reservesSpace: true)   // iOS 16.0+ -- see version-floor-registry.md#ios-160
```

Bind numbers, currency, and dates through a `FormatStyle`, never a `String` parsed by hand -- SwiftUI rejects junk input at the keyboard, you don't:

```swift
@State private var amount: Decimal = 0
TextField("Amount", value: $amount, format: .currency(code: "USD"))
    .keyboardType(.decimalPad)
```

`TextEditor(text:)` is the fixed-region editor for genuinely long-form text (a message body) -- it has no placeholder and an opaque background by default; pair it with `.scrollContentBackground(.hidden)` inside a `Form`. For anything shorter than a few lines, `TextField(_:text:axis:.vertical)` is lighter and participates in `Form` row sizing without the background fix. For a login/signup `SecureField` -- reveal toggles, `.newPassword` vs. `.password`, the VoiceOver-labeled eye button -- see `references/patterns/09-auth-account.md#credential-field-stack`; a non-auth `SecureField` (an app-lock PIN) needs only the base initializer with no content-type wiring.

**Selectable `Text` now takes real selection gestures.** In apps built with the iOS 27.0 and iPadOS 27.0 SDKs, a `Text` carrying `.textSelection(.enabled)` gets the system text-selection UI -- handles, drag-to-extend -- where before it offered only a callout menu. That is a better reading experience and a silent regression risk: a selectable `Text` that also carries a custom tap or drag gesture can now lose that gesture to the selection handles. Apple's named fix is to raise your gesture's priority:

```swift
Text(article.body)
    .textSelection(.enabled)
    .highPriorityGesture(TapGesture().onEnded { openInlineDefinition() })
```

Put that check on the pre-ship list for any 27-SDK rebuild. The same change makes a custom `TextRenderer` applied with `.textRenderer(_:)` take effect on selectable text, where it was previously dropped -- animated text effects finally compose with selectable body copy.

## Input semantics

Every field needs two coordinated decisions: what AutoFill/QuickType should suggest (`textContentType`) and which keyboard layout appears (`keyboardType`). Shipping only `keyboardType` is the most common miss. This table covers general, non-auth fields -- for the login/signup set (`.username`, `.password`, `.newPassword`, `.oneTimeCode`), see `references/patterns/09-auth-account.md#credential-field-stack`.

| Field | `textContentType` | `keyboardType` |
|---|---|---|
| Full name | `.name` | `.default`, with `.textInputAutocapitalization(.words)` |
| Phone number | `.telephoneNumber` | `.phonePad` |
| URL | `.URL` | `.URL`, with `.autocorrectionDisabled()` |
| Street address | `.fullStreetAddress` | `.default` |
| Postal / ZIP code | `.postalCode` | `.numbersAndPunctuation` |
| Currency amount | `nil` | `.decimalPad`, paired with `TextField(value:format:)` |

`ToolbarItemPlacement.keyboard` (iOS 15+) renders above the software keyboard; `.decimalPad`/`.numberPad`/`.phonePad` have no Return key, so a field on one of them with no dismiss affordance traps the user -- see Focus and keyboard below.

## Focus and keyboard

```swift
enum Field { case name, email }
@FocusState private var focus: Field?
// anywhere: focus = nil lowers the keyboard -- this IS "Done"
```

The old `sendAction(#selector(UIResponder.resignFirstResponder), …)` hack is unnecessary in pure SwiftUI and loses focus bookkeeping. Chain `submitLabel` + `onSubmit` so Return always advances focus, ending in a terminal action on the last field:

```swift
TextField("Name", text: $name).submitLabel(.next)
    .focused($focus, equals: .name).onSubmit { focus = .email }
TextField("Email", text: $email).submitLabel(.go)
    .focused($focus, equals: .email).onSubmit { submit() }
```

`.decimalPad`/`.numberPad`/`.phonePad` fields with no Return key MUST supply a keyboard-toolbar dismiss -- this is a correctness bug, not polish, because the user is otherwise trapped:

```swift
.toolbar {
    ToolbarItemGroup(placement: .keyboard) {
        Spacer()
        Button("Done") { focus = nil }
    }
}
```

`List`/`Form`/`ScrollView` dismiss the keyboard on scroll by default (iOS 16+) -- wrong for a chat composer, right for ordinary browsing. Choose deliberately:

```swift
.scrollDismissesKeyboard(.interactively)   // keyboard follows the drag -- Messages-style
```

For a primary CTA that must stay above the keyboard, use `.safeAreaInset(edge: .bottom)`, never `.overlay` (which ignores keyboard avoidance and gets covered):

```swift
ScrollView { FormContent() }
    .safeAreaInset(edge: .bottom) {
        Button("Continue") { submit() }
            .buttonStyle(.borderedProminent).controlSize(.large)
            .frame(maxWidth: .infinity).padding()
            .background(.bar)
    }
```

Don't auto-focus the first field on a screen whose primary path is Sign in with Apple or a passkey -- the keyboard covers the button the user actually wants. `focus = .field` inside `.onAppear` on a just-pushed or sheeted screen is frequently dropped (the field isn't in the responder chain yet); use `.defaultFocus($focus, .field)` or defer one runloop hop with `Task { focus = .field }`.

## Selection controls

For `Toggle`/`Picker`/`Stepper` row conventions inside a preferences `Form`, see `references/patterns/06-settings.md#row-vocabulary` -- the same controls, styled for settings. In a data-entry form, two additions matter:

| Control | Style | Gotcha |
|---|---|---|
| `Picker` | `.menu` (default, 3-12 options), `.segmented` (2-5 values, always visible), `.tabs` (iOS 27.0+, choosing which content is shown) | `.tag` type must equal the `selection` type EXACTLY, or the picker silently shows nothing selected -- the most common `Picker` bug |
| `DatePicker` | `.compact` (default, tappable field), `.graphical` (inline calendar), `.wheel` | `.field`/`.stepperField` are macOS-only -- never on iOS. Constrain with `in: Date.now...` (no past) or `in: ...Date.now` (no future) |
| `ColorPicker` | System swatch row; the system sheet owns the picking UI | iOS 14.0+ (iPadOS/Catalyst 14.0, macOS 11.0, visionOS 1.0) -- **no tvOS, no watchOS**. Pass `supportsOpacity: false` whenever a transparent result would be invalid |
| `Slider` | `step:` snaps to increments | pair a discrete snap with `.sensoryFeedback(.selection, trigger:)` (`references/haptics/02-swiftui-sensory-feedback.md#built-in-feedback-types`) |

```swift
DatePicker("Due", selection: $date, displayedComponents: [.date, .hourAndMinute])
    .datePickerStyle(.compact)

ColorPicker(selection: $tagColor, supportsOpacity: false) {   // Binding<CGColor>
    Text("Tag Color")                                          // the system sheet titles itself from this
}
```

`ColorPicker`'s label view is not decoration: the system color-picker sheet takes its title from it, so an icon-only or empty label leaves the sheet titled with nothing and leaves VoiceOver announcing a swatch with no purpose. Give it real text. `supportsOpacity` defaults to `true`; leave it on only where a semi-transparent color is a legal value for the thing being colored -- a tag, a label, or a theme accent that will be composited over unknown content should pass `false`, or the user can pick a color that renders invisible. Color is never the only channel: a color chosen here must be paired with a name, symbol or text label somewhere the user can read (`references/accessibility/03-visual-accessibility.md#color-is-never-the-only-indicator`).

Write a `ToggleStyle`/`ButtonStyle` conformance instead of faking a control from `Rectangle` + `.onTapGesture` -- a hand-rolled control loses VoiceOver traits, Full Keyboard Access, and the system's 44pt guarantee for free (`references/accessibility/04-motor-interaction.md#touch-targets`).

## Validation UX

Validate on blur and on submit, never on every keystroke -- reddening a field while the user is mid-typing their email reads as a broken app:

```swift
TextField("Email", text: $email)
    .focused($focus, equals: .email)
    .onChange(of: focus) { old, _ in
        if old == .email { emailError = validateEmail(email) }   // validate when focus LEAVES
    }
```

Keep the field border neutral until first commit; put the error in the Section footer (red), not a floating `Text`. Disable the primary CTA until the form is valid, and let the footer answer "why is Save greyed out":

```swift
Button("Save") { save() }.disabled(!formIsValid)
```

On a failed submit, move focus to the first invalid field and fire `.sensoryFeedback(.error, trigger: submitAttempts)`; on success, `.sensoryFeedback(.success, trigger:)` then dismiss -- see `references/patterns/04-loading-empty-error.md#success` for the full submit -> loading -> result treatment this validation flow feeds into.

A submit failure that has to interrupt -- a server rejection, a conflict -- binds its alert to the error itself, not to a `Bool` beside it. Building with Xcode 27, `alert(error:actions:)` takes a `Binding<E?>` where `E: LocalizedError` and runs back to iOS 15, so there is no availability gate and no second piece of state to drift:

```swift
@State private var submitError: SubmitError?     // SubmitError: LocalizedError

form
    .alert(error: $submitError) {
        Button("Try Again") { Task { await submit() } }
        Button("Cancel", role: .cancel) { }
    }
```

`references/patterns/05-modality-sheets.md#alerts` owns the full item- and error-driven modifier set.

### Protecting unsaved work

A form's job is not finished when it validates. Two dismissal paths can throw the work away, and they need different guards: the swipe-down on a sheet, and an iPad window closing. `interactiveDismissDisabled(hasChanges)` covers the first; `dismissalConfirmationDialog(_:shouldPresent:actions:)` (iOS 27.0+, iOS/iPadOS/Catalyst; macOS 15.0) covers the second, and is the system's own confirm-before-discard hook rather than a hand-built interstitial:

```swift
@available(iOS 27, *)
private func guardingWindowClose(_ form: some View) -> some View {
    form.dismissalConfirmationDialog("Discard this draft?", shouldPresent: hasChanges) {
        Button("Discard", role: .destructive) { discard() }
    }
}
```

`references/patterns/05-modality-sheets.md#drag-to-dismiss-and-interactivedismissdisabled-ethics` shows the gated call site; below iOS 27 the swipe guard is the whole guard, because iOS has no window-close hook before then. A long or high-cost form should autosave a draft rather than rely on either dialog -- a confirmation the user dismisses by accident still loses the work. `references/usability/02-forms-and-error-recovery.md` owns the data-loss method; this is the API for it.

One sizing note for a form presented in a sheet: in apps built with the 27.0 SDKs, `controlSize`, `buttonSizing`, `buttonRepeatBehavior`, `menuIndicatorVisibility` and `ButtonBorderShape` reset to their defaults inside sheets and popovers instead of inheriting from the presenter. A sheeted form whose `.controlSize(.large)` came from the app root reverts to default-sized controls on an Xcode 27 rebuild -- set control sizing inside the sheet's own content.

## Accessibility contract

`Form`/`Section`/`LabeledContent` inherit Dynamic Type reflow for free (`references/accessibility/02-dynamic-type-adaptation.md`); the obligation is yours only for rows you build outside these containers. Any hand-rolled control (a custom toggle, a tap-to-reveal button) needs the 44pt minimum from `references/accessibility/04-motor-interaction.md#touch-targets`, an explicit VoiceOver label if it's icon-only, and Full Keyboard Access support (`.focusable(interactions: .activate)`). A field-validation footer swap is a discrete state change, not continuous motion, and carries no Reduce Motion obligation on its own -- but if you animate the footer's appearance (`withAnimation { emailError = ... }`), route it through the standard double-gate (`references/accessibility/05-motion-accessibility.md#accessibility-contract`).

## Anti-patterns

| Wrong | Why it fails | Right |
|---|---|---|
| `VStack` of `TextField`s instead of `Form` | Forfeits free insets, separators, Dynamic Type row growth | `Form { Section { … } }` |
| Floating hand-positioned red error `Text` | Inconsistent placement, no VoiceOver pairing with the field | Section `footer:` |
| `HStack { Text; Spacer(); Text }` for a read-only row | Loses the automatic "label: value" VoiceOver pairing | `LabeledContent(_:value:)` |
| `.textFieldStyle(.roundedBorder)` inside a `Form` | Double-borders the row; the style is soft-deprecated regardless | No style inside a `Form`; `.bordered` + `.textInputBorderShape(_:)` outside one |
| A `Bool` beside an optional error to drive a submit-failure alert | The two drift; the alert renders stale or empty text | `alert(error:)` with one `Binding<E?>` (Xcode 27, runs back to iOS 15) |
| A `ColorPicker` with an icon-only or empty label | The system sheet has no title and VoiceOver announces a purposeless swatch | Give the label real text |
| `supportsOpacity: true` where transparency is not a legal value | The user can pick a color that renders invisible | `supportsOpacity: false` |
| Selectable `Text` carrying a custom tap/drag gesture, unprioritized | The 27.0-SDK selection UI takes the gesture | `.highPriorityGesture(_:)` on the custom gesture |
| Validating on every keystroke | Field flashes red mid-typing, reads as broken | Validate on blur (`onChange(of: focus)`) + on submit |
| `.decimalPad`/`.numberPad` with no dismiss affordance | No Return key on these layouts -- traps the user | Keyboard-toolbar `Button("Done") { focus = nil }` |
| Primary CTA in `.overlay` | Ignores keyboard avoidance, gets covered | `.safeAreaInset(edge: .bottom)` |
| `Picker` with a `.tag` type that doesn't match `selection` | Silently shows nothing selected | Match the tag type to the selection type exactly |
| Number bound to `String`, parsed by hand | Rejects nothing, silently mis-parses | `TextField(_:value:format:)` |

## Severity guide

CRITICAL: a numeric-keyboard field with no dismiss affordance traps the user with no way forward. HIGH: a `Picker` tag-type mismatch that silently shows no selection in a shipping form. MEDIUM: validating on every keystroke, or a growing `TextField` with no `reservesSpace` causing layout jump. LOW: a read-only row built as `HStack` instead of `LabeledContent`.

## See also

- `references/patterns/04-loading-empty-error.md#success` -- the submit -> loading -> result treatment this file's validation flow feeds into
- `references/patterns/05-modality-sheets.md#alerts` -- the item- and error-driven `alert`/`confirmationDialog` modifier set
- `references/usability/02-forms-and-error-recovery.md` -- the data-loss and recovery method these APIs implement
- `references/patterns/09-auth-account.md#credential-field-stack` -- the login/signup field contract this file deliberately excludes
- `references/patterns/06-settings.md#row-vocabulary` -- the same `Toggle`/`Picker`/`Stepper` controls styled for a preferences screen
- `references/haptics/02-swiftui-sensory-feedback.md#built-in-feedback-types` -- `.selection`/`.error`/`.success` triggers for controls and submit
- `references/accessibility/04-motor-interaction.md#touch-targets` -- 44pt floor for any hand-rolled control
- `references/accessibility/05-motion-accessibility.md#accessibility-contract` -- the Reduce Motion double-gate for animated validation state
