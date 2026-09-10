# Design canvas

Source for the design canvas of the extension's three UI surfaces. These are
working files: the published canvas is regenerated from them, never edited in
place.

Every `*.dc.html` is one artboard. `canvas.json` positions them and carries the
sticky notes. `card-picker-ui.html` is the seeded output -- a build product,
gitignored, ~2.5MB because the canvas editor is baked into it.

## What is in here

| Artboard | Surface | State |
| --- | --- | --- |
| `Dock` | injected dock | collapsed, the thing most people ever see |
| `Main` | injected panel | clear winner |
| `PanelTie` | injected panel | unresolved four-way tie |
| `PanelStale` | injected panel | expired rotating category |
| `PanelNotes` | injected panel | activation warning, and a portal note |
| `Popup` | toolbar popup | full ranking |
| `PopupEmpty` | toolbar popup | no cards added |
| `Options` | options page | every section |

Each renders light and dark side by side.

## Where the real thing lives

The options page is ordinary HTML on `src/options.css` and the popup is ordinary
HTML on `src/ui.css`, so a change to either is a normal edit. The popup is only
a fallback now: clicking the icon injects the overlay and closes the popup,
except on pages Chrome refuses to inject into. The dock and panel are NOT: their markup and 67 lines of
CSS are template strings inside `src/content.js`, in a closed shadow root, and
cannot reach `ui.css`. A redesign of those is an edit to a string literal.

Nothing here is wired to the extension. Changes have to be ported by hand.

## Regenerating

The seeding helper ships with the `design` skill, in a versioned directory that
changes between releases -- run `/design` and use the base directory it reports
rather than hardcoding a path. Then, from this directory:

```
node "<base>/seed-canvas.mjs" --template "<base>/payload.template.html" \
  --out card-picker-ui.html --title "Caddy UI" \
  --artboard Main.dc.html --artboard Dock.dc.html --artboard PanelTie.dc.html \
  --artboard PanelStale.dc.html --artboard PanelNotes.dc.html \
  --artboard Popup.dc.html --artboard PopupEmpty.dc.html \
  --artboard Options.dc.html --canvas canvas.json
```

`Main.dc.html` must stay the entry artboard.

## The numbers are real

Every rate, card name and category on these artboards came out of `rank()` in
`src/engine.js`, not from invention -- `homedepot.com` really does put Robinhood
Gold on top at 3.00%, and `doordash.com` really is a four-way tie at 4.50%. If
the card data changes enough to make an artboard wrong, regenerate the values
before redesigning against them.
