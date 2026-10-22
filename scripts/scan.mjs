#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, extname, basename, resolve, sep } from "node:path";

const LEVELS = { info: 0, medium: 1, high: 2 };

const IGNORED_DIRS = new Set([
  "node_modules", "Pods", "build", "DerivedData", ".git", ".build", "Carthage",
  "vendor", ".expo", "dist", "android", ".gradle", ".swiftpm", "fastlane", "coverage",
  "__tests__", "__mocks__", "e2e", "detox", "platforms", ".dart_tool", "ephemeral", ".fvm",
  "macos", "linux", "windows", "web", "hooks",
]);

const TEST_DIR = /(?:^|[\\/])(?:Tests|UnitTests|UITests|[A-Za-z0-9]+(?:Unit|UI)?Tests|tests?|integration_test|test_[a-z_]+)(?:[\\/]|$)/;
const TEST_FILE = /(?:Tests?|Spec|Mock|Mocks)\.(?:swift|m|mm)$|\.(?:test|spec)\.[cm]?[jt]sx?$|_test\.dart$/;
const GENERATED_DART = /\.(?:g|freezed|gr|mocks|config|pb|pbenum|pbjson)\.dart$|generated_plugin_registrant\.dart$/;
const NON_IOS_FILE = /\.(?:android|web|windows|macos)\.[cm]?[jt]sx?$/;

const PHONE_WIDTHS = "(?:320|375|390|393|402|414|428|430|440)(?:\\.0)?";

const LINE_RULES = [
  {
    id: "SW001", langs: ["swift"], severity: "high",
    title: "UIScreen.main is ambiguous on a two-display device",
    pattern: /\bUIScreen\.main\b/,
    exclude: /\?\?\s*UIScreen\.main\b/,
    fix: "Use the view's bounds, traitCollection.displayScale, or view.window?.windowScene?.screen",
    ref: "references/swift.md#sw001",
  },
  {
    id: "SW008", langs: ["swift"], severity: "medium",
    title: "UIScreen.main used as a fallback",
    pattern: /\?\?\s*UIScreen\.main\b/,
    fix: "The fallback still reads the wrong display when the window is nil. Return early or use a known size",
    ref: "references/swift.md#sw001",
  },
  {
    id: "OBJ001", langs: ["objc"], severity: "high",
    title: "[UIScreen mainScreen] is ambiguous on a two-display device",
    pattern: /\[\s*UIScreen\s+mainScreen\s*\]|UIScreen\.mainScreen\b/,
    fix: "Use the view's bounds, traitCollection.displayScale, or the window scene's screen",
    ref: "references/swift.md#sw001",
  },
  {
    id: "SW002", langs: ["swift", "objc"], severity: "medium",
    title: "Layout decided by device idiom",
    pattern: /\buserInterfaceIdiom\b|UI_USER_INTERFACE_IDIOM\s*\(/,
    fix: "Branch on horizontalSizeClass instead. The Duo is an iPhone idiom but regular width when open",
    ref: "references/swift.md#sw002",
  },
  {
    id: "SW003", langs: ["swift", "objc"], severity: "high",
    title: "Layout decided by interface or device orientation",
    pattern: /UIDevice\.current\.orientation|\[\s*\[\s*UIDevice\s+currentDevice\s*\]\s+orientation\s*\]|UIDevice\.currentDevice\.orientation|\binterfaceOrientation\b|\bstatusBarOrientation\b|UIInterfaceOrientationIs(?:Landscape|Portrait)/,
    fix: "The inner display ignores supported orientations. Use size classes or available width",
    ref: "references/swift.md#sw003",
  },
  {
    id: "SW005", langs: ["swift", "objc"], severity: "high",
    title: "Safe area or margin math assumes both sides are equal",
    pattern: /(?:safeAreaInsets|layoutMargins|directionalLayoutMargins)\.(?:left|right|leading|trailing)\s*\*\s*2\b|\b2(?:\.0)?f?\s*\*\s*[\w.]*(?:safeAreaInsets|layoutMargins|directionalLayoutMargins)\.(?:left|right|leading|trailing)/,
    fix: "Insets are asymmetric on the Duo. Use bounds.inset(by: safeAreaInsets) or handle each edge",
    ref: "references/swift.md#sw005",
  },
  {
    id: "SW006", langs: ["swift", "objc"], severity: "medium",
    title: "Hardcoded phone width comparison",
    pattern: new RegExp(`\\b\\w*[wW]idth\\s*(?:==|<=|>=|<|>)\\s*${PHONE_WIDTHS}\\b`),
    fix: "Compare against a layout breakpoint or use size classes, not a specific phone width",
    ref: "references/swift.md#sw006",
  },
  {
    id: "SW007", langs: ["swift", "objc"], severity: "medium",
    title: "App-wide window lookup instead of the scene's window",
    pattern: /UIApplication\.shared\.(?:windows|keyWindow)\b|\[\s*\[\s*UIApplication\s+sharedApplication\s*\]\s+(?:keyWindow|windows)\s*\]|UIApplication\.sharedApplication\.(?:keyWindow|windows)\b/,
    fix: "Use view.window, or the window from the relevant UIWindowScene",
    ref: "references/swift.md#sw007",
  },
  {
    id: "RN001", langs: ["rn"], severity: "high",
    title: "Dimensions.get('screen') returns the physical screen, not the app's window",
    pattern: /Dimensions\.get\(\s*['"`]screen['"`]\s*\)/,
    fix: "Use useWindowDimensions() so layout follows the space the app has",
    ref: "references/react-native.md#rn001",
  },
  {
    id: "RN002", langs: ["rn"], severity: "medium",
    title: "Dimensions.get('window') is a one-time snapshot",
    pattern: /Dimensions\.get\(\s*['"`]window['"`]\s*\)/,
    fix: "Use useWindowDimensions() so the value updates when the Duo opens or closes",
    ref: "references/react-native.md#rn001",
  },
  {
    id: "RN003", langs: ["rn"], severity: "medium",
    title: "Layout decided by tablet or iPad checks",
    pattern: /\bPlatform\.isPad\b|\bDeviceInfo\.isTablet\s*\(|\bisTablet\s*\(\s*\)/,
    fix: "The Duo is an iPhone. Branch on available width instead",
    ref: "references/react-native.md#rn003",
  },
  {
    id: "RN004", langs: ["rn"], severity: "medium",
    title: "Orientation lock or device orientation hook",
    pattern: /\b(?:Orientation\.lock\w*|ScreenOrientation\.lockAsync|lockToPortrait|lockToLandscape\w*)\s*\(|\buseDeviceOrientation\b|\bgetDeviceOrientation\s*\(/,
    fix: "The inner display ignores orientation locks. Layout must handle a wide canvas regardless",
    ref: "references/react-native.md#rn004",
  },
  {
    id: "RN005", langs: ["rn"], severity: "high",
    title: "Safe area math assumes both sides are equal",
    pattern: /\w*[iI]nsets\.(?:left|right)\s*\*\s*2\b|\b2\s*\*\s*\w*[iI]nsets\.(?:left|right)\b/,
    fix: "Insets are asymmetric on the Duo. Pad left and right separately",
    ref: "references/react-native.md#rn005",
  },
  {
    id: "RN006", langs: ["rn"], severity: "medium",
    title: "One side's inset applied to both sides",
    pattern: /\b(?:padding|margin)Horizontal\s*:\s*\w*[iI]nsets\.(?:left|right)\b/,
    fix: "Use paddingLeft: insets.left and paddingRight: insets.right",
    ref: "references/react-native.md#rn005",
  },
  {
    id: "RN008", langs: ["rn"], severity: "medium",
    title: "Hardcoded phone width comparison",
    pattern: new RegExp(`\\b\\w*[wW]idth\\s*(?:===?|<=|>=|<|>)\\s*${PHONE_WIDTHS}\\b`),
    fix: "Compare against a layout breakpoint, not a specific phone width",
    ref: "references/react-native.md#rn008",
  },
  {
    id: "NS001", langs: ["ns"], severity: "high",
    title: "Screen.mainScreen is the physical screen, not the app's window",
    pattern: /\bScreen\.mainScreen\b/,
    fix: "Size layouts from the page or view (getActualSize, layoutChanged) or use percentage and star sizing",
    ref: "references/nativescript.md#ns001",
  },
  {
    id: "NS002", langs: ["ns"], severity: "high",
    title: "UIScreen.mainScreen is ambiguous on a two-display device",
    pattern: /\bUIScreen\.mainScreen\b/,
    fix: "Read the screen from the view's window scene, or the scale from its traitCollection",
    ref: "references/nativescript.md#ns002",
  },
  {
    id: "NS003", langs: ["ns"], severity: "medium",
    title: "Layout decided by device type or idiom",
    pattern: /\bDevice\.deviceType\b|\bDeviceType\.Tablet\b|UIDevice\.currentDevice\.userInterfaceIdiom/,
    fix: "The Duo reports as a phone. Branch on the available width instead",
    ref: "references/nativescript.md#ns003",
  },
  {
    id: "NS004", langs: ["ns"], severity: "medium",
    title: "App-wide window lookup instead of the scene's window",
    pattern: /UIApplication\.sharedApplication\.(?:keyWindow|windows)\b|\bApplication\.ios\.window\b/,
    fix: "Use the view's own window (view.ios.window), or Application.ios.getPrimaryWindow() on NativeScript 9",
    ref: "references/nativescript.md#ns004",
  },
  {
    id: "NS005", langs: ["ns"], severity: "medium",
    title: "Orientation lock or orientation-driven layout",
    pattern: /\bApplication\.orientation\s*\(|UIDevice\.currentDevice\.orientation|\bstatusBarOrientation\b|\bsetOrientation\s*\(|\bdisableRotation\s*\(/,
    fix: "The inner display ignores orientation. Decide layout from the view's size",
    ref: "references/nativescript.md#ns005",
  },
  {
    id: "NS006", langs: ["ns"], severity: "high",
    title: "Safe area math assumes both sides are equal",
    pattern: /\w*[iI]nsets?\.(?:left|right)\s*\*\s*2\b|\b2\s*\*\s*\w*[iI]nsets?\.(?:left|right)\b|safeAreaInsets\.(?:left|right)\s*\*\s*2\b/,
    fix: "Insets are asymmetric on the Duo. Handle left and right separately",
    ref: "references/nativescript.md#ns006",
  },
  {
    id: "NS007", langs: ["ns"], severity: "medium",
    title: "Hardcoded phone width comparison",
    pattern: new RegExp(`\\b\\w*(?:[wW]idth|DIPs)\\s*(?:===?|<=|>=|<|>)\\s*${PHONE_WIDTHS}\\b`),
    fix: "Compare against a named layout breakpoint, not a specific phone width",
    ref: "references/nativescript.md#ns007",
  },
  {
    id: "FL001", langs: ["dart"], severity: "high",
    title: "Global window or first view used instead of the widget's own view",
    pattern: /WidgetsBinding\.instance!?\.window\b|\bui\.window\b|(?<![\w.])window\.(?:physicalSize|devicePixelRatio|padding|viewPadding|viewInsets)\b|PlatformDispatcher\.instance\.(?:views\.first|implicitView)\b/,
    fix: "Use MediaQuery.sizeOf(context), LayoutBuilder or View.of(context) so values follow the app's real view",
    ref: "references/flutter.md#fl001",
  },
  {
    id: "FL002", langs: ["dart"], severity: "medium",
    title: "MediaQueryData built by hand is a snapshot",
    pattern: /MediaQueryData\.from(?:Window|View)\s*\(/,
    fix: "Read MediaQuery from the widget tree so it updates when the Duo opens or closes",
    ref: "references/flutter.md#fl001",
  },
  {
    id: "FL003", langs: ["dart"], severity: "medium",
    title: "Layout decided by device model or tablet detection",
    pattern: /Device\.get\(\)\.is(?:Tablet|Phone|Ipad|IPad)\b|\.model\b[^;\n]*['"]iPad|\bgetDeviceType\s*\(|\bisTablet\s*\(\s*\)|utsname\.machine[^;\n]*iPad/,
    fix: "The Duo is an iPhone. Branch on available width from LayoutBuilder or MediaQuery.sizeOf",
    ref: "references/flutter.md#fl003",
  },
  {
    id: "FL004", langs: ["dart"], severity: "medium",
    title: "Orientation lock or device orientation sensor driving layout",
    pattern: /SystemChrome\.setPreferredOrientations\s*\(|\bNativeDeviceOrientation\w*/,
    fix: "The inner display ignores orientation locks. Layout must handle a wide canvas regardless",
    ref: "references/flutter.md#fl004",
  },
  {
    id: "FL005", langs: ["dart"], severity: "high",
    title: "Safe area math assumes both sides are equal",
    pattern: /(?:MediaQuery[^;\n]*(?:padding|viewPadding)|viewPadding|safeArea\w*|safePadding)\.(?:left|right)\s*\*\s*2\b/,
    fix: "Insets are asymmetric on the Duo. Subtract left and right separately",
    ref: "references/flutter.md#fl005",
  },
  {
    id: "FL006", langs: ["dart"], severity: "medium",
    title: "One side's safe area inset applied to both sides",
    pattern: /EdgeInsets\.symmetric\([^;\n]*horizontal\s*:\s*[^,;\n]*(?:padding|viewPadding)\.(?:left|right)\b/,
    fix: "Use EdgeInsets.only(left: padding.left, right: padding.right)",
    ref: "references/flutter.md#fl005",
  },
  {
    id: "FL007", langs: ["dart"], severity: "medium",
    title: "Hardcoded phone width comparison",
    pattern: new RegExp(`\\b\\w*[wW]idth\\s*(?:==|<=|>=|<|>)\\s*${PHONE_WIDTHS}\\b`),
    fix: "Compare against a named layout breakpoint, not a specific phone width",
    ref: "references/flutter.md#fl007",
  },
  {
    id: "FL101", langs: ["swift", "objc"], severity: "high",
    title: "AppDelegate reaches for the FlutterViewController through the window",
    pattern: /rootViewController\s+as[!?]\s*FlutterViewController|\(\s*FlutterViewController\s*\*\s*\)\s*\[?\s*self\.window/,
    fix: "The window is nil after the UIScene migration. Move this into didInitializeImplicitFlutterEngine",
    ref: "references/flutter.md#fl101",
  },
];

const FILE_RULES = [
  {
    id: "RN007", langs: ["rn"], severity: "medium",
    title: "SafeAreaView imported from react-native core",
    pattern: /import\s*\{[^}]*\bSafeAreaView\b[^}]*\}\s*from\s*['"]react-native['"]/,
    fix: "Use SafeAreaView or useSafeAreaInsets from react-native-safe-area-context",
    ref: "references/react-native.md#rn007",
  },
  {
    id: "CF001", langs: ["plist"], severity: "info",
    title: "UIRequiresFullScreen is set",
    pattern: /<key>\s*UIRequiresFullScreen\s*<\/key>\s*<true\s*\/>/,
    fix: "Honored on the Duo, but the app still resizes when it opens or closes. It is not an opt-out",
    ref: "references/config.md#cf001",
  },
  {
    id: "CF002", langs: ["plist"], severity: "info",
    title: "Portrait-only supported orientations",
    test: (content) => {
      const match = content.match(/<key>\s*UISupportedInterfaceOrientations\s*<\/key>\s*<array>([\s\S]*?)<\/array>/);
      if (!match) return -1;
      return /Landscape/.test(match[1]) ? -1 : match.index;
    },
    fix: "The inner display ignores this. Layout still has to handle the wide canvas",
    ref: "references/config.md#cf002",
  },
  {
    id: "CF003", langs: ["expo"], severity: "info",
    title: "Expo orientation locked to portrait",
    pattern: /["']?orientation["']?\s*:\s*["']portrait["']/,
    fix: "The inner display ignores this. Layout still has to handle the wide canvas",
    ref: "references/config.md#cf002",
  },
];

FILE_RULES.push(
  {
    id: "FL102", langs: ["swift", "objc"], severity: "medium",
    title: "Flutter plugins registered in didFinishLaunching",
    test: (content) => {
      if (/didInitializeImplicitFlutterEngine/.test(content)) return -1;
      const m = /GeneratedPluginRegistrant\.register\(\s*with:\s*self\s*\)|\[\s*GeneratedPluginRegistrant\s+registerWithRegistry:\s*self\s*\]/.exec(content);
      return m ? m.index : -1;
    },
    fix: "Adopt FlutterImplicitEngineDelegate and register in didInitializeImplicitFlutterEngine, or the scene migration breaks plugins",
    ref: "references/flutter.md#fl102",
  },
  {
    id: "FL103", langs: ["pubspec"], severity: "medium",
    title: "Flutter's UIScene migration is switched off",
    pattern: /enable-uiscene-migration\s*:\s*false/,
    fix: "Builds with Xcode 27.1 will not launch without scenes. Remove the opt-out and migrate",
    ref: "references/flutter.md#fl102",
  },
);

const PROJECT_RULES = {
  CF004: {
    severity: "high",
    title: "App has not adopted the UIScene lifecycle",
    fix: "Apps built with the iOS 27 SDK need scene support or they will not launch. Migrate before switching to Xcode 27.1",
    ref: "references/config.md#cf004",
  },
  PJ004: {
    severity: "info",
    title: "Flutter version range allows releases before 3.41",
    fix: "Flutter before 3.41 does not migrate to scenes automatically. Pin 3.41 or later before building with Xcode 27.1",
    ref: "references/flutter.md#pj004",
  },
  PJ005: {
    severity: "info",
    title: "NativeScript before 9 has no UIScene support",
    fix: "Upgrade to NativeScript 9 or later before building with Xcode 27.1, or the app will not launch",
    ref: "references/nativescript.md#pj005",
  },
  PJ001: {
    severity: "info",
    title: "No size class usage anywhere in the native code",
    fix: "Nothing adapts when the Duo opens. Add a regular-width layout at the top-level navigation",
    ref: "references/config.md#pj001",
  },
  PJ002: {
    severity: "info",
    title: "Dimensions are read but never observed",
    fix: "Nothing re-lays out when the Duo opens or closes. Move to useWindowDimensions or onLayout",
    ref: "references/config.md#pj002",
  },
  PJ003: {
    severity: "info",
    title: "Native iOS project is generated at build time",
    fix: "There is no ios folder to check. Confirm the Expo SDK in use generates a scene-based app before building with Xcode 27.1",
    ref: "references/config.md#pj003",
  },
};

function parseArgs(argv) {
  const args = { root: ".", json: false, failOn: null, only: null, listRules: false, includeTests: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--json") args.json = true;
    else if (arg === "--list-rules") args.listRules = true;
    else if (arg === "--include-tests") args.includeTests = true;
    else if (arg === "--fail-on") args.failOn = argv[++i];
    else if (arg === "--only") args.only = new Set((argv[++i] ?? "").split(",").map((s) => s.trim().toUpperCase()));
    else if (arg === "--help" || arg === "-h") args.help = true;
    else args.root = arg;
  }
  if (args.failOn && !(args.failOn in LEVELS)) {
    console.error(`--fail-on must be one of ${Object.keys(LEVELS).join(", ")}`);
    process.exit(2);
  }
  return args;
}

function languageOf(path) {
  const name = basename(path);
  const ext = extname(path);
  if (name === "app.json" || /^app\.config\.(?:js|ts|json)$/.test(name)) return "expo";
  if (name === "project.pbxproj") return "pbxproj";
  if (name === "Podfile") return "podfile";
  if (name === "pubspec.yaml") return "pubspec";
  if (ext === ".swift") return "swift";
  if (ext === ".dart") return GENERATED_DART.test(name) ? null : "dart";
  if (ext === ".vue" || ext === ".svelte") return "js";
  if (ext === ".m" || ext === ".mm") return "objc";
  if ([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"].includes(ext) && !name.endsWith(".d.ts")) return "js";
  if (name.endsWith("Info.plist")) return "plist";
  return null;
}

function isTestPath(rel) {
  return TEST_DIR.test(rel) || TEST_FILE.test(basename(rel));
}

function walk(dir, out) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      if (/\.(?:xcassets|framework|xcframework|bundle|xcworkspace)$/.test(entry.name)) continue;
      walk(full, out);
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
}

function findLineComment(line, from) {
  let idx = line.indexOf("//", from);
  while (idx > 0 && line[idx - 1] === ":") idx = line.indexOf("//", idx + 2);
  return idx;
}

function stripComments(line, state) {
  let out = "";
  let i = 0;
  while (i < line.length) {
    if (state.block) {
      const end = line.indexOf("*/", i);
      if (end === -1) return out;
      state.block = false;
      i = end + 2;
      continue;
    }
    const blockStart = line.indexOf("/*", i);
    const lineStart = findLineComment(line, i);
    if (lineStart !== -1 && (blockStart === -1 || lineStart < blockStart)) return out + line.slice(i, lineStart);
    if (blockStart === -1) return out + line.slice(i);
    out += line.slice(i, blockStart);
    state.block = true;
    i = blockStart + 2;
  }
  return out;
}

function ignoredIds(line) {
  const match = line.match(/duofy-ignore(?::\s*([A-Za-z0-9,\s]+))?/);
  if (!match) return null;
  if (!match[1] || !match[1].trim()) return "all";
  return new Set(match[1].split(/[,\s]+/).filter(Boolean).map((s) => s.toUpperCase()));
}

function isIgnored(lines, index, ruleId) {
  for (const candidate of [lines[index], lines[index - 1]]) {
    if (candidate === undefined) continue;
    const ids = ignoredIds(candidate);
    if (ids === "all" || (ids && ids.has(ruleId))) return true;
  }
  return false;
}

function snippetOf(line) {
  const trimmed = line.trim();
  return trimmed.length > 140 ? `${trimmed.slice(0, 137)}...` : trimmed;
}

function lineNumberAt(content, index) {
  let line = 1;
  for (let i = 0; i < index; i++) if (content.charCodeAt(i) === 10) line++;
  return line;
}

function makeFinding(id, rule, file, line, snippet) {
  return {
    rule: id,
    severity: rule.severity,
    title: rule.title,
    file,
    line,
    snippet,
    fix: rule.fix,
    reference: rule.ref,
  };
}

function compareVersions(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff) return diff;
  }
  return 0;
}

function readText(file) {
  try {
    if (statSync(file).size > 1_500_000) return null;
    return readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

function firstVersion(range) {
  const m = String(range ?? "").match(/(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  return m ? `${m[1]}.${m[2] ?? 0}.${m[3] ?? 0}` : null;
}

function detectStack(files, baseDir) {
  const stack = {
    swift: 0, objc: 0, jsFiles: 0, dartFiles: 0, reactNative: false, expo: false, flutter: false, nativescript: false,
    reactNativeVersion: null, expoVersion: null, flutterVersion: null, nativescriptVersion: null, hasXcodeProject: false,
  };
  const depth = (file) => relative(baseDir, file).split(sep).length;
  const manifests = [];
  const pubspecs = [];
  for (const file of files) {
    const lang = languageOf(file);
    if (lang === "swift") stack.swift++;
    if (lang === "objc") stack.objc++;
    if (lang === "js") stack.jsFiles++;
    if (lang === "dart") stack.dartFiles++;
    if (lang === "pbxproj") stack.hasXcodeProject = true;
    if (lang === "pubspec") pubspecs.push(file);
    if (basename(file) === "package.json") manifests.push(file);
  }
  manifests.sort((a, b) => depth(a) - depth(b));
  for (const file of manifests) {
    try {
      const pkg = JSON.parse(readFileSync(file, "utf8"));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if ("react-native" in deps) {
        stack.reactNative = true;
        stack.reactNativeVersion ??= deps["react-native"];
      }
      if ("expo" in deps) {
        stack.expo = true;
        stack.expoVersion ??= deps.expo;
      }
      const nsCore = deps["@nativescript/core"] ?? deps["tns-core-modules"];
      if (nsCore) {
        stack.nativescript = true;
        stack.nativescriptVersion ??= nsCore;
      }
    } catch {}
  }
  pubspecs.sort((a, b) => depth(a) - depth(b));
  for (const file of pubspecs) {
    const content = readText(file) ?? "";
    if (!/^\s+sdk:\s*flutter\s*$/m.test(content)) continue;
    stack.flutter = true;
    const env = content.match(/^environment:\s*\n((?:[ \t]+.*\n?)*)/m);
    const flutterLine = env && env[1].match(/^\s+flutter:\s*['"]?([^'"\n]+)['"]?/m);
    if (flutterLine) stack.flutterVersion ??= flutterLine[1].trim();
  }
  return stack;
}

function scan(root, only, includeTests) {
  const absRoot = resolve(root);
  const files = [];
  const rootStat = statSync(absRoot);
  if (rootStat.isFile()) files.push(absRoot);
  else walk(absRoot, files);

  const baseDir = rootStat.isFile() ? resolve(absRoot, "..") : absRoot;
  const stack = detectStack(files, baseDir);
  const singleJs = rootStat.isFile() && languageOf(absRoot) === "js";
  const rnActive = stack.reactNative || stack.expo || (singleJs && !stack.nativescript);
  const nsActive = stack.nativescript;
  const jsLangs = [...(rnActive ? ["rn"] : []), ...(nsActive ? ["ns"] : [])];
  const enabled = (id) => !only || only.has(id);

  const findings = [];
  const deploymentTargets = [];
  let skippedTests = 0;
  let sizeClassSeen = false;
  let rnResponsiveSeen = false;
  let rnDimensionsSeen = false;
  let sceneManifestSeen = false;
  let sceneCodeSeen = false;
  let swiftUIAppSeen = false;
  let firstAppPlist = null;

  for (const file of files) {
    const lang = languageOf(file);
    if (!lang) continue;
    if (lang === "js" && !jsLangs.length) continue;
    if (lang === "expo" && !rnActive) continue;
    const rel = relative(baseDir, file) || basename(file);
    if (lang === "js" && NON_IOS_FILE.test(rel)) continue;
    const effective = lang === "js" ? jsLangs : [lang];

    const content = readText(file);
    if (content === null) continue;

    if (lang === "pbxproj") {
      if (/INFOPLIST_KEY_UIApplicationSceneManifest_Generation\s*=\s*YES/.test(content)) sceneManifestSeen = true;
      for (const m of content.matchAll(/IPHONEOS_DEPLOYMENT_TARGET\s*=\s*"?([\d.]+)"?/g)) deploymentTargets.push(m[1]);
      continue;
    }
    if (lang === "podfile") {
      const m = content.match(/^\s*platform\s+:ios\s*,\s*['"]([\d.]+)['"]/m);
      if (m) deploymentTargets.push(m[1]);
      continue;
    }
    if (lang === "plist") {
      if (/<key>\s*UIApplicationSceneManifest\s*<\/key>/.test(content)) sceneManifestSeen = true;
      const isExtension = /<key>\s*NSExtension\s*<\/key>/.test(content);
      const notAppPlist = /^(?:AppFrameworkInfo|GoogleService-Info)\.plist$/.test(basename(rel)) || /(?:^|[\\/])Flutter[\\/]/.test(rel);
      if (!isExtension && !notAppPlist && !isTestPath(rel)) {
        if (!firstAppPlist || (basename(rel) === "Info.plist" && basename(firstAppPlist) !== "Info.plist")) firstAppPlist = rel;
      }
    }
    if (lang === "swift" || lang === "objc") {
      if (/UIWindowSceneDelegate/.test(content)) sceneCodeSeen = true;
      if (/@main\s+struct\s+\w+\s*:\s*App\b/.test(content)) swiftUIAppSeen = true;
    }

    if (!includeTests && !["plist", "expo", "pubspec"].includes(lang) && isTestPath(rel)) {
      skippedTests++;
      continue;
    }

    const rawLines = content.split(/\r?\n/);

    if ((lang === "swift" || lang === "objc") && /horizontalSizeClass|UITraitHorizontalSizeClass/.test(content)) {
      sizeClassSeen = true;
    }
    if (lang === "js" && rnActive) {
      if (/useWindowDimensions|onLayout\s*=|Dimensions\.addEventListener/.test(content)) rnResponsiveSeen = true;
      if (/Dimensions\.get\(/.test(content)) rnDimensionsSeen = true;
    }

    const lineRules = LINE_RULES.filter((r) => r.langs.some((l) => effective.includes(l)) && enabled(r.id));
    if (lineRules.length) {
      const state = { block: false };
      rawLines.forEach((raw, index) => {
        const code = stripComments(raw, state);
        if (!code.trim()) return;
        for (const rule of lineRules) {
          if (!rule.pattern.test(code)) continue;
          if (rule.exclude && rule.exclude.test(code) && !rule.pattern.test(code.replace(rule.exclude, ""))) continue;
          if (isIgnored(rawLines, index, rule.id)) continue;
          findings.push(makeFinding(rule.id, rule, rel, index + 1, snippetOf(raw)));
        }
      });
    }

    for (const rule of FILE_RULES) {
      if (!rule.langs.some((l) => effective.includes(l)) || !enabled(rule.id)) continue;
      if ((rule.id === "FL102" || rule.id === "FL103") && !stack.flutter) continue;
      let index = -1;
      if (rule.test) index = rule.test(content);
      else {
        const match = rule.pattern.exec(content);
        if (match) index = match.index;
      }
      if (index < 0) continue;
      const line = lineNumberAt(content, index);
      if (isIgnored(rawLines, line - 1, rule.id)) continue;
      findings.push(makeFinding(rule.id, rule, rel, line, snippetOf(rawLines[line - 1] ?? "")));
    }
  }

  const project = (id) => {
    if (!enabled(id)) return;
    findings.push(makeFinding(id, PROJECT_RULES[id], "(project)", 0, ""));
  };

  const nativeProjectPresent = stack.hasXcodeProject || firstAppPlist !== null;
  const scenesAdopted = sceneManifestSeen || swiftUIAppSeen;
  if (nativeProjectPresent && !scenesAdopted && enabled("CF004")) {
    findings.push(makeFinding("CF004", PROJECT_RULES.CF004, firstAppPlist ?? "(project)", firstAppPlist ? 1 : 0,
      sceneCodeSeen ? "scene delegate code found, but no UIApplicationSceneManifest in any Info.plist" : "no UIApplicationSceneManifest in any Info.plist"));
  }
  if (stack.expo && !stack.hasXcodeProject) project("PJ003");
  if (stack.swift + stack.objc > 0 && !sizeClassSeen && !stack.flutter && !stack.nativescript) project("PJ001");
  if (rnActive && rnDimensionsSeen && !rnResponsiveSeen) project("PJ002");
  const flutterFloor = firstVersion(stack.flutterVersion);
  if (stack.flutter && flutterFloor && compareVersions(flutterFloor, "3.41.0") < 0) project("PJ004");
  const nsFloor = firstVersion(stack.nativescriptVersion);
  if (stack.nativescript && nsFloor && compareVersions(nsFloor, "9.0.0") < 0) project("PJ005");

  findings.sort((a, b) =>
    LEVELS[b.severity] - LEVELS[a.severity] || a.file.localeCompare(b.file) || a.line - b.line,
  );

  const counts = { high: 0, medium: 0, info: 0 };
  for (const f of findings) counts[f.severity]++;

  const deploymentTarget = deploymentTargets.length
    ? deploymentTargets.sort(compareVersions)[0]
    : null;

  return {
    root: absRoot,
    stack: {
      swiftFiles: stack.swift,
      objcFiles: stack.objc,
      dartFiles: stack.flutter ? stack.dartFiles : 0,
      jsFilesScanned: jsLangs.length ? stack.jsFiles : 0,
      reactNative: stack.reactNative,
      reactNativeVersion: stack.reactNativeVersion,
      expo: stack.expo,
      expoVersion: stack.expoVersion,
      flutter: stack.flutter,
      flutterVersion: stack.flutterVersion,
      nativescript: stack.nativescript,
      nativescriptVersion: stack.nativescriptVersion,
      lowestDeploymentTarget: deploymentTarget,
      sceneLifecycle: scenesAdopted ? "adopted" : nativeProjectPresent ? "missing" : "unknown",
      testFilesSkipped: skippedTests,
    },
    counts,
    findings,
  };
}

function printRules() {
  for (const rule of [...LINE_RULES, ...FILE_RULES]) {
    console.log(`${rule.id.padEnd(7)} ${rule.severity.padEnd(7)} ${rule.title}`);
  }
  for (const [id, rule] of Object.entries(PROJECT_RULES)) {
    console.log(`${id.padEnd(7)} ${rule.severity.padEnd(7)} ${rule.title}`);
  }
}

function printText(report) {
  const { stack, counts, findings } = report;
  const parts = [];
  const version = (v) => (v ? ` ${v}` : "");
  if (stack.swiftFiles) parts.push(`swift ${stack.swiftFiles}`);
  if (stack.objcFiles) parts.push(`objc ${stack.objcFiles}`);
  if (stack.flutter) parts.push(`flutter${version(stack.flutterVersion)} (${stack.dartFiles} dart)`);
  if (stack.nativescript) parts.push(`nativescript${version(stack.nativescriptVersion)} (${stack.jsFilesScanned} js)`);
  if (stack.expo) parts.push(`expo${version(stack.expoVersion)} (${stack.jsFilesScanned} js)`);
  else if (stack.reactNative) parts.push(`react-native${version(stack.reactNativeVersion)} (${stack.jsFilesScanned} js)`);
  console.log(`duofy scan ${report.root}`);
  console.log(`stack     ${parts.join(", ") || "nothing iOS-related found"}`);
  if (stack.lowestDeploymentTarget) console.log(`target    iOS ${stack.lowestDeploymentTarget} lowest deployment target`);
  console.log(`scenes    ${stack.sceneLifecycle}`);
  if (stack.testFilesSkipped) console.log(`tests     ${stack.testFilesSkipped} test files skipped, use --include-tests to scan them`);
  console.log("");
  for (const f of findings) {
    const where = f.line ? `${f.file}:${f.line}` : f.file;
    console.log(`${f.severity.toUpperCase().padEnd(6)} ${f.rule.padEnd(6)} ${where}`);
    console.log(`       ${f.title}`);
    if (f.snippet) console.log(`       > ${f.snippet}`);
    console.log(`       fix ${f.fix}`);
    console.log(`       see ${f.reference}`);
    console.log("");
  }
  console.log(`summary   ${counts.high} high, ${counts.medium} medium, ${counts.info} info`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log("usage: scan.mjs [path] [--json] [--only ID,ID] [--fail-on high|medium|info] [--include-tests] [--list-rules]");
    return;
  }
  if (args.listRules) {
    printRules();
    return;
  }
  let report;
  try {
    report = scan(args.root, args.only, args.includeTests);
  } catch (error) {
    console.error(`duofy: cannot scan ${args.root}: ${error.message}`);
    process.exit(2);
  }
  if (args.json) console.log(JSON.stringify(report, null, 2));
  else printText(report);
  if (args.failOn) {
    const threshold = LEVELS[args.failOn];
    if (report.findings.some((f) => LEVELS[f.severity] >= threshold)) process.exit(1);
  }
}

main();
