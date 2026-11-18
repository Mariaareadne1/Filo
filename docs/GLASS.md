# Glass in Filo 2.0

Filo uses glass for **floating chrome only**: things that sit over the map or over scrolling content. Reading surfaces (place detail body, lists, forms, rankings) stay solid. The aim is to make the map feel like the canvas and the controls feel like they float above it, without hurting legibility.

All glass goes through one component, [`design/Glass.tsx`](../design/Glass.tsx). It picks one of three tiers at runtime and never imitates an effect the platform isn't actually rendering.

## The three tiers

| Tier | When | What renders | What it is *not* |
|---|---|---|---|
| **Native** | iOS 26+ (`isLiquidGlassAvailable()`), Reduce Transparency off | `GlassView` / `GlassContainer` from `expo-glass-effect`, i.e. UIKit's `UIGlassEffect`. Real lensing of the content underneath, system specular highlights, and the system touch response on `interactive` surfaces. Adjacent shapes in a `GlassGroup` blend and morph as one material. | — |
| **Blur** | iOS < 26 and Android, Reduce Transparency off | `expo-blur` (`systemThinMaterial*`) plus a light tint for legibility over busy map tiles, a hairline border and a brighter top edge. | Not refractive. No lensing or specular highlights are faked with gradients. |
| **Solid** | Reduce Transparency on (any OS) | Opaque `surface` color plus a hairline border. Same shapes, same layout. | No blur and no translucency. |

`useGlassTier()` exposes the current tier, and `ThemeProvider` tracks the OS accessibility settings live via `AccessibilityInfo` listeners.

## Where each surface uses it

| Surface | File | Glass | Notes |
|---|---|---|---|
| Tab dock and "+" button | `design/Dock.tsx` | `Glass` ×2 in a `GlassGroup`, `interactive` | The "+" button is tinted with the thread red. On iOS 26 the two shapes merge as one material. The selection pill springs, or jumps with Reduce Motion. |
| Map search capsule | `features/map/MapScreen.tsx` | `Glass interactive` | Opens the search route. |
| Map scope segmented control | `design/controls.tsx` → `GlassSegmented` | `Glass` | Everyone / Mine / Friends. |
| Category chips (map, onboarding, save, rankings, discover) | `GlassChip` | `Glass variant="clear" interactive` | The selected chip is tinted thread red, and its label also changes weight and color (not color alone). |
| Icon buttons (profile, locate, board back/share/edit, new board, share profile) | `GlassIconButton` | `Glass interactive` | 44 pt minimum hit area and an `accessibilityLabel` on every button. |
| Map status pill (loading and empty-state copy) | `MapScreen.tsx` | `Glass` | `pointerEvents="none"`. |
| Place sheet background | `features/places/PlaceSheet.tsx` | `Glass radius=xl` as the sheet background | Detached card that stops above the dock. The sheet body text sits on this; the native and blur tiers are tinted enough for body copy. |
| Search field (search screen, Discover) | `SearchScreen.tsx`, `DiscoverScreen.tsx` | `Glass` | |
| Upload toast | `components/UploadProgressOverlay.tsx` | `Glass radius=22` | Fades in and out, with no animation under Reduce Motion. |
| Status-bar scrim | `design/StatusScrim.tsx` | `BlurView` chrome material, or solid | Keeps the clock legible over scrolling content. |

**No glass:** the auth screens, onboarding body, save form, rank flow comparisons, board grids, profile stats and Year in Filo. These are content, so they use solid `surface` and `bg` tokens.

## Accessibility behavior

- **Reduce Transparency:** every glass surface switches to the solid tier, and the status-bar scrim goes opaque. Verified in the simulator: `docs/screenshots/after/12-reduce-transparency.png`.
- **Reduce Motion:** the dock pill stops springing, the place sheet uses a 180 ms fade-timing config instead of a spring, toasts appear without entering or exiting animations, and `PressableScale` swaps its spring scale for a short opacity dim.
- **Dark mode:** `GlassView` receives `colorScheme`, the blur tier switches to `*Dark` materials, and the tint and edge tokens have dark values. Mapbox switches to its dark style; the `MapView` is keyed by scheme so layers rebuild cleanly. See `10-map-dark.png` and `11-place-sheet-dark.png`.
- **Contrast:** text on glass uses `ink` and `inkSecondary`. Over the busiest map tiles, the blur tier's tint keeps body text readable. Selected states never rely on the red tint alone.

## Verification status

| Tier | Verified on | How |
|---|---|---|
| Native | iOS 26.5 simulator, iPhone 17 Pro, Xcode 26.6 | Dev build; screenshots in `docs/screenshots/after/` |
| Solid | Same simulator with Reduce Transparency on | `12-reduce-transparency.png` |
| Blur | **Not verified on a device.** No iOS < 26 runtime or Android emulator was available in this environment. The code path is type-checked and shares the shape and layout code with the other tiers. | — |

## Rules for new UI

1. Reach for `Glass` only if the element floats over the map or over scrolling content.
2. Never stack glass on glass. Controls inside the place sheet (which is already glass) use solid styles.
3. Use `interactive` only on things you can tap.
4. Don't hand-roll gradients or shadows to make the blur tier "look like" Liquid Glass.
5. Check every new surface with Reduce Transparency on, and in dark mode.
