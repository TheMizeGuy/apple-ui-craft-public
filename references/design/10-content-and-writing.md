# Content Design & Microcopy

> Owner: this file owns voice/tone, capitalization, punctuation, and the wording of buttons, labels, empty states, errors, permission prompts, and alerts. `references/patterns/04-loading-empty-error.md` owns the `ContentUnavailableView`/`LoadState` view APIs those empty/error copies live inside -- this file governs the words, not the chrome. `references/design/12-text-rendering.md` owns truncation/fitting APIs; this file governs what to write so truncation never cuts the meaning.
> Floors: cite `references/_scaffolding/version-floor-registry.md` for anything version-gated. Every API here is evergreen (iOS 13-16 floors) unless stated otherwise inline.

Microcopy is not decoration applied at the end -- the words are the interface. An app with correct layout and wrong words still reads as unfinished; a plain layout with precise, consistent copy reads as considered. This file is the single place to check "did they get the words right," parallel to how design/02 is the single place for glass and design/03 is the single place for type.

## The Apple way

- **Voice is constant, tone flexes.** Voice is who your app is (friendly, precise, playful). Tone is how it speaks in *this* moment -- celebratory on success, calm and blame-free on error. Same app, different tone per state, never a different personality.
- **Address the user as "you"; refer to the app as "we" sparingly.** Prefer the imperative for actions the user takes ("Choose a photo") over "We need you to choose a photo."
- **Be concise and concrete.** Cut hedge words ("simply," "just," "please" in most UI). "Send," not "Fire off," not "Please tap here to send your message."
- **Never blame the user.** "That password didn't match," not "You entered the wrong password." This is the one place passive/neutral phrasing beats active voice.
- **No jargon, no idiom in primary actions.** Idioms don't localize and fail plain-language cognitive accessibility -- "Send," not "Fire off."
- **Pick one capitalization style per element type and use it uniformly.** Inconsistency is the tell of an unfinished app.

## Button and action labels

HIG Buttons: "consider starting the label with a verb... using title-style capitalization." HIG Alerts: button titles "succinct, logical, typically one or two words... verbs or verb phrases that directly relate to the alert text."

- **Name the action, never "OK/Yes/No."** Destructive confirm: title = the verb ("Delete," "Discard Changes"), not "OK." The alert body asks the question; the buttons answer with verbs -- this also makes VoiceOver's button announcement self-describing out of context.
- **"Cancel" is reserved.** Always use "Cancel" for buttons that stop an action; never rename it "Nevermind"/"Back."
- **Match the trigger.** A button that opens a sheet titled "Add Item" should say "Add Item," not "New" -- reduces the user's translation cost.
- Bad → Good: `OK` → `Delete Draft`; `Submit` → `Send`/`Save`/`Continue`; `Click Here` → `View Report`; `Yes` (in "Delete this?") → `Delete`.

```swift
// iOS 15.0+
.alert("Delete this draft?", isPresented: $confirmingDelete) {
    Button("Delete", role: .destructive) { deleteDraft() }
    Button("Cancel", role: .cancel) { }
} message: {
    Text("This draft will be permanently deleted.")   // consequence, blame-free, full sentence + period
}
```

Good: title "Discard Changes?" · buttons "Discard" / "Keep Editing." Bad: title "Warning" · buttons "OK" / "Cancel" (OK answers nothing; VoiceOver can't tell which is destructive out of context). Use `confirmationDialog` (action sheet) when there are 2+ real choices or the action is destructive-from-a-list; keep the same verb-first button rule.

## Capitalization -- the decision table

| Element | Style | HIG source |
|---|---|---|
| Buttons, alert buttons, menu items, alert titles | **Title Case**, no ending period | Buttons / Alerts pages |
| Alert *message* body (sentences) | **Sentence case**, full punctuation | Alerts page |
| Tooltips / help text | **Sentence case**, omit ending period unless multi-sentence | Offering-help page |
| Widget descriptions | **Sentence case**, start with an action verb | Widgets page |
| Labels, list rows, most body content | Sentence case | Writing page |

Title Case in Apple's sense = capitalize first/last word + all principal words; lowercase articles/short prepositions/conjunctions (a, an, the, and, or, for, to, with...). "Add to Reading List," not "Add To Reading List."

Never SHOUT: all-caps is a *styling* choice applied by the system (`.textCase(.uppercase)`), not something you type. Type the string in normal case; let the modifier transform it so Dynamic Type, localization, and VoiceOver get the real word. To opt a `Form`/`List`/`Section` header out of automatic uppercasing, use `.textCase(nil)` -- do not retype the header in lowercase.

```swift
func textCase(_ textCase: Text.Case?) -> some View   // iOS 13.0+
```

## Punctuation

- **No ending periods** on labels, buttons, titles, single-sentence hints, or menu items. Periods belong in multi-sentence body copy and alert messages.
- **Ellipsis (…) means "more input required before the action happens."** A menu item/button that opens further UI before acting gets a trailing `…`: "Export…," "Move to…." A button that acts immediately does NOT. Use the real ellipsis character U+2026, never three periods.
- **Real punctuation glyphs:** curly quotes ' ' " " (U+2018/2019/201C/201D) and the em dash character (U+2014), not straight ASCII or a double hyphen. `Text` renders whatever is in the string; put the correct glyphs in the String Catalog. VoiceOver reads punctuation correctly only with real glyphs.

## Empty, error, and permission copy

Each `ContentUnavailableView` cause (never-had-data / filtered-to-zero / no-scope) is a distinct COPY problem, not one generic template:

| Cause | Title (title case) | Description (sentence case) | Action |
|---|---|---|---|
| Never had data | "No Bookmarks" | "Bookmarks you save will appear here." | "Add Bookmark" (verb-first CTA) |
| Filtered to zero (`.search`) | -- | echoes the query: "No results for 'foo'." | offer "Clear Search," no create CTA |
| No scope selected | "Choose a Workspace" | "Select a workspace to see its items." | picker, not an error |

Good empty description tells the user what will fill this space and how. Bad = "No data"/"Empty" (dead end, no path forward). Never put a Retry button on a never-had-data empty state -- nothing failed.

**Error copy is blame-free, specific, actionable, and never shows an error code.** Say what happened + what to do, in the user's terms. Good: "You're offline. Check your connection and try again." Bad: "Error -1009" / "URLError.notConnectedToInternet" / "Something went wrong." Offline vs server vs unknown is a COPY decision on the same chrome: offline → user can self-fix; server → "Our servers are having trouble. Try again in a moment."; unknown → generic + Retry. Reserve the generic message for genuinely unclassifiable failures. Conform errors to `LocalizedError` (`errorDescription`, `recoverySuggestion`) so `error.localizedDescription` is a real sentence, never a Swift type dump.

**Permission-prompt copy is content you must write.** `Info.plist` usage strings (`NSCameraUsageDescription`, `NSLocationWhenInUseUsageDescription`, `NSPhotoLibraryAddUsageDescription`) are shipped microcopy Apple requires -- App Review rejects generic ones. Formula: state the benefit to the user, in one sentence, referencing the concrete action. Good: "Lets you attach photos to your notes." Bad: "This app needs photo access." Prime before you prompt: show your own explanatory screen (your words, your button) BEFORE calling the system request -- the OS dialog is one-shot and unstyleable, and a denied prompt is expensive to recover. Request at the point of use ("just-in-time") so the purpose string reads true at that exact moment.

## Numbers, dates, lists as content

A hand-built `"\(count) items"` string is a localization bug and a VoiceOver bug. Rule: never `String` + `\(n)` for user-facing values; always a `FormatStyle`.

```swift
// iOS 15.0+
price.formatted(.currency(code: "USD"))                      // "$1,234.50" -- never prepend "$" yourself
date.formatted(.relative(presentation: .named))               // "yesterday", "2 weeks ago"
["A","B","C"].formatted(.list(type: .and))                    // "A, B, and C" -- locale-correct conjunction
Text(order.total, format: .currency(code: order.currencyCode)) // reactive + localized inside the view
```

Plurals are a DATA problem solved in the String Catalog, not a code branch. String Catalog "Vary by Plural" (author `%lld` in the key, add zero/one/other variants per language) or inline Automatic Grammar Agreement:

```swift
Text("^[\(count) photo](inflect: true) selected")   // "1 photo selected" / "5 photos selected"
```

Anti-pattern: `Text(count == 1 ? "1 item" : "\(count) items")` -- breaks in languages with dual/paucal/many forms (Arabic, Polish, Russian) and duplicates logic per string.

**Translator comments are load-bearing content design -- ship them.** The same English word ("Home," "Book") translates differently by role:

```swift
Text("Explore", comment: "Title of the tab that navigates to the Explore screen.")
Text("Book", comment: "Verb -- button that reserves a table. Not the noun.")
```

## LabeledContent -- content for a label/value pair

`LabeledContent` (iOS 16.0+) pairs a label with a value for settings rows, detail screens, and forms; the initializer's title parameter follows the same sentence-case labels rule as any other row label:

```swift
LabeledContent("Storage Used", value: order.bytesUsed, format: .byteCount(style: .file))
LabeledContent("Wi-Fi") { Text(networkName).foregroundStyle(.secondary) }
```

VoiceOver combines label and value into a single announcement ("Storage Used, 2.1 gigabytes"), so writing a precise label here does double duty as visible copy and accessible copy -- do not add a redundant `.accessibilityLabel`.

## Truncation is a content decision, not just an API

Truncation modifiers (`lineLimit`, `truncationMode`, `minimumScaleFactor`) live in `references/design/12-text-rendering.md#controlling-how-text-fits`; what you WRITE determines whether truncation reads as broken. Front-load the word that must survive: a tail-truncated "Confirm Your Emai…" loses the actionable word if it were "Please Confirm Your…"; a title starting with the noun that matters survives a cut. For values that must show in full (amounts, timers), prefer shrinking (`minimumScaleFactor`) or restructuring the label over accepting a truncated number -- a truncated dollar amount is a content bug, not a layout nit.

## Terminology consistency

Pick ONE term per concept and use it everywhere (nav title, button, empty state, alert, settings, VoiceOver). "Delete" vs "Remove" vs "Trash" for the same act confuses users and bloats the String Catalog. Maintain a tiny glossary; the String Catalog is the enforcement surface (one key, reused).

## Inclusive and respectful language

- **Address people, not conditions:** person-first where appropriate; avoid ableist idiom ("crazy," "sanity check," "dummy value" → "wild," "quick check," "placeholder value") in user-facing text.
- **Gender-neutral by default:** "they/them" for an unknown user; avoid "guys." Don't assume relationships/roles.
- **Don't hard-code names/pronouns/honorifics** -- derive from user data; many locales need grammatical gender agreement.
- **Culturally neutral examples and placeholders:** avoid US-centric formats in sample data; let `FormatStyle` localize dates/numbers/currency.
- **Leading/trailing, not left/right:** prefer "select"/"choose" over "tap/click" for cross-input and accessibility; use directional (leading/trailing, forward/back) not absolute left/right -- also an RTL and SF Symbol mirroring rule, owned by `references/accessibility/06-localization-rtl.md`.

## Accessibility contract

Every pattern above IS the VoiceOver experience -- a verb-first button, a specific error sentence, and a benefit-first onboarding line are read verbatim; good copy removes the need for a separate `.accessibilityLabel`. Add `.accessibilityLabel` only when the visible text is an abbreviation/symbol/number the synthesizer would mangle. Never write `.accessibilityLabel("Settings button")` -- the `.isButton` trait already appends "button" (see `references/accessibility/01-voiceover-fundamentals.md#accessibility-labels`). This file carries no motion; nothing here needs Reduce Motion gating.

## Anti-patterns

| Wrong | Why it fails | Right |
|---|---|---|
| `Text("Error: " + error.localizedDescription)` dumping a raw error | Exposes internals, unreadable, unlocalized | Blame-free sentence via `LocalizedError` |
| `Text(count == 1 ? "1 item" : "\(count) items")` | Breaks in dual/paucal/many-form languages | `^[\(count) item](inflect: true)` or String Catalog plural variants |
| Alert buttons "OK" / "Cancel" on a destructive confirm | VoiceOver can't tell which button is destructive out of context | Verb-first: "Delete" / "Cancel" |
| Retry button on a never-had-data empty state | Nothing failed; implies a fixable error | Benefit description + verb-first creation CTA |
| `.accessibilityLabel("Settings button")` on a `Button` | Duplicates the auto-appended "button" trait | Just `.accessibilityLabel("Settings")` |
| Mixing "Delete"/"Remove"/"Trash" for the same action across screens | Confuses users, bloats the String Catalog | One term, reused via one String Catalog key |

## Severity guide

- **CRITICAL**: a raw error code, stack trace, or type dump shown to the user; a permission string that misrepresents what data is collected (App Review rejects, and it is dishonest to the user).
- **HIGH**: destructive alert buttons that don't name the action ("OK" instead of "Delete"); a plural built with `count == 1 ? :` that breaks other locales.
- **MEDIUM**: inconsistent terminology for the same concept across screens; capitalization style mismatched against the element-type table.
- **LOW**: a missing translator `comment:` on an ambiguous short string; an ellipsis rendered as three periods instead of U+2026.

## See also

- `references/patterns/04-loading-empty-error.md` -- `ContentUnavailableView` and `LoadState` view APIs these copies live inside
- `references/design/12-text-rendering.md#controlling-how-text-fits` -- truncation, `lineLimit`, `minimumScaleFactor` APIs
- `references/accessibility/01-voiceover-fundamentals.md#accessibility-labels` -- when a separate accessibility label is actually needed
- `references/accessibility/06-localization-rtl.md` -- String Catalog plumbing, RTL mirroring, pluralization mechanics
