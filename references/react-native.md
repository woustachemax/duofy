# React Native and Expo fixes

Each section matches a scanner rule. React Native apps get the same letterbox as native apps until the iOS binary is built with Xcode 27.1, so check the toolchain first (see SKILL.md). After that, the JavaScript has to stop assuming one fixed phone screen.

## RN001

`Dimensions.get('screen')` returns the physical display, not the area the app is drawn in. In Split View or with the device half folded those are different numbers. `Dimensions.get('window')` (RN002) is closer but is a snapshot. Module level reads like `const { width } = Dimensions.get('window')` never update when the Duo opens.

Use the hook so components re-render with the new size.

```tsx
import { useWindowDimensions } from 'react-native';

export function Grid() {
  const { width } = useWindowDimensions();
  const columns = width >= 600 ? 3 : 1;
  return <FlatList key={columns} numColumns={columns} data={items} renderItem={renderItem} />;
}
```

`FlatList` cannot change `numColumns` on the fly, which is why the `key` changes with it.

For a size that belongs to one component rather than the whole window, measure the component.

```tsx
const [width, setWidth] = useState(0);
<View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} />
```

Values computed in `StyleSheet.create` from a module level `Dimensions` read are frozen too. Move those into the component or into a style function.

`useWindowDimensions` needs React Native 0.61 or later and only works in function components. The scanner prints the React Native version. Class components, which are common in older apps, subscribe to changes instead. Do not convert a class component to a function component just for this.

```jsx
class Feed extends React.Component {
  state = { window: Dimensions.get('window') };

  componentDidMount() {
    this.subscription = Dimensions.addEventListener('change', ({ window }) => this.setState({ window }));
  }

  componentWillUnmount() {
    this.subscription?.remove();
  }

  render() {
    return <View style={{ width: this.state.window.width }} />;
  }
}
```

`addEventListener` returns a subscription from React Native 0.65. On older versions it returns nothing and cleanup uses `Dimensions.removeEventListener('change', handler)` with a stored handler.

## Layout classes in JavaScript

React Native has no built-in size class. A small hook that buckets the window width is enough for most apps.

```tsx
import { useWindowDimensions } from 'react-native';

export type LayoutClass = 'compact' | 'regular';

export function useLayoutClass(): LayoutClass {
  const { width } = useWindowDimensions();
  return width >= 600 ? 'regular' : 'compact';
}
```

The 600 point threshold is an approximation of Apple's horizontal size class, not the real thing. Closed Duo and normal iPhones land in compact and the open Duo lands in regular. If the app needs the exact native value, write a small native module that reads `traitCollection.horizontalSizeClass` and emits changes, and verify it in the simulator. Ask the user before adding native code.

## RN003

`Platform.isPad` and `DeviceInfo.isTablet()` are false on the Duo even when it is open, so the tablet layout never appears. Replace them with the layout class above. Keep them only for behavior that truly depends on the hardware type.

## RN004

Orientation locks from `react-native-orientation-locker` or `expo-screen-orientation` do not apply to the inner display, and hooks that report device orientation pick the wrong layout when the device is open. An `isLandscape` computed as `width > height` from live window dimensions is fine, which is why the scanner does not flag it. Keep a lock if the product wants the outer display portrait only, but make sure no layout code depends on it. Swap orientation checks for the layout class or for `width > height` on the window.

## RN005

On the Duo the vertical toolbar can sit on either side, so left and right insets are often different.

```tsx
const insets = useSafeAreaInsets();
const innerWidth = width - insets.left - insets.right;
```

RN006 covers the styling version of the same mistake.

```tsx
<View style={{ paddingLeft: insets.left, paddingRight: insets.right }} />
```

## RN007

The `SafeAreaView` in React Native core is iOS only, cannot select edges, and is deprecated in recent versions. Use the one from `react-native-safe-area-context`, which most apps already depend on, and pick the edges you need.

```tsx
import { SafeAreaView } from 'react-native-safe-area-context';

<SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1 }}>
  <Screen />
</SafeAreaView>
```

If the package is not installed, ask before adding it.

## RN008

Comparisons like `width > 414` encode a specific phone. Replace them with the layout class or a named breakpoint.

## Navigation

React Navigation stacks and tabs do not turn into sidebars on their own. On regular width, consider a drawer that stays open (`drawerType: 'permanent'` in `@react-navigation/drawer`) or a two pane layout for list and detail screens. Confirm the navigation library version in package.json before suggesting options, and keep the compact layout unchanged.

## State across folds

Opening or closing the Duo changes the window size, which re-renders but should not remount screens. Watch for `key` props derived from width on large subtrees, and for effects that reset state when dimensions change. Scroll position, form input and media playback should survive a fold.
