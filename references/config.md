# Config and project level findings

## CF001

`UIRequiresFullScreen` is still honored on the Duo, but the app still resizes when the device opens or closes. Teams sometimes add it to opt out of iPad multitasking. It does not opt out of the Duo work, so layout still has to adapt. Removing it changes iPad behavior too, so only remove it if the user wants iPad multitasking.

## CF002

A portrait only `UISupportedInterfaceOrientations` is respected on the outer display but ignored on the inner one. CF003 is the Expo `orientation: "portrait"` equivalent. Leave the setting if the product wants it for the outer display. What matters is that no layout code assumes portrait because of it.

## CF004

This one blocks everything else. Removing the letterbox means building with Xcode 27.1, and apps built with the iOS 27 SDK that have not adopted the UIScene lifecycle terminate before any `AppDelegate` method runs. A new SwiftUI app with an `App` struct already has scenes. Older UIKit, Objective-C and React Native apps often do not, and the giveaway is an `AppDelegate` that creates `self.window` itself.

The scanner checks for `UIApplicationSceneManifest` in any Info.plist, the `INFOPLIST_KEY_UIApplicationSceneManifest_Generation = YES` build setting, or a SwiftUI `App` entry point. If it says the lifecycle is missing, confirm by reading the `AppDelegate`, then tell the user before doing anything. This is a real migration and it deserves its own pull request, separate from the layout fixes.

Scenes need a deployment target of iOS 13 or later. If the target is lower, raising it is the user's call.

For a UIKit app the migration has three parts.

Add the manifest to the app's Info.plist. Add `UISceneStoryboardFile` to the configuration if the app launches from a storyboard.

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
                <string>$(PRODUCT_MODULE_NAME).SceneDelegate</string>
            </dict>
        </array>
    </dict>
</dict>
```

Move window creation from the `AppDelegate` into a scene delegate.

```swift
final class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }
        let window = UIWindow(windowScene: windowScene)
        window.rootViewController = RootViewController()
        window.makeKeyAndVisible()
        self.window = window
    }
}
```

Move the rest of the launch and lifecycle handling across. Deep links, universal links, shortcut items and handoff arrive through `connectionOptions` at launch and through scene delegate methods afterwards. Foreground and background work moves from the app delegate callbacks to the scene ones. Anything that reached for `UIApplication.shared.delegate.window` needs the scene's window instead. Push notification registration stays in the `AppDelegate`.

For an Objective-C app the delegate class name in the manifest is the plain class name, without the module prefix.

Flutter and NativeScript have their own migrations. Follow FL101 and FL102 in `flutter.md`, or the scene manifest section in `nativescript.md`, rather than these UIKit steps.

For bare React Native, the `AppDelegate` shape depends on the React Native version. Check the React Native upgrade helper and release notes for the version in package.json and follow the template it shows, instead of hand-writing a scene delegate around the root view. If that version's template has no scene support, upgrading React Native is the real fix, and that is the user's call.

## PJ003

The project uses Expo with no committed `ios` folder, so the native app is generated during the build and the scanner cannot see whether it adopts scenes. Check the Expo SDK version from the scanner output against Expo's changelog for UIScene support before building with Xcode 27.1, and check any config plugins that modify the `AppDelegate`.

## PJ001

Nothing in the native code reads a horizontal size class, which usually means the app has one layout for every screen. Once the bars are gone, that layout gets stretched across the inner display. The cheapest high impact fix is at the top level navigation, like moving to `NavigationSplitView` or `UISplitViewController`, or opting the tab bar into a sidebar on regular width. See `swift.md` under SW002 and the wide canvas guidance.

## PJ002

The JavaScript reads `Dimensions` but nothing subscribes to size changes (`useWindowDimensions`, `onLayout` or a `Dimensions` listener). Layout is fixed at launch, so it will be wrong after the user opens or closes the Duo. See `react-native.md` under RN001.

## Toolchain

The scanner cannot see which Xcode builds the app. That check lives in step 1 of SKILL.md and it decides whether any of the code work is visible on the device at all.
