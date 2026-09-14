# Handoff

Where Caddy stands as of **13 September 2026**, and what is left.

Written to be picked up cold. The README is the reference for how the extension
works and why; this file is only the state of play.

---

## State

- **v1.0.0**, 20 cards across 9 issuers, 83 merchant rows, 19 categories.
- **Every card verified** against its issuer's own page, each carrying a
  `source_url` and the date it was read.
- **Tests green**: 285 engine + 24 setup + 49 lifecycle + 40 worker. `npm test`.
- **Nothing unpushed, nothing untracked.** All three store screenshots are
  current, so nothing is blocking submission any more.
- **`caddy-1.0.0.zip` sits in the repo root**, rebuilt on every commit. See the
  packaging note below.

---

## 1. Submit to the Chrome Web Store

Everything is written, checked and current. This is the next thing to do.

### What is ready

- `store/listing.md` — name, both descriptions, category, single-purpose
  statement, a justification for each of `storage`, `activeTab`, `scripting` and
  `<all_urls>`, and every data-use answer. Fill the dashboard from this file
  rather than writing fresh copy; the permission justifications are read by a
  human reviewer and each one matches what the manifest actually declares.
- `store/privacy-policy.md` — the published policy. The listing links to
  `https://github.com/davidx7217/card-picker/blob/main/store/privacy-policy.md`,
  which is stable, public and versioned. Editing the file and pushing publishes
  the change.
- Icons ship already, drawn by `tools/make-icons.mjs`.
- The upload is `caddy-1.0.0.zip` in the repo root. It is already built.
- **All three screenshots are current at 1280x800.** `1-settings-cards.png` and
  `2-setup-your-cards.png` were regenerated on 2026-09-13 by
  `node tools/make-screenshots.mjs`, after the setup rework made the old setup
  shot wrong. `3-dock-on-a-store.png` is the hand-captured one: hotels.com, panel
  open, Citi Double Cash winning at 2.80% with the Sapphire Reserve portal note
  under it, no browser chrome and nothing personal in frame. That script
  deliberately leaves it alone, because it is the shot the script cannot make.
- **Do not put `theme` back in the screenshot seed.** It used to seed
  `theme: 'light'`, and a pinned light is exactly what makes the Settings rail
  highlight LIGHT instead of AUTO. The seed pins nothing now, so the shot shows
  the state a new install is in, and the colour is held steady by the capture
  emulating `prefers-color-scheme: light` rather than by a stored setting. Put
  the key back and the shot silently stops showing the default.

**Expect the install prompt to be the thing reviewers and users react to.** As of
v1.0.0 `<all_urls>` is declared in the manifest rather than optional, so Chrome
says "read and change all your data on all websites" at install. That was a
deliberate reversal: optional-and-off meant a new user installed Caddy, visited a
shop, saw nothing, and had no way to tell whether the extension was broken. The
listing and the privacy policy both explain the permission in plain terms rather
than hiding it.

---

## 2. Dated: re-verify Chase Freedom Flex on 1 October 2026

Its rotating 5% categories are verified for **Q3 2026 and expire 2026-09-30**.

The extension does not silently mis-rank when they lapse -- `windowState()`
returns `expired` and `stalenessFor()` says so on the card -- but it cannot
invent the new quarter. Read the new categories off chase.com, update
`chase-freedom-flex` in `data/cards.json`, and set `last_verified`.

Discover it Cash Back does not need this: Discover publishes a full year in
advance and both live quarters are already in the file. That distinction is
`hasLaterWindow()` and it is deliberate -- rotation is not staleness.

---

## 3. Dated: the point-values copy names two figures that move

The "What you earn" step tells the reader where cents-per-point numbers come
from, and to make that concrete it quotes two: The Points Guy at 2.05 cents for
Chase points in September 2026, and Bankrate at 1.0 for the same point. Both
were read on **2026-09-13** and the sources are in a comment above the string in
`src/welcome.js`.

TPG republishes monthly. **Re-read both before any release after about March
2027** and either update the numbers or drop to naming the outlets without
figures. The point Caddy is making -- that the rates are published estimates, that
they disagree, and that its own defaults sit between a portal booking and a
cash-out -- survives either way.

There is no community-agreed valuation and the copy no longer implies one. That
was checked: TPG, NerdWallet and Bankrate each publish their own and each uses a
different methodology, which is why they differ by a factor of two.

---

## 4. Packaging

`caddy-<version>.zip` in the repo root is the loadable extension: `manifest.json`,
`src/`, `icons/` and `data/` minus `data/wallet.json`. Nothing else. The root
itself is not loadable as a zip, because it carries `tools/`, `store/`, `design/`,
the README and a real person's card list.

- `npm run pack` builds it. `tools/pack.mjs` reads the version out of the
  manifest, so bumping the manifest renames the file, and the script clears every
  older `caddy-*.zip` first so exactly one build is ever sitting there.
- **A `pre-commit` hook reruns it**, which is what keeps it from drifting behind
  the tree. The hook lives in `.git/hooks/pre-commit` and therefore does **not**
  survive a fresh clone -- recreate it, or just run `npm run pack` by hand.
- The zip stays gitignored, in keeping with the rule already in `.gitignore`
  that builds get rebuilt rather than committed. That also means it is not
  downloadable from GitHub. If it should be, attach it to a Release rather than
  committing a binary.

---

## 5. Not scheduled, worth knowing

- **`welcome.js` still has no automated coverage.** Its decisions were extracted
  to `src/setup.js` and are tested; the rendering half is not, because it assigns
  `innerHTML` and queries the result, which needs an HTML parser this project has
  no dependency for. The September 2026 setup rework was verified by driving all
  four steps in a browser instead: an empty wallet, a wallet with card settings,
  the pager, the search, and all three theme states against both an emulated
  light and an emulated dark browser.
- **Setup is centred and Settings is not**, and that is on purpose: setup is a
  sequence of single questions with a sticky footer under them, not a surface you
  scan. Rows opt back out of the centring in `welcome.css`, because a mark, a name
  and a control on one line reads as a row or it reads as nothing.
- **Theme is three states and the third one is an absent key.** Auto, Light,
  Dark, offered in the Settings sidebar rail and on setup's last step. Auto means
  `theme` is not in storage, and `ui.css` / `options.css` answer with a
  `prefers-color-scheme` query.

  Nothing stores the string 'system'. The popup, the overlay, Settings and setup
  all decide by testing for exactly 'light' or 'dark', and absence already meant
  follow-the-browser in every one of them, so choosing Auto REMOVES the key
  rather than writing a word. A fourth value would have been four readers to
  teach and four chances to miss one. `commit()` in `options.js` carries the only
  branch for it; `setTheme()` in `welcome.js` is the same contract written out
  again, because setup does not share that plumbing.

  **The rule to hold: never stamp `data-theme` while on Auto.** Stamping a
  resolved colour looks identical on load and then freezes, so the page stops
  following the browser. That was a real bug, not a hypothetical:
  `options.css` had no `prefers-color-scheme` block at all, and Options resolved
  the preference in JS and stamped the attribute, so a page left open across a
  system theme switch stayed on the colour it started in. The stylesheet now has
  the three-state pattern `ui.css` always had.

  The overlay is the one surface that legitimately still resolves in JS: its
  tokens are set inline on the host because the shadow root is closed and a
  stylesheet inside it cannot reach out. It carries a `matchMedia` listener for
  that reason, dropped in `destroy()` alongside the resize one, and keeps the
  last stored value in `storedTheme` so the listener knows whether it may act.
- **The card list pages six at a time** and reuses the `.pager` markup from
  Settings rather than growing a second one. Six is what fits under this step's
  title, blurb and search box; Settings pages ten because it has none of those.
- **The overlay can only be checked by looking at it.** Closed shadow root, so
  `host.shadowRoot` is null and no test can reach inside.
  `node tools/preview-overlay.mjs` serves a stand-in storefront running the real
  content script; `--long`, `--clear`, `--dark`, `--closed`, `--saved` cover the
  cases that break layouts. Three layout bugs were found this way and by nothing
  else.
- **Re-run the redirect sweep after any long gap.**
  `node tools/check-redirects-browser.mjs` does the HTTP pass first and browses
  whatever it could not confirm. Do not use `--headless`: measured 2026-09-10, it
  reported a moved row as CLEAN.
- **`department_store` and `utilities` are closed**, both by U.S. Bank Cash+. The
  category audit runs clean in both directions. Re-run it whenever a card or a
  category is added: rules without merchants are dead, merchants without rules
  are inert.
- **Amex Platinum and Citi Custom Cash are deliberately absent.** Platinum's fee
  and base rate could not be read off americanexpress.com; Custom Cash pays 5% on
  whichever category you spent most in that cycle, which is not knowable from a
  domain. Both are recorded in the README with the reasoning.

---

## Working agreements

- **Do not spawn Chrome to test.** Serve the files over a small local server and
  use the in-app browser. The exceptions are the tools that genuinely need a
  browser process -- `make-screenshots.mjs` writing PNGs to disk, and
  `check-redirects-browser.mjs` -- and those are for you to run.
- **Push after each change**, one commit per change, message explaining why and
  not just what.
