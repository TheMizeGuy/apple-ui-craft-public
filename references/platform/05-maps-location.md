# Maps and Location UI

> Owner: `references/platform/05-maps-location.md` owns SwiftUI `Map` content composition, camera control, search/selection/Look Around interaction, and Core Location authorization UX, per the ARCHITECTURE ownership map. Sheet presentation for place detail is a usage example here, not owned here -- cite `references/patterns/05-modality-sheets.md`. Smart Invert itself is owned by `references/accessibility/03-visual-accessibility.md#smart-invert`; this file only states the one map-specific application.
> Floors: SwiftUI `Map` and its content builder are iOS 17.0+ (`import MapKit`, replacing the deprecated iOS 14 `Map(coordinateRegion:)`). `mapItemDetailSelectionAccessory(_:)` and keyframe camera animation are iOS 18.0+. Liquid Glass control styling is automatic at iOS 26.0+ per `references/_scaffolding/version-floor-registry.md#ios-26x`. The eleven new `MKPointOfInterestCategory` values and `CLLocationManager.headingBody` are iOS 27.0+, and `headingOrientation` is deprecated at 27.0; the other MapKit and Core Location surfaces listed below are soft-deprecated rather than version-deprecated.

A map earns its place in an app only when it is the fastest way to answer "where," "how far," and "how do I get there" -- everything in this file exists to keep the map itself clean (few controls, decluttered pins, a style tuned to be a backdrop) while your data does the talking. The single most common way this goes wrong: never asking the OS to grant location, or asking on cold launch before the user has any reason to say yes.

## The Apple way

- Default to `Marker`; reach for `Annotation` only when the pin shape is genuinely wrong for the data -- a screen of custom `Annotation` views is the number one cause of janky map scrolling.
- Never fire `requestWhenInUseAuthorization()` from `init`/`onAppear`. Prime with your own explainer screen first; the system dialog is a one-shot resource just like notifications.
- Check `position.positionedByUser` before any programmatic recenter -- auto-snapping the camera while the user is actively panning is the most-hated map bug there is.
- `.mapStyle(.standard(emphasis: .muted, pointsOfInterest: .excludingAll))` when the map is a backdrop for your own data -- filtering to relevant POI categories is the difference between a cluttered map and a focused one.
- Above a few hundred pins, cluster. SwiftUI's `Map` does not auto-cluster the way UIKit's `MKMapView` does.

## Core APIs -- Map, content, and Marker vs Annotation

```swift
import MapKit
import SwiftUI

// Bound-camera initializer -- the one you use most.
Map(position: $position, bounds: cameraBounds, interactionModes: .all,
    selection: $selectedPlaceID) {
    // Balloon pin -- cheap, auto-declutters against system labels.
    Marker("City Hall", coordinate: cityHall)
        .tint(.orange)
        .tag(cityHall.id)

    // Fully custom view anchored to a coordinate -- only when the pin shape is wrong.
    Annotation("Playground", coordinate: playground, anchor: .bottom) {
        Image(systemName: "figure.play")
            .padding(6)
            .background(.yellow, in: .circle)
    }
    .annotationTitles(.hidden)                 // suppress the system label under Annotation

    // Overlays, translucent so the map stays legible underneath:
    MapCircle(center: hq, radius: 500)
        .foregroundStyle(.blue.opacity(0.15))
        .stroke(.blue, lineWidth: 2)
    MapPolyline(route.polyline)                // driven straight off an MKRoute, never re-derived
        .stroke(.blue, lineWidth: 5)
}
```

`interactionModes` is an `OptionSet` (`.all`, `.pan`, `.zoom`, `.rotate`, `.pitch`, or `[]` for a fully static preview map). `Marker` handles collision/decluttering against system POI labels automatically and is far cheaper than `Annotation`; keep `Annotation` bodies trivial (an SF Symbol in a circle) -- heavy views multiply per pin every frame. `MKMapItem` identity for `ForEach` is not `Identifiable`-safe; use `id: \.self`.

## Search-as-you-type and directions

`MKLocalSearchCompleter` streams completions as the query changes; bridge its delegate into an `@Observable` model feeding `.searchable`/`.searchSuggestions` (owner of the generic search UI pattern: `references/design/07-navigation-patterns.md#search`):

```swift
@Observable @MainActor
final class SearchModel: NSObject, MKLocalSearchCompleterDelegate {
    private let completer = MKLocalSearchCompleter()
    var suggestions: [MKLocalSearchCompletion] = []
    var query = "" { didSet { completer.queryFragment = query } }

    override init() {
        super.init()
        completer.delegate = self
        completer.resultTypes = [.pointOfInterest, .address]
    }
    func setRegion(_ r: MKCoordinateRegion) { completer.region = r }   // bias to the visible map
    nonisolated func completerDidUpdateResults(_ c: MKLocalSearchCompleter) {
        Task { @MainActor in suggestions = c.results }
    }
}
```

`MKLocalSearchCompleter` already coalesces internally -- no manual debounce needed. DO throttle the follow-on `MKLocalSearch`/`MKDirections` calls; both are rate-limited and networked.

```swift
let request = MKDirections.Request()
request.source = a; request.destination = b
request.transportType = .automobile                 // .walking, .transit
let route = try await MKDirections(request: request).calculate().routes.first
// route.polyline -> MapPolyline(route.polyline); route.expectedTravelTime/.distance for a glass overlay card
```

Frame results and routes with `position = .rect(route.polyline.boundingMapRect)` (or `.automatic`) so the whole path is visible before the user zooms further.

## Camera control -- MapCameraPosition and cinematic fly-to

Never mutate `MKMapView` directly; drive a `Binding<MapCameraPosition>` instead:

```swift
@State private var position: MapCameraPosition = .automatic

.automatic                                            // frames the map's content (all Markers/overlays)
.region(MKCoordinateRegion(center: coord, span: .init(latitudeDelta: 0.02, longitudeDelta: 0.02)))
.camera(MapCamera(centerCoordinate: coord, distance: 800, heading: 0, pitch: 60))   // 3D angle
.userLocation(fallback: .automatic)                   // follow the blue dot
```

Read `position.positionedByUser` before any programmatic recenter. Constrain panning with `MapCameraBounds(centerCoordinateBounds:minimumDistance:maximumDistance:)`. React to camera settling with `.onMapCameraChange(frequency: .onEnd)` (default; cheap) -- reserve `.continuous` for a live readout only, never for network work, since it fires on every frame.

For the polished "tap a result, sweep to it" motion, `mapCameraKeyframeAnimator(trigger:keyframes:)` (iOS 18+) drives `MapCamera` properties across `KeyframeTrack`s -- a pull-back-then-zoom-in arc on `\.distance` is what sells the camera as flying rather than teleporting. For a simple move, prefer plain `withAnimation { position = .region(newRegion) }`; reserve the keyframe animator for genuinely bespoke multi-track choreography, and gate its looping arc behind Reduce Motion per the double-gate owned by `references/accessibility/05-motion-accessibility.md`.

## Selection, POI interaction, and Look Around

Bind `selection:` to a type matching the `.tag(_:)` on each piece of content:

```swift
@State private var selectedPlaceID: Place.ID?

Map(position: $position, selection: $selectedPlaceID) {
    ForEach(places) { place in
        Marker(place.name, systemImage: place.symbol, coordinate: place.coordinate).tag(place.id)
    }
}
.sheet(item: Binding(get: { places.first { $0.id == selectedPlaceID } },
                      set: { selectedPlaceID = $0?.id })) { place in
    PlaceDetail(place: place).presentationDetents([.medium, .large])   // detent mechanics: patterns/05, owner
}
```

The selection value type and the `.tag` type must be identical (`Place.ID`, not the whole struct unless it's `Hashable`) or taps silently do nothing. For Apple's own labeled POIs, bind `selection` to `MapSelection<MKMapItem>` and use `.mapFeatureSelectionAccessory(.callout)` for the system callout, or `mapItemDetailSelectionAccessory(_:)` (iOS 18+) for a rich Maps-style detail callout with hours/photos/Directions for free.

Look Around is a two-step fetch-then-present, and the fetch can legitimately return no coverage:

```swift
@State private var scene: MKLookAroundScene?

func loadScene(for coordinate: CLLocationCoordinate2D) async {
    scene = try? await MKLookAroundSceneRequest(coordinate: coordinate).scene   // nil = no coverage
}

if let scene {
    LookAroundPreview(scene: .constant(scene), allowsNavigation: true, showsRoadLabels: true)
        .frame(height: 160)
        .clipShape(.rect(cornerRadius: 12))
}
```

Only show the preview card when `scene != nil` -- an empty "no imagery" box reads as broken, not absent.

## Location permission craft

The single biggest map-UX failure is firing the location prompt cold on launch. You get one shot at the system dialog; a cold prompt gets denied, and denial is sticky (recoverable only through Settings). Explain the value in your own UI first, then trigger the system prompt only on explicit opt-in -- the same priming pattern owned in full by `references/platform/04-system-surfaces-notifications.md`.

```swift
@Observable
final class LocationModel: NSObject, CLLocationManagerDelegate {
    private let manager = CLLocationManager()
    var status: CLAuthorizationStatus
    var accuracy: CLAccuracyAuthorization

    override init() {
        status = manager.authorizationStatus
        accuracy = manager.accuracyAuthorization
        super.init()
        manager.delegate = self
    }
    func requestWhenInUse() { manager.requestWhenInUseAuthorization() }

    func locationManagerDidChangeAuthorization(_ m: CLLocationManager) {
        status = m.authorizationStatus                 // drives the view; runs after the user answers
        accuracy = m.accuracyAuthorization
    }
}
```

`.whenInUse` covers almost every map app; reserve `.always` for geofencing/turn-by-turn, requested contextually AFTER when-in-use is granted -- requesting `.always` first is a documented mistake: the OS routes straight to Settings and the user never sees the in-app dialog. Required `Info.plist` keys crash on request if missing: `NSLocationWhenInUseUsageDescription` (any location access -- one benefit-first sentence, shown verbatim in the dialog), `NSLocationAlwaysAndWhenInUseUsageDescription` (background/Always), `NSLocationTemporaryUsageDescriptionDictionary` (per-purpose temporary full accuracy).

Users can grant "Precise: Off" (~5 km, iOS 14+). Read `accuracyAuthorization`; if `.reducedAccuracy` and a task genuinely needs precision (turn-by-turn), request a one-time upgrade tied to an `Info.plist` purpose key:

```swift
manager.requestTemporaryFullAccuracyAuthorization(purposeKey: "Navigation")
```

Do not block a "find nearby" experience on precise location -- it works fine at reduced accuracy. Show `UserAnnotation()` and `MapUserLocationButton` only in the authorized branch; a recenter button that does nothing is worse than none.

## Controls, styling, and clustering

`.mapControls { }` places the standard control set; on iOS 26 they render as floating Liquid Glass automatically -- do not rebuild them:

```swift
Map(position: $position) { /* content */ }
    .mapControls { MapUserLocationButton(); MapCompass(); MapScaleView(); MapPitchToggle() }
    .mapStyle(.standard(elevation: .automatic, emphasis: .muted,
                         pointsOfInterest: .excludingAll, showsTraffic: true))
```

`.mapControlVisibility(.hidden)` goes edge-to-edge behind your own chrome (a bottom sheet UI); if you take that route you OWN recenter and orientation reset, styled to match with `.glassEffect()` grouped inside a `GlassEffectContainer` (owner `references/design/02-liquid-glass.md#glass-buttons`) so your custom map chrome reads as one glass surface alongside MapKit's own controls. `PointOfInterestCategories` filters system POIs (`.all`, `.excludingAll`, `.including([...])`, `.excluding([...])`) -- filtering to relevant categories is what separates a focused map from clutter.

iOS 27 adds eleven `MKPointOfInterestCategory` values, weighted toward travel and the outdoors: `airportTerminal`, `automotiveDealership`, `commercialVehicleDealership`, `informationBooth`, `motorbikeDealership`, `picnicArea`, `rangerStation`, `restArea`, `scenicView`, `ticketOffice`, `visitorCenter`. They are the only new MapKit symbols in the 27 SDK, and they turn `.excludingAll` from the only honest decluttering answer into a fallback -- a road-trip or trails app can now keep exactly the places it is about:

```swift
private var relevantPOIs: PointOfInterestCategories {
    var categories: [MKPointOfInterestCategory] = [.gasStation, .park, .campground]
    if #available(iOS 27, *) { categories += [.restArea, .scenicView, .picnicArea, .visitorCenter] }
    return .including(categories)
}

Map(position: $position) { /* content */ }
    .mapStyle(.standard(emphasis: .muted, pointsOfInterest: relevantPOIs))
```

Build the array at runtime like this rather than gating the whole `.mapStyle` call; below iOS 27 the map keeps the categories it always had.

SwiftUI's `Map` does not auto-cluster `Marker`/`Annotation` the way `MKMapView` does via `clusteringIdentifier`. Above roughly 200-300 pins, either grid-cluster manually on `.onMapCameraChange(frequency: .onEnd)`, or drop to `MKMapView` via `UIViewRepresentable` for Apple's built-in decluttering at thousands of annotations.

## Accessibility: accessibilityIgnoresInvertColors

Smart Invert is owned by `references/accessibility/03-visual-accessibility.md#smart-invert`; the one map-specific application is marking the map itself exempt, since inverting a map's cartographic colors makes it misleading rather than merely differently-colored:

```swift
Map(position: $position) { /* content */ }
    .accessibilityIgnoresInvertColors()   // exempt the map from Smart Invert; default true when applied
```

## Legacy surfaces to migrate off

Each replacement is available well below this file's floor, so none of these migrations needs an availability branch.

| Superseded | Status | Replacement |
|---|---|---|
| `MKMapView.mapType` / `pointOfInterestFilter` / `showsBuildings` / `showsTraffic`, `MKMapSnapshotter.Options` equivalents | Soft-deprecated in Apple's documentation | `preferredConfiguration` with `MKStandardMapConfiguration` / `MKHybridMapConfiguration` / `MKImageryMapConfiguration` (iOS 16+) |
| `MKMapCamera.altitude` | Soft-deprecated in Apple's documentation | `centerCoordinateDistance` |
| `CLPlacemark` in full, plus `CLCircularRegion` / `CLBeaconRegion` and `CLLocationManager.startMonitoring(for:)` / `stopMonitoring(for:)` / `requestState(for:)` | Soft-deprecated in Apple's documentation | `MKMapItem` / `MKAddress` for address text; `CLMonitor` (iOS 17+) for geofencing |
| `CLLocationManager.headingOrientation` | Deprecated at iOS 27.0 | `headingBody` |

Soft-deprecated means prefer the replacement in new code; existing call sites still compile and do not warn. Only `headingOrientation` carries a hard iOS 27.0 deprecation.

The `preferredConfiguration` migration is a craft upgrade, not just a rename: POI filtering, traffic and elevation stop being four independent toggles on the view and become one configuration object you can build, name and reuse. And `CLGeocoder` + `CLPlacemark` should stop being the way an address label gets rendered -- the `MKMapItem` path is the one this file's selection accessories already use.

Heading is the one iOS 27.0 location-UX change worth acting on now. It stops being expressed as a device interface orientation and becomes a reference body:

```swift
if #available(iOS 27, *) {
    manager.headingBody = headingReference      // the any CLBodyIdentifiable heading is measured against
} else {
    manager.headingOrientation = .portrait
}
```

That fixes a real bug class: a compass arrow driven by `headingOrientation` points wrong whenever the scene's orientation and the device's differ, which resizable iPad scenes and iPhone Mirroring make routine rather than exotic. Core Location also gains `CLActivityType.maritime` and `CLLocationUpdate.LiveConfiguration.maritime` at 27.0 for on-water positioning.

## Availability + fallbacks

```swift
// mapItemDetailSelectionAccessory and the keyframe camera animator are iOS 18+;
// everything else in this file (Map, MapContentBuilder, MapCameraPosition, mapControls) is iOS 17+.
if #available(iOS 18, *) {
    map.mapItemDetailSelectionAccessory(.callout)
} else {
    map.mapFeatureSelectionAccessory(.callout)   // iOS 17 fallback: system callout, no rich detail card
}
```

## Accessibility contract

VoiceOver reads `Marker`/`Annotation` labels from the title you supply -- give every pin a real name, never a bare coordinate. `LookAroundPreview` and system map controls carry their own VoiceOver support; you own labels only on custom `Annotation` content and any chrome you build under `.mapControlVisibility(.hidden)`. The camera keyframe fly-to is a looping-arc motion effect the system does not auto-gate -- wrap it per the Reduce Motion double-gate owned by `references/accessibility/05-motion-accessibility.md`; a plain `withAnimation` region move is a one-shot transition and does not need the same treatment.

## Anti-patterns

| Wrong | Why it fails | Right |
|---|---|---|
| `requestWhenInUseAuthorization()` in `init`/`onAppear` | Cold prompt, likely denied, denial is sticky | Prime with your own screen, request on explicit tap |
| Requesting `.always` before `.whenInUse` | OS routes straight to Settings; user never sees the dialog | Always request `.whenInUse` first |
| A screen of custom `Annotation` views for hundreds of pins | Multiplies per-pin view cost every frame; scroll jank | `Marker` by default; cluster above ~200-300 pins |
| Auto-recentering the camera while the user pans | The most-hated map bug | Check `position.positionedByUser` before any programmatic move |
| `.onMapCameraChange(frequency: .continuous)` driving a network fetch | Fires every frame | `.onEnd` for a "search this area" affordance |
| Showing a Look Around card when `scene == nil` | Reads as a broken image, not absent coverage | Conditionally render only on a resolved scene |
| Blocking "find nearby" on precise-location upgrade | Reduced accuracy is fine for most map use cases | Request the one-time full-accuracy upgrade only when truly needed |
| `CLGeocoder` + `CLPlacemark` to render an address label | `CLPlacemark` is soft-deprecated; the address path moved to MapKit | `MKMapItem` / `MKAddress`, the same path the selection accessories use |
| Setting `mapType`/`showsTraffic` directly on `MKMapView` | Soft-deprecated; four toggles that should be one object | `preferredConfiguration` with an `MKStandardMapConfiguration` (iOS 16+) |
| A compass arrow driven by `headingOrientation` | Deprecated at 27.0, and points wrong when the scene's orientation differs from the device's | `headingBody` behind `#available(iOS 27, *)` |

## Severity guide

CRITICAL: a location-gated feature crashes because a required `Info.plist` usage-description key is missing. HIGH: cold-prompting location on launch with no priming; auto-recentering over an actively-panning user. MEDIUM: hundreds of ungrouped `Annotation` views causing visible scroll stutter; missing `MapUserLocationButton` on a map that shows the user's location. LOW: unfiltered system POI clutter on a data-focused map. NIT: a custom map control not wrapped in `.glassEffect()` next to MapKit's own Liquid Glass controls.

## See also

- `references/platform/04-system-surfaces-notifications.md` -- the shared cold-prompt/priming pattern this file's location UX reuses
- `references/design/02-liquid-glass.md#glass-buttons` -- `.glassEffect()` / `GlassEffectContainer` for custom map chrome (owner)
- `references/design/07-navigation-patterns.md#search` -- `.searchable`/`.searchSuggestions` mechanics (owner)
- `references/patterns/05-modality-sheets.md#sheets` -- detent mechanics for place-detail sheets (owner)
- `references/accessibility/03-visual-accessibility.md#smart-invert` -- Smart Invert (owner)
- `references/accessibility/05-motion-accessibility.md` -- Reduce Motion double-gate for the camera keyframe fly-to (owner)
