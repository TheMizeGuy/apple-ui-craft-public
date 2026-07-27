# Forms and Error Recovery

> Owner: `references/usability/02-forms-and-error-recovery.md` owns validation timing, error copy, focus on failure, the confirm-versus-undo decision, partial failure, and data-loss prevention. `references/patterns/02-forms-data-entry.md` owns the form CONTROLS (which picker, which field style, `Form` structure); this file owns what happens when the person gets it wrong or the system does. Cite, don't restate.
> Floors: `@FocusState` iOS 15.0+, `.submitLabel` iOS 15.0+, `.confirmationDialog` iOS 15.0+, `.alert(_:isPresented:actions:message:)` iOS 15.0+, `.textContentType(.oneTimeCode)` iOS 12.0+, `.scrollDismissesKeyboard` iOS 16.0+, `.defaultFocus` iOS 17.0+ (`references/_scaffolding/version-floor-registry.md`).

A form is the place where an app is most likely to destroy work it did not
create. Every rule below exists because some app somewhere threw away twenty
minutes of typing and reported nothing.

## The Apple way

1. **Validate on submit, and on blur for fields with a knowable format.** Never
   on every keystroke: the field is wrong until it is finished, and telling the
   user so while they type is scolding, not helping.
2. **An error names the cause and the next action.** "Invalid input" names
   neither.
3. **Focus moves to the first failed field.** On iOS this is `@FocusState`, and
   it is also what moves VoiceOver.
4. **Irreversible work is confirmed. Reversible work is undoable. Choose one,
   never neither.**
5. **The keyboard is a design element.** The wrong keyboard type is a defect,
   and a number pad with no way to dismiss it is a trap.

## 1. Validation timing

| Timing | Use for | Never |
|---|---|---|
| On submit | Everything | -- |
| On blur (`@FocusState` change) | Fields with a checkable format: email, card, postcode, date | Fields where the valid set is unknown until submit (username availability is a network call, not a format) |
| Live, as typed | Positive-only affordances: password strength meter, character counter, format masking | Showing an error before the first blur |
| Debounced network check | Availability, uniqueness | Blocking submit on an in-flight check with no feedback |

```swift
enum Field: Hashable { case email, password, confirm }

struct SignUpView: View {
    @FocusState private var focused: Field?
    @State private var emailError: String?

    var body: some View {
        Form {
            TextField("Email", text: $model.email)
                .focused($focused, equals: .email)
                .textContentType(.emailAddress)
                .keyboardType(.emailAddress)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .submitLabel(.next)
                .onChange(of: focused) { old, _ in
                    // Validate on BLUR of this field, not on every keystroke.
                    if old == .email { emailError = model.validateEmail() }
                }
            if let emailError {
                Text(emailError)
                    .font(.footnote)
                    .foregroundStyle(.red)
                    .accessibilityLabel("Email error: \(emailError)")
            }
        }
        .onSubmit { advance() }
    }
}
```

**The error text must be associated with the field for VoiceOver.** A red
`Text` below a field is a separate element; a VoiceOver user hears the field,
then hears an unrelated sentence. Either combine them
(`.accessibilityElement(children: .combine)` on the pair) or set the field's
`accessibilityValue` to include the error.

## 2. Error message content

Every error answers three questions. Missing any one of them is a finding.

| Question | Bad | Good |
|---|---|---|
| What happened | "Error" | "Card declined" |
| Why | (absent) | "Your bank rejected the charge" |
| What now | (absent) | "Try another card, or contact your bank" |

| Rule | Detail |
|---|---|
| No error codes as the headline | `ERR_4013` may appear as secondary detail, never as the message |
| No blame | "You entered an invalid date" becomes "Enter a date after today" |
| No raw `Error.localizedDescription` in user-facing copy | It leaks framework vocabulary ("The operation couldn't be completed") |
| Localized, and length-tolerant | German runs ~35% longer; the alert must not truncate |
| Actionable in the user's vocabulary | "Endpoint unreachable" becomes "Can't reach the server" |

```swift
// Map transport failures to user-facing recovery, once, in one place.
extension AppError {
    var message: String {
        switch self {
        case .offline:      String(localized: "You're offline. Your changes are saved and will send when you reconnect.")
        case .timeout:      String(localized: "The server took too long. Try again.")
        case .unauthorized: String(localized: "Your session expired. Sign in to continue.")
        case .conflict:     String(localized: "Someone else edited this. Review the differences before saving.")
        case .rateLimited(let retryAfter):
                            String(localized: "Too many requests. Try again in \(retryAfter) seconds.")
        }
    }
}
```

## 3. Inline errors, summaries, and where focus goes

| Requirement | Rule |
|---|---|
| Inline | Every failed field shows its own error, adjacent to it |
| Summary | Any form over one screen also shows a summary at the submit site |
| Focus | On failed submit, focus moves to the first failed field |
| Scroll | The focused field is scrolled into view above the keyboard |
| Nothing retyped | A failed submit never clears a field, including secure fields |
| Announcement | VoiceOver is told the submit failed and how many fields failed |

```swift
func submit() {
    let failures = model.validateAll()
    guard failures.isEmpty else {
        focused = failures.first                       // moves keyboard AND VoiceOver focus
        UIAccessibility.post(notification: .announcement,
                             argument: String(localized: "\(failures.count) fields need attention"))
        return
    }
    Task { await save() }
}
```

**Collapsed sections hide errors.** A `DisclosureGroup` or a `Section` behind a
picker that contains a failed field must expand on failure. A user staring at a
submit button that does nothing, with the error two taps away, will conclude the
app is broken.

## 4. Required and optional marking

| Rule | Detail |
|---|---|
| Mark the minority | If most fields are required, mark the optional ones; do not asterisk fifteen of eighteen |
| Never colour alone | An asterisk in red is a colour-only signifier for the colour-blind; the asterisk itself carries it |
| Say it in the accessibility label | `.accessibilityLabel("Email, required")` |
| Do not disable submit to signal incompleteness | See section 6 of `references/usability/04-states-feedback-and-affordances.md`; a disabled button with no explanation is the single most common dead end in a form |

## 5. Input types, keyboards, and autofill

The iOS-specific section, and the one most often wrong.

| Content | `keyboardType` | `textContentType` | Notes |
|---|---|---|---|
| Email | `.emailAddress` | `.emailAddress` | Also `.textInputAutocapitalization(.never)` and `.autocorrectionDisabled()` |
| Password (sign in) | default | `.password` | Enables the AutoFill key |
| Password (sign up) | default | `.newPassword` | Plus `passwordRules`, so Keychain proposes a conforming password |
| One-time code | `.numberPad` | `.oneTimeCode` | This is what makes the SMS code appear above the keyboard |
| Phone | `.phonePad` | `.telephoneNumber` | Never `.numberPad`: it lacks `+`, `*`, `#` |
| Card number | `.numberPad` | `.creditCardNumber` | |
| Postal code | `.numbersAndPunctuation` | `.postalCode` | Not `.numberPad`: many locales use letters |
| Name | default | `.name`, `.givenName`, `.familyName` | |
| Street address | default | `.fullStreetAddress` | |
| URL | `.URL` | `.URL` | |
| Search | default | -- | `.submitLabel(.search)` |
| Quantity, integer | `.numberPad` | -- | Provide a dismiss path; see below |
| Money, decimal | `.decimalPad` | -- | The separator is locale-dependent; never parse with a hardcoded `.` |

**`.numberPad` and `.decimalPad` have no return key.** A screen whose only text
field uses one, with no toolbar Done button, no tap-to-dismiss, and no
`.scrollDismissesKeyboard`, traps the keyboard over the submit button. This is a
HIGH finding and it ships constantly.

```swift
.toolbar {
    ToolbarItemGroup(placement: .keyboard) {
        Spacer()
        Button("Done") { focused = nil }
    }
}
// or, for a scrolling form:
.scrollDismissesKeyboard(.interactively)
```

| Autofill defect | Consequence |
|---|---|
| Missing `.textContentType` on personal-data fields | AutoFill and Keychain are dead; every sign-in is typed by hand |
| `.oneTimeCode` missing on a verification field | The user leaves the app to read the SMS, which backgrounds and may terminate the flow |
| Paste blocked on a password or OTP field | Password managers cannot fill it; this is an accessibility barrier, not a security control |
| `.newPassword` without `passwordRules` | Keychain proposes a password the server rejects, after the user accepted it |

## 6. Preventing data loss

| Trigger | Required behaviour |
|---|---|
| Sheet swipe-dismiss with unsaved content | `.interactiveDismissDisabled(true)` plus a confirmation, plus a visible Cancel |
| Navigation back with unsaved content | Confirm, or autosave |
| Backgrounding | Persist on `scenePhase` change; do not wait for a save button |
| Termination | The draft is on disk; see `references/usability/01-task-flows-and-journeys.md` section 4 |
| Failed submit | Every field retains its value, including secure fields |
| Session expiry mid-form | The draft survives re-authentication |

```swift
.interactiveDismissDisabled(draft.hasUnsavedContent)
.confirmationDialog("Discard this draft?", isPresented: $isConfirmingDiscard, titleVisibility: .visible) {
    Button("Discard", role: .destructive) { draft.clear(); dismiss() }
    Button("Keep Editing", role: .cancel) { }
} message: {
    Text("Your changes will be lost.")
}
```

**A disabled dismiss with no Cancel button is a trap and is worse than the data
loss it prevents.** Guarding the gesture obliges you to provide the exit.

## 7. Destructive actions: confirm, or undo, or both

Choose on two axes: reversibility and blast radius.

| Reversible? | Blast radius | Treatment |
|---|---|---|
| Yes, cheaply | One item | Undo affordance, no confirmation |
| Yes, cheaply | Many items | Undo, and state the count |
| No | One item | Confirmation naming the item |
| No | Many items | Confirmation naming the count, and typed confirmation past a threshold |
| No | Account, or all data | Confirmation plus re-authentication |

```swift
// Irreversible, one item: name the item, not "this item".
.confirmationDialog("Delete \(workout.name)?", isPresented: $isConfirming, titleVisibility: .visible) {
    Button("Delete", role: .destructive) { delete(workout) }
    Button("Cancel", role: .cancel) { }
} message: {
    Text("This can't be undone.")
}
```

| Rule | Detail |
|---|---|
| The destructive button carries `role: .destructive` | It gets the red treatment and the correct VoiceOver trait for free |
| The cancel button carries `role: .cancel` | It gets the escape behaviour |
| `.confirmationDialog` for a choice, `.alert` for a stop | An alert that offers three actions is a dialog wearing an alert |
| Bulk actions state the count | "Delete 47 workouts?", never "Delete items?" |
| Undo lasts at least 8 seconds | Shorter than a glance away |
| Undo RESTORES, it does not RECREATE | A recreated record has a new id, a new timestamp, and a broken relationship graph |
| Swipe-to-delete is a destructive action | It needs undo, or `.confirmationDialog` on the swipe, for anything not trivially recoverable |

```swift
// SwiftData and Core Data both give you real undo. Use it instead of hand-rolling.
@Environment(\.undoManager) private var undoManager
// ModelContainer(for: Item.self, configurations: .init(isUndoEnabled: true))
```

## 8. Partial failure

The failure mode nobody designs. A bulk operation where some items succeeded.

| Requirement | Rule |
|---|---|
| Never report "some items failed" | Name which, or give a count with a way to see them |
| The successes are not rolled back silently | Say what landed |
| Retry applies to the failures only | Re-sending the successes duplicates them |
| The list reflects reality immediately | Not after a pull-to-refresh |

```
Sent 45 of 47 invitations.
2 failed: alex@example.com (already a member), sam@example.com (invalid address)
[Retry 2 failed]  [Done]
```

## 9. Recovery from every failure state

Enumerate. Each row needs a designed screen, not a generic alert.

| Failure | Recovery |
|---|---|
| Offline | Cached content, marked as cached; queued writes; automatic retry on reconnect |
| Timeout | Retry, with the input intact |
| Server 5xx | Retry, and a path that does not need retry (contact, or a cached view) |
| Auth expired | Re-authenticate and RETURN to the task, not to the root |
| Permission denied | What still works without it, plus a Settings link |
| Conflict | Show both versions; never silent last-write-wins |
| Rate limited | State when to retry; disable the control until then |
| Quota exceeded | State the limit and the upgrade or cleanup path |
| Background task expired mid-submit | The write is durable, or the user is told it did not send |
| Crash mid-form | The draft is on disk |

**Silent last-write-wins on a conflict is a CRITICAL finding.** The user's
colleague's work vanished and nobody was told.

## 10. Submission state

| Moment | Required |
|---|---|
| Tap | Immediate visual response, under 100ms |
| In flight | The control shows progress and is disabled against re-entry |
| Success | An outcome confirmation, not merely a dismissal |
| Failure | The error, the input intact, and retry |

```swift
// Guards double-submit, which a bare Task {} does not.
Button {
    guard !isSubmitting else { return }
    isSubmitting = true
    Task {
        defer { isSubmitting = false }
        await submit()
    }
} label: {
    if isSubmitting { ProgressView() } else { Text("Send") }
}
.disabled(isSubmitting)
```

An outcome with no visible result needs a confirmation: a copy, a save, a
send-in-background. A pressed state is not a confirmation, because it says the
button was tapped, not that the thing happened. `.sensoryFeedback(.success,
trigger:)` is a good half of the answer and never the whole of it.

## 11. Detection procedures

Source-only review:

```bash
# Fields with no content type -- AutoFill is dead on every one of these
grep -rn "TextField(\|SecureField(" --include=*.swift . | grep -v textContentType
# Number pads with no dismissal path
grep -rln "numberPad\|decimalPad" --include=*.swift . \
  | xargs grep -Ln "placement: .keyboard\|scrollDismissesKeyboard\|onTapGesture"
# Destructive actions with no confirmation and no undo
grep -rn "role: .destructive\|\.onDelete\|modelContext.delete\|\.delete(" --include=*.swift .
# Sheets carrying input with no dismiss guard
grep -rln "\.sheet(" --include=*.swift . | xargs grep -Ln "interactiveDismissDisabled"
# Raw error text reaching the UI
grep -rn "localizedDescription" --include=*.swift .
# Submit paths with no in-flight guard
grep -rn -A3 "Button {" --include=*.swift . | grep -B1 "Task {"
```

Driven review: submit empty, submit garbage, submit valid then kill the network
mid-flight, background during submit, swipe-dismiss the sheet with content in
it, double-tap submit, and rotate the device with the keyboard up.

## Accessibility contract

- Error text is associated with its field, not floating beside it.
- Submit failure is announced, with a count.
- `@FocusState` moves VoiceOver as well as the keyboard; use it rather than
  scrolling manually.
- Required state is in the accessibility label, not only in a red asterisk.
- `role: .destructive` and `role: .cancel` carry traits the custom-styled
  equivalents do not.
- WCAG 2.2: 3.3.1 Error Identification, 3.3.2 Labels or Instructions, 3.3.3
  Error Suggestion, 3.3.4 Error Prevention, 3.3.7 Redundant Entry, 3.3.8
  Accessible Authentication (paste must work).

## Anti-patterns

| Wrong | Why it fails | Right |
|---|---|---|
| Validating on every keystroke | Scolds the user mid-word | Validate on blur and on submit |
| "Invalid input" | Names neither cause nor action | Name both |
| Surfacing `localizedDescription` | Leaks framework vocabulary | Map to app-level recovery copy |
| No `textContentType` | Kills AutoFill and Keychain | Set it on every personal-data field |
| `.numberPad` with no Done | Traps the keyboard over the submit button | Keyboard toolbar, or interactive dismiss |
| Blocking paste on password or OTP | Breaks password managers; WCAG 3.3.8 | Allow paste |
| Disabled submit with no reason given | The user cannot tell what is missing | Enable it and validate on tap, or state what is missing |
| "Some items failed" | Unactionable | Name them, retry only those |
| Silent last-write-wins | Destroys someone's work invisibly | Detect and present the conflict |
| Undo that recreates | New id, broken relationships | Restore the original object |
| Confirmation AND no undo on a cheap reversible action | Friction with no benefit | Undo alone |
| Neither confirmation nor undo on an irreversible one | Unrecoverable loss | Confirm, naming the object |

## Severity guide

| Severity | Example |
|---|---|
| CRITICAL | Irreversible destruction with neither confirmation nor undo; silent last-write-wins; a failed submit that clears the form; paste blocked on a password field |
| HIGH | Error with no next action; focus not moved to the first failure; sheet dismiss discarding a draft; number pad with no dismissal; missing `textContentType` on a sign-in form; partial failure reported as "some items failed"; no recovery path for offline or auth expiry |
| MEDIUM | Validation on every keystroke; required fields marked by colour alone; bulk action without a count; undo under 8 seconds; collapsed section hiding an error |
| LOW | Error copy that blames the user; missing `submitLabel`; asterisks on fifteen of eighteen fields |
| NIT | Wording preference in an otherwise complete error |

## See also

- `references/patterns/02-forms-data-entry.md` -- which control, which field style, `Form` structure
- `references/usability/01-task-flows-and-journeys.md` -- carried state, break tests, dead ends
- `references/usability/04-states-feedback-and-affordances.md` -- the complete state set, latency budgets
- `references/patterns/04-loading-empty-error.md` -- `ContentUnavailableView`, the load-state model
- `references/patterns/09-auth-account.md` -- Sign in with Apple, session expiry
- `references/accessibility/01-voiceover-fundamentals.md` -- announcements and focus
- `references/review/01-finding-format.md` -- the canonical finding template
