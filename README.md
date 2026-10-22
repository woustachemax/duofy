# Duofy

A Claude skill that gets iOS apps off the letterbox on iPhone Duo. It works on Swift, SwiftUI, UIKit, Objective-C, React Native, Expo, Flutter and NativeScript codebases.

Duofy has two parts. A zero dependency scanner finds the layout patterns that break on a foldable, like `UIScreen.main`, orientation driven layout, symmetric safe area math, `Dimensions.get('screen')`, `ui.window` and `Screen.mainScreen`. A set of fix guides tells Claude how to rewrite each one properly. Everything runs on your machine with your own Claude, so no source code leaves your laptop.

## Install

Claude Code, for one project or for every project:

```
cp -r duofy .claude/skills/
cp -r duofy ~/.claude/skills/
```

Claude apps: upload `duofy.zip` under Settings, Capabilities, Skills.

Then ask something like "make this app work properly on iPhone Duo".

## Scanner on its own

```
node duofy/scripts/scan.mjs path/to/app
node duofy/scripts/scan.mjs path/to/app --json
node duofy/scripts/scan.mjs path/to/app --fail-on high
node duofy/scripts/scan.mjs --list-rules
```

Silence a reviewed finding with a `duofy-ignore: SW001` comment on the line or the line above.

## CI

```yaml
name: duofy
on: [pull_request]
jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: node duofy/scripts/scan.mjs . --fail-on high
```

## Before you start

The black bars go away only when the app is built with Xcode 27.1. The code fixes are what make the app look right once it has the whole screen. Older apps on any of these stacks may also need the UIScene migration first, or the rebuild will not launch, and the scanner checks for that. .NET MAUI and Kotlin Multiplatform are not covered yet.
