# NativeScript fixes

NativeScript apps get the same letterbox as native apps until the iOS app is built with Xcode 27.1. NativeScript calls UIKit directly, so the same layout mistakes show up in TypeScript, plus a few NativeScript-specific ones.

## Toolchain first

The scanner prints the `@nativescript/core` version. Run `ns --version` or ask the user for the CLI version.

- NativeScript 9 added UIScene lifecycle support. It switches to scenes automatically when the app's Info.plist has a scene manifest, and the default scene delegate is enough for most apps.
- Earlier versions have no scene support, so an Xcode 27.1 build of them will not launch. That is PJ005, and the fix is upgrading to NativeScript 9 (the CLI's `ns migrate` handles most of it). That is the user's call.

## Scene manifest

Once on NativeScript 9, add the manifest to `App_Resources/iOS/Info.plist`.

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
                <key>UISceneConfigurationName</key>
                <string>Default Configuration</string>
                <key>UISceneDelegateClassName</key>
                <string>SceneDelegate</string>
            </dict>
        </array>
    </dict>
</dict>
```

Code that listened to app lifecycle events for foreground and background work should move to the scene events (`SceneEvents.sceneDidActivate`, `SceneEvents.sceneDidEnterBackground` and the rest) through `Application.on`. Check NativeScript's multi-window guide for the version in use before writing this.

## NS001

`Screen.mainScreen.widthDIPs` and `heightDIPs` describe the physical display, not the space the app has. In Split View or half folded they are wrong, and values read once at startup never update when the Duo opens.

Prefer layouts that size themselves, like `GridLayout` with star columns or percentage widths. When code needs the number, read it from the view.

```ts
export function onLayoutChanged(args: EventData) {
  const view = args.object as View;
  const { width } = view.getActualSize();
  view.className = width >= 600 ? 'regular' : 'compact';
}
```

```xml
<GridLayout layoutChanged="onLayoutChanged" columns="300, *">
```

## NS002

`UIScreen.mainScreen` called from TypeScript has the same ambiguity as in Swift. Use the native view's window scene and trait collection. For most views `view.ios` is the `UIView`. For a `Page` it is the view controller, so go through its `view`.

```ts
const nativeView: UIView = view.ios;
const scale = nativeView.traitCollection.displayScale;
const screen = nativeView.window?.windowScene?.screen;
```

## NS003

`Device.deviceType === 'Tablet'` is false on the Duo even when it is open, and the `ns-phone` and `ns-tablet` root CSS classes follow the same rule. Branch on the view's width as in NS001 and style with your own `regular` and `compact` classes.

## NS004

`UIApplication.sharedApplication.keyWindow` and `Application.ios.window` assume one window. Use the view's own window (`view.ios.window`), or `Application.ios.getPrimaryWindow()` on NativeScript 9 when there is no view at hand.

## NS005

`Application.orientation()`, `statusBarOrientation` and orientation lock plugins pick the wrong layout when the Duo is open, because the inner display ignores orientation. Re-laying out on the `orientationChanged` event is fine, but the decision should come from the view's size. `width > height` from `getActualSize()` is the safe form.

## NS006

On the Duo the left and right safe area insets are often different. NativeScript applies safe areas itself unless `iosOverflowSafeArea` is turned on, so check that first. Where code reads insets manually, handle each side separately.

```ts
const insets = (view.ios as UIView).safeAreaInsets;
const innerWidth = width - insets.left - insets.right;
```

## NS007

Comparisons like `width > 414` encode a specific phone. Replace them with a named breakpoint.

## Wide canvas guidance

On regular width, show navigation on the side instead of a bottom tab strip, like a `RootLayout` drawer that stays open or a two column `GridLayout` for list and detail screens. Cap long text with a max width. Keep state across folds by avoiding page re-navigation on size changes.

## PJ005

The app is on NativeScript before 9. See the toolchain section above.
