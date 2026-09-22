# Paywall, StoreKit Purchases, and Apple Pay / Wallet

> Owner: `references/patterns/08-paywall-storekit-applepay.md` owns paywall UI craft, StoreKit 2 purchase-surface UI (`SubscriptionStoreView`, `StoreView`, `ProductView`, `SubscriptionOfferView`), offer-code redemption UI, entitlement-gated UI (`subscriptionStatusTask`, `currentEntitlementTask`), and Apple Pay / Wallet payment-button UI (`PayWithApplePayButton`, `AddPassToWalletButton`, `ApplePayMerchandisingView`). `references/haptics/02-swiftui-sensory-feedback.md` owns the `.sensoryFeedback` surface this file only invokes; `references/accessibility/04-motor-interaction.md` owns the 44pt touch-target floor this file cites, not restates.
> Floors: cite `references/_scaffolding/version-floor-registry.md#ios-160`, `#ios-170`, `#ios-26x` for the headline APIs below. The iOS 27.0 StoreKit and PassKit floors are stated inline per symbol in this file; `references/_scaffolding/version-floor-registry.md` remains the tie-breaker when the two disagree.

A paywall and a payment button are UI screens Apple reviews as strictly as any other -- get the honesty, the entitlement gating, or the system-owned button shapes wrong and the app fails review or churns trust. This file owns every purchase-surface craft rule: which StoreKit view to reach for, how to gate premium UI off live entitlement state instead of a cached flag, and how to wire Apple Pay/Wallet buttons Apple will not let you restyle.

## The Apple way

- `SubscriptionStoreView`, `StoreView`, and `ProductView` are first-party surfaces: on iOS 26 and later they render in Liquid Glass, adopt Dynamic Type, and honor accessibility settings for free. Hand-rolling a paywall from `Product.purchase()` is a MEDIUM finding unless the built-in views genuinely cannot express the merchandising.
- Gate premium UI off StoreKit's live entitlement state (`subscriptionStatusTask`/`currentEntitlementTask`), never off a cached `Bool` -- a cached flag drifts on refunds, Family Sharing changes, cross-device purchases, and grace-period transitions.
- Apple owns the Apple Pay and Wallet button shapes. Never recreate the mark, recolor it, or change its corner radius -- you control width and height only.
- Apple Pay is for physical goods and services (App Review 3.1.3); StoreKit IAP is for digital content. An Apple Pay button on a subscription paywall for in-app content is a boundary violation, not a style choice.
- The HIG page is **Apple In-App Purchase** (renamed and rewritten September 2026; the old `/in-app-purchase` slug redirects). Use that name in copy and citations. Its load-bearing rules: show the total billing price for every purchase type, hide or explain the store when `canMakePayments` is false, never modify or replicate the system confirmation sheet, put a redeem-code entry point on the paywall / onboarding / settings, and keep cancellation easy to find.

## Core APIs

### SubscriptionStoreView -- the Apple-native paywall

`SubscriptionStoreView` (StoreKit, iOS 17.0+) sources products three ways:

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

For consumables, non-consumables, and mixed catalogs (StoreKit, iOS 17.0+):

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

`SubscriptionOfferView` (StoreKit, **iOS 26.0+** -- `version-floor-registry.md#ios-26x`) is a compact merchandising card for one auto-renewable subscription, meant to drop inline in normal UI (a settings row, a "Go Pro" banner) rather than as a full paywall. Before iOS 26 the only Apple-native subscription surface was the full paywall; a hand-rolled inline upgrade card on an iOS-26-target app is now a LOW/MEDIUM finding -- prefer `SubscriptionOfferView`.

### Offer-code redemption (iOS 27)

The redemption sheet stopped being a blind hand-off. On iOS 27 the call returns the redeemed transaction, so the same `await` can unlock content, flip the paywall to its subscribed state, and push a welcome screen:

```swift
@State private var isRedeeming = false

Button("Redeem Code") { isRedeeming = true }
    .offerCodeRedemption(options: [], isPresented: $isRedeeming) { result in   // iOS 27.0+
        switch result {
        case .success(.verified(let transaction)):
            Task {
                await unlock(transaction)
                await transaction.finish()
                route = .welcomeToPro                 // AFTER the unlock lands, not beside it
            }
        case .success(.unverified):
            route = .contactSupport                   // tamper signal -- do not unlock
        case .failure(let error):
            redeemError = error                       // a redeem sheet that fails must say so
        }
    }
```

Signatures: `offerCodeRedemption(options: Set<RedeemOption>, isPresented: Binding<Bool>, onCompletion: @escaping @MainActor (Result<VerificationResult<Transaction>, any Error>) -> Void)` (SwiftUI, iOS 27.0+, not tvOS/watchOS) and, from UIKit, `AppStore.presentOfferCodeRedeemSheet(from: UIViewController, options: Set<RedeemOption> = []) async throws -> VerificationResult<Transaction>` (iOS 27.0+; macOS takes `from window: NSWindow`). Write `options: []`: Apple publishes the `RedeemOption` type but no member values, so any named case is invented.

On an app that still supports iOS 26, gate it and keep the old path:

```swift
if #available(iOS 27, *) {
    redeemButton.offerCodeRedemption(options: [], isPresented: $isRedeeming) { result in
        handleRedemption(result)                  // the switch above
    }
} else {
    redeemButton.offerCodeRedemption(isPresented: $isRedeeming) { _ in
        // Pre-27 completion carries no transaction: the unlock arrives via Transaction.updates.
    }
}
```

`AppStore.presentOfferCodeRedeemSheet(in: UIWindowScene)` and `offerCodeRedemption(isPresented:onCompletion:)` are deprecated at iOS 27.0 with named replacements, so on an iOS-27-target app either is a MEDIUM finding with a one-line migration. A global `Transaction.updates` listener is still required either way -- redemptions started from the App Store app never pass through your sheet.

### Subscription Bundles and Suites (iOS 27)

Two product types let several subscriptions be sold as one purchase: `Product.ProductType.subscriptionBundle` (subscriptions that are also sold alone, up to 5 developers) and `.subscriptionSuite` (subscriptions that exist only inside the Suite, up to 15 apps). Both are iOS 27.0+.

The craft rule is that a bundle card must merchandise its contents. `Product.SubscriptionInfo.bundledSubscriptions` hands back `BundledSubscription` values carrying `id`, `displayName`, `description`, `displayPrice`, `price`, `subscriptionGroupID`, `subscriptionGroupDisplayName`, `subscriptionGroupLevel` and `isFamilyShareable` per member -- render them, rather than an opaque "Bundle" row the user has to take on faith:

```swift
if #available(iOS 27, *), product.type == .subscriptionBundle {
    ForEach(product.subscription?.bundledSubscriptions ?? [], id: \.id) { member in
        LabeledContent(member.displayName) { Text(member.displayPrice) }
            .accessibilityElement(children: .combine)
    }
}
```

A product-type `switch` that has no `.subscriptionBundle`/`.subscriptionSuite` branch renders a broken card on iOS 27 -- check for the default branch, and check the app does not duplicate the App Store's own post-purchase app list.

### Seat-based purchases (Group Purchases and Volume Purchasing)

An App Store and server-side feature, not a client API: one subscriber can buy multiple seats and invite others (Group Purchases), and organizations buy in volume through Apple Business / Apple School Manager. Seat life cycle runs through App Store Server API group-management endpoints; pricing and availability are configured in App Store Connect.

Apple ships no system view for any of it, so every screen is yours to design: a seat-count control in the merchandising flow, an invitation share sheet, and a seat-management screen (who holds a seat, revoke, resend) that belongs in the account area (`references/patterns/06-settings.md#account-section-placement`). Treat it as a screen archetype, not an API to adopt.

### Merchandising sheets and the system win-back message

`AppStore.presentMerchandising(_:from:) async throws -> AppStoreMerchandisingKind.PresentationResult` (iOS 26.0+; macOS 26.2 for the `NSWindow` overload) presents an App Store-drawn sheet for a subscription group via `AppStoreMerchandisingKind.subscriptionBundle(_:)`, returning `.dismissed` or `.purchaseCompleted(_:)`. That case takes a subscription group ID and is unrelated to the iOS 27 `Product.ProductType.subscriptionBundle` above, which names a product type -- two namespaces, one spelling. That completes the merchandising ladder: full paywall (`SubscriptionStoreView`), inline card (`SubscriptionOfferView`), system sheet (`presentMerchandising`).

It also means the system already shows a win-back sheet at launch to eligible customers with no code at all. An app that shows its own win-back interstitial without intercepting `Message.messages` and withholding `displayStoreMessage` for `.winBackOffer` double-prompts the same user -- a real MEDIUM finding, not a theoretical one.

### Store-sheet errors and purchase help

Two iOS 27.0 error cases give the purchase-help screen something specific to say:

- `StoreKitError.invalidPresentationContext` -- StoreKit UI cannot be presented from the current context (a detached or already-dismissing controller). This is an app bug, not a user problem: it must never surface as "Something went wrong." Log it and retry from a live presenter.
- `Transaction.RefundRequestError.ineligible` -- the transaction is not eligible for a refund. Say that before sending the user into the system flow. Stating eligibility is allowed; characterizing or predicting Apple's refund decision is not.

Both need a default branch on a sub-27 deployment target.

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

Signature: `subscriptionStatusTask(for groupID: String, priority: TaskPriority = .medium, action: (EntitlementTaskState<[Product.SubscriptionInfo.Status]>) async -> Void)` -- iOS 17.0+. Treat `.inGracePeriod` and `.inBillingRetryPeriod` as entitled: revoking premium the instant a card fails is a classic churn mistake, since Apple keeps retrying billing for roughly 60 days. For a single non-consumable/lifetime product, use `currentEntitlementTask(for:priority:action:)` and check `revocationDate == nil` plus `case .verified` (reject `.unverified` -- that is a tamper signal).

There is no `@Environment(\.subscriptionStatuses)` key and no `Status.all` -- both are fabricated. `subscriptionStatusTask`/`currentEntitlementTask` are the only entitlement-gating surface (`version-floor-registry.md#ios-170`).

A managed install should not see a consumer paywall at all. `AppTransaction.storeType` (iOS 27.0+, typed `AppTransaction.StoreType`: `.consumer`, `.education`, `.enterprise`) replaces the string-based `storeTypeStringRepresentation`, which is deprecated at 27.0:

```swift
if #available(iOS 27, *) {
    let result = try await AppTransaction.shared
    if case .verified(let appTransaction) = result, appTransaction.storeType != .consumer {
        showsUpgradePrompts = false   // Business / School Manager copy: no paywall, no restore, no review prompt
    }
}
```

`AppTransaction.all` (iOS 27.0+, same gate) returns every `AppTransaction` for this version of the app, which is what volume-purchased and Managed Apple Account copies need. Below iOS 27, read `storeTypeStringRepresentation` and compare strings. Related: `AppStore.ageRatingCode` (`Int?`, iOS 26.2+) reads the age rating the current storefront actually enforces, so age-dependent merchandising adapts instead of hard-coding a rating that differs per region.

## Paywall design rules

1. **Value hero first, above the fold.** 3-5 concrete outcome-framed benefits, not feature jargon.
2. **Plans with a clear default.** Pre-select the recommended plan; show the per-month equivalent AND the total -- do the arithmetic for the user.
3. **Commitment sentence, visible by the buy button.** What is charged, the period, that it auto-renews, how to cancel -- required disclosure that also converts better because it removes fear.
4. **One obvious primary action.** Secondary actions (Restore, Terms, Privacy) stay quiet, never hidden.
5. **Offers, checked for eligibility.** Read `product.subscription?.introductoryOffer`/`.promotionalOffers`/`.winBackOffers`; gate a trial behind `await sub.isEligibleForIntroOffer` before promising it -- StoreKit rejects a purchase the user is ineligible for. `SubscriptionStoreView`/`SubscriptionOfferView` do this automatically.
6. **Honest merchandising.** Compute "Save X%" from `product.price`, never hardcode it; never stack countdown-timer urgency on top of a real offer -- Apple rejects fabricated scarcity.
7. **Placement.** Show the paywall after the user has felt value, not on cold launch; gate with the entitlement tasks above so subscribers never see it.
8. **Testability.** Use a local StoreKit configuration file (Xcode -> New File -> StoreKit Configuration File) so products resolve in `#Preview` and the Simulator, and use the Transaction Manager (Debug -> StoreKit) to force expired/grace-period/ineligible-for-intro states before shipping -- this is how the "flash of Locked" and "trial shown to an ineligible user" bugs get caught before review.
9. **Leave the cancellation moment to the system.** After a customer taps Cancel Subscription, the system shows its own Confirm Cancellation page, and the Retention Messaging API (a server-to-server service; messages render on iOS 15.1+, iPadOS 15.1+, visionOS 1+, macOS 14+) chooses which of four message types it carries: text, text with an image, a switch-plan suggestion, or a promotional offer. A homegrown "are you sure?" interstitial inside the app duplicates that screen and reads as an obstacle. The craft work moved to the copy and the configuration: write what the customer loses and what to switch to, and configure a default message for every product and locale, because a locale with no default gets no message at all. Cancellation still has to stay easy to find.

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

if #available(iOS 27, *) {
    r.unsupportedPrimaryAccountIdentifiers = declinedCardIdentifiers   // the sheet stops offering these cards
}
```

Build `supportedNetworks` from what the merchant account actually accepts, never from a frozen literal: iOS 27 added `elcard`, `humo`, `maal`, `payPak`, `ruPay`, `uzCard` and `verve` (Kyrgyzstan, Uzbekistan, Maldives, Pakistan, India, Nigeria), and a hardcoded array hides the Apple Pay button outright for customers in those markets. Gate the new cases behind `#available(iOS 27, *)` on a lower target.

`unsupportedPrimaryAccountIdentifiers` (`[String]`, iOS 27.0+, also on `PKDisbursementRequest`) removes a whole class of post-authorization error copy: a card the merchant will decline is simply not offered, which is the HIG rule "report problems before authorization" made mechanical.

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

The button is not a static graphic: in some contexts the system now draws an image of the person's default card on it. So overlaying it, masking it, screenshotting it, or shrinking it below the documented minimum of 100x30pt (140pt wide for longer captions, margins one tenth of the button height) is a HIGH finding, not a nit. Corner radius is adjustable from square to capsule and styles are `automatic` (preferred), `black`, `whiteOutline` and `white`. Picking the button *type* carries the same weight as writing the CTA -- the documented set is Apple Pay, Book, Buy, Check Out, Continue, Donate, Order, Reload, Add Money, Top Up, Rent, Subscribe, Support, Contribute, Tip and plain, and a donation flow shipping "Buy with Apple Pay" is a HIG violation. If the size you specify cannot fit the localized title, the system silently substitutes the plain Apple Pay button, so verify the button in the longest supported locale. The HIG also forbids requiring account creation before purchase and forbids stacking your own spinner over the payment sheet's own progress.

### ApplePayMerchandisingView -- system installment messaging (iOS 27)

Hand-written "or 4 payments of $12.49" strings are unauthorized replicas of Apple financing messaging. iOS 27 ships the system-drawn widget instead:

```swift
if #available(iOS 27, *) {
    ApplePayMerchandisingView(
        amount: cart.total,
        currency: Locale.Currency("USD"),
        region: Locale.Region("US"),
        action: .learnMore,                     // presents the system info sheet
        style: .standard,
        partners: .all                          // or .none / .limited(partnerIdentifiers:)
    ) {
        PriceFootnote()                         // the fallback is load-bearing -- see below
    }
}
```

iOS and iPadOS 27 only -- no macOS, Catalyst, visionOS, watchOS or tvOS. Availability also varies by region and financing partner, so the `fallback:` builder decides what the price block looks like for most of the world. Review it as real layout: either a genuine substitute or a deliberate `EmptyView` that leaves no gap. A fallback that is a placeholder, or that changes the block's height when the widget disappears, shifts the price at the worst possible moment.

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

**Related passes are added as a group, in one sheet.** A loop that presents an add sheet per pass is the single worst Wallet experience in travel and ticketing apps, and iOS 27 removes the last excuse for it: `PKAddPassesViewController` gains `init?(passesData: [Data])`, `init?(passesArchiveAt:)`, `init?(passesArchiveAtFileURL:)` and `init?(passesArchiveData:)`, and `PKPassLibrary` gains `addPasses(data:completion:)`, `addPasses(fromArchiveAt:completion:)` and `addPasses(fromArchiveData:completion:)` -- all iOS 27.0+ (iOS/iPadOS/Catalyst/visionOS), all taking raw pass data or a `.pkpasses` archive so the app never has to parse each pass into a `PKPass` first. A six-leg itinerary is one presentation and one confirmation. Below iOS 27, `PKAddPassesViewController(passes:)` with an already-parsed `[PKPass]` gets the same single presentation.

Before drawing an "Add to Apple Wallet" affordance for a secure-element credential (payment card, key, transit), read `PKSecureElementPass.isProvisioningAvailable` (iOS 27.0+) and hide the affordance when it is false -- a dead Wallet button is a HIG violation. Pre-27, fall back to the `PKPassLibrary` capability checks and the `canAddSecureElementPass` family.

**Pass design.** iOS 27 adds the Poster Generic style -- full background image plus primary logo, header fields, primary fields, a footer field and a barcode -- usable for any category; plain Generic remains for iOS 26 and earlier. A pass can declare up to two `featuredActions` in `pass.json` (each an identifier, type and url) that surface as quick links such as venue directions or membership benefits; two is a hard cap, so choosing them is a task-flow decision, not a marketing slot. Apple's Pass Designer (a WYSIWYG Mac editor producing `.pkpasstemplate` files) and Pass Builder (a Swift-on-server package with a `buildpass` CLI) replace hand-authored JSON guesswork, and iOS 27 accepts EAN-13, Code 39, Codabar and ITF alongside PDF417 and QR. A pass whose essential information is baked into the background image rather than carried in fields and semantic tags is a clear finding: it breaks Apple Watch, VoiceOver and localization at once.

Three related surfaces worth knowing, not owning here: after a successful Apple Pay purchase, returning `orderDetails` (`PKPaymentOrderDetails`, iOS 16.0+) on the authorization result pushes the order into Wallet for live tracking against your Wallet Orders web service. Accepting contactless cards on an iPhone (merchant side) is the separate ProximityReader framework, gated by its own entitlement -- present Apple's built-in Tap to Pay UI and never build a custom card-read screen. And ID verification through Wallet belongs to `references/patterns/09-auth-account.md#identity-verification-through-wallet`, which owns the iOS 27 `PKIdentityElement.name` and `PKIdentityDocumentDescriptor.issuerIdentifiers` data-minimization rules.

## Availability + fallbacks

```swift
if #available(iOS 26, *) {
    SubscriptionOfferView(groupID: groupID, visibleRelationship: .upgrade)
} else {
    UpgradeRow(product: proProduct)          // Material-backed inline row, StoreView-driven
}
```

`SubscriptionStoreView`, `StoreView`, `ProductView`, and both entitlement tasks are iOS 17.0+ across the fleet -- no gate needed on an iOS-17-floor app. `PayWithApplePayButton` and `AddPassToWalletButton` are iOS 16.0+; gate any iOS-16-only piece and fall back to `PKPaymentAuthorizationController` + UIKit buttons on older targets.

Every iOS 27.0 symbol above needs `if #available(iOS 27, *)` with the fallback shown beside it while the target still supports iOS 26; an iOS-27 deployment target drops all of those gates. `ApplePayMerchandisingView` is the exception that keeps working after the gate goes: its `fallback:` builder answers region and partner coverage, not availability, so it stays at every target.

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
| Deprecated redeem entry point on an iOS-27 target | MEDIUM -- deprecated at 27.0, and the sheet returns nothing to react to | `offerCodeRedemption(options:isPresented:onCompletion:)` / `presentOfferCodeRedeemSheet(from:options:)` |
| Hand-written "or 4 payments of $X" installment copy | HIGH -- unauthorized replica of Apple financing messaging | `ApplePayMerchandisingView` with a real `fallback:` |
| Frozen `supportedNetworks` literal | MEDIUM -- hides the Apple Pay button in whole markets | Build it from the merchant account's actual networks |
| Apple Pay button overlaid, masked, screenshotted, or under 100x30pt | HIGH -- the system may draw the customer's card on it | System button at documented size, `.frame` only |
| One add-pass sheet per pass in a loop | MEDIUM -- N confirmations for one itinerary | One presentation: `PKAddPassesViewController(passesArchiveData:)` or `(passes:)` |
| Own "are you sure?" interstitial on cancellation | MEDIUM -- duplicates the system Confirm Cancellation page, reads as an obstacle | Configure Retention Messaging defaults per product and locale |
| Own win-back interstitial at launch with the system message unsuppressed | MEDIUM -- double-prompts the same customer | Intercept `Message.messages`, withhold `.winBackOffer`, or drop yours |
| Bundle/Suite product rendered as an opaque row | MEDIUM -- hides what the purchase contains | Render `bundledSubscriptions` names and prices |
| Consumer paywall shown to an `.education`/`.enterprise` install | MEDIUM -- un-purchasable prompt on a managed device | Branch on `AppTransaction.storeType` |

## Severity guide

- **CRITICAL**: a dark pattern that traps the user in the purchase flow, or an Apple Pay/StoreKit boundary violation (a physical-goods button gating digital IAP content).
- **HIGH**: missing required disclosure or restore path, a trademark/HIG violation on a system payment button, or entitlement UI driven by a source that is not StoreKit.
- **MEDIUM**: an eligibility check gap that promises something StoreKit will refuse, a hand-rolled paywall with no concrete reason to bypass the built-in view, a redemption API deprecated at iOS 27.0 still in use on an iOS 27 target (the replacement is one line and returns the transaction), a duplicated system surface (own win-back interstitial, own cancellation interstitial), or a paywall shown to a managed install.
- **LOW**: a missed merchandising opportunity -- no win-back offer surfaced, no inline upgrade card where one belongs.

## See also

- `references/design/02-liquid-glass.md` -- Liquid Glass adoption the store views and payment buttons inherit automatically
- `references/haptics/02-swiftui-sensory-feedback.md#async-outcome-success-or-failure` -- the purchase-confirmation haptic pattern
- `references/accessibility/01-voiceover-fundamentals.md#label-composition` -- composing a single-phrase VoiceOver label for custom controls
- `references/accessibility/04-motor-interaction.md#touch-targets` -- the 44pt floor this file cites
- `references/patterns/01-gotchas-anti-patterns.md#reduce-motion-one-animation-accessor-gates-both-apis` -- the shared Reduce Motion gate
- `references/platform/08-app-clips-extensions.md#ephemeral-experience-and-size-budget` -- App Clips use `PayWithApplePayButton` as their native checkout path
