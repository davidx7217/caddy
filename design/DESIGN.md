# Caddy DESIGN.md

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
3. **Every edge is rounded, on a three-step scale.** `4px` for controls, `8px`
   for surfaces, `12px` for anything that floats. There are no square corners
   anywhere in the product -- not on a button, not on a hover block, not on the
   dock. A radius outside the scale is a bug, and so is the absence of one.
   The one exception is the toolbar popup's own window, which Chrome draws and
   which no stylesheet here can reach -- which is why the popup is a fallback
   and the in-page overlay is the real surface.
4. **Type carries hierarchy, colour does not.** Three colours of text (ink, muted,
   warn) and a wide type ramp. Importance is signalled by size and case, never by
   tinting a label.
5. **Micro-caps label, sentence case explains.** Anything that names a thing is
   10-11px uppercase with wide tracking. Anything that says something to the
   reader is 13-14px sentence case.
6. **No border is ever near-black.** Borders are `--line` or `--warnLine` and
   nothing else. `--warn` and `--accent` are text and fill values; either one
   used as a border draws a black box, which is what a warn note and a selected
   tile both used to look like.

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

| `--fill` | `rgba(26,25,23,.05)` | `rgba(239,236,229,.06)` | A block lifted off the ground with no border: the winning row, a selected tile, a button in the popup or overlay |
| `--warnLine` | `#d4b483` | `#6b5a33` | **Every warn border.** `--warn` is dark enough to read as a black outline, so it is text only |

**Every surface follows the theme's own ground.** Light theme means a light
popup, a light dock and a light panel; dark means all three are dark. `--accent`
is for marks *on* a surface -- solid buttons, the selected tile, the active nav
rule, focus rings -- never for the ground of a whole surface. Getting that
backwards inverts the extension against the setting the user just chose.

**The accent inverts between themes.** In light it is near-black; in dark it is
near-white. It is a contrast device, not a brand colour. Do not give it a hue.

**There is no success/error/info triad.** `--warn` is the only semantic colour
and it always appears as a `1px` border plus matching text, never as a fill.

### Issuer marks

A `32x32` tile at `--r-md`: two letters in `--ink` over a **wash** of the
issuer's colour, never a fill. **Never a logo** either -- bundling issuer
artwork into a distributed extension means shipping someone else's trademark,
and it would be seven more files to keep current.

| Issuer | Tint | Mark |
| --- | --- | --- |
| chase | `#1c4d8f` | CH |
| robinhood | `#0f9d58` | RH |
| amex | `#2e6fb8` | AX |
| citi | `#0a4a86` | CT |
| capitalone | `#c0392b` | C1 |
| discover | `#e8620c` | DS |
| bofa | `#a3232b` | BA |
| *(unknown)* | `#635e58` | ? |

The tile is a `::before` at `opacity: .16`, rising to `.34` in dark. Two earlier
attempts failed and are worth not repeating:

- **A bare colour block** made the reader remember which blue was Chase and
  which was Citi.
- **Letters in white on the solid brand colour** put the only saturated,
  cold-primary surfaces in the product against a warm paper ground, and they
  fought it. It also forced three of the colours darker to hold 4.5:1.

At 16% the colour still separates Chase from Robinhood at a glance, the letters
do the identifying, and because they are `--ink` no tint needs a per-theme
contrast check. These tiles are the one place saturated colour is allowed,
because they are data, not chrome.

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
| Page title | 34px | 400 | `-.03em` | UPPER | `line-height: 1.12`. Falls to 26px under 860px |
| Numeral display | 34px | 400 | `-.03em` | - | Point values. Transparent background, no border, no spinners |
| Brand | 24px | 500 | `-.03em` | UPPER | Sidebar only |
| Lede | 22px | 300 | `-.02em` | Sentence | `max-width: 26ch`. The one place weight 300 appears |
| Section heading | 18px | 500 | `-.01em` | UPPER | Tie categories, mode tiles |
| Card name | 16px | 600 | `-.015em` | Sentence | `line-height: 1.25` |
| Row name | 15px | 600 | `-.01em` | Sentence | List rows; the overlay panel's winner |
| Body | 13px | 400 | - | Sentence | `line-height: 1.5`. The base |
| Body small | 12.5px | 400 | - | Sentence | Mode descriptions, select values, the overlay panel |
| Caveat | 11.5px | 400 | - | Sentence | Warn notes and banners, `line-height: 1.45` |
| Meta | 11px | 400 | - | Sentence | Fee and issuer lines under a name |
| Micro | 10.5px | 400 | - | Sentence | Overlay notes, rank numerals |
| Micro-cap | 10px | 400 | `.06-.12em` | UPPER | Every label, every button, every column head |

The display end came down once already: 46px read as shouting in a settings
page and left the card grid cramped. Micro-caps did **not** move -- they are at
the floor of legibility and shrinking them buys nothing.

**Tracking scales inversely with size.** Display type is negative
(`-.01em` to `-.03em`); micro-caps are positive (`.06em` to `.12em`). Nothing
between 10.5px and 15px carries tracking at all.

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

## Borders, radius, elevation

- **Every border is `1px solid var(--line)`.** There is no second border weight.
- **Radius comes from the scale, and only from the scale.**

| Token | Value | Applies to |
| --- | --- | --- |
| `--r-sm` | `4px` | Buttons, selects, inputs, banners, warn notes, issuer marks |
| `--r-md` | `8px` | Grid cells, the blocklist field, the popup's winning row |
| `--r-lg` | `12px` | The dock, the overlay panel and the card dialog -- the things that float |

  The overlay hardcodes `4px` and `12px` as literals, because a shadow root
  cannot read a stylesheet and the values do not vary by theme.
- **No `box-shadow`.** The one exception is `inset 3px 0 0 var(--accent)` on the
  active nav item, which is a rule, not a shadow.
- **Grid cells are separate objects.** `gap: 12px`, each cell with its own full
  border and `--r-md`. The old seamless grid shared one hairline between
  neighbours, which is cheaper but cannot be rounded.
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

**In the popup and the overlay there is no ghost.** At those sizes a hairline
around a 10px label reads as a frame rather than a control, so those buttons
drop the border and take `background: var(--fill)`, hovering to `--line`.

### Nav item

`display: flex`, `gap: 12px`, `padding: 13px 22px`, `border-bottom` hairline.
Three children: a `11px` ordinal at `opacity: .55`, a flexed label at `14px`, a
`11px` count at `opacity: .55`. Active state takes `--surface`, `--ink`,
`font-weight: 600`, and the inset accent rule. Set `aria-current="page"`, do not
use a class.

### Card row

A `div` holding two buttons, not one button: `.card-open` takes the mark, name,
meta, caution flag and chevron and opens the dialog; a `.btn` beside it removes
the card. It cannot be a single button -- Remove has to be reachable without
opening the dialog, and a button inside a button is invalid markup that never
fires. `padding: 8px 10px` with a matching `-10px` margin, `--r-md`,
`--surface` on hover.

**The divider is an inset `::after`, not a `border-bottom`.** A border on a
rounded row is clipped at the corners, and the hover block has to be rounded --
a hard-edged wash inside a rounded system reads as a mistake. The rule sits
`10px` in from each end, and both the hovered row's own divider and the one
below it go transparent so the hover block has clean edges. Issuer mark, then name over meta, then a
`--warn` `!` when the card carries a caution, then a chevron. Opens the detail
dialog.

It replaced a `340px` grid cell. The cell only had to be that tall because it
held the caution text and the per-card dropdowns; both moved into the dialog, so
the summary needs nothing but enough to identify the card. Six cards now occupy
the height four used to.

### Dialog

`<dialog>` with `showModal()` -- native, so focus trapping and Esc come free.
`--r-lg`, `1px solid var(--line)`, `--surface`, capped at `560px`. Head (mark,
title, close), a scrolling body at `max-height: min(60vh, 460px)`, and a foot
holding the destructive action on the left and the outbound link on the right.

**No shadow.** `::backdrop` at `rgba(0,0,0,.45)` is the separation, which keeps
the overlay's two the only shadows in the system.

**`margin: auto` has to be restated.** The `* { margin: 0 }` reset at the top of
`options.css` wipes the UA rule that centres a modal, and without it the dialog
pins to the top-left corner.

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
Controls take `1px solid var(--line)`, `--r-sm`, `padding: 8px 10px`, and a
`--surface` ground when they sit directly on the page.

**One lifted surface per field, never two.** The point values were briefly a
bordered input inside a bordered `--surface` cell, which read as two fields
stacked -- and the outer one was not editable. Point cells carry no border and
no background; the input is the only thing raised off the page.

### Note and banner

`1px solid var(--warn)`, text `--warn`, `padding: 10px 12px`, 12.5px at
`line-height: 1.5`. No fill, no icon. Notes sit inside a cell; banners sit above
the pane and survive a re-render.

### Selected tile

Same cell geometry, but `background: var(--accent)` and `color: var(--accentInk)`
when on. Descriptive text inside a tile uses `opacity: .78` rather than a second
colour, because `--muted` has no contrast against the accent fill.

### Section heading

`.sub-head`: micro-cap in `--muted` on a `border-top` hairline, `padding-top:
12px`, `margin-top: 40px` (`26px` as the first child). An optional `.hint`
follows at 12.5px `--muted`, capped at `62ch`. Whatever comes next starts
`14px` below -- that rule is declared last in the sheet on purpose, since it has
the same specificity as the block margins it overrides.

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

Neither carries a border: the shadow is the whole separation, and both sit at
`--r-lg` like any other floating thing.

---

## Per-surface rules

Three surfaces, one system, different constraints.

### Options page

The reference implementation. Full-page, sidebar plus main, one section visible
at a time. Sole owner of `src/options.css`.

**Card details live in a dialog, not the page.** Clicking a card opens
everything the ranker knows about it: the spec table, the per-card config, every
bonus rule with its caps and windows and caveats, and a link to the issuer's own
terms page (`source_url`, present on all 14 records).

**`note` is never rendered.** It is a maintainer field -- why a card is modelled
the way it is, what was deliberately left out, where a rate was read from.
`caution` is the user-facing one. This is written into `data/cards.json` as
`_note_field` too, because it was rendered once by mistake and showed a reader a
paragraph about schema design.

**Four sections, not eight.** Cards (owned plus catalogue), Ranking
(tie-breakers plus point values), Where it runs (mode plus blocklist), Data
(activity plus about plus export). Each pane holds two blocks separated by a
`.sub-head`, so a merged section still reads as two things rather than one long
scroll. Anything that used to be a section blurb now rides under its own
sub-head as a `.hint`.

### Toolbar icon

**The click's job is to open the in-page overlay, not a popup.** A browser popup
is a native window Chrome draws: its square corners, border and shadow sit
outside any stylesheet this extension owns, and there is no API to change them
-- see the Chromium issue "Cannot change extensions' popup's shape". The overlay
is ours end to end, so wherever it can run, it wins.

`manifest.json` still declares a `default_popup`, and `src/popup.html` opens for
a few milliseconds before closing itself. That is deliberate. The alternative --
`chrome.action.onClicked` plus per-tab `setPopup` -- has to know in advance which
tabs are injectable, which means reading every tab's URL, which means the `tabs`
permission, which Chrome describes at install as **"read your browsing
history"**. This extension's whole pitch is that installing asks for nothing. A
brief flash is the cheaper price.

So the popup, on open:

1. **No cards** -> opens Options and closes. Flashing an empty ranking at someone
   who has not built a wallet answers nothing.
2. **Injection succeeds** -> the overlay mounts, is told to `OPEN`, and the popup
   closes. This is the normal path on every http(s) page.
3. **Injection refused** -> the popup stays and renders the ranking itself. This
   is the only reason it still exists.

Chrome refuses `chrome://` pages, the Web Store, the PDF viewer, `view-source:`,
other extensions' pages, and `file://` without the file-access grant. That list
is the browser's and no permission changes it.

**The click is an explicit request, so it overrides `res.show`** -- that flag is
a guess about whether a page sells anything, and the icon is not a guess. It does
**not** override the blocklist.

### Popup

`340px` wide, on `--surface` so it is the same colour as the dock. No border: the
browser draws the edge, square, and rule 3 cannot reach it -- which is exactly
why it is a fallback rather than the main surface. Everything inside it follows
the scale. The ramp compresses: the top of it is the hostname at 17px uppercase,
and gutters drop from `40px` to `14px`.

**It must fit without scrolling.** Chrome gives a popup 600px of height and no
more, and a popup that scrolls has buried its own primary action.

- **Three cards, never more.** The fourth-best card has never changed a decision
  at the till, and the full ranking is one click away in Options.
- **No tail.** Portal routes and other secondary notes are cut.

The winning row is marked only when `resolvedBy === 'clear_winner'`, with a
`--fill` ground at `--r-md` and nothing else.

### Injected overlay

The hard one. Markup and CSS are template strings inside `src/content.js`, in a
**closed shadow root**, on a page the extension does not control.

- **It cannot reach any stylesheet.** No `ui.css`, no `options.css`. Tokens have
  to be written as literal values in the template string.
- **Chrome ignores `@font-face` inside a shadow root.** Measured, not assumed. The
  overlay receives its face from the service worker as a `data:` URI under a
  random `f<nonce>` family, injected into the host page's head and removed on
  unmount. Never hardcode the family name.
- **Dock and panel are one object.** Both take `--surface` at `--r-lg` with no
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
| Popup | `src/ui.css` | Fallback only. Reads the stored theme, falls back to the OS |
| Overlay | style string in `src/content.js` | Tokens are set inline on the host by `applyTheme()`, because a shadow root can reach no stylesheet and must not carry a fixed attribute a page could detect. Holds the [exemption](#exemptions) |

### One theme, three surfaces

Options owns the choice and writes `theme` (`'light'` / `'dark'`) to
`chrome.storage.local`. Unset means follow the OS, so a fresh install matches the
system on all three surfaces.

- **Options** sets `data-theme` on the root every render.
- **Overlay** receives `theme` in the recommendation payload and, separately,
  listens for the storage change so a switch repaints a dock that is already up
  without closing an open panel.

---

## Don'ts

- Do not invent a radius. Three values exist; a fourth is a bug.
- Do not add a drop shadow. Use a hairline or a `--surface` fill. The overlay's two are exempt and no third one is coming.
- Do not introduce a hue. The accent is a value, not a colour.
- Do not tint text to signal importance. Change size or case.
- Do not add a third button variant.
- Do not fetch a font, a stylesheet or an icon set. Nothing goes over the network.
- Do not use `--warn` as a fill, or as a border. It is text. Borders are `--warnLine`.
- Do not use `--accent` as a border or as the ground of a whole surface. It inverts with the theme, and at `#44403c` it is a black box.
