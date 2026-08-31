# Card Picker

Chrome extension that tells you the best credit card to use on the site you are on.

No account. No bank linking. No network calls. No build step. No dependencies.

---

## Licence

MIT -- see [LICENSE](LICENSE). Rates and merchant categories are facts read from
public issuer terms, and facts are not copyrightable, so the licence covers the
code and the arrangement of the data rather than the underlying numbers. It is
here to make contribution and reuse unambiguous, not to fence anything off.

Not financial advice. Verify any rate against your issuer before relying on it.

## Data status

All 7 card records were verified against issuer sources on **2026-08-29**. Each carries
`verified: true`, `last_verified`, and a `source_url`.

**Standing obligations:**

- **Chase Freedom Flex rotating categories expire 2026-09-30.** Re-verify on 2026-10-01
  or the extension will confidently recommend a dead 5% category.
- Merchant categories in `merchants.json` are still hand-assigned and unverified.
- Robinhood's rumoured 5% travel-portal rate is deliberately **not** modelled: several
  third-party sites report it, robinhood.com does not confirm it.

Re-verify any card whose `last_verified` is over 90 days old. The popup shows an
"unverified data" banner while any owned card has `verified: false`.

This is the actual product. The extension is a few hundred lines; the data is the asset.

---

## Install

1. Chrome -> `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. **Load unpacked** -> select this folder
4. The options page opens on install. Add your cards there -- the extension
   ships with no wallet, by design.

No icons are included, so Chrome shows a default puzzle piece. Pin it to the toolbar.

## Use

- Visit any of the 69 seeded merchants (e.g. `wholefoodsmarket.com`, `target.com`,
  `amazon.com`, `delta.com`). A small green dock appears bottom-right.
- Click the toolbar icon for the full ranking across every card you own.
- The dock sits on the right rail. Click the icon to open the panel, `x` to close it,
  and drag the dotted grip to slide the dock up or down. Its position is saved globally.
- When two cards are within 10% of each other, the overlay shows both and lets you
  pick one to use on that category from then on.

## Commands

```bash
node tools/test-engine.mjs
```
191 assertions over the recommendation logic. Run this after any data or engine change.

```bash
node tools/test-lifecycle.mjs
```
18 assertions over the content script's mount/unmount/polling behaviour. It runs the
real `src/content.js` in a vm sandbox with stubbed DOM and chrome globals and a fake
clock, so the timing rules below are actually verified rather than reasoned about.

---

## Layout

```
data/
  categories.json   17 normalized categories, the pivot everything maps into
  cards.json        7 card products, all verified 2026-08-29 with source_url
  merchants.json    69 domains -> category, plus per-issuer overrides
  valuations.json   cents per point. Opinions, not facts. User-overridable
src/
  engine.js         pure rank(). No DOM, no chrome.*, runs under node
  background.js     service worker: loads data, runs the engine, caches per tab
  content.js        shadow-DOM overlay. Dumb renderer, no logic
  popup.js/.html    full ranking for the current tab
  options.js/.html  card picker, per-card config, saved tie choices, valuations
  options.css       options page styling only; ui.css holds the shared tokens
  fonts/            Outfit, bundled woff2, latin subset, never fetched remotely
tools/
  test-engine.mjs   zero-dependency test runner for the engine
  test-lifecycle.mjs runs the real content script in a vm sandbox
  fixtures/         test-only data; never shipped with the extension
```

## Design rules worth keeping

**The engine is pure.** `src/engine.js` never touches the DOM, `chrome.*`, or the
network. That is why it can be tested in node in 40ms. Every decision about which
card wins lives there and nowhere else.

**Rules are declarative data, never code.** No `eval`, no expression strings. If a
rule shape cannot express something, add a field and handle it in the engine.
Interpreting remote code would get the extension rejected from the Web Store.

**Permissions.** The only declared permission is `storage`, but the content script
matches `<all_urls>` so the dock can appear on merchants that are not yet in the table.
That is a real tradeoff, taken deliberately: the install prompt reads "read and change
all your data on all websites", and store review will scrutinise it. Revisit before
any public listing.

**Categories are inferred when the merchant is not in the table.** `merchants.json`
is hand-verified and always wins. Failing that, `inferCategory()` reads the page's
own Schema.org markup -- `Hotel` -> `travel_hotel`, `Restaurant` -> `dining`,
`GroceryStore` -> `groceries`, bare `Product` or a storefront platform ->
`online_retail` -- and only then falls back to "everything else". Ordering is
specificity-first, so a hotel page carrying Product markup still reads as lodging.
The result reports `categorySource` as `merchant`, `inferred`, or `default`, and the
UI labels a guess as a guess.

Without this the extension appeared on every store but categorised only the 69 in
the table, so an unlisted merchant fell to "everything else" and silently dropped
any card whose bonus category applied -- on a live allbirds.com checkout that meant
Blue Cash Everyday's 3% US online retail never entered the ranking.

**The dock only appears on pages you can buy something on.** `isMerchantPage()` in
`engine.js` decides, and like `rank()` it is pure and signal-based -- the content
script reads the DOM, the engine judges, so the rule is testable in node. Precedence:

1. The page is a checkout -> always show, so the auto-open has a dock to open.
2. One strong structural signal -> show. Schema.org commerce types (`Product`,
   `Offer`, `OfferCatalog`, `Hotel`, ...), `og:type` starting `product`, or a
   storefront platform fingerprint (Shopify, WooCommerce, Magento, BigCommerce).
3. Editorial markup (`Article`, `NewsArticle`, `BlogPosting`, ...) vetoes the weak
   signals unless there is a real cart or checkout link.
4. A domain in `merchants.json` still needs one weak signal. Being in the table
   settles WHAT a site is, not whether THIS page sells anything -- youtube.com is
   a merchant, but a video you are watching on it is not a purchase.
5. Otherwise two of three weak signals: a buy CONTROL, a cart link, a price.

Step 4 exists because being in the table used to short-circuit detection
entirely, so the dock sat on every YouTube video. Measured live: a YouTube watch
page has zero commerce signals, while homedepot.com's homepage has one and
netflix.com's signup page has one. One weak signal separates them cleanly.

**No conclusive signal may come from page text.** A control means you can act;
text only means the page is talking. Text may corroborate a weak signal -- a
price is one third of the merchant test -- but nothing text-only should ever
decide on its own. Both false positives on this project's own GitHub page came
from breaking that rule, once in the buy scan and once in the saved-card scan.

A buy signal means a control you can click, never words on the page. This
README quotes "add to cart" and "Pay $52.10" as examples, and a page-text scan
duly flagged the GitHub page rendering it as a storefront -- a documentation site
has no Article markup, so the editorial veto could not save it. Matching button
labels instead separates a page that *sells* from a page that *describes selling*.

Step 3 exists because it was a real false positive: Wikipedia's "Credit card" article
carries both dollar figures and the words "buy now". Signals captured from live pages
(ihg.com, allbirds.com, en.wikipedia.org) are pinned as tests -- when you change the
rule, those are what tell you if you broke it.

Client-rendered storefronts often expose nothing at `document_idle`, so the content
script re-checks once after 2.5s and then stops.

**The panel opens itself at checkout.** `isCheckoutPage()` takes any one of:

- a mounted card field or payment-processor frame;
- a commit button -- "Place your order", "Pay $52.10" -- via `isCommitLabel()`;
- a payment-method chooser (a control, not the words);
- two or more `autocomplete="billing *"` inputs, the HTML standard for a billing form;
- a checkout-shaped URL corroborated by checkout-shaped copy.

It needs this many routes because the obvious signal is often absent. Large
retailers keep the card on file, so there is no card field to find, and some
stacks collect billing on one step and card details on the next. Detection is
existence-only: it never reads a field's value, and the extension makes no
network requests of any kind.

Two things this got wrong before they were fixed, both found on live pages:

- Matching `iframe[src*="js.stripe.com"]` fires on any page that merely loads
  stripe.js. On docs.stripe.com that was eight controller and metrics frames with
  no card field anywhere. Match the mounted element by frame *name* instead.
- A `/payment` path alone is a marketing page as often as a checkout, hence the
  requirement that the copy corroborate the URL.
- On a live Shopify checkout the only thing that matched was the English
  `title="Card number"`. Card frames are now matched by *name*
  (`card-fields-number-*`) and by the PCI host, so it survives a non-English
  checkout; the title selector is kept only as a fallback.
- That same page's path is `/checkouts/cn/...`, which the singular-only URL
  pattern missed. The card fields carried it, but the pattern now allows plurals.
- `^pay` matched the "Pay" in **PayPal**, and then in **Pay in 4**. Bare "pay"
  now only counts carrying an amount or as the whole label. Every false case in
  the `isCommitLabel` table is a button seen on a real page.
- payments.wikimedia.org has no card field on its billing step and its commit
  button says "Donate". An earlier version passed it only by coincidence; the
  billing-autocomplete signal is what actually earns it.

Verified against live pages on 2026-08-29: allbirds.com Shopify checkout (fires),
payments.wikimedia.org custom stack (fires), amazon.com cart (correctly does not),
wikimedia donate landing (correctly does not), en.wikipedia.org (correctly does
not). **Amazon's own checkout requires a login and was not reached** -- it is
covered in principle by the commit-label and billing-form routes, but that is
reasoning, not evidence.

Checkout is nearly always a client-side route change with no page load, so the
content script polls `location.href` once a second and re-evaluates on change. The
panel auto-opens at most once per route: close it and it stays closed until you
navigate.

Three rules govern the dock's lifetime, all covered by `test-lifecycle.mjs`:

- **A single miss never unmounts.** A new route may not have painted yet, so the
  dock only disappears once a re-check 2.5s later still says the page is not a
  merchant. Without this the dock flickers away on any slow-rendering route.
- **Navigating off a merchant route removes the dock**, rather than leaving a stale
  recommendation sitting on an About page.
- **Write one key, then render from storage.** The options page used to hold
  copies of `instances`, `valuations` and `prefs`, write all three together, and
  re-render from memory. That has two failure modes: a blanket write clobbers what
  another surface wrote in between, and rendering from memory makes a *failed*
  write look successful -- a cleared tie choice vanished from the screen, was
  never saved, and came back on the next site. `commit(key)` now writes only the
  key that changed, re-reads, and renders what storage actually returned.
- **A saved tie choice is clearable from the overlay itself** ("change" on the
  why-line). Making a one-click decision take a trip to another page to undo is
  what left the user stuck in an invisible state in the first place.
- **The options page detects the same orphaning.** A reload orphans an open
  options tab too, and it used to keep updating the screen while every
  `chrome.storage.set` threw in the background -- so a cleared tie choice looked
  cleared, never saved, and reappeared on the next site visited. It now refuses to
  act and says the page is stale.
- **An orphaned script shuts itself down.** Reloading the extension leaves every
  already-injected content script running with a dead `chrome.runtime`, where any
  `sendMessage` throws "Extension context invalidated". Because this script polls,
  an orphan would throw once per route change forever -- on YouTube, every click.
  Every message goes through `send()`, which checks `chrome.runtime.id` first,
  catches the throw, then clears the interval and removes the dead dock.
- **Polling stops after 5 consecutive misses on a site that has never shown the
  dock.** Mail, docs and dashboards change their URL constantly and would otherwise
  be re-evaluated forever. Once a site has shown the dock even once, polling never
  stops -- a store's non-product routes must not disable checkout detection.

**Position is not preference.** A card's place in your list is a sort key, not a
tiebreak. Only cards you deliberately reordered (`pinned`) or a saved category
default will silently resolve a tie. Everything else asks you once, at the moment
it matters.

A pin marks the whole LIST ORDER as deliberate, so the earliest tied card wins --
not necessarily the pinned one. Pinning a card that sits below an unpinned one
hands the win to the unpinned card. That is asserted in the tests so it cannot
regress into a surprise.

`isPinned()` is exported and used by BOTH the ranker and the options page. Those
two drifted once, with real consequences: the ranker honoured `priority`, the UI
only rendered `pinned`, so a card silently settled every tie while Options showed
nothing pinned and offered no way to undo it. Never re-derive that test locally.

**The UI must not claim what the data does not say.** The options page hard-coded
"all seed rates are unverified" long after every card was verified, telling the
user to go edit `cards.json`. The freshness chip is now derived from the owned
cards' `verified` and `last_verified` fields, so it cannot drift again.

**`caution` is for users, `note` is for maintainers.** Card records carry both.
Only `caution` is rendered -- one short line, the thing that changes a decision
(the Robinhood subscription, the CSR travel credit). Maintainer reasoning stays in
`note` and never reaches the UI.

**Chrome ignores @font-face inside a shadow root.** Measured, not assumed: the
identical rule applies at document scope and does nothing in a shadow tree. So
the overlay's faces are injected into the HOST PAGE's head, under a namespaced
family (`CardPicker-geist`) so they cannot override a face the site declares
under the same name, and removed again when the dock unmounts.

**`size-adjust` is not cosmetic.** Outfit's x-height measures 47.5 at 100px
against a 53.4 reference, so the same px value renders visibly smaller than the
layout assumes. The `adjust: 112.4` on the font entry corrects it; drop it and
every label in the extension shrinks.

**One font, four surfaces.** `FONTS` in `engine.js` is the single source of truth;
the options page and popup import it, and the overlay -- which cannot import -- is
handed the resolved stack and `@font-face` rules in the recommendation payload.
Outfit is bundled as woff2 (latin subset, 32KB) rather than loaded from Google,
because "no network calls" has to stay literally true. The overlay reaches it
through `web_accessible_resources`, which is a local `chrome-extension://` URL,
not a request.

**Every stored preference needs a visible off switch.** Saved tie choices, pinned
order, and (previously) the snooze list were all write-only at some point, each
one trapping the user in a state with no way out. If you add persisted state, add
the control that clears it in the same change.

**Portal rates are not ranked.** A 5x issuer-portal rate does not apply on the
airline's own site, so it surfaces as a note ("book through Chase Travel instead")
rather than as a winner.

## Known gaps in this build

- No spend tracking, so caps are shown as warnings, not balances.
- Citi Custom Cash is modelled optimistically: it shows 5% on any eligible category
  with a caveat, because without transaction data there is no way to know which
  category is actually your top one this cycle.
- Rotating categories (Freedom Flex) are verified for Q3 2026 and expire 2026-09-30.
- No icons, no onboarding polish, no store listing.
