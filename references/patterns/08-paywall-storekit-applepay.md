# Paywall, StoreKit Purchases, and Apple Pay / Wallet

> Owner: `references/patterns/08-paywall-storekit-applepay.md` owns paywall UI craft, StoreKit 2 purchase-surface UI (`SubscriptionStoreView`, `StoreView`, `ProductView`, `SubscriptionOfferView`), entitlement-gated UI (`subscriptionStatusTask`, `currentEntitlementTask`), and Apple Pay / Wallet payment-button UI (`PayWithApplePayButton`, `AddPassToWalletButton`). `references/haptics/02-swiftui-sensory-feedback.md` owns the `.sensoryFeedback` surface this file only invokes; `references/accessibility/04-motor-interaction.md` owns the 44pt touch-target floor this file cites, not restates.
> Floors: cite `references/_scaffolding/version-floor-registry.md#ios-160`, `#ios-170`, `#ios-26x` for the headline APIs below.

A paywall and a payment button are UI screens Apple reviews as strictly as any other -- get the honesty, the entitlement gating, or the system-owned button shapes wrong and the app fails review or churns trust. This file owns every purchase-surface craft rule: which StoreKit view to reach for, how to gate premium UI off live entitlement state instead of a cached flag, and how to wire Apple Pay/Wallet buttons Apple will not let you restyle.

## The Apple way

- `SubscriptionStoreView`, `StoreView`, and `ProductView` are first-party surfaces: on iOS 26 they render in Liquid Glass, adopt Dynamic Type, and honor accessibility settings for free. Hand-rolling a paywall from `Product.purchase()` is a MEDIUM finding unless the built-in views genuinely cannot express the merchandising.
- Gate premium UI off StoreKit's live entitlement state (`subscriptionStatusTask`/`currentEntitlementTask`), never off a cached `Bool` -- a cached flag drifts on refunds, Family Sharing changes, cross-device purchases, and grace-period transitions.
- Apple owns the Apple Pay and Wallet button shapes. Never recreate the mark, recolor it, or change its corner radius -- you control width and height only.
- Apple Pay is for physical goods and services (App Review 3.1.3); StoreKit IAP is for digital content. An Apple Pay button on a subscription paywall for in-app content is a boundary violation, not a style choice.

## Core APIs

### SubscriptionStoreView -- the Apple-native paywall

`SubscriptionStoreView` (StoreKitSwiftUI, iOS 17.0+) sources products three ways:

```swift
// Whole subscription group (most common)
SubscriptionStoreView(groupID: "21469355")

// Explicit product IDs (control order / subset shown)
SubscriptionStoreView(productIDs: ["com.app.pro.monthly", "com.app.pro.yearly"])

// Group + relationship -- restrict tiers relative to the user's current plan
SubscriptionStoreView(groupID: "21469355", visibleRelationship: .upgrade)
```

Theme it through sanctioned modifiers -- never wrap it in a custom `.glassEffect(...)`; a second glass layer produces muddy double-blur (`references/design/02-liquid-glass.md`):

```swift
SubscriptionStoreView(groupID: "21469355") {
    MarketingHero()
        .containerBackground(for: .subscriptionStoreFullHeight) {   // iOS 17+
            MeshGradient(...)                        // brand backdrop, behind the glass
        }
}
.subscriptionStoreControlStyle(.prominentPicker)      // .automatic/.buttons/.picker/.prominentPicker/.pagedProminentPicker/.compactPicker(18+)
.subscriptionStorePickerItemBackground(.thinMaterial)
.tint(.indigo)                                        // drives the subscribe-button accent
.subscriptionStoreButtonLabel(.multiline)              // plan + price + intro offer, one label
.storeButton(.visible, for: .restorePurchases)         // never hide -- App Review 3.1.1
.subscriptionStorePolicyDestination(url: termsURL, for: .termsOfService)
```

`.prominentPicker` is the most conversion-friendly style for 2-3 tiers. Never hide the restore button or the Terms/Privacy destinations -- both are App Review 3.1.1/3.1.2 requirements and HIGH accessibility/trust findings when missing.

### StoreView / ProductView -- non-subscription IAP

For consumables, non-consumables, and mixed catalogs (StoreKitSwiftUI, iOS 17.0+):

```swift
StoreView(ids: ["com.app.gems.100", "com.app.gems.500"])
    .productViewStyle(.compact)                       // .automatic/.compact/.regular/.large
    .storeButton(.visible, for: .restorePurchases)

ProductView(id: "com.app.pro.lifetime") { Image(systemName: "crown.fill") }
    .productViewStyle(.large)
```

Draw a graceful placeholder for `configuration.state == .loading` and hide the row on `.unavailable` -- showing a broken/empty row while the network is slow is a common craft miss. `.onInAppPurchaseCompletion` fires for purchases initiated inside the view but does NOT replace a global `Transaction.updates` listener at app launch -- that listener is still required for Ask-to-Buy approvals, cross-device purchases, offer-code redemptions, and refunds.

### SubscriptionOfferView -- inline merchandising

```swift
if #available(iOS 26, *) {
    SubscriptionOfferView(groupID: "21469355", visibleRelationship: .upgrade)
} else {
    UpgradeRow(product: proProduct)      // Material-backed inline row driven by StoreView data
}
```

`SubscriptionOfferView` (StoreKitSwiftUI, **iOS 26.0+** -- `version-floor-registry.md#ios-26x`) is a compact merchandising card for one auto-renewable subscription, meant to drop inline in normal UI (a settings row, a "Go Pro" banner) rather than as a full paywall. Before iOS 26 the only Apple-native subscription surface was the full paywall; a hand-rolled inline upgrade card on an iOS-26-target app is now a LOW/MEDIUM finding -- prefer `SubscriptionOfferView`.

### Entitlement-gated UI

Two view modifiers make a view reactively depend on purchase state and hand back an `EntitlementTaskState` that models loading/failed/succeeded, so the view never flashes the wrong tier:

```swift
TabView { /* ... */ }
    .subscriptionStatusTask(for: "21469355") { taskState in     // subscription GROUP id, not a product id
        switch taskState {
        case .loading: break                                     // hold prior UI; don't flash
        case .failure(let error): logNonFatal(error)              // keep last-known access
        case .success(let statuses):
            isPro = statuses.contains { s in
                [.subscribed, .inGracePeriod, .inBillingRetryPeriod].contains(s.state)
            }
        }
    }
```

Signature: `subscriptionStatusTask(for productID: String, priority: TaskPriority = .userInitiated, action: (EntitlementTaskState<[Product.SubscriptionInfo.Status]>) async -> Void)` -- iOS 17.0+. Treat `.inGracePeriod` and `.inBillingRetryPeriod` as entitled: revoking premium the instant a card fails is a classic churn mistake, since Apple keeps retrying billing for roughly 60 days. For a single non-consumable/lifetime product, use `currentEntitlementTask(for:priority:action:)` and check `revocationDate == nil` plus `case .verified` (reject `.unverified` -- that is a tamper signal).

There is no `@Environment(\.subscriptionStatuses)` key and no `Status.all` -- both are fabricated. `subscriptionStatusTask`/`currentEntitlementTask` are the only entitlement-gating surface (`version-floor-registry.md#ios-170`).

## Paywall design rules

1. **Value hero first, above the fold.** 3-5 concrete outcome-framed benefits, not feature jargon.
2. **Plans with a clear default.** Pre-select the recommended plan; show the per-month equivalent AND the total -- do the arithmetic for the user.
3. **Commitment sentence, visible by the buy button.** What is charged, the period, that it auto-renews, how to cancel -- required disclosure that also converts better because it removes fear.
4. **One obvious primary action.** Secondary actions (Restore, Terms, Privacy) stay quiet, never hidden.
5. **Offers, checked for eligibility.** Read `product.subscription?.introductoryOffer`/`.promotionalOffers`/`.winBackOffers`; gate a trial behind `await sub.isEligibleForIntroOffer` before promising it -- StoreKit rejects a purchase the user is ineligible for. `SubscriptionStoreView`/`SubscriptionOfferView` do this automatically.
6. **Honest merchandising.** Compute "Save X%" from `product.price`, never hardcode it; never stack countdown-timer urgency on top of a real offer -- Apple rejects fabricated scarcity.
7. **Placement.** Show the paywall after the user has felt value, not on cold launch; gate with the entitlement tasks above so subscribers never see it.
8. **Testability.** Use a local StoreKit configuration file (Xcode -> New File -> StoreKit Configuration File) so products resolve in `#Preview` and the Simulator, and use the Transaction Manager (Debug -> StoreKit) to force expired/grace-period/ineligible-for-intro states before shipping -- this is how the "flash of Locked" and "trial shown to an ineligible user" bugs get caught before review.

## Apple Pay & Wallet

`PKPaymentRequest` (PassKit, iOS 8+) is the shared model consumed by both the SwiftUI button and the UIKit controller. Gate visibility on availability before configuring anything:

```swift
let canPay = PKPaymentAuthorizationController.canMakePayments()
let hasCard = PKPaymentAuthorizationController.canMakePayments(
    usingNetworks: [.visa, .masterCard, .amex], capabilities: .threeDSecure)
// false canPay -> hide the button entirely; true canPay + false hasCard -> show it
// configured to prompt "add a card" (SwiftUI fallback: closure covers the fully-unavailable case)
```

```swift
let r = PKPaymentRequest()
r.merchantIdentifier   = "merchant.com.example.store"
r.supportedNetworks    = [.visa, .masterCard, .amex, .discover]
r.merchantCapabilities = .threeDSecure                             // required minimum
r.countryCode           = "US"
r.currencyCode          = "USD"
r.paymentSummaryItems = cart.lines.map {
    PKPaymentSummaryItem(label: $0.name, amount: NSDecimalNumber(decimal: $0.price))
} + [PKPaymentSummaryItem(label: "Example Store", amount: NSDecimalNumber(decimal: cart.total), type: .final)]
```

### PayWithApplePayButton (SwiftUI, module PassKit, iOS 16.0+)

```swift
PayWithApplePayButton(
    .checkout,                                        // PayWithApplePayButtonLabel, 17 cases
    request: request,
    onPaymentAuthorizationChange: { phase in
        switch phase {                                 // PayWithApplePayButtonPaymentAuthorizationPhase
        case .willAuthorize:
            break                                       // last chance to update the request
        case .didAuthorize(let payment, let resultHandler):
            Task {
                let ok = await sendTokenToServer(payment.token)
                resultHandler(.init(status: ok ? .success : .failure, errors: nil))
            }
        case .didFinish:
            break                                       // sheet dismissed -- move to confirmation UI
        @unknown default:
            break
        }
    },
    onMerchantSessionRequested: {                       // separate closure, Apple Pay on the Web only
        await requestMerchantSession()                  // () async -> PKPaymentRequestMerchantSessionUpdate
    },
    fallback: {
        Button("Set up Apple Pay") { openWalletSetup() }.buttonStyle(.bordered)
    }
)
.payWithApplePayButtonStyle(.automatic)                 // .automatic/.black/.white/.whiteOutline
.frame(maxWidth: .infinity, minHeight: 50)               // HIG: full-width, 44pt minimum height
```

The phase type is `PayWithApplePayButtonPaymentAuthorizationPhase` -- it does not carry "Change" in its name, and its cases are `willAuthorize` / `didAuthorize(payment:resultHandler:)` / `didFinish`. Merchant-session validation for Apple Pay on the Web is a separate `onMerchantSessionRequested` closure, not a fourth phase case. `fallback` defaults to `EmptyView`; always supply a real one. There is no `.tint`/corner-radius knob on the style -- Apple owns the shape; wrap in `.frame` for width and height only.

Not using SwiftUI (UIKit codebase, watchOS, or an imperative flow)? Use `PKPaymentAuthorizationController` (PassKit, iOS 10+) -- it presents and dismisses its own sheet through `PKPaymentAuthorizationControllerDelegate`, and it is the only option on watchOS. `PKPaymentAuthorizationViewController` (iOS 8+) is the older `UIViewController`-you-present-yourself pattern; steer new code to the controller.

### AddPassToWalletButton -- adding a PASS, not paying

A distinct surface from payment: adding a boarding pass, ticket, coupon, or loyalty card to Wallet.

```swift
AddPassToWalletButton([pass], onCompletion: { success in
    // fires after the system add sheet dismisses
})
.addPassToWalletButtonStyle(.black)          // .black / .blackOutline
.frame(height: 52)

// Fully custom completion flow (e.g. driving PKPassLibrary yourself):
AddPassToWalletButton(action: { presentCustomAddFlow() })
```

The real initializers are `init(_ passes: [PKPass], onCompletion: (Bool) -> Void)` and `init(action: () -> Void)` -- PassKit, iOS 16.0+. Check `PKPassLibrary().containsPass(pass)` first to swap the CTA to "View in Wallet" (deep-link via `pass.passURL`) instead of showing Add for an already-added pass.

Two related surfaces worth knowing, not owning here: after a successful Apple Pay purchase, returning `orderDetails` (`PKPaymentOrderDetails`, iOS 16.0+) on the authorization result pushes the order into Wallet for live tracking against your Wallet Orders web service. Accepting contactless cards on an iPhone (merchant side) is the separate ProximityReader framework, gated by its own entitlement -- present Apple's built-in Tap to Pay UI and never build a custom card-read screen.

## Availability + fallbacks

```swift
if #available(iOS 26, *) {
    SubscriptionOfferView(groupID: groupID, visibleRelationship: .upgrade)
} else {
    UpgradeRow(product: proProduct)          // Material-backed inline row, StoreView-driven
}
```

`SubscriptionStoreView`, `StoreView`, `ProductView`, and both entitlement tasks are iOS 17.0+ across the fleet -- no gate needed on an iOS-17-floor app. `PayWithApplePayButton` and `AddPassToWalletButton` are iOS 16.0+; gate any iOS-16-only piece and fall back to `PKPaymentAuthorizationController` + UIKit buttons on older targets.

## Accessibility contract

- **VoiceOver:** the subscribe button composes plan + price + offer into one phrase automatically ("Subscribe, Pro Yearly, 39 dollars 99 cents per year, 7 day free trial"); replicate that single-phrase label if building a custom control (`references/accessibility/01-voiceover-fundamentals.md#label-composition`). Never override the accessibility label of a system Apple Pay/Wallet button -- doing so breaks the trademark treatment.
- **Reduce Motion:** any celebratory purchase-success animation gates on the shared `Animation?` accessor (`references/patterns/01-gotchas-anti-patterns.md#reduce-motion-one-animation-accessor-gates-both-apis`) and falls back to a cross-fade. Announce Apple Pay/Wallet results on your own confirmation screen via an accessibility announcement, not a haptic alone -- hearing-independent and Reduce-Motion-safe.
- **Reduce Transparency:** the system swaps Liquid Glass for opaque backgrounds automatically; if a custom `containerBackground` is supplied, verify text stays legible when the glass turns solid.
- **Dynamic Type:** the paywall must survive AX5 -- test the marketing hero at AX5, prefer `ViewThatFits` over a fixed-height image plus large title. Every actionable element, including the close (X) button and policy links, stays 44x44pt or larger (`references/accessibility/04-motor-interaction.md#touch-targets`).
- **Increase Contrast:** policy/CTA foreground styles must still meet 4.5:1; the Apple Pay button's outline styles satisfy Increase Contrast on matching backgrounds.
- Confirm purchase with `.sensoryFeedback(.success, trigger:)` (`references/haptics/02-swiftui-sensory-feedback.md#async-outcome-success-or-failure`) -- never block the UI on a spinner after `transaction.finish()`.

## Anti-patterns

| Wrong | Why it fails | Right |
|---|---|---|
| Close (X) button hidden, tiny, delayed, or low-contrast | CRITICAL -- Guideline 3.1.2 trap pattern | Keep the X visible, 44pt or larger, immediate |
| Buy button styled primary, "not now" nearly invisible | HIGH -- manipulative contrast | Give the dismiss a real visual target |
| Auto-renew / price not disclosed on the paywall itself | HIGH -- 3.1.2 rejection | Commitment sentence beside the buy button |
| Fake/reset countdown "offer expires!" timers | HIGH -- deceptive urgency | Real offer, real (or no) urgency |
| Restore button missing | HIGH -- 3.1.1 rejection, breaks reinstalls | `.storeButton(.visible, for: .restorePurchases)` |
| Price hardcoded in `Text` instead of `product.displayPrice` | HIGH -- wrong currency/locale | Always use StoreKit's localized string |
| Cached `Bool` gates premium UI | HIGH -- drifts on refund/Family Sharing/grace period | `subscriptionStatusTask`/`currentEntitlementTask` |
| Apple Pay button recolored, resized, or corner-radius changed | HIGH -- trademark/HIG violation | System style only, `.frame` for size |
| Apple Pay button on a subscription paywall for digital content | CRITICAL -- App Review 3.1.3/3.1.5 boundary violation | Route digital content through StoreKit IAP |
| Trial offered without an `isEligibleForIntroOffer` check | MEDIUM -- promises a trial StoreKit will refuse | Check eligibility, or use the built-in views |
| Hand-rolled inline "Go Pro" card on an iOS-26 app | LOW/MEDIUM -- loses localization + offer awareness | `SubscriptionOfferView` |

## Severity guide

- **CRITICAL**: a dark pattern that traps the user in the purchase flow, or an Apple Pay/StoreKit boundary violation (a physical-goods button gating digital IAP content).
- **HIGH**: missing required disclosure or restore path, a trademark/HIG violation on a system payment button, or entitlement UI driven by a source that is not StoreKit.
- **MEDIUM**: an eligibility check gap that promises something StoreKit will refuse, or a hand-rolled paywall with no concrete reason to bypass the built-in view.
- **LOW**: a missed merchandising opportunity -- no win-back offer surfaced, a deprecated redemption API still in use.

## See also

- `references/design/02-liquid-glass.md` -- Liquid Glass adoption the store views and payment buttons inherit automatically
- `references/haptics/02-swiftui-sensory-feedback.md#async-outcome-success-or-failure` -- the purchase-confirmation haptic pattern
- `references/accessibility/01-voiceover-fundamentals.md#label-composition` -- composing a single-phrase VoiceOver label for custom controls
- `references/accessibility/04-motor-interaction.md#touch-targets` -- the 44pt floor this file cites
- `references/patterns/01-gotchas-anti-patterns.md#reduce-motion-one-animation-accessor-gates-both-apis` -- the shared Reduce Motion gate
- `references/platform/08-app-clips-extensions.md#ephemeral-experience-and-size-budget` -- App Clips use `PayWithApplePayButton` as their native checkout path
