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
| Numeral display | 22px | 500 | `-.02em` | - | Point values. `--surface` ground, `--line` border, `--r-sm`, no spinners |
| Brand | 24px | 500 | `-.03em` | UPPER | Sidebar only |
| Lede | 22px | 300 | `-.02em` | Sentence | `max-width: 26ch`. The one place weight 300 appears |
| Section heading | 18px | 500 | `-.01em` | UPPER | Tie categories |
| Card name | 16px | 600 | `-.015em` | Sentence | `line-height: 1.25` |
| Row name | 15px | 600 | `-.01em` | Sentence | List rows; the overlay panel's winner. Mode tile labels are the same size and weight but UPPER at `.01em` |
| Body | 13px | 400 | - | Sentence | `line-height: 1.5`. The base |
| Body small | 12.5px | 400 | - | Sentence | Mode descriptions, select values, the overlay panel |
| Caveat | 11.5px | 400 | - | Sentence | Warn notes and banners, `line-height: 1.45` |
| Meta | 11px | 400 | - | Sentence | Fee and issuer lines under a name |
| Micro | 10.5px | 400 | - | Sentence | Overlay notes, rank numerals |
| Micro-cap | 10px | 400 | `.06-.12em` | UPPER | Every label, every button, every column head |

The display end came down twice. 46px read as shouting in a settings page and
left the card grid cramped; then the point values came off 34px when they stopped
being printed output and became fields you could type in. Micro-caps did **not**
move -- they are at the floor of legibility and shrinking them buys nothing.

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
| Page gutter | `40px` minimum, growing to centre the column (`22px` under 860px) |
| Page bottom | `80px` |
| Header | `34px 40px 26px` |
| Sidebar block | `26px 22px` |
| Nav item | `12px 22px` |
| Grid cell | `16px 18px` (mode tiles; point cells carry no padding at all) |
| List row | `14px 4px` |
| Table row | `13px 4px` |
| Section top margin | `28px` |
| Empty state | `30px 4px` |

### Measure

Text gets a `ch` cap, not a `px` one.

| Content | Cap |
| --- | --- |
| Lede | `26ch` |
| Section blurb | `62ch` |
| Body paragraph | `60ch` |
| Banner | `72ch` |

### Container widths

**One content width, `--content: 900px`.** Every block on every pane caps
there: list rows, mode tiles, point values, the activity table, the blocklist
and About. They used to cap anywhere between `620px` and `980px`, which made
the narrow panes read as left-aligned even inside a centred column -- a `700px`
grid of tiles stopping short under a full-width section rule.

| Region | Width |
| --- | --- |
| Sidebar | `250px` fixed |
| Any content block | `var(--content)`, `900px` |
| Mode tiles | `minmax(260px, 1fr)` auto-fit |
| Point values | `minmax(190px, 1fr)` auto-fill, `gap: 18px 26px` |
| Setup shell | `calc(var(--content) + 80px)`, centred in the window |

**The column is centred by the gutter, not by a `max-width`.** `.head`,
`#alerts` and `.page` take
`padding-inline: max(40px, (100% - var(--content)) / 2)`, so the gutter grows
past `40px` to centre the content and never falls below it. Capping those
elements themselves would work for the blocks and stop the header's rule and
the pane's dividers short, and those are full-width rules by design.

---

## Borders, radius, elevation

- **Every border is `1px solid var(--line)`.** There is no second border weight.
- **Radius comes from the scale, and only from the scale.**

| Token | Value | Applies to |
| --- | --- | --- |
| `--r-sm` | `4px` | Buttons, selects, inputs, banners, warn notes |
| `--r-md` | `8px` | Grid cells, issuer marks, list-row hover blocks, the blocklist field, the popup's winning row |
| `--r-lg` | `12px` | The dock, the overlay panel and the card dialog -- the things that float |

  The overlay hardcodes `4px` and `12px` as literals, because a shadow root
  cannot read a stylesheet and the values do not vary by theme.
- **No `box-shadow`.** The one exception is `inset 3px 0 0 var(--accent)` on the
  active nav item, which is a rule, not a shadow.
- **Grid cells are separate objects.** `gap: 10px`, each cell with its own full
  border and `--r-md`. The old seamless grid shared one hairline between
  neighbours, which is cheaper but cannot be rounded. Point cells opt out of the
  cell chrome entirely -- see [Field](#field).
- **Focus is `2px solid var(--accent)` at `outset: 2px`,** via `:focus-visible`.
  Never remove it. Two elements drop the ring and both replace it with a
  `border-color` change to `--muted`: the blocklist textarea and the point-value
  input. Both already carry a `--line` border that the ring only doubles, and
  both take the same treatment on hover, so focus and hover stay one idea.
  Nothing else qualifies -- the setup flow's search box tried and was put back.

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
is never more than one on screen. Today that is START RECORDING on the Data pane
(until it is on), ISSUER TERMS in the card dialog, and CONTINUE in setup. Cards,
Ranking and Where it runs carry none, which is correct: a list you pick from has
no single forward action. The catalogue used to give every unowned card a solid
ADD, which put twelve of them on one pane and made a list read as twelve
competing demands. Export and Import are both ghost for the same reason -- they
are a matched pair, and solid on one implied a hierarchy that is not there.

**In the popup and the overlay there is no ghost.** At those sizes a hairline
around a 10px label reads as a frame rather than a control, so those buttons
drop the border and take `background: var(--fill)`, hovering to `--line`.

### Nav item

`display: flex`, `gap: 12px`, `padding: 12px 22px`, `border-bottom` hairline.
Three children: a `11px` ordinal at `opacity: .55`, a flexed label at `13px`, a
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

**Both lists use it.** YOUR CARDS and ADD A CARD are the same row: the body opens
the dialog, the button on the end removes or adds. The catalogue used to be a
plain row with an ADD button and no way to look at a card before taking it, which
made the one screen that should answer "what does this card do?" the one screen
that could not.

It replaced a `340px` grid cell. The cell only had to be that tall because it
held the caution text and the per-card dropdowns; both moved into the dialog, so
the summary needs nothing but enough to identify the card. Six cards now occupy
the height four used to.

### Filter bar

Not a component. It is the [Field](#field) spec laid out in a row -- micro-cap
label over a control -- with the result count pushed to the far end at
`margin-left: auto` and a ghost CLEAR beside it that appears only once something
is filtering. Three CSS rules, no new tokens.

**No issuer dropdown.** The search box already matches issuer names, so typing
"chase" does that job with one less control on screen. Every filter that survived
answers a question the data can settle: what it earns, whose name is on the
account, whether it costs anything, and which categories it bonuses.

**Filters are view state and are never stored.** A filter you have to remember
turning off is a filter that makes the catalogue look permanently short.

### Dialog

**Keyed by product, not by wallet position.** The catalogue opens it too, so the
card may not be owned: everything above the footer reads the same either way,
because what a card earns is a fact about the card. The footer flips between
REMOVE CARD and ADD CARD, and the per-card selects appear only once there is an
instance to write them to -- until then the dialog says so in one line.

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

`display: flex; align-items: center; gap: 14px; padding: 14px 4px`, hairline
bottom. Left slot is a fixed-width mark, middle is `flex: 1; min-width: 0`, right
is the action. The `4px` horizontal padding is deliberate: rows sit flush with
the page gutter, so the divider reads as a full-width rule.

### Table row

`display: grid` with an explicit column template, `gap: 14px`,
`padding: 13px 4px`, hairline bottom. The header row is the same grid at
`padding: 8px 4px` in micro-caps. Numerals right-align at `font-weight: 500`.

### Field

Label is a micro-cap in `--muted`, stacked above the control with `gap: 5px`. A
card that asks for more than one pick gets one control per pick, numbered in the
label (`YOUR TWO 5% CATEGORIES 1`, `... 2`) -- `user_config.selections` is a list
of groups, each with its own `max`, and the saved value is one flat array of
option ids that the ranker reads directly.
Controls take `1px solid var(--line)`, `--r-sm`, `padding: 8px 10px`, and a
`--surface` ground when they sit directly on the page. The blocklist textarea is
the one control that scales up rather than repeating that spec: it is a
multi-line field the width of a paragraph, so it takes `--r-md` and
`padding: 16px 18px` like a surface, not like a control.

**One lifted surface per field, never two.** The point values were briefly a
bordered input inside a bordered `--surface` cell, which read as two fields
stacked -- and the outer one was not editable. Point cells carry no border and
no background; the input is the only thing raised off the page.

### Note and banner

`1px solid var(--warn)`, text `--warn`, `padding: 10px 12px`, 12.5px at
`line-height: 1.5`. No fill, no icon. Notes sit inside a cell; banners sit above
the pane and survive a re-render.

### Selected tile

Same cell geometry, but `background: var(--fill)` and `border-color: var(--muted)`
when on, and the state micro-cap goes `--ink` at `600`.

**Not an `--accent` fill.** That is `#44403c` in light, which reads as a black
block dropped into a paper page -- the same failure principle 6 names for
`--accent` used as a border. A tint plus a warmer border says "chosen" without
inverting the tile out of the palette, and it leaves the descriptive text on
`--muted` where it belongs rather than needing an opacity to survive the fill.

### Section heading

`.sub-head`: micro-cap in `--muted` on a `border-top` hairline, `padding-top:
12px`, `margin-top: 40px`. The **first** one in a pane drops the border and the
padding and takes `margin-top: 24px`, because it sits directly under the header's
own full-width rule and two hairlines that close together read as a mistake. The
later ones keep theirs: that is what separates the blocks a merged section holds. An optional `.hint`
follows at 12.5px `--muted`, capped at `62ch`. Whatever comes next starts
`14px` below -- that rule is declared last in the sheet on purpose, since it has
the same specificity as the block margins it overrides.

### Empty state

`padding: 30px 4px`, `--muted`, 13px sentence case -- the `4px` matches the list
rows so an empty list sits where a full one would. Inside a grid cell it drops
the cell's border and background as well. Always says what to do next and where,
e.g. naming the section that fixes it, or the search term to clear.

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

Four surfaces, one system, different constraints.

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

### Setup flow

The install flow, `src/welcome.html`. It borrows the theme wholesale -- it loads
`options.css` first and adds `welcome.css` for the stepper alone -- because a
third copy of the palette is how the popup and Options drifted apart in the
first place. The issuer marks, rows, buttons, mode tiles and point-value cells
are the Options components, unchanged.

**A centred column, not the sidebar shell.** Setup is a sequence, not a place to
navigate around, so the nav that makes Options legible would be four dead links
here. The shell is `var(--content)` plus its own `40px` gutters, so the content
lands on the same `900px` measure Options uses and the two line up when setup
hands over to Settings at the end.

**Progress is carried by the label, not by the rule.** Each step is a flex cell
under a `1px --line` hairline; reached steps take `--ink` and `600`, the rest
stay `--muted`. It was briefly a `2px` rule filling to `--accent`, which broke
two rules at once: there is no second border weight, and `--accent` as a border
draws a black box. Type carries hierarchy, colour does not.

**The footer is sticky and sits on `--bg`.** It is the page's own ground
continuing under a long catalogue, not a raised bar, so it takes a `1px` top
hairline and no `--surface`.

**A card's `caution` is on the picker row.** This is the screen where it changes
a decision: "Robinhood Gold Card, no annual fee" is true and misleading on its
own, because the 3% needs a paid subscription. It renders as a `--warn` caveat
line under the meta, capped at `60ch`. `note` stays out of the UI, here as
everywhere.

**The catalogue is one flat ranked list, not issuer groups.** Rows are ordered by
`common`, the editorial popularity rank in `cards.json`, so a new reader meets
mass-market cards first. Grouping by issuer put whichever bank was written into
the file first at the top and buried the ordering entirely; with the groups gone,
each row names its bank in the meta line instead of relying on the two-letter
mark alone. Search matches card name and bank name.

**The card picker is one button per row.** The whole row is the control, so the
divider is an `::after` inside the padding rather than a border on the element
-- a hard-edged wash inside a rounded system reads as a mistake. Chosen rows
take `--fill` and flip their micro-cap from `ADD` to `ADDED`, which is the
[selected tile](#selected-tile) pattern at row scale.

**Step three exists only when the picks earn it.** Fine-tune renders the
per-card config and the point values for currencies the wallet actually earns.
A cash-back-only wallet skips the step entirely rather than being shown a form
whose every field is `1.0 cpp` by definition.

**It honours the 860px breakpoint.** Same as Options: the gutter falls to
`22px` and the page title to `26px`. The four step labels wrap two-up rather
than squashing.

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

All four surfaces are on-system. What each one owns:

| Surface | Sheet | Notes |
| --- | --- | --- |
| Options | `src/options.css` | Reference implementation. Explicit `data-theme` switch |
| Setup | `src/options.css` + `src/welcome.css` | Borrows the theme; owns only the stepper. Reads the stored theme, falls back to the OS |
| Popup | `src/ui.css` | Fallback only. Reads the stored theme, falls back to the OS |
| Overlay | style string in `src/content.js` | Tokens are set inline on the host by `applyTheme()`, because a shadow root can reach no stylesheet and must not carry a fixed attribute a page could detect. Holds the [exemption](#exemptions) |

### One theme, four surfaces

Options owns the choice and writes `theme` (`'light'` / `'dark'`) to
`chrome.storage.local`. Unset means follow the OS, so a fresh install matches the
system on all four surfaces.

- **Options** sets `data-theme` on the root every render.
- **Setup** sets it once at load. There is no theme switch in the flow: it is a
  minute long, it follows whatever is already stored, and Options owns the toggle.
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
