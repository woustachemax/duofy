# What Apple says about iPhone Duo layouts

Summarized from Apple's tech talk "Prepare your app for iPhone Duo" (September 2026). Source at https://developer.apple.com/videos/play/tech-talks/111461/

## The hardware

The Duo has a 5.4 inch outer display and a 7.6 inch inner display. Both have the same aspect ratio, so opening the device behaves more like an orientation change than a reshape. The status bar sits in a corner and standard toolbars, tab bars and the dock run vertically down the side.

## Compatibility tiers

Apps run on the Duo without being rebuilt. How much screen they get depends on the SDK.

- Pre iOS 27 SDK. Closed, the app uses the space beside the status bar and camera. Open, it runs at a familiar phone size with black around it.
- iOS 27 SDK. The app extends further on the inner display, to the left of the status bar area. Work done for iPhone app resizing pays off here.
- iOS 27.1 SDK. The app reaches the screen edges and standard navigation and toolbar buttons lay out vertically under the status bar.

## Size classes

- Outer display, portrait. Compact width, regular height. Same as other iPhones.
- Outer display, landscape. Compact width, compact height.
- Inner display. Regular width and regular height, which leaves room for sidebars.

The inner display does not honor supported interface orientations. Apple's advice is to stop using interface orientation and idiom for layout decisions and use size classes instead.

## Screens

On a device with two displays, referencing the main screen is ambiguous and will be deprecated. Use the environment, the trait collection or the scene's bounds. If the screen itself is needed, read it from the window scene.

Concentricity APIs from iOS 26 (`ConcentricRectangle` in SwiftUI, `UICornerConfiguration` in UIKit) are updated for the Duo's screen corners.

`UIRequiresFullScreen` is still honored, but the app still resizes when the device opens or closes. Supported orientations are respected on the outer display, and the app still scales on the inner display, including in Split View.

## Navigation

`NavigationSplitView`, `UISplitViewController`, `TabView` and `UITabBarController` adapt to every pose. Columns collapse into a stack when closed and tile or overlay when open. Tabs lay out vertically when appropriate. On the inner display a sidebar can be opted into.

```swift
TabView { }
    .defaultTabBarPlacement(.sidebar)
```

```swift
tabBarController.sidebar.preferredPlacement = .sidebar
```

Sheets, popovers, context menus and alerts adapt too.

## Safe areas

Standard bars lay out outside the safe area and avoid the status bar and camera on their own. Foreground interactive content belongs inside the safe area. Background art can extend past it. Safe areas and layout margins are often asymmetric on the Duo, since vertical bars can sit on either side in landscape and in Split View, so each edge must be handled separately.

## Reserved regions

New in iOS 27.1, `ReservedRegion` (SwiftUI) and `UIViewReservedRegion` (UIKit) let custom UI use space outside the safe area without colliding with system UI. They are meant for custom bars and edge to edge designs. Apple's companion talk "Strike a pose with adaptive layouts on iPhone Duo" covers them in depth. Check the documentation for exact signatures before using them.

## Tooling

Xcode 27.1 adds an iPhone Duo simulator in Device Hub with controls to open, close, rotate and fold. Apple's App Resizability skill in Xcode 27.1 covers SwiftUI and UIKit apps. Duofy overlaps with it for native code and adds React Native and Expo coverage.

## Companion talks

- Leverage multiple displays and scenes on iPhone Duo
- Raise the bar with iPhone Duo
- Strike a pose with adaptive layouts on iPhone Duo
- Modernize your UIKit app (WWDC26)
