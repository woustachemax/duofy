---
name: duofy
description: Make an iOS app fill the iPhone Duo foldable display instead of running letterboxed with black bars. Use when someone wants their Swift, SwiftUI, UIKit, Objective-C, React Native, Expo, Flutter or NativeScript app to support iPhone Duo or foldable and large iPhone screens, asks why their app shows black bars on the Duo, or wants a codebase audited for layout code that breaks when the device opens, closes, rotates or folds.
---

# Duofy

Duofy takes an existing iOS app from letterboxed to full screen on iPhone Duo. It pairs a deterministic scanner (`scripts/scan.mjs`, Node 18+, no dependencies) with fix guides. The scanner finds the patterns and you fix them with judgment.

## Why the black bars exist

The letterbox is chosen by the SDK the binary was built with, not by anything in the app's code.

- Built with an SDK older than iOS 27, the app runs at a familiar phone size and aspect ratio on the inner display, surrounded by black.
- Built with the iOS 27 SDK, it extends further but still leaves unused space.
- Built with the iOS 27.1 SDK (Xcode 27.1), it reaches the screen edges and standard bars lay out vertically.

So the toolchain comes first. Code fixes only show up on the device once the app is built with Xcode 27.1. After that, the code fixes are what stop the app looking stretched, cramped or broken in each pose. Background and sources are in `references/apple-guidance.md`.

## Workflow

### 1. Check the stack and toolchain

Run the scanner once to see what the repo contains:

```
node <skill-dir>/scripts/scan.mjs <repo-root>
```

The header tells you what kind of app this is. Read it before planning any fixes.

- `scenes` says whether the app has adopted the UIScene lifecycle. If it says `missing`, stop and tell the user first. Apps built with the iOS 27 SDK without scene support do not launch, so the Xcode 27.1 rebuild that removes the bars would break the app. Older UIKit, Objective-C, React Native, Flutter and NativeScript apps are the usual cases. The migration is CF004 in `references/config.md` (Flutter and NativeScript have their own steps in their references), and it should land on its own, before any layout work.
- `target` is the lowest iOS deployment target. Every fix must compile against it. Existing apps often support iOS 15 or 16, so iOS 17+ APIs need the older fallbacks in the references.
- The React Native, Expo, Flutter or NativeScript version decides which APIs exist, and for Flutter and NativeScript it also decides whether scenes are possible without an upgrade.

Then confirm the build toolchain.

- Native or bare React Native: run `xcodebuild -version` if you are on macOS, or ask the user. Xcode 27.1 or later is required. If it is older, tell the user plainly that nothing in the code will remove the bars until they build with 27.1, then continue with the code work only if they want it done ahead of time.
- Bare React Native: also note the `react-native` version in package.json. A new Xcode SDK sometimes needs a React Native upgrade to compile. Do not upgrade without asking.
- Expo with EAS Build: the Xcode version comes from the build image in `eas.json`. Check Expo's current build image list for one that ships Xcode 27.1. Do not guess image names.
- Flutter: run `flutter --version`. Flutter 3.41 or later migrates the runner to scenes automatically when the `AppDelegate` is unmodified. Older versions need an upgrade, which is the user's call. See `references/flutter.md`.
- NativeScript: version 9 or later is needed for scene support. See `references/nativescript.md`.

### 2. Scan

```
node <skill-dir>/scripts/scan.mjs <repo-root> --json > duofy-report.json
```

Other flags are `--only SW001,RN005` to rerun specific rules, `--fail-on high` for CI exit codes, `--include-tests` to scan test files, and `--list-rules`. Framework rules only run when the project declares that framework (`react-native` or `expo` or `@nativescript/core` in package.json, `sdk: flutter` in pubspec.yaml), so web code in a monorepo is skipped. Test files, generated Dart files, `.android` and `.web` platform files, and Flutter's `macos`, `windows`, `linux` and `web` folders are skipped by default.

Treat findings as leads, not verdicts. Read the surrounding code before changing anything. Some hits are fine, like camera code reading device orientation, or a one-off `Dimensions.get` used for analytics. Leave those alone and mention them in the report. Add a `duofy-ignore: <ID>` comment on or above the line only if the user wants a clean CI run.

### 3. Fix

Work through high, then medium, then info. Fix one rule at a time across the whole repo so each diff stays easy to review. Before fixing a rule, read its section in the matching reference.

- `SW*` and `OBJ*` go to `references/swift.md`
- `RN*` go to `references/react-native.md`
- `FL*` and PJ004 go to `references/flutter.md`
- `NS*` and PJ005 go to `references/nativescript.md`
- `CF*` and `PJ*` go to `references/config.md`

Principles that apply to every fix:

- Fit the codebase as it is. Objective-C stays Objective-C, class components stay class components, UIKit screens are not rewritten in SwiftUI, and Flutter or NativeScript layout stays in Dart or TypeScript rather than moving into native code. Use APIs that exist at the app's deployment target and framework version.
- Prefer system components over custom layout math. `NavigationSplitView`, `TabView`, `UISplitViewController`, `UITabBarController`, sheets and popovers already adapt to every pose. In Flutter, the equivalent is switching from `NavigationBar` to `NavigationRail` on wide layouts.
- Decide layout from size class or available width. Never from idiom, orientation or which phone it is.
- Handle each safe area edge on its own. On the Duo the left and right insets often differ.
- Cap readable width on the inner display instead of stretching text edge to edge.
- Keep state across fold changes, like scroll position, selection and text being typed. Do not tear down and rebuild view hierarchies on a size change.
- Never "fix" the problem by locking orientation, adding `UIRequiresFullScreen`, or hardcoding Duo dimensions.
- Do not add dependencies without asking. `react-native-safe-area-context` is the one exception worth proposing, since most React Native apps already have it.
- For APIs new in iOS 27.1, like `ReservedRegion` in SwiftUI and `UIViewReservedRegion` in UIKit, look up the exact signature in Apple's documentation rather than guessing, and gate the call with `if #available(iOS 27.1, *)` when the deployment target is lower.

### 4. Verify

Rerun the scanner. The high count should be zero and every remaining finding should have a reason.

You cannot see the simulator unless you have screen access, so do not claim visual results you have not seen. Give the user this checklist to run in the iPhone Duo simulator in Xcode's Device Hub, or walk it yourself if computer use is available and the user agrees.

1. Closed, portrait and landscape.
2. Open, flat.
3. Open and rotated.
4. Half folded, like a book and like a tent.
5. Split View with the app on the left, then on the right.
6. Open and close mid-scroll and mid-typing, and confirm the position and text survive.
7. Look for controls colliding with the vertical toolbar, the status bar corner and the inner camera.

### 5. Report

Keep it short. Cover the toolchain status, what was fixed per rule with file counts, what was left and why, and the pose checklist results if you have them. Do not commit or push unless the user asks.
