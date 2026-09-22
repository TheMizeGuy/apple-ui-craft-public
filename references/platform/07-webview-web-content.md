# WebView and Web Content

> Owner: `references/platform/07-webview-web-content.md` owns the SwiftUI-native `WebView`/`WebPage` surface (module `WebKit`) -- loading, navigation policy, JavaScript bridging, back-forward, and the view modifiers layered on top. Legacy UIKit `WKWebView` via `UIViewRepresentable` remains the only path below the file's floor; it is mentioned here only as the fallback, not re-documented.
> Floors: `WebView`/`WebPage` = iOS/iPadOS/macOS/visionOS **26.0+** (Mac Catalyst 26.0+); NOT watchOS/tvOS. `ScrollInputKind` and `.handGestureShortcut` predate WebKit adoption at iOS **18.0+**/macOS 15.0+ -- only `webViewScrollInputBehavior(_:for:)` itself is 26.0. The iOS 27.0 additions -- `WebPage.FormInfo` + `willSubmit(formInfo:)`, the four new `NavigationPreferences` properties, and the geolocation permission callback -- are iOS/iPadOS/Mac Catalyst/macOS/visionOS 27.0. Two 27.0 symbols are single-platform: website immersive environments are **visionOS only**, and `WKWebView.refreshController` is **macOS only**. See `references/_scaffolding/version-floor-registry.md#ios-26x`.

`WebView` is the view, `WebPage` is the `@Observable` model that owns navigation/loading/JavaScript, and the two compose exactly like any other SwiftUI screen -- no wrapping `WKWebView` in `UIViewRepresentable` just to show an embedded page. iOS 26 established that surface; iOS 27 closes the gaps that still forced hybrid apps back into JavaScript injection: form submission is now interceptable, a navigation can be rewritten instead of cancelled and re-issued, and the host app decides geolocation permission. The most common way this goes wrong is reaching for API shapes that sound plausible but don't exist -- `WebView.BackForwardList`, a `.failed` navigation event, an iOS-26 tag on `ScrollInputKind`, or an iPhone `refreshController` -- because the surface is young and easy to half-remember from the older UIKit type.

## The Apple way

- `WebView(page)` for anything interactive with SwiftUI-native observation; `WebPage` standalone (headless) for scrape-and-evaluate automation with nothing displayed.
- Drive navigation state by observing `WebPage`'s `isLoading`/`estimatedProgress`/`title`/`url` -- never poll, the model is `@Observable`.
- `WebPage.NavigationDeciding` replaces the old completion-handler delegate with `async` decision methods -- no more `decisionHandler(.allow)` callback plumbing.
- Below the 26.0 floor, keep a `UIViewRepresentable`-wrapped `WKWebView` fallback; the two are not interchangeable at the type level.

## Core APIs: WebView and WebPage

```swift
import SwiftUI
import WebKit

struct ContentView: View {
    @State private var page = WebPage()

    var body: some View {
        NavigationStack {
            WebView(page)
                .navigationTitle(page.title)         // auto-updates: WebPage is @Observable
        }
        .task { page.load(URLRequest(url: URL(string: "https://apple.com")!)) }
    }
}
```

`WebView` is a SwiftUI `View` struct that displays web content; it also has a direct convenience initializer, `WebView(url:)`, for the no-model case. `WebPage` is an `@Observable @MainActor final class` that owns navigation, loading, JavaScript execution, and back-forward -- usable standalone (headless: load a page, run JavaScript, scrape, with nothing on screen). Observable state on `WebPage`: `isLoading: Bool`, `estimatedProgress: Double`, `url: URL?`, `title: String`, plus the back-forward list and current navigation event -- all observable, so SwiftUI re-renders automatically on change.

## Loading and NavigationEvent

```swift
@discardableResult @MainActor
func load(_ url: URL?) -> some AsyncSequence<WebPage.NavigationEvent, any Error>
func load(_ request: URLRequest) -> some AsyncSequence<WebPage.NavigationEvent, any Error>
func load(_ item: WebPage.BackForwardList.Item) -> some AsyncSequence<WebPage.NavigationEvent, any Error>
func load(html: String, baseURL: URL) -> some AsyncSequence<WebPage.NavigationEvent, any Error>
```

The returned `AsyncSequence` lets you `for try await event in page.load(url) { ... }` to track per-navigation progress; cancelling the enclosing `Task` stops loading. Because loading is `@discardableResult`, you can also ignore the sequence entirely and just observe `page.isLoading`/`page.estimatedProgress`/`page.title`/`page.url`.

`WebPage.NavigationEvent` has exactly four cases: `startedProvisionalNavigation`, `receivedServerRedirect`, `committed`, `finished` -- there is **no `.failed` case**. A navigation failure is thrown by the async sequence itself (the `for try await` loop throws), not delivered as an event value; do not write a `switch` expecting a failure case to fall out of the sequence.

## Navigation policy -- WebPage.NavigationDeciding

The `async`/value-typed replacement for `WKNavigationDelegate.webView(_:decidePolicyFor:decisionHandler:)` -- no completion handlers:

```swift
struct MyDecider: WebPage.NavigationDeciding {
    // Called before loading new content. Default implementation returns .allow.
    func decidePolicy(for action: WebPage.NavigationAction,
                       preferences: inout WebPage.NavigationPreferences) async -> WKNavigationActionPolicy {
        guard let host = action.request.url?.host, host.hasSuffix("apple.com") else { return .cancel }
        return .allow
    }
    func decidePolicy(for response: WebPage.NavigationResponse) async -> WKNavigationResponsePolicy { .allow }
    func decideAuthenticationChallengeDisposition(for challenge: URLAuthenticationChallenge) async
        -> (URLSession.AuthChallengeDisposition, URLCredential?) { (.performDefaultHandling, nil) }
}
let page = WebPage(navigationDecider: MyDecider())
```

The policy enums are the SAME `WKNavigationActionPolicy`/`WKNavigationResponsePolicy` WebKit already ships; `NavigationAction`/`NavigationResponse`/`NavigationPreferences` are new `WebPage`-nested value types, and `decidePolicy(for:preferences:)` is `mutating` on the protocol.

### Rewriting a navigation instead of cancelling it (iOS 27)

`NavigationPreferences` gains four properties at iOS 27, and the first is the one that changes how an embedded browser feels:

| Property | Effect |
|---|---|
| `alternateRequest: URLRequest?` | Replaces the main-resource request for this navigation |
| `overrideReferrer` | Applies a custom `Referer` header to every resource load in the frame |
| `isGlobalPrivacyControlEnabled` | Sends the GPC signal (mirrored as `WKWebpagePreferences.globalPrivacyControlEnabled`) |
| `allowsJSHandleCreationInPageWorld` | Controls `WKJSHandle` availability in the page world |

Before iOS 27 the only way to attach an auth header was to `return .cancel` and reload a modified request yourself -- which the user sees as a flash and a reload. Now you mutate `preferences` in place:

The method is the iOS 26 requirement; only the four properties are new, so gate inside rather than annotating the conformance:

```swift
func decidePolicy(for action: WebPage.NavigationAction,
                   preferences: inout WebPage.NavigationPreferences) async -> WKNavigationActionPolicy {
    if #available(iOS 27, *) {
        preferences.isGlobalPrivacyControlEnabled = true       // deliberate privacy posture, one line
        if let url = action.request.url, url.host?.hasSuffix("myapi.com") == true {
            var authed = action.request
            authed.setValue(token, forHTTPHeaderField: "Authorization")
            preferences.alternateRequest = authed              // no cancel, no visible reload
        }
    }
    return .allow
}
```

An in-app browser should set `isGlobalPrivacyControlEnabled` on purpose rather than by omission.

### Intercepting form submission (iOS 27)

`WebPage.NavigationDeciding` gains a hook that fires before a form submission commits:

```swift
@MainActor mutating func willSubmit(formInfo: WebPage.FormInfo) async
```

`FormInfo` carries `formValues`, `httpMethod`, `submissionURL`, `sourceFrame` and `targetFrame`. Apple's framing is autofill: let the app process form values before the submission takes place.

This is what makes an embedded checkout or login read as native. The "Save this password?" prompt appears at the instant of submission, against values you were handed, instead of after a page transition has already carried the fields away:

```swift
@available(iOS 27, *)
mutating func willSubmit(formInfo: WebPage.FormInfo) async {
    guard formInfo.submissionURL.host() == "accounts.example.com" else { return }   // submissionURL is non-optional
    await CredentialStore.shared.offerToSave(formInfo.formValues)
}
```

Below iOS 27 the only route is a JavaScript submit listener injected through `WKUserContentController` and messaged back -- a scrape after the fact, timed a beat too late.

### Geolocation permission (iOS 27)

Geolocation joins camera and microphone as a web permission the host app decides. The callback is on `WKUIDelegate`, so it applies to the UIKit path:

```swift
optional func webView(_ webView: WKWebView,
                       requestGeolocationPermissionFor origin: WKSecurityOrigin,
                       initiatedBy frame: WKFrameInfo) async -> WKPermissionDecision
```

Embedded content can no longer silently take the device's location, which makes this a real design task rather than a checkbox: present your own explanation naming the origin, and return `.prompt` or `.deny` accordingly. An unconditional `.grant` for convenience is a HIGH privacy finding. Below iOS 27 there is no callback and the system default applies.

## JavaScript -- callJavaScript

```swift
@MainActor
final func callJavaScript(
    _ functionBody: String,
    arguments: [String: Any] = [:],
    in frame: WebPage.FrameInfo? = nil,        // nil = main frame
    contentWorld: WKContentWorld? = nil
) async throws -> Any?
```

Pass ONLY the function BODY (`"return x ? y : z;"`), not a callable. Supported argument types: numeric, `String`, `Date`, and arrays/dictionaries/optionals of those. Returns `nil` if the body has no explicit return, `NSNull` if it returns JS `null`; `await` on a returned thenable is supported, a rejected promise throws `WKError.javaScriptAsyncFunctionResultRejected`.

## Configuration

`WebPage.Configuration` carries `urlSchemeHandlers: [URLScheme: any URLSchemeHandler]` (iOS 26+) to register a custom-scheme resource loader -- the direct replacement for wiring a `WKURLSchemeHandler` onto `WKWebViewConfiguration`. Pass it to `WebPage(configuration:navigationDecider:)`.

## Back-forward list

The back-forward type is **`WebPage.BackForwardList`** (module WebKit) -- it is NOT `WebView.BackForwardList`; that name does not exist. Items are `WebPage.BackForwardList.Item`; the list surfaces `backList`/`currentItem`/`forwardList` and a `subscript(Int)`. Navigate to a prior item with `page.load(_ item: WebPage.BackForwardList.Item)` (the third `load` overload above).

## View modifiers

```swift
WebView(page)
    .webViewLinkPreviews(.enabled)                    // link preview on press
    .webViewBackForwardNavigationGestures(.enabled)    // edge-swipe back/forward
    .webViewTextSelection(.enabled)                    // selectable web text
    .webViewMagnificationGestures(.enabled)             // pinch-to-zoom
    .webViewElementFullscreenBehavior(.enabled)         // iOS 26.0+ -- allow JS fullscreen elements (video)
    .findNavigator(isPresented: $findShown)             // STANDARD SwiftUI find UI (iOS 16+), now wired to web content
```

Also `.webViewContextMenu(menu:)` and `.webViewContentBackground(_:)` (`.automatic`/`.hidden`/`.visible` -- `.hidden` shows your SwiftUI background through the web view). Behavior types (`WebView.MagnificationGesturesBehavior`, `WebView.BackForwardNavigationGesturesBehavior`, `WebView.ElementFullscreenBehavior`) are each `static let automatic/disabled/enabled`.

## Scroll integration

`WebView` "is a scrollable view, behaves similarly to `ScrollView`" -- standard SwiftUI scroll modifiers apply directly:

```swift
.scrollBounceBehavior(.basedOnSize, axes: .vertical)             // standard SwiftUI modifier
.webViewScrollInputBehavior(.enabled, for: .keyboard)             // iOS 26.0 -- per scroll-input-kind control
.webViewScrollPosition($scrollPosition)                           // bind a SwiftUI ScrollPosition
.webViewOnScrollGeometryChange(for: CGFloat.self, of: { $0.contentOffset.y }) { old, new in }
```

`webViewScrollInputBehavior(_:for:)` is iOS 26.0+ -- it is the only new-in-26 piece here. `ScrollInputKind` and `.handGestureShortcut` themselves predate WebKit's adoption of them and are iOS **18.0+**/macOS 15.0+; do not tag `ScrollInputKind` as an iOS-26 type just because it shows up in this modifier's signature.

## Accessibility

VoiceOver bridges the rendered DOM's own semantics (ARIA roles, headings, links, form labels) to the accessibility tree automatically -- you do not hand-annotate web content from Swift. Give the `WebView` container a meaningful `.accessibilityLabel` only for a chrome-less embed; otherwise let the page title carry context (`.navigationTitle(page.title)`). Web text scales via the page's own CSS plus the user's text-zoom -- enable `.webViewMagnificationGestures(.enabled)` and/or `.webViewTextSelection(.enabled)` so users can enlarge; never force a fixed `.font` on the container. The system exposes Reduce Motion to WebKit as the CSS `prefers-reduced-motion` media query, which well-built pages honor automatically. For any NATIVE chrome you draw around the `WebView` -- a custom progress overlay animating `estimatedProgress`, for instance -- gate that animation yourself per the double-gate owned by `references/accessibility/05-motion-accessibility.md`; the system's automatic handling covers only the rendered web content, not your own overlay.

## Two 27.0 symbols that are not iPhone symbols

The 26.0 floor was uniform across iOS, iPadOS, macOS and visionOS. iOS 27 breaks that: two additions exist on exactly one platform each, and both have names that invite the wrong assumption.

**Website immersive environments -- visionOS 27 only.** `WebPage.Configuration.allowsImmersiveEnvironments` (default `false`), `WebPage.ImmersiveEnvironment`, and `View.onWebViewImmersiveEnvironmentRequest(shouldAllow:present:dismiss:)` let a website request an immersive environment from inside a `WebView`. Nothing here exists on iOS, iPadOS or macOS -- there is no fallback to write, because there is no capability to fall back from.

**`WKWebView.refreshController` -- macOS 27 only.** An `NSRefreshController` for pull-to-refresh, which reads like iOS finally got built-in web pull-to-refresh. It did not. On iOS, pull-to-refresh over web content is still `.refreshable` driving `page.reload()`, or a `UIRefreshControl` on `webView.scrollView` on the UIKit path.

## When legacy WKWebView is still required

`WebView`/`WebPage` are iOS 26.0+ only. A `UIViewRepresentable`-wrapped `WKWebView` remains necessary when: the deployment target is below iOS 26; you need `WKUIDelegate`/`WKNavigationDelegate` callbacks not yet surfaced on `WebPage`; you need fine-grained `WKWebViewConfiguration` (process pools, content-rule lists, pre-26 custom URL scheme handlers); or you must reparent a single retained `WKWebView` instance across containers (a rotation/fullscreen pattern) -- that path still needs its own retained-instance and navigation-identity guards, which do not apply to `WebPage` because navigation there is modeled as an async sequence plus `@Observable` state rather than racing delegate callbacks.

## Availability + fallbacks

```swift
struct AdaptiveWeb: View {
    let url: URL
    var body: some View {
        if #available(iOS 26, macOS 26, visionOS 26, *) {
            WebView(url: url)
        } else {
            LegacyWebView(url: url)   // your UIViewRepresentable over WKWebView
        }
    }
}
```

Annotate any SwiftUI-`WebView`-only helper `@available(iOS 26, macOS 26, visionOS 26, *)` at the type level, not just per call site.

## Accessibility contract

The rendered DOM's accessibility tree, Dynamic Type via CSS, and Reduce Motion via `prefers-reduced-motion` are all system/page-owned -- nothing here requires manual bridging on the Swift side. The one thing you own: any native SwiftUI chrome drawn around the `WebView` (progress bars, custom find affordances, loading overlays) needs its own Reduce Motion gate and VoiceOver label, per the standard double-gate contract.

## Anti-patterns

| Wrong | Why it fails | Right |
|---|---|---|
| `switch event { case .failed: ... }` on a `NavigationEvent` | No `.failed` case exists -- won't compile | Catch the throw from the `for try await` loop |
| `WebView.BackForwardList` | Wrong type -- does not exist | `WebPage.BackForwardList` |
| Tagging `ScrollInputKind` as iOS 26 | Predates WebKit adoption; it's iOS 18.0+/macOS 15.0+ | Only `webViewScrollInputBehavior(_:for:)` is 26.0 |
| `callJavaScript` passed a full function/closure | API expects the function BODY string only | `"return document.title;"`, not a callable |
| Hand-annotating rendered web content for VoiceOver | WebKit already bridges DOM semantics | Label only the native container/chrome |
| Shipping `WebView` with no pre-26 fallback | Hard floor -- app won't build/run below iOS 26 | `UIViewRepresentable`-wrapped `WKWebView` fallback |
| `return .cancel` then reload a modified request to attach a header | The user sees a flash and a reload | `preferences.alternateRequest` in `decidePolicy(for:preferences:)` (iOS 27) |
| Unconditional `.grant` from `requestGeolocationPermissionFor` | Hands the page the device's location with no user decision | Present your own explanation naming the origin; return `.prompt` or `.deny` |
| Scraping submitted form values out of the DOM afterwards | Fires a beat late, after the page has moved on | `willSubmit(formInfo:)` (iOS 27) |
| `WKWebView.refreshController` in an iPhone app | macOS 27 only | `.refreshable` driving `page.reload()` |
| Website immersive environments off visionOS | visionOS 27 only -- the symbols do not exist elsewhere | Nothing to gate; do not design for it on iPhone |

## Severity guide

CRITICAL: `WebView`/`WebPage` shipped as the ONLY implementation with a deployment target below iOS 26 (build failure or crash on older OS). HIGH: navigation-failure handling written against a non-existent `.failed` case, silently never firing; an unconditional `.grant` from the iOS 27 geolocation permission callback. MEDIUM: `ScrollInputKind` mis-gated to iOS 26 in a doc or comment, misleading a future reader into over-gating a call site. LOW: missing `.webViewTextSelection`/`.webViewMagnificationGestures` on a content-heavy embed. NIT: a custom progress overlay with no Reduce Motion gate on an otherwise-correct integration.

## See also

- `references/accessibility/05-motion-accessibility.md` -- Reduce Motion double-gate for native chrome drawn around a `WebView` (owner)
- `references/design/07-navigation-patterns.md#search` -- SwiftUI's `.findNavigator`/`.searchable` family this file's find integration reuses
- `references/_scaffolding/version-floor-registry.md#ios-26x` -- the unified 26.0 boundary WebView/WebPage share with Liquid Glass and Foundation Models
