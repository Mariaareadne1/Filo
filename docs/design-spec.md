# Filo — Design System & UI Kit

**Version 1.0 · Reverse-engineered from shipped code.**
Source of truth: `constants/theme.ts`, `types/index.ts`, `components/PinMarker.tsx`, `components/PinDetailSheet.tsx`, `app/(app)/_layout.tsx`. If a value isn't here, it isn't in the system — don't invent it.

---

## 1. Foundations — the three signatures

Filo's identity rests on three moves. Every screen uses all three; nothing else is allowed to compete with them.

**The thread.** Red `#d8423a` (`ACCENT.red`) is the *only* accent color. It appears on the FAB, the active ranking, save confirmations, the wordmark period, and exactly one italicized word per display title — and nowhere else. One accent, used with precision. (A secondary `ACCENT.electric` `#3a5cff` exists as a dark-mode/secondary thread but is not used in the shipping Paper theme.)

**Sticker shadow.** Every card carries a hard offset shadow — `2px` down/right, **0 blur**, ink at 100% opacity. No soft drop shadows, no elevation blur. Cards look physically stuck to the paper. The only exception is floating glass (tab bar, sheets), which use a soft `FLOAT_SHADOW`.

**Italic accent word.** Display titles are set in Fraunces with a single word italicized in red: *"different **tastes**, same map."* This is the brand's voice signature and appears on every major screen.

### Anti-patterns (from README — do not ship these)
- ❌ Public star ratings or 0–10 scores — impressions only.
- ❌ Sponsored or algorithmic content in the feed.
- ❌ Infinite scroll — the feed stops.
- ❌ Emoji in core UI (allowed in user-generated content only).
- ❌ Gradient backgrounds.
- ❌ More than 4 cards visible without scroll.

> Note: the README also lists "beige/cream backgrounds (we tried; rejected)" as an anti-pattern, yet the shipping **Paper** palette uses an off-white `#fafaf8` ground. Treat `#fafaf8` as "paper," not "beige" — it is the intended default. Flagged as a doc/code tension worth reconciling.

---

## 2. Color

Four palettes are defined; **Paper ships** as the default (`PALETTE = PALETTES.paper`). All share the same token shape so a theme swap is a single assignment.

### Palette tokens

| Token | Paper (ships) | Concrete | Midnight | Sky |
|---|---|---|---|---|
| `bg` | `#fafaf8` | `#ececec` | `#1a1a1f` | `#e2e8ee` |
| `surface` | `#ffffff` | `#f5f5f5` | `#26262d` | `#edf1f5` |
| `ink` | `#0a0a0a` | `#2a1f2e` | `#f1efea` | `#1f2233` |
| `inkSoft` | `rgba(10,10,10,0.6)` | `rgba(42,31,46,0.6)` | `rgba(241,239,234,0.65)` | `rgba(31,34,51,0.6)` |
| `inkMute` | `rgba(10,10,10,0.55)` | `rgba(42,31,46,0.55)` | `rgba(241,239,234,0.55)` | `rgba(31,34,51,0.55)` |
| `inkLine` | `rgba(10,10,10,0.18)` | `rgba(42,31,46,0.18)` | `rgba(241,239,234,0.18)` | `rgba(31,34,51,0.18)` |
| `zone1` | `#f5f3ee` | `#e6e6e6` | `#1f1f25` | `#dae1e9` |
| `zone2` | `#efece5` | `#dedede` | `#23232a` | `#d2dae4` |
| `zone3` | `#eae6dd` | `#d4d4d4` | `#27272f` | `#cad3df` |
| `zone4` | `#e5e0d4` | `#cacaca` | `#2b2b34` | `#c2ccda` |
| `park` | `#cdd8c0` | `#cdd6c4` | `#3a4233` | `#c5d0c2` |
| `water` | `#c8d2db` | `#c8cfd6` | `#2a3239` | `#bcc8d4` |

`zone1–4` are the map's land tiers; `park`/`water` are map fills. `inkSoft`/`inkMute`/`inkLine` are ink at fixed opacities for secondary text, muted text, and hairline borders.

> **Accessibility fix:** `inkMute` was raised to **0.55** alpha across all four palettes (was 0.4/0.45). At 0.55 it clears ~4.5:1 on the paper ground for muted text. `inkSoft` (0.6) was already compliant.

### Accent (the thread)
| Token | Value | Use |
|---|---|---|
| `ACCENT.red` | `#d8423a` | Primary brand thread — the only accent |
| `ACCENT.electric` | `#3a5cff` | Secondary / dark-mode option (not used in Paper) |

### Category colors (`CATEGORY_COLORS`)
| Category | Color | Label |
|---|---|---|
| food | `#E85D04` | Food & Drink |
| bar | `#7209B7` | Bar & Nightlife |
| beauty | `#F72585` | Beauty & Grooming |
| experience | `#4CC9F0` | Experience |
| retail | `#4361EE` | Taste Retail |

### Friend colors (`FRIEND_COLORS`) — cycle for friend dots/avatars
`maya #ff6b4a` · `amir #5b8def` · `jules #f4c542` · `sasha #7d5fff` · `kai #2ec27e` · `rae #e6739f`

### Visibility (`VISIBILITY_COLOR`)
`public #22c55e` · `friends #3b82f6` · `private` → `inkMute`

---

## 3. Typography

Three families, three jobs. Never introduce a fourth.

| Role | Family | Token |
|---|---|---|
| Display — titles, place names | **Fraunces** (serif) | `FONTS.display` |
| Body / UI | **Inter** | `FONTS.body` |
| Meta — labels, counts, ranks, addresses | **DM Mono** | `FONTS.mono` |

Loaded weights: Fraunces Regular/Italic/SemiBold, Inter Regular/Medium/SemiBold/Bold, DM Mono Regular/Medium.

### Type scale (`TYPE`)
| Style | Family | Size / line | Tracking | Weight | Notes |
|---|---|---|---|---|---|
| `metaLabel` | Mono | 9 | +2 | — | uppercase, `inkSoft` — the eyebrow |
| `pageTitle` | Fraunces | 32 / 34 | — | 400 | screen titles |
| `pageTitleLg` | Fraunces | 36 / 38 | — | 400 | large screen titles |
| `placeTitle` | Fraunces | 22 / 24 | — | 400 | place / card titles |
| `body` | Inter | 14 / 20 | — | — | body copy |
| `bodySm` | Inter | 12 / 16 | — | — | secondary body |
| `uiLabel` | Inter | 11 | +0.2 | 600 | chips, button labels |
| `monoSm` | Mono | 10 | +1 | — | dates, ranks, n° codes |

The italic-red accent word uses Fraunces `italic` at the title's size, colored `ACCENT.red`.

---

## 4. Radii · Shadows · Spacing

### Radii (`RADII`)
`none 0` (sticker cards, pin chips) · `sm 4` · `md 14` (toasts) · `lg 18` (tab bar, glass panels) · `pill 999` (chips, toggles, avatars).

The sticker aesthetic means **most cards use `none` (square corners)**. Rounding is reserved for glass surfaces and pills.

### Shadows
| Token | Offset | Blur | Color/opacity | Use |
|---|---|---|---|---|
| `STICKER_SHADOW` | `1.5, 1.5` | **0** | ink @ 1.0 | pin chips, small cards |
| `STICKER_SHADOW_LG` | `2, 2` | **0** | ink @ 1.0 | cards, sheets |
| `FLOAT_SHADOW` | `0, 8` | 24 | `rgba(40,40,60,1)` @ 0.10 | tab bar, floating glass |

CSS equivalent of the sticker shadow: `box-shadow: 2px 2px 0 var(--ink);` with a `1px solid var(--ink)` border and `border-radius: 0`.

### Glass surfaces
`GLASS_STYLE` — `rgba(255,255,255,0.85)` fill, `inkLine` border, radius `lg` (18) + `FLOAT_SHADOW`. `GLASS_STYLE_SM` is the same at radius `md` (14).

### Spacing (`SPACING`)
`xs 4 · sm 8 · md 16 · lg 24 · xl 32 · xxl 48`. Screen edge padding `SCREEN_PAD = 20`. Bottom clearance for the floating tab bar `TAB_CLEARANCE = 100`.

---

## 5. Components

### Pin marker (`components/PinMarker.tsx`)
A square "sticker" chip: `surface` fill, `1.5px` ink border, `STICKER_SHADOW`, `0` radius. A category glyph sits centered, colored by `CATEGORY_COLORS` (or `ACCENT.red` when selected).
- **Default:** 36×36, glyph 16.
- **Selected:** 44×44, glyph 20, `2px` border + `STICKER_SHADOW_LG`, a `3px` red bar pinned to the bottom edge, and a mono `n° XXXX` tag (first 4 chars of the pin id, uppercased) below.
- Photo-backed pins use a `PhotoPin` variant (place photo as the fill) — see `app/(app)/index.tsx`.

### Sticker card
The base surface: `surface` fill, `1px` ink border, `0` radius, `STICKER_SHADOW_LG`. Everything content-bearing is a sticker card.

### Pill button / chip
`RADII.pill`, `1px` border. **Inactive:** transparent fill, `inkLine` border, `ink` label. **Active:** `ink` fill, `bg`-colored label. Category filter chips and toggles use this.

### Glass panel
`GLASS_STYLE` — translucent white, hairline border, soft float shadow, rounded. Used only for floating chrome, never for content cards.

### Tab bar + center FAB (`app/(app)/_layout.tsx`)
A floating glass bar (radius `lg`, `FLOAT_SHADOW`) with four slots and a raised center FAB:
- **find** `✦` · **map** `◉` · **feed** `☰` · **you** `○` — glyph + lowercase mono label; active slot is `ink` (inactive `inkMute`) with a `4px` red `activeDot`.
- **Center FAB** → `/pin/search`: 52×52 red circle, `＋` glyph + tiny "pin" label, red glow shadow, `2px` surface border.

### Bottom sheet (`components/PinDetailSheet.tsx`)
Slides up over a `rgba(15,15,15,0.4)` backdrop; `surface` fill, `24` top radius, `STICKER_SHADOW_LG`, `78%` max height, a centered grab handle. Marked `accessibilityViewIsModal`; backdrop is a labeled "Close" control.

### Rank card (inside the sheet)
- **Filled:** red border, `metaLabel` "YOUR RANK", a large **italic red** `#{rank}` with a muted ` / total`, category caption, and a red `edit →` affordance.
- **Empty / CTA:** solid `ACCENT.red` fill, `metaLabel` "UNRANKED", italic surface-colored "rank it", `→`.

### Friend chip
Horizontal chip: a colored `friendDot` (from `FRIEND_COLORS` cycle) + `@username` (bold Inter 11) + `#rank/total category` (mono 9). Tapping routes to that user.

### Count pill
Square mini-pill: `1px` border, `surface` fill, `STICKER_SHADOW`, `min-width 32`, mono value. In "friends" mode a red count badge rides markers where >1 friend has visited.

### Status pill
`RADII.pill`, `1px` border. **Visited:** ink border, "✓ visited". **Want to go:** hairline border, "○ want to go".

---

## 6. Iconography

Glyphs are typographic (no icon font in core UI). Category glyphs: food `◆` · bar `○` · beauty `◇` · experience `✦` · retail `◉`. Tab glyphs: `✦ ◉ ☰ ○` and the FAB `＋`. These pair with `CATEGORY_COLORS` so category is never conveyed by color alone.

---

## 7. Accessibility

- **Contrast:** `inkMute` raised to `0.55` alpha (all palettes) so muted text/UI meets ~4.5:1 on the ground; `inkSoft` (0.6) already passed. Do not use `inkMute` for anything smaller/lighter than this.
- **Labels:** icon/glyph-only controls carry `accessibilityRole` + `accessibilityLabel` — tab bar (`tabBarAccessibilityLabel` + `selected` state), the `＋` FAB ("Add a new pin"), map/pin markers (`${place}, ${category}`), OTP field, modal backdrops, board rows, retry chips.
- **Live regions:** the upload toast is an `accessibilityLiveRegion="polite"`; key spinners are labeled.
- **Font scaling:** pictographic tab glyphs set `allowFontScaling={false}` (intentional — they're icons); text scales normally. Prefer `minHeight` over fixed `height` on text-bearing containers at large Dynamic Type.
- **Never color alone:** category = glyph + color; rank/status = red + explicit text ("✓ visited").

---

## 8. Usage — do & don't

**Do**
- Use exactly one red thread per screen; let it mark the single most important action/state.
- Square corners + hard sticker shadow for content; rounded glass only for floating chrome.
- One italic red word in each display title.
- Always show the real place name, person's name, and neighborhood — specific over generic.

**Don't**
- Don't add a second accent color, a gradient, or a soft/blurred content shadow.
- Don't use a fourth typeface.
- Don't introduce star ratings or numeric scores.
- Don't stack more than 4 cards above the fold.
- Don't use `inkMute` for primary text.
