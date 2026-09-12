# Handoff

Where Caddy stands as of **11 September 2026**, and what is left.

Written to be picked up cold. The README is the reference for how the extension
works and why; this file is only the state of play.

---

## State

- **v1.0.0**, 20 cards across 9 issuers, 83 merchant rows, 19 categories.
- **Every card verified** against its issuer's own page, each carrying a
  `source_url` and the date it was read.
- **Tests green**: 285 engine + 24 setup + 49 lifecycle + 40 worker. `npm test`.
- **Two commits are unpushed.** `git push` before anything else.
- **One untracked file is in the tree and must NOT be committed as it stands.**
  See the first task below.

---

## 1. The dock screenshot — BLOCKED, and it is the only thing stopping submission

`store/screenshots/3-dock-on-a-store.png` exists in the working tree and is
**wrong on two counts**. It is untracked. Do not `git add` it.

1. **The panel is closed.** Only the pill is visible in the corner. The shot has
   to show the panel open with a recommendation in it, which is the whole point.
2. **It contains personal information.** It is a full-screen grab, so the Chrome
   tab bar is in frame: two inboxes showing an email address, a Robinhood
   retirement tab, and a tab titled "David - Finances". That would be published
   on a public store listing.

### How to redo it

1. Open a merchant from `data/merchants.json` — hotels.com works and gives a
   clear winner with a portal note, which shows off a rule most people do not
   know.
2. **Click the pill so the panel opens.**
3. `Cmd+Shift+4`, then **Space**, then click the Chrome window. Capturing the
   window rather than the screen leaves out the menu bar and the clock.
4. Save over `store/screenshots/3-dock-on-a-store.png`.

Then ask Claude to crop out the tab bar and address bar and scale it to exactly
**1280x800** — the store does not rescale, and `sips` can do it with no
dependency. Check the result for anything personal before committing it.

The other two screenshots are correct and committed. `node
tools/make-screenshots.mjs` regenerates them and deliberately leaves this third
file alone, because it is the one shot that script cannot produce: the overlay
only exists inside a page the content script has run on.

---

## 2. Submit to the Chrome Web Store

Everything except the screenshot is written and checked.

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

**Expect the install prompt to be the thing reviewers and users react to.** As of
v1.0.0 `<all_urls>` is declared in the manifest rather than optional, so Chrome
says "read and change all your data on all websites" at install. That was a
deliberate reversal: optional-and-off meant a new user installed Caddy, visited a
shop, saw nothing, and had no way to tell whether the extension was broken. The
listing and the privacy policy both explain the permission in plain terms rather
than hiding it.

---

## 3. Dated: re-verify Chase Freedom Flex on 1 October 2026

Its rotating 5% categories are verified for **Q3 2026 and expire 2026-09-30**.

The extension does not silently mis-rank when they lapse -- `windowState()`
returns `expired` and `stalenessFor()` says so on the card -- but it cannot
invent the new quarter. Read the new categories off chase.com, update
`chase-freedom-flex` in `data/cards.json`, and set `last_verified`.

Discover it Cash Back does not need this: Discover publishes a full year in
advance and both live quarters are already in the file. That distinction is
`hasLaterWindow()` and it is deliberate -- rotation is not staleness.

---

## 4. Not scheduled, worth knowing

- **`welcome.js` has no automated coverage.** Its decisions were extracted to
  `src/setup.js` and are tested; the rendering half is not, because it assigns
  `innerHTML` and queries the result, which needs an HTML parser this project has
  no dependency for. Verified by driving all four steps in a browser.
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
