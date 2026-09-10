# Caddy

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

All 20 card records were verified against issuer sources -- 7 on **2026-08-29**, 7 on
**2026-09-09** and 6 on **2026-09-10**. Each carries `verified: true`, `last_verified`,
and a `source_url`.

Each also carries `business: true` if it is issued on business underwriting -- absent
means personal, so there is nothing to keep in sync on the other nineteen records. It
filters the catalogue and the ranker never reads it.

Each also carries `common`, a 1-20 popularity rank that orders the setup picker. It is
the one **editorial** field in the file and is labelled as such in `_common_note`: there
is no public card-level ranking of US cardholders, so it is judgement, not a sourced
fact. Nothing computes from it; re-rank it freely.

**Standing obligations:**

- **Chase Freedom Flex rotating categories expire 2026-09-30.** Re-verify on 2026-10-01.
  The extension does not silently mis-rank when they lapse -- it says so, in the dock
  and in the popup -- but it cannot invent the new quarter's categories for you.
- Merchant categories in `merchants.json` are still hand-assigned and unverified.
- Robinhood's rumoured 5% travel-portal rate is deliberately **not** modelled: several
  third-party sites report it, robinhood.com does not confirm it. Capital One
  Quicksilver's Capital One Travel rates are left out on exactly the same grounds.
- **Amex Platinum is absent, not forgotten.** Its 5X flights and 5X prepaid hotels are
  published, but no reachable americanexpress.com page stated the annual fee or the base
  rate on 2026-09-10, and a card modelled without those two numbers ranks wrong against
  everything else. Add it when the issuer states them.

Re-verify any card whose `last_verified` is over 90 days old. The popup shows an
"unverified data" banner while any owned card has `verified: false`.

This is the actual product. The extension is a few hundred lines; the data is the asset.

---

## Install

1. Chrome -> `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. **Load unpacked** -> select this folder
4. Setup opens on install and asks four things: what Caddy is, which cards you
   carry, the questions those picks raise, and whether it may run by itself. The
   extension ships with no wallet by design, so step two is the one it cannot do
   for you. It takes about a minute and lands you in Settings when it is done.
5. Automatic mode is the last step of setup and is **off** unless you pick it
   there. The install prompt asks for nothing, so until you turn it on the dock
   appears only when you click the toolbar icon. Settings -> **Where it runs**
   changes it later.

Pin it to the toolbar.

## Use

- Visit any of the 82 seeded merchants (e.g. `wholefoodsmarket.com`, `target.com`,
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
280 assertions over the recommendation logic. Run this after any data or engine change.

```bash
node tools/check-redirects.mjs
```
Requests every domain in `merchants.json` and reports any whose final host no
longer matches its row -- the failure that killed two rows before anyone looked.
Exits 1 on a surprise move, so it can gate a release. Rows that redirect on
purpose declare `"redirects_to"` and are reported separately, so a deliberate
stale-link row does not leave the script permanently red.

It speaks HTTP, so it sees SERVER-side redirects only. Anything it lists as
BLOCKED is unconfirmed, not clean, and a client-side redirect is invisible to it
either way -- `exxon.com` was reported as "403, host unchanged", which was simply
wrong. Open the blocked rows in a browser and compare `location.hostname`.

```bash
node tools/test-lifecycle.mjs
```
40 assertions over the content script's mount/unmount/polling behaviour, its
blocklist, and host matching. It runs the
real `src/content.js` in a vm sandbox with stubbed DOM and chrome globals and a fake
clock, so the timing rules below are actually verified rather than reasoned about.

---

## Layout

```
data/
  categories.json   19 normalized categories, the pivot everything maps into
  cards.json        14 card products, all verified with a source_url
  merchants.json    82 domains -> category, plus per-issuer overrides
  valuations.json   cents per point. Opinions, not facts. User-overridable
icons/            generated by tools/make-icons.mjs; commit both
store/
  listing.md        Chrome Web Store copy, permission justifications, data answers
  privacy-policy.md the policy the listing has to link to; publish it somewhere stable
src/
  engine.js         pure rank(). No DOM, no chrome.*, runs under node
  hostmatch.js      classic script; the ONLY copy of the blocklist rule
  background.js     service worker: loads data, runs the engine, caches per tab
  content.js        shadow-DOM overlay. Dumb renderer, no logic
  popup.js/.html    hands off to the overlay; renders only where it cannot
  options.js/.html  four-section settings page: cards, ranking, where it runs, data
  setup.js          what the setup flow DECIDES. No DOM, no chrome.*, testable
  welcome.js/.html  first-run setup: what it is, your cards, tuning, the permission
  welcome.css       the stepper only; the theme is options.css, which it loads first
  issuers.js        issuer marks, names and currency labels. One copy, two surfaces
  options.css       the paper theme; ui.css is the popup's, the overlay inlines its own
  fonts/            Outfit, bundled woff2, latin subset, never fetched remotely
tools/
  check-redirects.mjs  merchant redirect sweep, HTTP pass. Server-side moves only
  check-redirects-browser.mjs  the browser pass, over CDP. Catches client-side moves
  redirect-sweep.mjs   what both passes must agree on: rows, verdicts, the report
  make-icons.mjs    draws the icon set; zero-dependency PNG encoder
  fake-chrome.mjs   promise-style chrome.* for the worker; NOT the lifecycle stub
  test-engine.mjs   zero-dependency test runner for the engine
  test-setup.mjs    the setup flow's decisions, against the real cards.json
  test-lifecycle.mjs runs the real content script in a vm sandbox
  test-worker.mjs   runs the real service worker against fake-chrome.mjs
  fixtures/         test-only data; never shipped with the extension
```

## Design rules worth keeping

**The engine is pure.** `src/engine.js` never touches the DOM, `chrome.*`, or the
network. That is why it can be tested in node in 40ms. Every decision about which
card wins lives there and nowhere else.

**Rules are declarative data, never code.** No `eval`, no expression strings. If a
rule shape cannot express something, add a field and handle it in the engine.
Interpreting remote code would get the extension rejected from the Web Store.

**Nothing broad is asked for at install.** Declared permissions are `storage`,
`activeTab` and `scripting`; there are no web-accessible resources and no host
permissions. `<all_urls>` is `optional_host_permissions`, requested only when the
user turns on **Where it runs** in Options. Granted, `background.js`
registers the same two content-script files at runtime for the same matches;
revoked, it unregisters them. A registration does not survive a reload or update,
so `syncAutoMode()` re-asserts it on every worker start, not only when the grant
changes.

Left off, the toolbar click carries `activeTab`, which is enough to inject the
content script for that one visit. That is also what finally gave the popup a
hostname: with no host permission `tabs.query` returns no URL, so the popup used
to send an EMPTY hostname and every uncached site read as "no merchant detected".

**Do not narrow this to the merchant table instead.** Listing the 82 domains as
static `content_scripts` matches looks like the tighter, more honest option and is
a trap: host permissions declared in the manifest are re-prompted when they
change, and Chrome DISABLES the extension until the user re-approves. The table is
meant to grow -- it grew four times in one session -- so every data release would
knock the extension offline until someone noticed. It would also need a manifest
generator, which is the build step this project does not have. Keeping the grant
coarse, optional and off by default lets `merchants.json` grow without touching
permissions at all.

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

0. The user has excluded this domain -> the script stops before reading anything.
1. Nothing suggests the SITE sells things -> never show, whatever else is present.
2. A page you came to CONSUME, not shop -> show ONLY if real payment machinery
   is on it: a card field, a payment-method chooser or a billing form. Nothing
   written in a button or in the page text counts here. Two ways to qualify, both
   requiring that the page carry no commerce markup of its own: media markup
   (`VideoObject`, `Movie`, `PodcastEpisode`, ..., or `og:type` starting `video`),
   or `"content_site": true` on the domain's `merchants.json` entry.
3. The page is a checkout -> show, so the auto-open has a dock to open.
4. One strong structural signal -> show. Schema.org commerce types (`Product`,
   `Offer`, `OfferCatalog`, `Hotel`, ...), `og:type` starting `product`, or a
   storefront platform fingerprint (Shopify, WooCommerce, Magento, BigCommerce).
5. A domain in `merchants.json` still needs one weak signal. Being in the table
   settles WHAT a site is, not whether THIS page sells anything.
6. Editorial markup (`Article`, `NewsArticle`, `BlogPosting`, ...) vetoes the weak
   signals unless there is a real cart or checkout link.
7. Otherwise two of three weak signals: a buy CONTROL, a cart link, a price.

Steps 2 and 5 both exist because of YouTube. Being in the table used to
short-circuit detection entirely, so the dock sat on every video; requiring one
weak signal was not enough, because ads, comments and shopping shelves supply one
intermittently -- a single stray `$` in the page text put the dock back on a video
the user was simply watching. A watch page's own markup is the only stable thing
about it, so that is what decides. Ordered ahead of the commerce checks but tested
against them: retail product pages routinely embed a `VideoObject`, so commerce
markup on the page beats the media markup.

`content_site` covers what markup cannot. Measured live 2026-09-04,
youtube.com's feed and youtube.com/premium are IDENTICAL in signals -- no
JSON-LD, no `og:type`, no controls, only a price that may or may not have
rendered -- so no weak signal can tell the page you shop on from the page you
browse. They differ only in path, which is site-specific knowledge, and
site-specific knowledge lives in `merchants.json`. The flag is per-domain data,
not a rule about streaming: netflix.com is not flagged and its signup page still
shows on plan pricing alone.

The cost is that YouTube's Premium marketing page no longer shows the dock. That
is the right trade: it is a page that quotes a price, not one that takes payment,
and the step that does take payment puts a card field or a payment-method chooser
on screen, which qualifies on its own.

**Payment machinery is not evidence of shopping.** Payroll, banking, insurance,
tax and HR portals all have payment-method choosers and billing-address forms.
The dock appeared on an employer's payroll site on exactly that basis. A page now
has to show some sign the SITE sells things -- a cart link, a storefront platform,
commerce markup, a buy control, or a known merchant domain -- before any payment
signal can qualify it. Money being involved is not the same as a purchase.

**A blocklist users can actually reach.** `Never run on these sites` in Options.
Checked in the content script BEFORE any DOM is read, so on a listed domain the
extension collects nothing, sends nothing and starts no timers. Suffix matched,
so one entry covers subdomains.

It applies to the tab you are already looking at. The list used to be read once,
at injection, with no `storage.onChanged` listener anywhere in the content script
and no check at all in the worker -- so blocking the site you were standing on did
nothing until you reloaded it. The dock stayed up, the poll kept ticking and `PAGE`
messages kept being sent on a domain the user had just switched off, which made the
one control they have look broken. Unblocking runs the same path in reverse and
brings the dock back without a reload.

The rule itself lives in `src/hostmatch.js`, a classic script the manifest loads
ahead of `content.js` in the same isolated world -- a content script cannot import
an ES module, and this has to run before any DOM is read. It is the ONLY copy.
`engine.js` used to export an identical one that the engine suite tested and the
browser never loaded, so the tested version was not the executing version. That is
the same class of drift as a rule the tests exercise and the browser never runs.
The assertions moved with the code, into `test-lifecycle.mjs`.

**The extension does not announce itself to the page.** Its own privacy claim cuts
both ways: a merchant that can tell you are running a card optimiser can price
against it. Three fixed handles used to make that trivial, and none needed any real
access to the page:

- `web_accessible_resources` exposed the bundled font at a fixed
  `chrome-extension://` URL that any site could `fetch` to prove the extension was
  installed. There is now no web-accessible resource at all: the worker reads its
  own font and hands the overlay a `data:` URI, which needs no declaration.
- `#__card-picker-host`, an id on the overlay's host element that nothing ever
  looked up. Removed.
- `#__card-picker-fonts`, the `@font-face` style in the page's head. Held by
  reference now instead of found by id, and its family name is a random `f<nonce>`
  rather than `CardPicker-outfit`, so scanning `document.styleSheets` for a known
  string finds nothing.

What remains is inherent: the overlay is a `div` on `documentElement` and a `style`
in `head`, and it has to be, to be visible. A site that enumerates either will find
something it does not recognise. It just will not find a name that identifies this
extension. `window.__cardPickerMounted` is not a handle -- content scripts run in an
isolated world and the page cannot see it.

**Every collector is bounded.** JSON-LD was the exception: unbounded recursion over
attacker-controlled input, throwing a `RangeError` the surrounding `catch` quietly
swallowed, and an unbounded type array that then had to cross `sendMessage`. Now
capped at 20 scripts, 200000 chars each, depth 20, and 60 DISTINCT types. Deduping
is what makes the cap safe: nothing downstream counts types, it only asks whether
one is present, so truncation can no longer hide a `Product` behind sixty
`ListItem`s.

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

**Position is not preference, and there is no way to make it one.** A card's place
in the wallet is a sort key and nothing else. Only a saved category default
resolves a tie silently; everything else asks, once, at the moment it matters.

Top-to-bottom ordering used to exist, with pinning layered on top: reordering two
cards marked the whole list as deliberate, and the earliest tied card then won --
not necessarily the one you moved. Pinning a card BELOW an unpinned one handed the
win to the unpinned card. It was a second way to settle a tie, triggerable by
accident, on a list nobody was told was meaningful. Removed, along with
`isPinned()`, `priority`, `pinned`, the reorder buttons and the unpin controls.

The tests now assert the opposite: reversing the wallet changes nothing, and being
first does not win a four-way tie. A tie the user has not deliberately settled is
always shown.

**The UI must not claim what the data does not say.** The options page hard-coded
"all seed rates are unverified" long after every card was verified, telling the
user to go edit `cards.json`. The freshness chip is now derived from the owned
cards' `verified` and `last_verified` fields, so it cannot drift again.

**Cash back and points are told apart by currency, not by marketing.** The catalogue
filter splits on `currency`: `cash` and `disco` are cash back, everything else is
points and miles. That puts Freedom Unlimited, Freedom Flex, Ink Business Cash and
Citi Double Cash under points, and all four are sold as cash back cards.

It is the right answer anyway, because `valuations.json` prices `ur` at 1.5 cents and
`citi` at 1.4, and those numbers are the reason those cards win the rankings they win.
A filter that called Freedom Unlimited a cash back card would contradict the ranking
on the very next screen. The label says "Points & miles", which is what the currency
is, rather than what the issuer's homepage calls the product.

**`caution` is for users, `note` is for maintainers.** Card records carry both.
Only `caution` is rendered -- one short line, the thing that changes a decision
(the Robinhood subscription, the CSR travel credit). Maintainer reasoning stays in
`note` and never reaches the UI.

**Chrome ignores @font-face inside a shadow root.** Measured, not assumed: the
identical rule applies at document scope and does nothing in a shadow tree. So
the overlay's faces are injected into the HOST PAGE's head, under a random
`f<nonce>` family so they can neither override a face the site declares nor give
the page a fixed string to detect the extension by, and removed again when the
dock unmounts.

**`size-adjust` is not cosmetic.** Outfit's x-height measures 47.5 at 100px
against a 53.4 reference, so the same px value renders visibly smaller than the
layout assumes. The `ADJUST` constant corrects it; drop it and every label in the
extension shrinks.

**One font, and no registry for it.** `engine.js` used to hold a `FONTS` map, a
`DEFAULT_FONT` key, and three functions that each took a `key` to look it up. The
picker that justified all of that was deleted long before, and every remaining
call site passed the same constant -- 27 lines of lookup serving exactly one
value. Now it is four constants and three functions with no key: 18 lines, two
fewer exports. Outfit is bundled as woff2 (latin subset, 32KB) rather than loaded
from Google, because "no network calls" has to stay literally true, and the
overlay receives it as a `data:` URI so there is no extension URL for a page to
probe.

**Every stored preference needs a visible off switch.** Saved tie choices and
(previously) the snooze list were both write-only at some point, each one trapping
the user in a state with no way out. If you add persisted state, add
the control that clears it in the same change.

**Rotation is not staleness.** Discover publishes its whole year's calendar in
advance, so both live quarters are in `cards.json` and on 1 October its Q3 gas
rule expires while a Q4 rule already sits in the same card. The categories
rotated; nothing went out of date. `hasLaterWindow()` is what tells those apart:
a lapsed rule only means stale data when it is the LAST word the card has. Chase
publishes one quarter at a time, so Freedom Flex's lapse is genuine staleness and
still warns. The fix had to separate the two cases, not silence both -- a warning
that cries wolf is one people stop reading.

**Stale data announces itself.** Measured on the real card set: when Freedom Flex's
Q3 window shut, `ruleApplies` stopped matching, the card dropped from 5x to its 1x
base rate, and every caveat vanished with it. The extension quietly stopped
recommending a card it should still have been recommending and gave no reason. It
failed closed, which is safe, but silently, which is not -- a wrong answer the user
cannot detect is worse than no answer.

`windowState()` now returns `open` / `future` / `expired` rather than a boolean, so
a lapsed rule can be told apart from one that never applied, and `stalenessFor()`
turns that into one sentence on the card. Three cases, most misleading first: a rule
for this category has expired; a rate ends within 14 days; the product record is
older than 90 days. One string, never a stack -- a badge that always has warnings on
it is a badge people stop reading. An expiry that cost nothing (another rule still
pays more) says nothing at all.

Surfaced as `staleReason` on the entry as well as inside `caveats`, for the same
reason `needsActivation` is: the overlay renders no caveat list, and the dock is
what people actually look at.

**A category with no card behind it ranks nothing.** `office_supply` and
`phone_internet` both resolved correctly and then did nothing, because no card in
the set bonused either -- the mirror image of a card rule with no merchant behind
it. Ink Business Cash was added to close both, and its 5% is exactly those two
categories. Run the audit in both directions whenever you add a card OR a
category: rules without merchants are dead, merchants without rules are inert.

**Every category is now behind a card.** `utilities` and `department_store` were the
last two dead ones, and U.S. Bank Cash+ closed both at once -- they are two of the
eight 5% choices it offers. Four of its other choices (electronics stores, gyms,
clothing, sporting goods) are deliberately NOT modelled, because giving them a
category would create the opposite failure: a category with no merchant rows behind
it. The audit runs clean in both directions as of 2026-09-10.

**Portal rates are not ranked.** A 5x issuer-portal rate does not apply on the
airline's own site, so it surfaces as a note ("book through Chase Travel instead")
rather than as a winner.

## Where the dock appears

The measured spec. Every row marked MEASURED was read off the live site on the
date given and is pinned as a test in `tools/test-engine.mjs`; break the rule and
those are what tell you. Rows marked ASSUMED are reasoning, not evidence, and are
called out so they are not mistaken for the former.

### Shows

| Page | Example | Why | Status |
| --- | --- | --- | --- |
| Product page, listed merchant | homedepot.com | rule 5, one weak signal | MEASURED 2026-08-30 |
| Product page, unlisted store | allbirds.com | rule 4, Shopify fingerprint | MEASURED 2026-08-29 |
| Hotel or airline booking | ihg.com | rule 4, `OfferCatalog` | MEASURED 2026-08-29 |
| Any checkout | payments.wikimedia.org | rule 3 | MEASURED 2026-08-29 |
| Payment step on a content site | netflix.com account payment | rule 2, card field | MEASURED 2026-09-09 |
| Rental inside a content site | YouTube film rental | rule 2, payment chooser | MEASURED 2026-09-04 |
| Telecom home and cart | t-mobile.com | rule 5, cart link + price | MEASURED 2026-09-09 |
| Utility bill page | coned.com bill | rule 5, amount due | ASSUMED, needs a signed-in read |

### Does not show

| Page | Example | Why | Status |
| --- | --- | --- | --- |
| Article about money | en.wikipedia.org "Credit card" | rule 1 | MEASURED 2026-08-29 |
| Docs quoting buy copy | this repo on github.com | rule 1, labels not text | MEASURED 2026-08-30 |
| Payment-processor docs | docs.stripe.com | rule 1, frame name not src | MEASURED 2026-08-29 |
| Video watch page | youtube.com/watch | rule 2, `VideoObject` | MEASURED 2026-09-04 |
| Content-site browse and marketing | youtube.com feed, netflix.com, hulu.com/welcome | rule 2, `content_site` | MEASURED 2026-09-04, 2026-09-09 |
| Cart, before checkout | amazon.com cart | rule 3 excludes "proceed to" | MEASURED 2026-08-29 |
| Payment wallets and crypto | paypal.com, venmo.com, coinbase.com | rule 1 | MEASURED 2026-09-09 |
| Utility and EV marketing sites | coned.com, evgo.com, electrifyamerica.com | rule 5, zero weak signals | MEASURED 2026-09-09 |
| Payroll, banking, brokerage, tax | employer payroll, irs.gov | rule 1 | ASSUMED |

### Three findings worth keeping

**Payment branding is not commerce context, and needs no new mechanism.** PayPal,
Venmo and Coinbase were expected to need a `never_show` flag. Measured, none of
them carries a cart link, a storefront platform, commerce markup or a buy control,
so rule 1 already vetoes all three. venmo.com renders a literal "Checkout" button
and still does not qualify: `BUY_LABEL` does not match a bare "Checkout", and a
button is not an `a[href*="/checkout"]`. The flag would have been dead code.

**Listing a merchant is cheap only when its marketing pages are quiet.** The
known-merchant branch still demands one weak signal, so a signal-free marketing
site stays dark even when listed. coned.com, evgo.com and electrifyamerica.com are
all in that class, which is what makes utilities and EV charging safe to add as
pure data. chargepoint.com is not: it renders a price, so its row does mount the
dock on a B2B marketing site. Accepted, recorded, and pinned as a test rather than
left to be rediscovered.

**A category can be bonused and still unreachable.** `ev_charging` had two card
rules and zero merchants, so every charging charge ranked as "everything else".
There is no inference path to fall back on: `EVChargingStation` is not a
schema.org type (404 on schema.org and pending.schema.org, checked 2026-09-09), so
the table is the only mechanism that can resolve it. Do not add an `LD_CATEGORY`
row for it. The audit that finds this class of bug compares, per category, the
number of card rules against the number of merchants and whether anything infers
it; run it whenever you add a card.

## Known gaps in this build

- No spend tracking, so caps are shown as warnings, not balances.
- Citi Custom Cash is **not** in the catalogue, and this file used to claim it was.
  citi.com states applications closed on **2026-05-28**; existing holders keep the
  card, but its terms can no longer be read off the issuer, and unverified rates
  are the one thing `cards.json` refuses. Citi Double Cash was added instead, which
  is the replacement Citi itself names. Add Custom Cash as `verified: false` if you
  hold one -- the popup already banners unverified data.
- Rotating categories (Freedom Flex) are verified for Q3 2026 and expire 2026-09-30.
- The store listing is **written but not submittable**. `store/listing.md` holds
  the name, both descriptions, the single-purpose statement, a justification per
  permission and the data-use answers; `store/privacy-policy.md` is the policy it
  has to link to. What is missing is assets: the store requires at least one
  1280x800 screenshot and there are none.

  Two of the three worth having can be captured from the extension's own pages
  and `store/listing.md` says exactly how, verified at that size. The third --
  the dock and panel open on a real checkout -- needs the extension loaded in
  Chrome on a real merchant, and must not be mocked up.

  Writing it turned up one overclaim worth remembering: the first draft said the
  content script never reads an input's value. It does, on `type="submit"`,
  `"button"` and `"reset"`, where `value` is the button's LABEL. Both files say
  so precisely now. A privacy policy the source contradicts is worse than none.
- `src/welcome.js` is half covered, and the half that is not is the markup.
  Every decision the flow makes moved to `src/setup.js` on **2026-09-10** --
  which steps a given set of picks earns, which currencies raise a
  cents-per-point field, and the shape of the wallet that gets written -- under
  the same contract as `engine.js`: no DOM, no `chrome.*`, no network.
  `tools/test-setup.mjs` covers it against the real `cards.json`, so a card that
  gains or loses a `user_config` changes the result rather than a fixture.

  What is left in `welcome.js` is rendering, and that still cannot run in node:
  it assigns `innerHTML` and then queries the result, which needs an HTML parser
  this project has no dependency for. It stays browser-verified.

  Mutation-checked, and one mutation SURVIVED: deleting the `_`-prefix filter in
  `liveCurrencies` broke nothing, because the currency set already excludes any
  key no card earns. The guard was dead and the test written for it could never
  fail. Both are gone.
- ~~`utilities` is inert~~ **Closed 2026-09-10** by U.S. Bank Cash+, whose "home
  utilities" 5% choice is electricity, gas and water. Ink Business Cash never closed
  it and still does not: its 5% is "internet, cable and phone services", which is
  `phone_internet`. Do not fold them together.
- ~~`department_store` has no card behind it~~ **Closed 2026-09-10** by U.S. Bank
  Cash+, and without the store card this note predicted: "department stores" is one
  of its eight 5% choices. `streaming` and `utilities` were the two before it.
- Every valuation now has a card using it. Savor is deliberately NOT `c1`: it is a
  cash back card, and the 1.4 cpp `c1` figure belongs to the Venture miles family,
  which is why Venture Rewards carries it instead.
- ~~Nothing tests `syncAutoMode()` or the on-demand injection~~ **Closed
  2026-09-10** by `tools/test-worker.mjs`, which runs the real `background.js`
  against a fake `chrome.*` and the real data files: registration against the
  grant, the INJECT-then-OPEN handshake and both of its failure shapes, the
  per-tab cache and its eviction, tie-break defaults, and the activity log's
  off-by-default, collapse and thirty-row cap.

  It is a SECOND fake, not a shared one. `test-lifecycle.mjs` stubs the
  content-script world -- callback-style, six methods, inside a `vm` sandbox --
  and the worker lives in the promise half of the API. One module pretending to
  be both would model each of them worse.

  Checked by mutation, not by going green: dropping the OPEN message, opening
  setup on every `onInstalled` reason, registering scripts regardless of the
  grant, logging activity with the pref off, and removing the cap each fail
  exactly the test that names them.
- A hand table cannot cover US utilities; there are thousands of them and they are
  regional. coned.com is the worked example proving the mechanism, not the start of
  a list. Anything beyond a handful needs a different approach.
- spotify.com is measured and deliberately NOT flagged `content_site`. It is not
  the Netflix shape: Netflix serves the browse grid and the pricing copy from one
  markup-free page, while Spotify splits them, and `open.spotify.com` carries no
  price at all. The player is dark only because of that, though -- an upsell price
  rendered in the web player would mount the dock on a page you are listening to.
- A merchant row can die by redirect, and two of them had. `max.com` now goes to
  `hbomax.com` and `exxon.com` to `exxonmobilfuels.com`; in both cases the row
  matched almost nothing and the brand resolved to no merchant at all. Both are
  fixed, with the old rows kept for stale links.

  All 79 rows were swept on 2026-09-09: curl cleared 52, found `max.com` moved, and
  left 25 unconfirmable behind bot protection. A browser pass over those 25 cleared
  21 and found `exxon.com`. That second pass is the one that mattered: curl reported
  `exxon.com` as "403, host unchanged" and was simply wrong, because the redirect is
  CLIENT-SIDE and an HTTP sweep cannot see those by construction.

  Both passes are scripted now. `node tools/check-redirects-browser.mjs` runs the
  HTTP sweep first and opens whatever it could not confirm in a real Chrome,
  driven over the DevTools Protocol with no dependency. Run that rather than the
  HTTP script alone after any long gap.

  **Do not use `--headless`.** Measured 2026-09-10, same machine, same minute:
  headed Chrome saw `exxon.com` move to `exxonmobilfuels.com`; headless reported
  the row CLEAN. Not blocked -- clean. A sweep that silently says "fine" is worse
  than the HTTP pass it exists to cover for, because that one at least says
  UNCONFIRMED when it cannot see.
- audible.com is `content_site` and audible.com/pd/ pages still show. Measured
  2026-09-10: the homepage is the netflix.com shape (Organization and FAQPage
  markup, `og:type` `book`, a price, no cart link, no buy control) and one domain
  serves the store, the marketing page and the player. Product pages carry
  `Product` and `Offer`, and commerce markup beats the flag inside
  `isMerchantPage`, so flagging darkens the homepage and the library while the
  pages you actually buy on still show. That is the opposite call from
  spotify.com for the opposite reason: Spotify's purchase surface has no markup
  to save it, Audible's does.
- Netflix's payment page qualifies on a card field alone -- measured 2026-09-09,
  with the payment chooser and billing form both absent. There is no second signal
  in reserve, so if it moves card entry into a frame whose name and title miss the
  selectors in `collectSignals`, that page goes dark.
