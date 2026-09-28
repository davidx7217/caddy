# Handoff

Where Caddy stands as of **28 September 2026**, and what is left.

Written to be picked up cold. The README is the reference for how the extension
works and why; this file is only the state of play.

---

## State

- **v1.0.0**, 82 cards across 16 issuers, 144 merchant rows, 27 categories.
  The second twenty cards landed 2026-09-27; store cards plus the remaining
  airline and hotel tiers, then nineteen cards from five issuers Caddy lacked, on
  2026-09-28. See sections 6, 7 and 9.
- **Every card verified** against its issuer's own page, each carrying a
  `source_url` and the date it was read. The one soft spot: the three Bilt cards'
  category definitions were not readable (section 9).
- **Tests green**: 447 engine + 31 setup + 49 lifecycle + 45 worker. `npm test`.
- **Nothing unpushed.** `main` on GitHub is the whole tree. All three store
  screenshots are still current -- the new cards rank after the ones they show.
- **`caddy-1.0.0.zip` sits in the repo root**, rebuilt on every commit. See the
  packaging note below.
- **`caddy-1.0.0/` in the root is untracked and STALE**: an unzip of the build
  made 2026-09-27 21:24, before any of this week's work -- 20 cards, no setup
  resume, no store cards. If Chrome has that folder loaded, it is running old
  code. Load the repo root instead, or delete the folder and unzip a fresh one.

---

## Start here

In order. The first is dated; the second needs a real install, so it is David's.

1. **1 October 2026: re-verify Chase Freedom Flex** -- its Q3 5% categories expire
   2026-09-30. Section 2.
2. **Hand checks only a real install can do.** Load unpacked from the repo root,
   then:
   - Remove and re-add Caddy, close setup on Your cards, click the toolbar icon:
     setup should reopen on Your cards (`runtime.getContexts` and the popup
     closing on focus change were only verified against stubs).
   - Add the Target Circle Credit Card: the dock should recommend it on
     target.com and never show it on walmart.com.
   - Browse a few of the 61 merchant rows added this week -- gym, carrier and
     shipping homepages -- and note any that mount the dock on a marketing page.
   - `node tools/check-redirects-browser.mjs` to confirm `bhphotovideo.com` and
     `microcenter.com`, which met a Cloudflare challenge.
3. **Keep widening coverage, with the recipe in section 8.** By a rough
   bank-by-bank judgment made before section 9's cards -- no public data exists
   per card -- Caddy covered about 55-60% of US rewards-card spending. The
   issuers it lacked are in now (section 9). The next gaps, largest first:
   - **Business and corporate cards**: Amex Business Platinum and Business Gold,
     Blue Business Cash, Capital One Spark, Ink Business Premier, Sapphire Reserve
     for Business. Two more seen on 2026-09-28: the JetBlue Business Card and the
     Sam's Club Business Mastercard.
   - **Smaller store cards**: Nordstrom, Gap, Ulta, JCPenney -- same `only_at`
     shape as the seven already in. Gap's cards are Barclays' now: its card list
     carries Gap, Old Navy, Banana Republic and Athleta Encore Mastercards.
   - **Tiers still missing from covered programs**: Citi AAdvantage Executive and
     Globe, Autograph Journey, BofA Premium Rewards, U.S. Bank Altitude.
   - **Barclays' other co-brands**, listed on its card page but not read:
     Wyndham Rewards Earner (three personal tiers), AARP, Upromise, Frontier,
     Emirates, Miles & More.
4. **Submit to the Chrome Web Store** -- section 1, unchanged. The listing's
   counts were kept current through this week.

---

## 1. Submit to the Chrome Web Store

Everything is written, checked and current. Nothing about it is blocked.

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
- **Setup cannot be walked away from half done.** `setupPending` is set on
  install and only on install, and holds the step reached. While it exists the
  toolbar icon opens setup (or brings an open setup tab forward) and Settings
  redirects to it; `welcome.js` resumes at that step, and FINISH deletes the key.
  An install from before the key existed has none, so it reads as set up and
  needs no migration. Verified 2026-09-27 against stubbed `chrome.*` in the
  in-app browser; the two things only a real install can show -- that
  `runtime.getContexts` finds the open setup tab, and that the popup shuts when
  focus leaves it -- want one check by hand: Load unpacked, close setup on Your
  cards, click the icon.
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
- **The category audit is a test now**, in `test-engine.mjs`, both directions:
  rules without merchants are dead, merchants without rules are inert. Adding a
  card or a category that leaves either behind fails `npm test` and names it.
- **Citi Custom Cash is deliberately absent.** It pays 5% on whichever category
  you spent most in that cycle, which is not knowable from a domain, and Citi
  stopped taking applications, so its terms can no longer be read off the issuer.
  Amex Platinum, the other absentee, went in on 2026-09-27 once its page stated a
  fee and a base rate.

---

## 6. The second twenty cards, 27 September 2026

Added as ranks 21 to 40 of `common`, each read off its issuer's page that day:
Apple Card, Costco Anywhere Visa, Venture X, Amex Platinum, Delta SkyMiles Gold,
Southwest Rapid Rewards Plus, United Explorer, BofA Unlimited Cash Rewards, BofA
Travel Rewards, VentureOne, Wells Fargo Autograph, Marriott Bonvoy Boundless,
Hilton Honors Amex, Citi Strata Premier, Citi AAdvantage Platinum Select, Discover
it Chrome, Chase Freedom Rise, Ink Business Unlimited, Ink Business Preferred and
Amex Blue Business Plus.

What they changed about the categories, all pinned in `test-engine.mjs`:

- **Eight new categories**: `car_rental`, `electronics`, `clothing`,
  `sporting_goods`, `fitness`, `shipping`, `advertising`, and `phone_internet`
  split into `phone` and `internet_cable`. Each has merchant rows; 56 were added.
- **Existing cards reorganised to match their issuers' definitions**: Blue Cash
  Everyday's online retail and BofA Customized Cash's Online Shopping are
  channels, so both now pay across the store categories; Cash+ gained its four
  missing 5% picks; car rentals joined Sapphire Preferred's 2x travel and the
  Capital One, Citi and Amex Gold portal rates. The README has the reasoning.
- **Two engine changes**: a portal rule now pays only on its own category unless
  it is filed under `travel_portal`, and a relationship tier multiplies portal
  rates as well as everything else.
- **BofA Rewards replaced Preferred Rewards** on 2026-05-26. All three BofA cards
  use the new five-step tier picker; users who saved a tier keep the same number.

Left open, for you:

- `bhphotovideo.com` and `microcenter.com` answered a Cloudflare challenge in the
  browser sweep and are unconfirmed. `node tools/check-redirects-browser.mjs`
  may get through where the in-app browser could not.
- Nobody has watched the dock on the new merchants. Gym, carrier and shipping
  homepages may carry a price or a cart link and mount it on marketing pages.
- Wholesale clubs are left out of Blue Cash Everyday's online retail until card
  acceptance at each club is checked; see the card's `note`.

---

## 7. Store cards and the remaining airline and hotel tiers, 28 September 2026

Sixteen cards that complete programs Caddy already half-covered -- Delta Blue,
Platinum and Reserve; Hilton Surpass and Aspire; Marriott Bold, Bevy and Brilliant;
United Gateway, Quest and Club; Southwest Premier and Priority; World of Hyatt; IHG
Premier and Traveler -- and seven store cards: Amazon Store Card, Target Circle
Credit Card, Kohl's Card, Macy's Credit Card, MyLowe's Rewards, My Best Buy Credit
Card and TJX Rewards. Every one read off its issuer's or retailer's page that day.

- **`only_at` is new, and the engine reads it.** A store card only ranks on its own
  store's domains; everywhere else it is not a candidate. `rank()` reports
  `none_usable` when a wallet holds cards but none works on the page, and the popup
  says so instead of "no cards added".
- **Two issuers are new**, TD Bank (Target) and Synchrony (Amazon, Lowe's, TJX), with
  marks in `issuers.js`. Two currencies are new, `hyatt` and `ihg`, valued from the
  same NerdWallet table as the other airline and hotel currencies.
- **IHG cards are Mastercard**, unlike Chase's other co-brands -- the page terms say
  World and World Elite Mastercard, and the data says so.
- **Store cards pay in store money that expires.** Kohl's Cash and Macy's Star Money
  last 30 days; each card's caution says so, and both are valued as cash anyway.
- **Not added:** store cards with no rewards (Home Depot is the big one), and smaller
  programs -- Nordstrom, Gap, Ulta, JCPenney. The same `only_at` shape takes them.

---

## 8. Adding a card: the recipe this week's 62 followed

1. **Read the issuer's own page** in the in-app browser -- `get_page_text`, or a
   short `javascript_tool` regex over `document.body.innerText`. Never a blog or
   a comparison site. Record the annual fee, the base rate, every category with its
   cap, the network (page terms or card art) and the issuing bank. Chase and Amex
   put exact definitions in collapsed "Offer Details"; read `#offerpop`'s
   `textContent` on Chase pages. A number the page does not state goes in the
   `note` as unconfirmed, never in the data as fact. A terms link that downloads
   a file instead of opening (Bilt's does) is not to be retried; say in the
   `note` that the definitions went unread.
2. **Map each category onto the 27 in `categories.json`**, reading the issuer's
   definition rather than its headline. Online retail at Amex and Online Shopping
   at BofA are channels, repeated across every store category -- see the README.
   A rate that needs Apple Pay, PayPal checkout or a chosen top category cannot be
   seen from a web page; put it in the `caution`, not in `rules`. A rate that needs
   a membership (Prime, Walmart+, Sam's Club Plus) goes in at the member rate, with
   the other rate in the `caution` -- Prime Visa's convention.
3. **Every allowlisted domain and every category needs merchant rows.** Add them,
   then sweep the new rows: `tools/check-redirects.mjs` over HTTP, and the browser
   for whatever it reports as blocked. Never try to get past a bot challenge.
4. **New currency**: `valuations.json` plus a `_sources` line, and
   `CURRENCY`/`KIND` in `issuers.js`. **New issuer**: `CHIP`, `MONOGRAM` and
   `ISSUER` there too. The audit test fails on either if forgotten. Pick a mid-tone
   `CHIP` colour: the wash is 16% on paper and 34% on dark, and a near-black or a
   deep navy vanishes on the dark theme.
5. **`common` takes the next free rank**; bump the card count in the audit test and
   in `cards.json`'s `_comment`.
6. **Pin every verified rate in `test-engine.mjs`**, run `npm test`, and
   mutation-check any engine change: break it on purpose and watch its test fail.
7. **Update the counts** in the README's Data status and Layout, in
   `store/listing.md`, and in this file.
8. **Commit only when David says so.** Branch, commit the change, commit the
   handoff separately, fast-forward `main`, push, delete the branch.

---

## 9. The issuers Caddy lacked, 28 September 2026

Nineteen cards, ranks 64 to 82 of `common`, each read off its issuer's page that
day: Synchrony's PayPal Cashback Mastercard, Venmo Credit Card, Sam's Club
Mastercard and OnePay CashRewards Card; Barclays' JetBlue, JetBlue Plus and JetBlue
Premier; USAA Preferred Cash Rewards, Cashback Rewards Plus Amex, Eagle Adapt and
Eagle Navigator; Navy Federal cashRewards, cashRewards Plus, More Rewards Amex, GO
REWARDS and Flagship Premier; and the Bilt Blue, Obsidian and Palladium cards.

- **Four issuers are new** -- `barclays`, `usaa`, `navyfederal` and `column` -- and
  three currencies: `jetblue` at 1.4 (NerdWallet), `usaa` at 1.0 (USAA's own travel
  figure) and `bilt` at 1.25 (NerdWallet's baseline, not its 1.8 transfer
  estimate). No engine change, no new category, no new merchant row.
- **Bilt is filed under Column N.A.**, the bank that issues it, as Apple Card is
  under Goldman Sachs. **Its terms were not read**: the Offer Terms link on
  bilt.com downloads a file instead of opening, so only the headline rates on
  bilt.com/card are in. What Obsidian's "other travel" covers is unconfirmed, and
  transit is left out of it.
- **Rates that depend on how you pay are cautions, not rules**: PayPal Cashback's 3%
  with PayPal checkout, and Venmo's 3% for paying with Venmo and +1% for splitting
  a purchase -- the same call as Apple Pay.
- **Membership rates go in at the member rate**, Prime Visa's convention: OnePay's
  5% at Walmart needs Walmart+ (3% without), and the Sam's Club Mastercard's 3% at
  samsclub.com needs Plus (1% for Club members).
- **JetBlue's bonus needs a direct purchase.** Barclays withholds bonus points from
  purchases made through third parties, so the delivery apps are denylisted on
  dining and `instacart.com` gained a `barclays` override. TrueBlue Travel is a
  portal note, as United's Renowned Hotels is.
- **USAA Eagle Adapt is not a top-category card**, whatever its tagline says: all
  fourteen mapped categories earn 3% at once, under one $3,000 quarterly cap.
- **Navy Federal points are cash.** Its program description prices every point at
  $0.01 as cash, so all five cards earn `cash`. cashRewards and cashRewards Plus
  are one application -- the approved credit limit decides which card arrives --
  and either can be a Visa or a Mastercard, which `network` says.
- **Not added:** the AAdvantage Aviator Red (its Barclays page 404s and the card is
  gone from Barclays' list), Navy Federal's Flagship Rewards (closed to new
  applicants), the Sam's Club Credit Card and the OnePay Walmart Spend Card (no
  rewards), and USAA's and Navy Federal's low-rate, secured and credit-building
  cards, which were not read.
- **Chip colours needed a second pass.** USAA's deep navy and Column's near-black
  vanished on the dark theme; both were lightened and checked on both themes in
  the in-app browser, with Settings served over a local server and a stubbed
  `chrome.*`.

Left open, for you:

- Re-read the Bilt Card Offer Terms in a browser that opens them, then confirm or
  correct Obsidian's "other travel" and anything else they define.

---

## Working agreements

- **Do not spawn Chrome to test.** Serve the files over a small local server and
  use the in-app browser. The exceptions are the tools that genuinely need a
  browser process -- `make-screenshots.mjs` writing PNGs to disk, and
  `check-redirects-browser.mjs` -- and those are for you to run.
- **Push after each change**, one commit per change, message explaining why and
  not just what.
