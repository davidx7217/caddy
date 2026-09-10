# Card Picker DESIGN.md

The system the extension is built to. It was not chosen from a template: it was
derived from the paper canvas in this directory and first shipped in
`src/options.css`. This file is the prose copy, so the other two surfaces can be
brought onto it without re-reading the CSS and guessing which numbers were
deliberate.

**How to use it.** Read this before touching any UI in `src/`. Every value here
is already in the codebase; if you need one that is not, add it here first and
then use it, rather than inventing it at the call site. If you find yourself
reaching for a rounded corner or a drop shadow, the answer is in
[Borders instead of elevation](#borders-instead-of-elevation).

---

## Principles

Six rules generate the whole look. Everything below is a consequence of one of them.

1. **Paper, not glass.** Warm off-white grounds, warm greys, one ink. No blue-grey,
   no pure `#fff`, no pure `#000`. The palette is what a printed page looks like,
   not what a dialog looks like.
2. **Hairlines do the work of shadows.** Structure comes from `1px` dividers.
   There is exactly one `box-shadow` in the entire system and it is a 3px inset
   rule marking the active nav item.
3. **Zero radius, everywhere.** Including form controls, which have to be reset.
   This is the single most load-bearing choice: it is what stops the UI reading
   as a generic component library.
4. **Type carries hierarchy, colour does not.** Three colours of text (ink, muted,
   warn) and a wide type ramp. Importance is signalled by size and case, never by
   tinting a label.
5. **Micro-caps label, sentence case explains.** Anything that names a thing is
   10-11px uppercase with wide tracking. Anything that says something to the
   reader is 13-14px sentence case.
Rule 2 breaks at the overlay. See [Exemptions](#exemptions).

---

## Colour

Two themes, same token names. Light is the default; dark is opted into by
`data-theme="dark"` on the root, which also has to flip `color-scheme` so native
controls and scrollbars follow.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--bg` | `#eceae5` | `#171614` | Page ground |
| `--surface` | `#f6f4f0` | `#1f1e1b` | Anything raised off the ground: grid cells, the active nav item, the blocklist field |
| `--ink` | `#1a1917` | `#efece5` | Primary text |
| `--muted` | `#635e58` | `#9c968c` | Secondary text, every micro-cap label, resting button text |
| `--line` | `#cfcbc2` | `#35332e` | Every divider and border. Also the text-selection ground |
| `--accent` | `#44403c` | `#efece5` | Solid buttons, selected tiles, the active-nav rule, focus rings |
| `--accentInk` | `#f6f4f0` | `#1a1917` | Text on `--accent` |
| `--warn` | `#7c5310` | `#dcbb74` | Caveats and banners, as both border and text |

### On-accent tokens

The popup and the whole injected overlay are filled with `--accent`, where
`--muted`, `--line` and `--warn` have no contrast at all. Four tokens exist only
for text and structure sitting on that fill.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--onMuted` | `rgba(246,244,240,.62)` | `rgba(26,25,23,.60)` | Secondary text on the fill |
| `--onLine` | `rgba(246,244,240,.20)` | `rgba(26,25,23,.20)` | Dividers on the fill |
| `--onSurface` | `rgba(246,244,240,.08)` | `rgba(26,25,23,.08)` | A raised block on the fill: the winning row, a button |
| `--onWarn` | `#dcbb74` | `#7c5310` | Caveats on the fill |

`--onWarn` is deliberately the *other* theme's warn: the ground it sits on is
the other theme's ground.

**The accent inverts between themes.** In light it is near-black; in dark it is
near-white. It is a contrast device, not a brand colour. Do not give it a hue.

**There is no success/error/info triad.** `--warn` is the only semantic colour
and it always appears as a `1px` border plus matching text, never as a fill.

### Issuer marks

Card issuers get a `40x26` colour block, never a logo (no issuer artwork ships
with the extension). Defined in `src/options.js`:

`chase #1c4d8f` &middot; `robinhood #0f9d58` &middot; `bofa #a3232b` &middot;
`amex #2e6fb8` &middot; `citi #0a4a86` &middot; `capitalone #a8232b` &middot;
`discover #e8620c` &middot; fallback `#635e58`

These are the one place saturated colour is allowed, because they are data, not
chrome.

---

## Typography

One family, bundled, never fetched:

```
"Outfit", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif
```

Outfit's x-height measures 47.5 at 100px against a 53.4 reference, so every face
carries `size-adjust: 112.4%` (`ADJUST` in `src/engine.js`). Drop it and every
label in the extension shrinks.

### Ramp

| Role | Size | Weight | Tracking | Case | Notes |
| --- | --- | --- | --- | --- | --- |
| Page title | 46px | 400 | `-.03em` | UPPER | `line-height: 1.08`. Falls to 34px under 860px |
| Numeral display | 46px | 400 | `-.035em` | - | Point values. Transparent background, no border, no spinners |
| Brand | 30px | 500 | `-.03em` | UPPER | Sidebar only |
| Lede | 28px | 300 | `-.02em` | Sentence | `max-width: 24ch`. The one place weight 300 appears |
| Section heading | 22px | 500 | `-.01em` | UPPER | Tie categories, mode tiles |
| Card name | 20px | 600 | `-.02em` | Sentence | `line-height: 1.2` |
| Row name | 17px | 600 | `-.015em` | Sentence | List rows |
| Body | 14px | 400 | - | Sentence | `line-height: 1.5`. The base |
| Body small | 13.5px | 400 | - | Sentence | Mode descriptions; blocklist textarea at `line-height: 2` |
| Control | 13px | 400 | - | Sentence | Select values |
| Caveat | 12.5px | 400 | - | Sentence | Warn notes and banners, `line-height: 1.5` |
| Meta | 11.5px | 400 | - | Sentence | Fee and issuer lines under a name |
| Micro | 11px | 400 | `.1em` | UPPER | Breadcrumb, counts, header meta |
| Micro-cap | 10px | 400 | `.08-.12em` | UPPER | Every label, every button, every column head |

**Tracking scales inversely with size.** Display type is negative
(`-.01em` to `-.035em`); micro-caps are positive (`.06em` to `.12em`). Nothing
between 12px and 17px carries tracking at all.

**Weight is used sparingly.** 300 appears once (lede). 400 is the default. 500
marks display type. 600 marks a name inside a row. There is no 700.

---

## Space

Not a strict 4px grid. Use a value from this set and do not invent between them:

```
4  5  6  8  10  12  14  16  18  20  22  24  26  28  30  34  40  50  80
```

| Context | Value |
| --- | --- |
| Page gutter | `40px` (`22px` under 860px) |
| Page bottom | `80px` |
| Header | `34px 40px 26px` |
| Sidebar block | `26px 22px` |
| Nav item | `13px 22px` |
| Grid cell | `20-24px` |
| List row | `18px 4px` |
| Table row | `14px 4px` |
| Section top margin | `28px` |
| Empty state | `50px` |

### Measure

Text gets a `ch` cap, not a `px` one.

| Content | Cap |
| --- | --- |
| Lede | `24ch` |
| Section blurb | `62ch` |
| Body paragraph | `60ch` |
| Banner | `72ch` |

### Container widths

| Region | Width |
| --- | --- |
| Sidebar | `250px` fixed |
| Card grid | `minmax(340px, 1fr)` auto-fill |
| Mode tiles | `minmax(310px, 1fr)` auto-fit, capped `840px` |
| Point values | `minmax(230px, 1fr)` auto-fill, capped `860px` |
| List rows | `900px` |
| Activity table | `980px` |
| About | `720px` |
| Blocklist | `620px` |

---

## Borders instead of elevation

- **Every border is `1px solid var(--line)`.** There is no second border weight.
- **Radius is `0`.** Reset it explicitly on `button, select, input, textarea`,
  because user agents supply their own.
- **No `box-shadow`.** The one exception is `inset 3px 0 0 var(--accent)` on the
  active nav item, which is a rule, not a shadow.
- **Grids draw borders on two sides only.** The container takes
  `border-left` + `border-top`; children take `border-right` + `border-bottom`.
  This is what keeps interior lines a single pixel instead of two.
- **Focus is `2px solid var(--accent)` at `outset: 2px`,** via `:focus-visible`.
  Never remove it. The blocklist textarea is the sole element that drops the ring,
  and it replaces it with a `border-color` change to `--muted`.

---

## Components

Concrete specs. Class names are the ones in `src/options.css`.

### Button

Two variants and nothing else.

| | Ghost (`.btn`) | Solid (`.btn.solid`) |
| --- | --- | --- |
| Font | 10px, `.1em`, UPPER | 10px, `.1em`, UPPER |
| Padding | `8px 14px` | `10px 18px` |
| Background | transparent | `--accent` |
| Text | `--muted` | `--accentInk` |
| Border | `1px solid var(--line)` | none |
| Hover | text `--ink`, border `--muted` | `opacity: .88` |

Ghost is the default. Solid marks the single forward action in a view, and there
is never more than one on screen.

**On an accent fill there is no ghost.** A hairline there is either invisible or
reads as a second frame, so buttons in the popup and the overlay drop the border
and take `background: var(--onSurface)` with `--accentInk` text, hovering to
`--onLine`.

### Nav item

`display: flex`, `gap: 12px`, `padding: 13px 22px`, `border-bottom` hairline.
Three children: a `11px` ordinal at `opacity: .55`, a flexed label at `14px`, a
`11px` count at `opacity: .55`. Active state takes `--surface`, `--ink`,
`font-weight: 600`, and the inset accent rule. Set `aria-current="page"`, do not
use a class.

### Grid cell

`padding: 22px`, `background: var(--surface)`, `display: flex; flex-direction:
column; gap: 14px`. The trailing action is pushed down with `margin-top: auto`
so cells of unequal height still line their buttons up.

### List row

`display: flex; align-items: center; gap: 18px; padding: 18px 4px`, hairline
bottom. Left slot is a fixed-width mark, middle is `flex: 1; min-width: 0`, right
is the action. The `4px` horizontal padding is deliberate: rows sit flush with
the page gutter, so the divider reads as a full-width rule.

### Table row

`display: grid` with an explicit column template, `gap: 14px`,
`padding: 14px 4px`, hairline bottom. The header row is the same grid at
`padding: 8px 4px` in micro-caps. Numerals right-align at `font-weight: 500`.

### Field

Label is a micro-cap in `--muted`, stacked above the control with `gap: 5px`.
Controls take `1px solid var(--line)`, `background: var(--bg)` inside a
`--surface` cell (or `--surface` on the page ground), `padding: 8px 10px`, radius
`0`.

### Note and banner

`1px solid var(--warn)`, text `--warn`, `padding: 10px 12px`, 12.5px at
`line-height: 1.5`. No fill, no icon. Notes sit inside a cell; banners sit above
the pane and survive a re-render.

### Selected tile

Same cell geometry, but `background: var(--accent)` and `color: var(--accentInk)`
when on. Descriptive text inside a tile uses `opacity: .78` rather than a second
colour, because `--muted` has no contrast against the accent fill.

### Empty state

`padding: 50px` (`50px 22px` inside a grid cell), `--muted`, 14px sentence case.
Always says what to do next and where, e.g. naming the section that fixes it.

---

## Motion

**Motion is part of the system, and most of it is not built yet.**

Today there is exactly one piece: the overlay panel fades and slides 6px over
`.13s`, with a `transform-origin` that flips between `bottom right` and
`top right` so it grows out of the dock that opened it. That is the reference
for everything added later -- short, directional, and tied to the thing the
reader just acted on.

Two constraints hold as motion gets built out:

- **It has to mean something.** Motion that explains where a thing came from, or
  that something changed underneath the reader, earns its place. Motion that
  decorates a state that was already obvious does not.
- **It stays short.** `.13s` is the house duration. Nothing should read as a
  delay between an action and its result.

Honour `prefers-reduced-motion: reduce` on anything added from here.

---

## Exemptions

One, confined to the injected overlay.

### Drop shadows on floating chrome

`.dock` keeps `0 4px 14px rgba(0,0,0,.28)` and `.panel` keeps
`0 8px 28px rgba(0,0,0,.16)`.

The reason is physical, not stylistic: everywhere else a hairline separates two
surfaces the extension owns, so the line is enough. These two float over a page
the extension does not control and cannot predict -- a `--line` hairline against
an arbitrary photograph, gradient or dark hero section separates nothing. The
shadow is the only thing guaranteeing the dock is visible as an object.

**The radius exemption was not granted.** Both are square. Radius was the
decorative half of the old treatment; the shadow is the functional half. Neither
carries a border either: the shadow is the whole separation.

---

## Per-surface rules

Three surfaces, one system, different constraints.

### Options page

The reference implementation. Full-page, sidebar plus main, one section visible
at a time. Sole owner of `src/options.css`.

### Popup

`340px` wide inside browser chrome, and **filled with `--accent`** so it reads as
the same object as the dock. No frame: the browser already draws the edge. The
ramp compresses -- page title and lede have no place here, and the top of the
ramp is the hostname at 20px uppercase. Gutters drop from `40px` to `14px`.
Structure uses the [on-accent tokens](#on-accent-tokens) throughout.

### Injected overlay

The hard one. Markup and CSS are template strings inside `src/content.js`, in a
**closed shadow root**, on a page the extension does not control.

- **It cannot reach any stylesheet.** No `ui.css`, no `options.css`. Tokens have
  to be written as literal values in the template string.
- **Chrome ignores `@font-face` inside a shadow root.** Measured, not assumed. The
  overlay receives its face from the service worker as a `data:` URI under a
  random `f<nonce>` family, injected into the host page's head and removed on
  unmount. Never hardcode the family name.
- **Dock and panel are one object.** Both take the `--accent` fill with no
  border at all; only the `10px` gap separates them. This is the one place a
  `1px` hairline is not enough separation from what is behind, so the shadow
  does that job instead.
- **It must not announce itself.** No fixed class names, URLs or family names a
  merchant could scan for.

---

## Compliance

All three surfaces are on-system. What each one owns:

| Surface | Sheet | Notes |
| --- | --- | --- |
| Options | `src/options.css` | Reference implementation. Explicit `data-theme` switch |
| Popup | `src/ui.css` | Popup-only despite the generic filename. Reads the stored theme, falls back to the OS |
| Overlay | style string in `src/content.js` | Tokens are set inline on the host by `applyTheme()`, because a shadow root can reach no stylesheet and must not carry a fixed attribute a page could detect. Holds the [exemption](#exemptions) |

### One theme, three surfaces

Options owns the choice and writes `theme` (`'light'` / `'dark'`) to
`chrome.storage.local`. Unset means follow the OS, so a fresh install matches the
system on all three surfaces.

- **Options** sets `data-theme` on the root every render.
- **Popup** reads the key on open and sets the same attribute. The stylesheet is
  three-state: `:root` light, `:root[data-theme="dark"]` dark, and a
  `prefers-color-scheme` block guarded with `:not([data-theme="light"])` so a
  pinned light survives a dark OS.
- **Overlay** receives `theme` in the recommendation payload and, separately,
  listens for the storage change so a switch repaints a dock that is already up
  without closing an open panel.

---

## Don'ts

- Do not add a border radius. Not on buttons, not on the dock, not "just this once".
- Do not add a drop shadow. Use a hairline or a `--surface` fill. The overlay's two are exempt and no third one is coming.
- Do not introduce a hue. The accent is a value, not a colour.
- Do not tint text to signal importance. Change size or case.
- Do not add a third button variant.
- Do not fetch a font, a stylesheet or an icon set. Nothing goes over the network.
- Do not use `--warn` as a fill.
