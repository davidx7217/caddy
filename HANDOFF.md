# Handoff

Where Caddy stands as of **29 September 2026**, and what is left.

Written to be picked up cold. The README is the reference for how the extension
works and why; this file is only the state of play.

---

## State

- **v1.0.0**, 140 cards across 17 issuers, 163 merchant rows, 27 categories.
  The second twenty cards landed 2026-09-27; store cards plus the remaining
  airline and hotel tiers, nineteen cards from five issuers Caddy lacked,
  thirteen business cards, eight smaller store cards, seven missing tiers,
  sixteen more Barclays co-brands and fourteen co-branded business cards, on
  2026-09-28. See sections 6, 7 and 9 to 14.
- **Every card audited 2026-09-29** (section 16): all 140 read against their
  issuer's own pages -- fourteen of them only in the in-app browser -- and every
  card ranked on every merchant row. The fixes it found are merged. The one soft
  spot left: the three Bilt cards' category definitions (section 9).
- **28 merchant rows record how they actually code** (`mcc`, `mcc_source`); the
  other 135 are still unverified seed data (section 16).
- **Freedom Flex carries Q4 2026 and Q1 2027**, dining 7X in Q4 (section 2). Rates
  switch at local midnight even in a tab left open.
- **Tests green**: 581 engine + 31 setup + 54 lifecycle + 47 worker. `npm test`.
- **Two scheduled agents keep the data current** (section 15), and run without
  permission prompts. Rate changes they find wait on `rates-*` and `upkeep-*`
  branches for David's approval; only `last_verified` date bumps land on `main`
  by themselves.
- **Nothing unpushed.** `main` on GitHub is the whole tree. All three store
  screenshots are still current -- the new cards rank after the ones they show.
- **`caddy-1.0.0.zip` sits in the repo root**, rebuilt on every commit. See the
  packaging note below.
- **Rules David decided 2026-09-28.** A store rate is what the card adds over
  whatever the store's free program pays members with any card (section 11). Keep
  extension text minimal: one-line cautions, and rule caveats short or absent,
  because they print in the popup. The extension must never tell a user its
  rotating categories are out of date -- a quarter goes in the day the issuer
  posts it. And every rate and mapping rests on the issuer's own definitions,
  researched as thoroughly as possible.
- **Public since 2026-09-29, as davidx7217/caddy.** The local `origin` points at
  the new name. `SECURITY.md` sends vulnerability reports through GitHub's
  private vulnerability reporting, switched on 2026-09-29 (a repository setting,
  not a file). Nothing in the tree or its history is secret, but every commit
  carries David's Gmail address as author.

---

## Start here

In order. The first waits on a second source, the second on David; the third is
dated.

1. **The merchant-code changes, reviewed 2026-09-29 against a two-source bar**
   (section 16). David approved whatever two real sources back. Applied:
   Autograph's 3X at xfinity.com and spectrum.com. Held, each for want of a
   second source:
   - Autograph's 3X at cox.com, optimum.com and audible.com. About 10 minutes
     once a second source turns up.
   - The Gap Encore Mastercard's 3X without tjmaxx.tjx.com, marshalls.com and
     nike.com. About 10 minutes, same condition.
   - A `travel_agency` category: not approved as stated, because booking sites
     are not always the merchant. A call for David, then one to two hours.
2. **Submit to the Chrome Web Store** -- unblocked 2026-09-29. The repo is public
   as github.com/davidx7217/caddy (renamed from card-picker; old URLs redirect),
   and the listing's privacy-policy URL now names it and returns 200. Section 1
   has everything; about 30 minutes in the developer dashboard, David's to do.
3. **Check the agents' first scheduled runs**: the rates keeper on Thursday
   2026-10-01 at 8:15 and the monthly upkeep on 2026-10-02 at 10:30. Each should
   finish without stopping for approval (section 15); review any `rates-*` or
   `upkeep-*` branch it leaves. The fourteen browser-only cards will show as
   unreadable -- expected (section 16).
4. **Hand checks only a real install can do.** Reload Caddy in
   `chrome://extensions` first, so the installed copy has Q4. Load unpacked from
   the repo root, then:
   - Remove and re-add Caddy, close setup on Your cards, click the toolbar icon:
     setup should reopen on Your cards (`runtime.getContexts` and the popup
     closing on focus change were only verified against stubs).
   - Add the Target Circle Credit Card: the dock should recommend it on
     target.com and never show it on walmart.com.
   - Add the JCPenney Credit Card and Robinhood Gold: on jcpenney.com the 3%
     card should win, per the store-rate rule.
   - Browse a few of the 65 merchant rows added this week -- gym, carrier and
     shipping homepages, and the new nordstrom, nordstromrack, jcpenney and ulta
     rows -- and note any that mount the dock on a marketing page.
   - `node tools/check-redirects-browser.mjs` to confirm `bhphotovideo.com` and
     `microcenter.com`, which met a Cloudflare challenge.
5. **Continue the merchant-code evidence**, about fifteen rows a batch, method in
   section 16, then **keep widening coverage, with the recipe in section 8.** By a rough
   bank-by-bank judgment made before section 9's cards -- no public data exists
   per card -- Caddy covered about 55-60% of US rewards-card spending. The
   issuers it lacked, the general-purpose business cards, the smaller store
   cards, the missing tiers, Barclays' other co-brands and the co-branded
   business cards are in now (sections 9 to 14). The next gaps:
   - **Business cards from the issuers section 10 did not cover** -- BofA, U.S.
     Bank, Wells Fargo and Citi -- not yet looked for.
   - **Cruise and timeshare categories**, if you want them: without them
     Carnival's 3X and the RCI and Capital Vacations 5X go unranked, and adding
     either means a rule on every card whose travel covers it (section 13).
   - **The Kroger Rewards World Elite Mastercard** (First Bank & Trust, launched
     2026-09-24), which the monthly scout logged.

   Loose ends, each small, each explained in its section:
   - **U.S. Bank Altitude points** are assumed to be worth a cent; no U.S. Bank
     page states a figure (section 12).
   - **Bilt's offer terms** were never readable -- the link downloads a file --
     so Obsidian's "other travel" is unconfirmed (section 9).

   Settled 2026-09-29: Wyndham Earner's 3X stands, `gm` stays at a cent, and
   Business Gold and World of Hyatt Business have pickers for their top
   categories (sections 10, 13 and 14).

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
  `https://github.com/davidx7217/caddy/blob/main/store/privacy-policy.md`,
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

## 2. Rotating categories: the rates keeper adds each quarter

Freedom Flex's rotating 5% categories change every quarter. Chase now shows the
next quarter on the card page a full quarter ahead (Q1 2027 was up on 2026-09-28).
The rates keeper (section 15) adds each quarter to a `rates-*` branch **as soon as
the issuer posts it**; a rule dated in the future switches itself on, so approving
early is safe. David's rule, 2026-09-28: the extension must never tell a user that
rotating categories have not been updated. It always has the latest categories.

`stalenessFor()` still carries that line as a last-resort tripwire for a rotating
quarter (`requires_activation` plus a start date) that lapses with no later quarter
modelled. Reaching it means the keeper failed. Any other dated rule -- Aeroplan's
3x dining stepping down to 2x after 2026-12-31, the Lyft offers ending 2027-09-30 --
is an end the issuer announced and the data already holds, so it never triggers
the line (`isRotating()`, pinned in `test-engine.mjs`).

**Read the definitions, not the headline.** Every category mapping rests on the
issuer's own definition: chase.com/RewardsCategoryFAQs for Chase (Travel names
airlines, hotels, car rental agencies, cruise lines, travel agencies, discount
travel sites, trains, buses, taxis, limousines, ferries, tolls and parking), the
calendar footnotes for Discover, americanexpress.com/rewards-info for Amex. Reading
Discover's Q4 footnote is what showed its Utilities covers phone and internet
bought online.

**When a definition does not name a merchant, check how it codes.** Issuers build
categories from merchant category codes, so the MCC settles it. Two sources:
Visa's Merchant Data Standards Manual (usa.visa.com, April 2026) for what each MCC
covers -- 4121 Taxicabs and Limousines "includes ride-share Merchants", 7011 lodging
takes short-term rentals, a single-line marketplace must use that line's MCC --
and awardwallet.com/merchants for how a merchant is actually observed coding on
each issuer's statements. Found that way on 2026-09-28: Uber and Lyft code as
taxis/limousines (Chase travel), DoorDash, Uber Eats and Grubhub as 5812
restaurants (Discover's Q4 Restaurants), Airbnb as a travel agency at Chase, and
Instacart as a grocery store at Chase and Citi, which is why their `instacart.com`
overrides were removed.

**Rates switch at local midnight, open tabs included.** The engine reads the clock
on every ranking. The dock re-ranks when the local day turns while a page is open
(`rerank()` in `content.js`, pinned in `test-lifecycle.mjs`), and the popup does not
reuse a cached answer stamped (`rankedOn`) with an earlier day. So on 1 October the
Q4 rates show without a reload -- provided Q4 is in the installed build by then.

**Stacking.** `rank()` takes the single best rule and never adds two, so when a
rotating category lands on one Freedom Flex already pays 3x on, the rule carries
the total: 1% base + 4% quarterly + 2% standing = **7x**, falling back to **3x**
past the $1,500 cap, not 1x. Chase's Q4 2026 release states exactly that for
dining. The "Freedom Flex stacking guard" in `test-engine.mjs` fails on anything
else, and it was written by hand so the agent cannot talk itself past it.

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
  reported a moved row as CLEAN. A row reported as moved to `na.network-auth.com`
  has not moved: that is a guest Wi-Fi sign-in page catching the request (hulu.com
  and jcpenney.com, 2026-09-29).
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

## 8. Adding a card: the recipe this week's 120 followed

1. **Read the issuer's own page** in the in-app browser -- `get_page_text`, or a
   short `javascript_tool` regex over `document.body.innerText`. Never a blog or
   a comparison site. Some pages fill in numbers only while the browser pane is on
   screen -- Citi's fees stayed blank until it was -- so a blank number means
   bring the pane up and read again, not that the page lacks it. Record the annual fee, the base rate, every category with its
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
   the other rate in the `caution` -- Prime Visa's convention. A store rate is what
   the card adds: leave out whatever the store's free program pays members with any
   card, and say it in a one-line caution. Keep rule caveats short or absent; they
   print in the popup.
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

## 10. Business cards, 28 September 2026

Thirteen cards, ranks 83 to 95 of `common`, all `business: true`, each read off its
issuer's page that day: Amex Business Platinum, Business Gold, Blue Business Cash and
Graphite Business Cash Unlimited; Capital One Venture X Business, Spark Cash Plus,
Venture Business, Spark Cash, VentureOne Business and Spark Cash Select; Chase Ink
Business Premier and Sapphire Reserve for Business; and Barclays' JetBlue Business
Card. No new issuer, currency, category or merchant row, and no engine change.

- **Amex's business categories are defined on one page**,
  americanexpress.com/us/rewards-info/business.html. Construction material and
  hardware suppliers names Lowe's and excludes home furnishings, so Business
  Platinum's 2X skips homegoods.com and homesense.com; electronics retailers and
  shipping carriers are the other two 2X categories.
- **Business Platinum's 5X is portal-only.** Unlike the consumer Platinum, a flight
  bought from the airline earns 1X; the 5X is for flights and prepaid hotels booked
  through Amex Travel.
- **Business Gold's 4X has a picker (2026-09-29).** It goes to whichever two of six
  categories a business spent most on each cycle, which no page shows, so it was a
  caution at first and ranked 1X. David chose a Cash+-style picker instead: the
  cardholder names the two they usually hit. Amex works the two out from spending on
  this card and Caddy decides what goes on it, so following Caddy keeps them on top.
  The six map onto advertising, electronics, dining, gas, transit and phone, each 4X
  under the $150,000 yearly cap; with nothing picked it still ranks 1X. Data only.
- **Graphite Business Cash Unlimited is new** in Amex's lineup (2%, 5% through Amex
  Travel, $295) and went in alongside Blue Business Cash, whose old URL now 404s; the
  live page is americanexpress.com/en-us/business/credit-cards/blue-business-cash/.
- **Capital One's business portal is Capital One Business Travel**, which Capital One
  says may differ from Capital One Travel, so the notes name it separately. The Spark
  Miles cards are gone; Venture Business and VentureOne Business replace them.
- **Ink Business Premier earns `cash`, not `ur`.** The page calls its rewards Cash
  Back and says nothing of moving them to other Ultimate Rewards cards, and its
  rewards agreement downloads as a file. At the `ur` figure it would read 3%
  everywhere, which nothing on the page supports.
- **Two networks are unconfirmed** and say `visa or mastercard`: Capital One's
  business pages and the Sapphire Reserve for Business card art name none. The older
  Ink Business Cash and VentureOne records say `visa` for the same situation; that
  inconsistency was left alone.
- **Not added:** the Sam's Club Business Mastercard (no reachable page states its
  rates -- samsclub.com/credit/business 404s), and Capital One's Spark Classic, a
  fair-credit card, left out as the consumer fair-credit and secured cards are.

---

## 11. Smaller store cards, 28 September 2026

Eight cards, ranks 96 to 103: Gap Inc.'s Encore Credit Card and Encore Mastercard
(Barclays), the Nordstrom Credit Card and Nordstrom Visa (TD Bank), the Ulta Beauty
Rewards Credit Card and Mastercard (Comenity Capital Bank, a new issuer), and the
JCPenney Credit Card and Mastercard (Synchrony). One new currency, `ulta`. Four new
merchant rows -- nordstrom.com, nordstromrack.com, jcpenney.com and ulta.com -- all
confirmed by the HTTP sweep.

- **Gap's cards are Barclays' and the program is Encore now.** Gap, Old Navy, Banana
  Republic and Athleta each sell an Encore card with identical rewards, so one record
  per product stands for all four designs, named so a search for any brand finds it.
  500 points = $1, so Barclays' "5X, 3X, 1X" are 5%, 3% and 1%. All four brands sell
  from gap.com hosts (oldnavy.gap.com and so on), so the existing gap.com row covers
  them. Gap Factory and Banana Republic Factory earn the 5% too (2026-09-29): Gap's
  Encore FAQ puts both in the Family of Brands, Barclays' terms cover the brands'
  Outlet/Factory stores, and gapfactory.com's own Encore page offers the 25 points.
  One gapfactory.com row covers both. Cash+ is not extended there: U.S. Bank's
  clothing list names GAP, and nothing says Gap Factory counts as GAP.
- **Nordstrom has a status picker.** Cardmembers start at Influencer, 2 points per $1
  at Nordstrom; Ambassador and Icon earn 3. It is a selection rather than Macy's tier
  multiplier, because a multiplier would also scale the 5% off at Nordstrom Rack and
  the Visa's everyday rates. Rack pays no points; its 5% off is modelled like
  Target's.
- **ulta.com is filed under `other`.** Caddy has no cosmetics category, and making it a
  drugstore would hand drugstore bonuses to a beauty store. Ulta points redeem on a
  sliding scale; `ulta` sits at the 3-cent floor, and the caution gives the range.
- **Store rates are what the card adds (decided 2026-09-28).** Where a store's free
  program pays members whatever card they use, that share is left out: it cannot
  change which card to use. Kohl's 7.5% became 2.5%, JCPenney's 7.5% 2.5%, Macy's
  2/3/5% 1/2/4% (tier multipliers now 1, 2 and 4), Gap Inc.'s 5% 4%, Nordstrom's 2/3
  points 1/2, Ulta's 2 points 1. Unchanged, because members get nothing extra or the
  card rate already stacks on top: Amazon, Target, Lowe's, Best Buy, TJX, Costco,
  Sam's Club, OnePay and Apple. Target's member rate was not re-read -- target.com
  showed a press-and-hold bot check -- and its 5% off is card-only either way. Each
  changed card's caution is one line: "Members also earn 5% with any card."
- **Text is kept minimal, on your instruction.** The new cards' rule caveats are
  gone (they print in the popup); definitions live in each card's `note`, which the
  extension never shows.
- **Not added:** Ulta's Platinum and Diamond rates (2.25 and 2.5 points with the card,
  noted in the records) and the Nordstrom debit card.

---

## 12. The missing tiers, 28 September 2026

Seven cards, ranks 104 to 110: Citi AAdvantage Executive and Globe, Wells Fargo
Autograph Journey, BofA Premium Rewards and Premium Rewards Elite, and U.S. Bank
Altitude Go and Connect. One new currency, `usbank`. No new issuer, category or
merchant row.

- **Citi's pricing renders only while the page is on screen.** The fees are in
  a block the page fills after load, and Globe's stayed blank until the browser pane
  was showing. Both were read that way: Executive $695 (not the $595 older sources
  quote), Globe $350. AAdvantage Hotels and AAdvantage Cars, AA's own booking sites,
  are portal notes, as United's Renowned Hotels is.
- **Autograph Journey splits hotels by how they are booked**: 5X with the hotel, 3X
  through a travel agency or booking site, which a denylisted 5X rule and a plain 3X
  rule say between them.
- **BofA Premium Rewards points are cash**: its terms price every point at $0.01.
  Both cards take the same BofA Rewards tier picker as the other BofA cards.
- **U.S. Bank Altitude points are assumed to be worth a cent.** The pages say only
  that a deposit to a U.S. Bank account gets the maximum value, never what it is.
  `usbank` is 1.0 until a page states one, and each Altitude card's caution says so.
- **Not added:** Altitude Reserve -- its page redirects to U.S. Bank's card list and it
  is gone from the site map -- and the Altitude Go Secured card.

Left open, for you:

- Confirm the U.S. Bank point value if you can find it stated; Settings takes an
  override meanwhile.

---

## 13. Barclays' other co-brands, 28 September 2026

Sixteen cards, ranks 111 to 126, in two batches. The first ten, 111 to 120: Wyndham Rewards Earner, Earner Plus and Earner Premier;
AARP Travel Rewards and Essential Rewards; Upromise World Mastercard; Frontier
Airlines World Mastercard; Emirates Skywards Rewards and Premium; and the Lufthansa
Miles & More Mastercard. Each read off the Reward Rules in its Barclays terms that
day. No new issuer, category or engine change. Four new currencies and seven new
merchant rows -- flyfrontier.com, emirates.com, lufthansa.com, swiss.com,
austrian.com, brusselsairlines.com and lot.com -- two confirmed by the HTTP sweep,
the five it met with a 403 confirmed in the browser.

- **Wyndham Earner's 3X follows the Reward Rules, not the page.** The product page
  sums the 3X up as vacation clubs, dining and groceries; the Reward Rules, which are
  the agreement, add gas and EV charging. The data has all four, confirmed by David
  2026-09-29. The page's 2X is stale text in its compare panel, hidden until you
  compare cards; the Plus, Premier and Business panels match their pages.
- **Wyndham Plus and Premier define travel without hotels**: airfare, car rental,
  rideshare, gas, EV charging, tolls and trains at 4X. Another chain's hotel earns 1X.
  The Earner cards are Visas, unlike Barclays' other cards here.
- **Frontier's "up to 17x" is 12 member miles plus the card's 5.** The 12 arrive with
  any card, so the card goes in at 5X, per the store-rate rule.
- **Two currencies NerdWallet does not price** take the lowest September 2026 figure
  found: `frontier` at WalletHub's 0.98 (Upgraded Points says 1.1, TPG 1.3) and
  `milesandmore` at One Mile at a Time's 1.2 (Upgraded Points says 1.3). `wyndham`
  (0.7) and `emirates` (1.0) come from NerdWallet's table, as the others do.
- **Barclays' third-party rule, as on the JetBlue cards**: bonus rewards are withheld
  from purchases made through a third party, so the delivery apps are denylisted on
  every new dining rule, and the OTAs on AARP Travel's and the Emirates cards' hotel
  rules.
- **Miles & More pays 2X at nine partner airlines.** The five that fly to the US are
  allowlisted by their own sites; Air Dolomiti, Croatia, Eurowings and Luxair are not.
- **Upromise goes in at 1.529%**, its rate with a linked 529 plan, with the unlinked
  1.25% in the caution, as Prime Visa does with Prime.
- **Not ranked:** AARP Essential's 2% on medical purchases, which has no category;
  Wyndham's vacation-club earning; the statement credits on the Premier.
- **GM Business and Wyndham Earner Business** went in with the co-branded business
  cards, section 14.

The other six, 121 to 126, missing from this file's list until David asked for
them: GM Rewards, Carnival Rewards, Barnes & Noble, Breeze Easy Visa, RCI Elite
Rewards and Capital Vacations. Three new currencies -- `gm`, `carnival`, `breeze`
-- and seven merchant rows, all online retail: barnesandnoble.com (bn.com redirects
there), the accessories hosts of Chevrolet, Buick, GMC and Cadillac, gmparts.com and
gmcompanystore.com, each confirmed by the HTTP sweep.

- **Cruise lines and timeshares have no category, so three headline rates are
  unranked**: Carnival's 3X at Carnival, RCI's 5X at RCI, Capital Vacations' 5X on
  its own charges. Filing carnival.com or rci.com under an existing category would
  misrank every card whose travel includes cruise lines or timeshares -- Chase's,
  Autograph Journey, BofA Premium Rewards, USAA, Navy Federal -- so those sites are
  not in merchants.json. A `cruise` or `timeshare` category would rank them, at
  the cost of a rule on each of those cards.
- **GM points are valued at a full cent**, GM's own figure for a point redeemed
  through GM, as store money is valued as cash elsewhere. They spend only with GM,
  so the card reads 3% everywhere and ties or beats every flat card; `gm` is its own
  currency so Settings can mark it down, and the caution says where points go. Kept
  at a cent on 2026-09-29: GM's terms (L.iii) send point values to
  experience.gm.com/rewards/redeem, which states one, $0.01 a point for every
  redemption through GM, a GM Financial balance included. No GM or Barclays page
  offers cash or states a lower figure, so a markdown would rest on no source.
- **GM's 7X ranks only on GM's own web stores.** Vehicles and service are bought at
  dealers; OnStar, SiriusXM, GM Energy and GM Insurance are services with no clean
  category. The brand sites themselves, chevrolet.com and the rest, are not
  merchants -- only their accessories hosts are.
- **Breeze's airfare rate depends on the fare bundle** -- 5X Nicer and Nicest, 2X
  Nice, 1X No Flex -- which the domain cannot show, so it is the caution, per the
  recipe, and flybreeze.com is not a merchant row. BreezePoints are a cent each by
  Barclays' own figure, 30,000 for $300.
- **`carnival` is WalletHub's 0.92**, the lowest figure found; Carnival states none
  for its new program, and TPG's launch review put sample redemptions at 1 to 2
  cents.
- **Barnes & Noble's 5% is a statement credit and its points are B&N gift cards**,
  a cent each, so the card earns cash, as the other store currencies do.
- **RCI and Capital Vacations rewards are cash**, a cent each from $25; the 5% of
  each redemption paid back as a bonus is not modelled. Their travel includes OTAs,
  so their hotel rules carry no denylist.

---

## 14. Co-branded business cards, 28 September 2026

Fourteen cards, ranks 127 to 140, all `business: true`, each read off its issuer's
page that day: Amex's Delta SkyMiles Gold, Platinum and Reserve Business, Marriott
Bonvoy Business, Hilton Honors Business and Business Green; Chase's United and United
Club Business, Southwest Performance and Premier Business, IHG One Rewards Premier
Business and World of Hyatt Business; Barclays' Wyndham Rewards Earner Business and
GM Business. One new currency, `gmbusiness`. No new issuer, category, merchant row or
engine change.

- **The business Delta cards are not the personal ones.** Platinum Business has no
  restaurant bonus; its 1.5X on transit and U.S. shipping shares a $100,000 yearly
  cap with purchases of $5,000 or more, which is not ranked. Reserve Business earns
  1.5X on shipping, transit and office supply and 1X on hotels. Gold Business caps
  shipping and ads at $50,000 each.
- **Hilton Honors Business earns 5X on everything to $100,000 a year, then 3X.** The
  5X is the base rate, which carries no cap, so the $100,000 is in the caution, as
  Blue Business Plus's $50,000 is.
- **World of Hyatt Business's 2X has a picker (2026-09-29).** It goes to the top three
  of eight categories each calendar quarter, with no cap, which no page shows. It was
  a caution ranking 1X until David chose the picker Business Gold took (section 10):
  the cardholder names the three they usually hit. Internet, cable and phone covers
  both phone and internet_cable; gas leaves out EV charging. Nothing picked, 1X.
- **The airline cards' headline totals include member miles**, as on the personal
  cards: United's 8x is 6 MileagePlus miles plus the card's 2.
- **Southwest Performance Business's offer details still list categories that ended
  2025-12-31** -- 3X at Rapid Rewards partners, 2X on ads and on internet, cable and
  phone. They have lapsed and are not modelled.
- **GM Business Card Points are not GM Rewards points** and redeem only at GM dealers.
  GM's support page converted the old Marcus card's Earnings at 100 points per $1, so
  `gmbusiness` is 1.0, a currency of its own.
- **Networks**: the Chase cards are Visas by their card art or Visa Signature
  benefits, except IHG's, a Mastercard like the personal IHG cards; Wyndham is a Visa
  and GM a Mastercard.

---

## 15. Scheduled agents, 28 September 2026

Two Claude scheduled tasks on David's Mac. They run while the Claude app is open;
a missed run catches up at the next launch. Each works in its own git worktree
in `~/Documents/Projects/.agent-work/`, never in the checkout people work in, and
removes it when done. The prompts are the spec:
`~/.claude/scheduled-tasks/<task>/SKILL.md`.

- **They run without permission prompts because of an allowlist, not a mode.**
  Scheduled runs start in default (ask) mode whatever mode the app keeps for the
  folder -- measured 2026-09-28 with a test run. What keeps them unattended is
  `~/Documents/Projects/.claude/settings.local.json`: it allows Bash, Read,
  WebFetch, WebSearch and edits under `.agent-work/`, and denies force pushes
  (tested). A default-mode test run then finished with zero prompts. It applies to
  every session started in `~/Documents/Projects`, and the edit allowance is why
  the worktrees must stay in `.agent-work/`. The agents read pages with WebFetch,
  not the built-in browser, which can stop to ask for a site; a page WebFetch
  cannot read is reported as unreadable rather than waited on.

| Task | When | Does |
|---|---|---|
| `caddy-rates-keeper` | Mon and Thu, 8:15 | Every rotating quarter the issuers have posted (Freedom Flex, Discover) and any dated rule about to lapse; then re-reads the 8 least recently verified cards, so each is re-read about every 9 weeks, inside the 90-day staleness line |
| `caddy-monthly-upkeep` | 2nd of the month, 10:30 | Point-valuation drift against `_sources`; the HTTP redirect sweep; a news scout for card launches, refreshes and closures |

- **What lands by itself**: only `last_verified` bumps for cards whose issuer page
  matched the record in full, and only when this checkout is on a clean `main`
  with nothing unpushed. Otherwise the `verify-*` branch waits for the next run.
- **What waits for David**: every rate change, on `rates-YYYY-MM-DD`, and every
  valuation change, on `upkeep-YYYY-MM`. Committed there, never pushed. The commit
  body names each change, the issuer URL and the sentence it rests on.
- **To approve** (say "approve rates-2026-09-28" in a Caddy session): rebase the
  branch onto `main` if it moved, `npm test`, `git merge --ff-only`, push, delete
  the branch, then update this file if the change touches anything it describes.
- **They talk through the progress ledger.** The scout logs
  `card-picker: re-verify now - <card id>: ...` for a refresh it read about, and the
  rates keeper re-reads those cards first. Unreadable cards are logged as blocked.
- **Silent when nothing needs David**; one push notification when something does.

---

## 16. Full audit, 29 September 2026

All 140 cards' rates read against their issuer pages -- 117 that day plus the 14
below, 9 by the rates keeper the day before -- and every card ranked on all 162
merchant rows to see what the extension actually recommends. Fixed: Cash+'s fast
food, restaurants, movie, furniture, department store and clothing choices, checked
against U.S. Bank's own sample-merchant lists; Autograph's pay TV; the Freedom
cards' 2% on Lyft; the Gap cards' dead source link; and an engine bug where a
later-ending promo silenced the stale-quarter warning.

**Fourteen cards need the in-app browser, not a fetch**: the four USAA cards
(usaa.com renders everything in script), Sam's Club, and the store cards --
Amazon, Target, Lowe's, TJX, Gap x2, JCPenney x2, Macy's. All fourteen matched
their pages in the browser on 2026-09-29. The rates keeper reads with WebFetch
only, so it will report these as unreadable; re-read them by hand in a session.

**Where merchant-code evidence comes from** (the next gap: merchants.json still
calls itself UNVERIFIED SEED DATA and no agent checks how a merchant codes):
- The issuer's own lists beat everything. U.S. Bank publishes sample merchants per
  Cash+ choice at cashplus.usbank.com/cash-plus/samplemerchants; Chase names its
  streaming list in chase.com/RewardsCategoryFAQs; Wells Fargo defines Autograph's
  categories by merchant code type in the product page's footnote.
- awardwallet.com/merchants shows how real purchases coded, per issuer, from its
  users' statements -- Starbucks is "FAST FOOD RESTAURANTS" at Chase and Citi,
  T.J.Maxx "Discount stores" at Chase. It only works in a real browser, and some
  merchants (HomeGoods) have no codings yet. Look things up there; do not script it.
- Visa's Merchant Data Standards Manual and Mastercard's Quick Reference Booklet
  define what each code covers, not which merchant uses which.

**Recorded so far** (2026-09-29): 28 rows carry `mcc_source`, 20 of them an `mcc` --
the booking sites, the cable and phone companies, the off-price stores, Nike,
Wayfair, HomeGoods, StubHub, Audible, YouTube, Starbucks, and the rows the Cash+
recheck leaned on. The engine does not read either field; a test keeps every `mcc`
four digits with a source beside it. Next: the other 135 rows, a batch at a time.

**How to continue it** -- what worked on 2026-09-29:
- In the in-app browser, open awardwallet.com/merchants, find the "Merchant Name"
  box and type the merchant. The newest `POST /api/merchants/data` response in
  the network log lists every billing-name variant with an id and a category.
  Open `awardwallet.com/merchants/<nameToUrl>` for the main variant and read the
  line "has been seen to be coded as": a Chase label is the Visa code's own
  description ("Discount stores" is 5310). Leave the cookie banner unaccepted.
  Never call those endpoints outside the page -- a plain request is refused, and
  it would be scraping.
- Write the rows with a short script: `data/merchants.json` round-trips exactly
  through `json.dumps(d, indent=2, ensure_ascii=False)` plus a newline, so the
  diff stays to the new fields.
- What every card pays on every merchant row, with every picker option on -- the
  audit's main view, and the fastest way to spot a wrong mapping:

      node --input-type=module -e "
      import {readFileSync} from 'node:fs'; import {rank} from './src/engine.js';
      const L=n=>JSON.parse(readFileSync('data/'+n+'.json','utf8')), P=L('cards'), M=L('merchants'), V=L('valuations');
      const I=Object.keys(P).filter(k=>!k.startsWith('_')).map(id=>({productId:id,config:{selections:(P[id].user_config?.selections||[]).flatMap(g=>Object.keys(g.options))}}));
      for (const d of Object.keys(M).filter(k=>!k.startsWith('_'))) console.log(d+':', rank({hostname:d,merchants:M,products:P,instances:I,valuations:V,now:new Date()}).all.filter(e=>e.matchedCategory).sort((a,b)=>b.rate-a.rate).map(e=>e.productId+' '+e.rate+'x').join(', '));
      "

- Amex pages overflow WebFetch: read them raw (curl, strip the HTML) or in the
  browser. USAA and the store-card pages render in script: in-app browser, and
  wait about five seconds after each load before reading.
- Before breaking a test on purpose, copy the data file aside. `git checkout`
  restores the last commit, not uncommitted work -- that wiped this batch once.

**The changes the evidence suggested, reviewed 2026-09-29.** David's bar: apply
what two real sources back. AwardWallet counts as one source however many issuers
it shows, and the MCC directory sites (pxp.io, tagada.io and the like) count as
none: they name no source and contradict each other (T.J.Maxx is 5310 on one, 5651
on another).
- **Applied**: Autograph's 3X at xfinity.com and spectrum.com. Wells Fargo's footnote
  2 and wellsfargo.com/autographstreaming define streaming by Visa code, "cable and
  other pay television" included. Comcast and Charter code that way by AwardWallet's
  Chase codings and by U.S. Bank's Cash+ list, which names Comcast, Charter and Time
  Warner Cable as cable and satellite TV providers. No Autograph cardholder report
  for a cable bill was found either way; the one on myFICO (2022) is Xfinity Mobile
  earning 3X as a phone plan.
- **Held, one source each**: cox.com and optimum.com (AwardWallet's own "Cable" and
  "Select Streaming Services" labels; none of the 17 variants carrying them shows
  an issuer coding) and
  audible.com (AwardWallet's Chase and Citi codings as continuity/subscription).
- **Held, one source and a contrary one**: dropping T.J.Maxx and Marshalls from the
  Gap Encore Mastercard's 3X. Barclays' terms (tc47922) and Gap's Encore FAQ define
  it as Mastercard "clothing store" merchant codes, excluding wholesale clubs, Amazon,
  Target and Walmart. Chase codes both stores as discount stores; Amex files them as
  clothing stores; nothing shows the code on Mastercard.
- **Held, no source**: dropping nike.com. AwardWallet shows only its own "Internet"
  and "U.S. Online Retailers" labels for it, no issuer coding. Its row used to call
  that "online-order codes, not a clothing or shoe store code"; it now says the
  code is unknown.
- **Not approved as stated**: a `travel_agency` category. Booking sites code as
  travel agencies when they take the payment (Expedia at Chase; Airbnb at Chase, Amex
  and Capital One), but on a pay-at-property booking the property charges the card
  under its own code -- Booking.com's partner documentation says so, and
  AwardWallet's "Hotel at Booking.com" descriptors show Hotels. So no single category
  is right for booking.com, priceline.com, hotels.com or vrbo.com, and the change
  also needs each travel card's definition, which Citi (Strata Premier) does not
  publish and Bilt's unread terms may hold. That makes it a modelling call for David.

**Open questions, each a call for David or a statement to settle it:**
- Citi Strata Premier's "Air Travel and Other Hotel Purchases" has no published
  definition; booking sites and Airbnb get 3X today.
- Altitude Connect excludes booking sites from its 4X travel and the Emirates cards
  from their 2X; RCI and Capital Vacations do not. The same question answered two
  ways.
- Sapphire Preferred's 3X "vacation homes at top brands" is not modelled.
- Venture X's portal note says 10X on vrbo.com and airbnb.com; vacation rentals
  through Capital One Travel earn 5X.
- Merchant rows that are not really checkouts: kayak.com (search only), opentable.com
  (meals are paid at the table), riteaid.com (no longer a drugstore storefront),
  traderjoes.com, wholefoodsmarket.com.

---

## Working agreements

- **Never add a permission.** Once a reader installs Caddy they never approve it
  again (David, 2026-09-28). Chrome installs updates silently, but an update that
  adds a permission with a warning is disabled until the reader re-approves it.
  `storage`, `activeTab`, `scripting` and `<all_urls>` already cover everything
  Caddy does. The "permissions are frozen" test in `test-worker.mjs` fails on any
  change to them, including optional permissions; changing that test is David's
  call, never a fix.

- **Do not spawn Chrome to test.** Serve the files over a small local server and
  use the in-app browser. The exceptions are the tools that genuinely need a
  browser process -- `make-screenshots.mjs` writing PNGs to disk, and
  `check-redirects-browser.mjs` -- and those are for you to run.
- **Push after each change**, one commit per change, message explaining why and
  not just what.
- **To eyeball Settings without an install**: serve a scratch folder that
  symlinks `data/`, `icons/`, `manifest.json` and every file in `src/`, except a
  copy of `options.html` that loads a small `chrome.*` stub script before
  `options.js`. The stub answers `storage.local.get/set`, `runtime.getURL`,
  `getManifest` and `sendMessage` from a seeded wallet. Serve it with
  `python3 -m http.server` and open it in the in-app browser; the 2026-09-28
  chip-colour and dialog checks were done that way.
