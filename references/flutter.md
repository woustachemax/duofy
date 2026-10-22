# Flutter fixes

Flutter apps get the same letterbox as native apps, because the bars depend on the SDK the iOS runner is built with. Once the app is built with Xcode 27.1, Flutter gets the full canvas, and everything after that is about how the Dart code sizes itself.

Flutter draws its own UI, so the Duo's vertical system toolbars do not apply to Flutter widgets. Apple's direction still does. On a wide canvas, controls belong on the side, which in Flutter means a `NavigationRail` instead of a `NavigationBar`.

## Toolchain first

Run `flutter --version` or ask the user. The scanner prints the Flutter range from pubspec.yaml.

- Flutter 3.41 and later migrates the iOS runner to the UIScene lifecycle automatically during `flutter build ios` or `flutter run`, but only when the `AppDelegate` is unmodified. On success the CLI prints a line saying the UIScene migration finished. Otherwise it warns and the migration is manual (FL101, FL102 below).
- Earlier Flutter versions do not migrate at all, and an app built with Xcode 27 without scenes fails to launch. PJ004 flags a version range that allows these.
- Xcode 27 needs an Apple Silicon Mac, so Intel CI runners will need replacing before the rebuild.

Use APIs that exist at the app's Flutter version. `MediaQuery.sizeOf` and the other `*Of` helpers need Flutter 3.10. On older versions use `MediaQuery.of(context).size`.

## FL001

`ui.window`, `WidgetsBinding.instance.window` and `PlatformDispatcher.instance.views.first` read one global view. Values computed from them at the top level of a file, like `final screenWidth = ui.window.physicalSize.width / ui.window.devicePixelRatio`, are frozen at launch and never change when the Duo opens. FL002 covers the same problem with `MediaQueryData.fromView`.

Read sizes from the widget tree so Flutter rebuilds when they change.

```dart
final size = MediaQuery.sizeOf(context);
final dpr = MediaQuery.devicePixelRatioOf(context);
```

For a size that belongs to one widget, ask its parent.

```dart
LayoutBuilder(
  builder: (context, constraints) {
    final columns = constraints.maxWidth >= 600 ? 3 : 1;
    return GridView.count(crossAxisCount: columns, children: tiles);
  },
)
```

Code outside the widget tree, like an image cache sizing thumbnails, should take the value as a parameter from the widget that calls it rather than reaching for a global. If there is no widget, `View.of(context)` from the nearest caller is still better than `views.first`.

## FL003

Device model checks and packages like `flutter_device_type` say "phone" for the Duo even when it is open, so the tablet layout never shows. Replace them with a width breakpoint from `LayoutBuilder` or `MediaQuery.sizeOf`. A variable named `isTablet` computed from width is already the right pattern, which is why the scanner does not flag it.

## FL004

`SystemChrome.setPreferredOrientations` and orientation sensor packages do not stop the inner display from being wide. Keep a lock if the product wants the outer display in portrait, but no layout should depend on it. `MediaQuery.orientationOf(context)` is computed from the current size, so it is fine to use.

## FL005

On the Duo the left and right safe area insets are often different. FL006 is the `EdgeInsets.symmetric` version of the same mistake.

```dart
final padding = MediaQuery.paddingOf(context);
final innerWidth = MediaQuery.sizeOf(context).width - padding.left - padding.right;
```

```dart
Padding(
  padding: EdgeInsets.only(left: padding.left, right: padding.right),
  child: child,
)
```

The `SafeArea` widget already handles each side on its own and is usually the simplest fix.

## FL007

Comparisons like `width > 414` encode a specific phone. Replace them with a named breakpoint that describes the layout decision.

## Wide canvas guidance

Side navigation. Switch from a bottom bar to a rail when there is room.

```dart
LayoutBuilder(
  builder: (context, constraints) {
    if (constraints.maxWidth < 600) {
      return Scaffold(body: page, bottomNavigationBar: NavigationBar(destinations: destinations, selectedIndex: index, onDestinationSelected: onSelect));
    }
    return Scaffold(
      body: Row(
        children: [
          NavigationRail(destinations: railDestinations, selectedIndex: index, onDestinationSelected: onSelect),
          Expanded(child: page),
        ],
      ),
    );
  },
)
```

Readable width. Cap long text instead of stretching it across the inner display.

```dart
Center(
  child: ConstrainedBox(
    constraints: const BoxConstraints(maxWidth: 680),
    child: article,
  ),
)
```

State across folds. Opening or closing the Duo rebuilds widgets but should not remount them. Avoid keys derived from width on large subtrees, keep `ScrollController`s in state objects, and use `PageStorageKey` for lists that should keep their position.

## FL101

After the UIScene migration the `AppDelegate`'s window is nil when `didFinishLaunching` runs, so code like `window?.rootViewController as! FlutterViewController` crashes. Method channels, platform views and anything else that needed the controller move into the implicit engine callback.

```swift
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)
    let channel = FlutterMethodChannel(
      name: "app/channel",
      binaryMessenger: engineBridge.applicationRegistrar.messenger()
    )
  }
}
```

If a `FlutterViewController` has to come from a storyboard, subclass it and do the setup in `awakeFromNib`.

## FL102

Plugin registration in `didFinishLaunching` is the other half of the same migration. Move it into `didInitializeImplicitFlutterEngine` as shown above, then add the scene manifest to `ios/Runner/Info.plist`.

```xml
<key>UIApplicationSceneManifest</key>
<dict>
  <key>UIApplicationSupportsMultipleScenes</key>
  <false/>
  <key>UISceneConfigurations</key>
  <dict>
    <key>UIWindowSceneSessionRoleApplication</key>
    <array>
      <dict>
        <key>UISceneClassName</key>
        <string>UIWindowScene</string>
        <key>UISceneDelegateClassName</key>
        <string>FlutterSceneDelegate</string>
        <key>UISceneConfigurationName</key>
        <string>flutter</string>
        <key>UISceneStoryboardFile</key>
        <string>Main</string>
      </dict>
    </array>
  </dict>
</dict>
```

Lifecycle callbacks on the `AppDelegate`, like `applicationDidBecomeActive`, stop being called. Move them to a `SceneDelegate` that subclasses `FlutterSceneDelegate`, and point `UISceneDelegateClassName` at `$(PRODUCT_MODULE_NAME).SceneDelegate`. Launch options are nil after migration, so deep link and notification launch handling moves to `scene(_:willConnectTo:options:)`.

Native plugin code inside the app that used `UIApplication.shared.delegate?.window`, `UIScreen.main` or `keyWindow` should go through the registrar's view controller instead.

```swift
let window = registrar?.viewController?.view.window
let screen = window?.windowScene?.screen
```

FL103 means someone switched the automatic migration off with `enable-uiscene-migration: false` in pubspec.yaml. Find out why before removing it, since it was usually a workaround for a custom `AppDelegate` that now needs the manual steps above.

Source for the migration steps is Flutter's breaking change note at https://docs.flutter.dev/release/breaking-changes/uiscenedelegate

## PJ004

The Flutter range in pubspec.yaml allows versions before 3.41. Upgrading Flutter is the user's call, and plugins may need updates with it. If they agree, raise the floor in pubspec.yaml so CI cannot build with an older SDK.

```yaml
environment:
  flutter: ">=3.41.0"
```
