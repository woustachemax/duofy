# Swift, SwiftUI, UIKit and Objective-C fixes

Each section matches a scanner rule. Read the code around the finding first. The goal is the same behavior on a normal iPhone and correct behavior in every Duo pose.

## Match the deployment target

The scanner prints the lowest deployment target it finds (`lowestDeploymentTarget` in the JSON). Every fix has to compile against it, because existing apps often support versions far older than the newest APIs.

- iOS 17 and later can use `registerForTraitChanges` and `containerRelativeFrame`.
- Older targets use `traitCollectionDidChange` and `GeometryReader`. Both are shown below.
- iOS 26 APIs like `ConcentricRectangle` and iOS 27.1 APIs like `ReservedRegion` need an `if #available` check unless the target is that high.
- Never raise the deployment target to make a fix easier without asking. It drops users.

Objective-C code gets Objective-C fixes. Do not rewrite a file in Swift as part of this work.

## SW001

`UIScreen.main` and `[UIScreen mainScreen]` (OBJ001) pick one display on a device that has two. Whatever the code was using it for, there is almost always a more local answer.

For sizes, use the view or container you are laying out in.

```swift
let available = view.bounds.inset(by: view.safeAreaInsets).size
```

For pixel scale, use the trait collection.

```swift
let scale = traitCollection.displayScale
```

If the screen itself is needed, read it from the scene the view lives in.

```swift
let screen = view.window?.windowScene?.screen
```

In SwiftUI, `.frame(width: UIScreen.main.bounds.width)` usually becomes a container relative frame or a `GeometryReader`.

```swift
Image("cover")
    .resizable()
    .scaledToFill()
    .containerRelativeFrame(.horizontal)
```

```swift
GeometryReader { proxy in
    CarouselView(itemWidth: proxy.size.width * 0.8)
}
```

`containerRelativeFrame` needs iOS 17. For older targets use the `GeometryReader` form.

Values cached once at launch, like a static `let screenWidth = UIScreen.main.bounds.width`, are the worst case because they never update when the device opens. Delete the cache and read the size where it is used.

SW008 is the fallback form, like `window?.bounds ?? UIScreen.main.bounds`. The fallback runs when there is no window yet, and then it reads the wrong display. Usually the fix is to return early and lay out again once the view is in a window, since `layoutSubviews` and `viewDidLayoutSubviews` run again then.

Objective-C:

```objc
CGFloat scale = self.traitCollection.displayScale;
UIScreen *screen = self.view.window.windowScene.screen;
CGRect usable = UIEdgeInsetsInsetRect(self.view.bounds, self.view.safeAreaInsets);
```

An `AppDelegate` that builds its window with `[[UIWindow alloc] initWithFrame:[[UIScreen mainScreen] bounds]]` is a sign the app has no scene lifecycle. That is CF004 in `config.md` and it comes first.

## SW002

`userInterfaceIdiom == .pad` checks were a proxy for "do I have room". The Duo is always `.phone` but has regular width when open, so idiom checks hide the big layout right when it is needed. Replace the proxy with size classes.

SwiftUI:

```swift
@Environment(\.horizontalSizeClass) private var horizontalSizeClass

var body: some View {
    if horizontalSizeClass == .regular {
        TwoColumnFeed()
    } else {
        SingleColumnFeed()
    }
}
```

UIKit, reacting when the class changes:

```swift
override func viewDidLoad() {
    super.viewDidLoad()
    applyLayout(for: traitCollection.horizontalSizeClass)
    registerForTraitChanges([UITraitHorizontalSizeClass.self]) { (self: Self, _: UITraitCollection) in
        self.applyLayout(for: self.traitCollection.horizontalSizeClass)
    }
}
```

`registerForTraitChanges` needs iOS 17. For older targets override `traitCollectionDidChange` instead. It still works on newer systems, so one path is enough.

```swift
override func traitCollectionDidChange(_ previousTraitCollection: UITraitCollection?) {
    super.traitCollectionDidChange(previousTraitCollection)
    guard previousTraitCollection?.horizontalSizeClass != traitCollection.horizontalSizeClass else { return }
    applyLayout(for: traitCollection.horizontalSizeClass)
}
```

Objective-C:

```objc
- (void)traitCollectionDidChange:(UITraitCollection *)previousTraitCollection {
    [super traitCollectionDidChange:previousTraitCollection];
    if (previousTraitCollection.horizontalSizeClass != self.traitCollection.horizontalSizeClass) {
        [self applyLayoutForSizeClass:self.traitCollection.horizontalSizeClass];
    }
}
```

`UI_USER_INTERFACE_IDIOM()` is the old macro form of the same check and gets the same fix.

Leave idiom checks that are not about layout, like enabling Apple Pencil features.

## SW003

The inner display ignores supported interface orientations, so code like `if UIDevice.current.orientation.isLandscape { wideLayout() }` picks the wrong layout when the Duo is open. `statusBarOrientation` and `UIInterfaceOrientationIsLandscape` in older code are the same problem.

Swap orientation for size classes as in SW002, or for an aspect check on the space you have.

```swift
let isWide = view.bounds.width > view.bounds.height
```

Keep orientation reads that drive something physical, like camera capture rotation or a compass. Those are not layout.

## SW005

On the Duo the vertical toolbar can sit on either side, so the left and right insets are often different. Doubling one side is wrong.

```swift
let width = view.bounds.inset(by: view.safeAreaInsets).width
```

For Auto Layout, constrain to the guide and let it handle each edge.

```swift
NSLayoutConstraint.activate([
    content.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor),
    content.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor),
])
```

The same applies to `layoutMargins` and `directionalLayoutMargins`.

## SW006

Comparisons like `width > 414` encode a specific phone. Replace them with a size class, or with a named breakpoint that describes the layout decision.

```swift
let showsSidebar = horizontalSizeClass == .regular
```

If a numeric breakpoint is truly needed, name it after what it controls and compare against the container's width, not the screen's.

## SW007

`UIApplication.shared.windows` and `keyWindow` assume one window. With two displays and multiple scenes, use the window the view is in.

```swift
guard let window = view.window else { return }
```

For code with no view, like a presenter or a coordinator, pass the scene or window in rather than looking it up globally.

## Wide canvas guidance

These are not scanner rules, but they are what makes a full-screen app look right once the bars are gone.

Readable width. Long text stretched across the inner display is hard to read. In UIKit constrain text to `readableContentGuide`. In SwiftUI cap it.

```swift
ArticleBody()
    .frame(maxWidth: 680)
    .frame(maxWidth: .infinity)
```

Sidebars. When the app has a `TabView` and more than a few destinations, opt into the sidebar on regular width with `.defaultTabBarPlacement(.sidebar)`.

State across folds. Use stable view identity and `@SceneStorage` for anything the user would be annoyed to lose, like the selected tab, a draft, or a scroll target. In UIKit, avoid recreating child view controllers inside `viewWillTransition(to:with:)` or trait change handlers.

Custom bars. A hand-built bottom bar will collide with the vertical system toolbar. Prefer a standard toolbar. If the custom bar has to stay, it is a candidate for `UIViewReservedRegion` or `ReservedRegion` in iOS 27.1. Look up the API before writing it.
