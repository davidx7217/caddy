# Chrome Web Store listing

Copy for the developer dashboard. Every claim here is checkable against the code
in this repo, and several of them are the kind a reviewer will check, so do not
soften them into marketing that the source then contradicts.

Fill the dashboard from this file rather than writing fresh copy in the form:
the permission justifications in particular are read by a human reviewer, and
the reason each permission exists is already written down here and in the README.

**Two kinds of statement live in here, and they follow different rules.** The
marketing copy -- the short description and WHAT MAKES IT DIFFERENT -- makes
promises a user reads as permanent, so it only carries claims that hold for the
life of the product. "No account" and "no network calls" used to be there and are
not any more: a paid tier would need a licence of some kind, and the obvious thing
to sell is fresher rate data, which is a fetch. Neither is decided, and taking a
privacy claim back costs more trust than never making it.

The permission justifications and the data-use answers are the other kind. They
describe what THIS version does, a reviewer checks them against the source, and
they say plainly that the extension makes no network requests, because today it
makes none. Keep them accurate rather than future-proof: when a version changes
what it does, that version's disclosures change with it.

---

## Item details

**Name**

```
Caddy
```

**Short description** (132 characters max; this is 128)

```
Tells you which of your credit cards earns the most on the site you're on. No bank linking, no affiliate links, no card numbers.
```

**Category**

```
Shopping
```

**Language**

```
English (United States)
```

---

## Detailed description

```
Caddy tells you which credit card to use, on the page where you are about to pay.

You add the cards you carry. When you land on a store, a small dock appears in
the corner with the card that earns you the most there, and why. At checkout it
opens itself. That is the whole product.

WHAT MAKES IT DIFFERENT

No bank linking. Caddy never sees a transaction, a balance, or a card number. It
does not ask for one, and there is no field to type one into.

No affiliate links. Most "best card for this purchase" sites are paid by the
issuers they recommend. Caddy earns nothing from what it tells you, which is why
it will happily tell you your no-fee card beats your premium one.

Rates read off the issuer. Every card in the catalogue was checked against the
issuer's own published terms, and carries the link and the date it was read, so
you can check the number rather than trust it.

HOW IT DECIDES

Caddy reads the domain of the page you are on and, on that page only, whether
you have reached a checkout. It matches the site against a hand-verified table of
163 merchants mapped to 27 spending categories, then ranks the cards you told it
you own against their published issuer terms.

It knows about caps, activation requirements, rotating quarterly categories, and
the difference between booking a hotel direct and booking it through an online
travel agency. When two cards are within 10% of each other it shows both and asks
rather than guessing, and it remembers your answer if you want it to.

It also tells you when it does not know. A rate that has expired, a quarterly
category that has lapsed, a card record older than 90 days: each says so on the
card rather than quietly falling back to a base rate.

THE DATA

140 cards from 17 issuers, every one verified against the issuer's own published
terms, each carrying the source URL and the date it was read. Not scraped, not
crowd-sourced, not copied from a blog. When an issuer's page could not confirm a
rate, that rate is not in here -- there are cards deliberately left out of the
catalogue for exactly that reason, and the repository names them and says why.

PERMISSIONS

Caddy asks to read the pages you visit, because that is the only way to tell a
shop from a checkout from an article. Chrome will say so at install, plainly.

What it does with that access is the part worth reading. It looks at the domain,
the page's own structured markup, and whether commerce controls exist -- as
existence checks, never values. It does not read what you type. All of it happens
in your browser and none of it is transmitted anywhere, because the extension
makes no network requests of any kind.

Two switches, both in Settings. "Only when you ask" unregisters the content
scripts entirely, so nothing runs until you click the toolbar icon. The blocklist
turns Caddy off on any domain you name, checked before it reads anything at all,
so on a blocked site it collects nothing, sends nothing and starts no timers.

OPEN SOURCE

MIT licensed. The rates, the merchant table, the ranking engine and the reasoning
behind every judgement call are all in the repository, including the mistakes
that were found and fixed along the way.

https://github.com/davidx7217/caddy

NOT FINANCIAL ADVICE

Caddy reports published earning rates. It is not a financial adviser, it does not
know your balances or your spending, and rates change. Verify anything that
matters against your issuer before relying on it.
```

---

## Privacy practices

**Single purpose**

```
Caddy has one purpose: to show which of the user's own credit cards earns the
most rewards on the website they are currently viewing. Everything in the
extension serves that -- the card catalogue, the merchant-to-category table, the
ranking engine, and the overlay that displays the result.
```

**Permission justifications**

`storage`

```
Stores the user's own settings on their machine: which cards they have added, any
per-card choices those cards require (for example, the category a Bank of America
Customized Cash card is set to), their cents-per-point valuations, their blocked
domains, and their saved tie-break preferences. Nothing in storage is transmitted
anywhere -- the extension makes no network requests at all.
```

`activeTab`

```
When the user clicks the toolbar icon, the popup needs the hostname of the tab
they are on in order to name the merchant it is ranking for, and injects the
content script into that one page so the answer comes from real page signals
rather than a domain lookup. activeTab scopes both to that single visit.

It still matters with <all_urls> declared, because a user can switch Caddy to
"Only when you ask" in Settings, which unregisters the content scripts entirely.
In that mode activeTab is the only access the toolbar click has.
```

`scripting`

```
Used to inject the content script that draws the recommendation overlay. Two
cases: registered as a content script so the dock can appear on stores by
itself, which is the default; and injected into one tab for one visit when the
user clicks the toolbar icon, which is how it still works after they switch to
"Only when you ask". That setting unregisters the scripts, and chrome.scripting
is what both registers and unregisters them. The script only reads page structure
to
determine whether the page sells anything and whether it is a checkout. It reads
no text the user has entered: the one place it touches an input's `value` is on
submit and button inputs, where that attribute is the button's own label, and the
element's tag and type are both checked first so that a text field wearing
role="button" cannot be read that way.
```

`<all_urls>`

```
This is the extension's core function: Caddy shows which of the user's own cards
earns the most on the store they are looking at, which requires reading the page
they are on. It is declared rather than optional because the feature is useless
until it is granted -- a user who installs Caddy, visits a shop and sees nothing
cannot tell whether the extension is broken or the page does not qualify.

It is coarse rather than a list of merchant domains on purpose. The merchant
table grows with data releases, and a declared host-permission list that changes
causes Chrome to disable the extension until the user re-approves it, which
would take the extension offline on every data update.

What is read: the page's domain, its Schema.org and Open Graph markup, and
whether commerce controls exist (a cart link, a buy button, a card field) as
existence checks only. It never reads the value of a form field the user has
typed into. Nothing read from a page is transmitted anywhere -- the extension
makes no network requests at all. Settings has a switch that unregisters the
content scripts entirely, and a per-domain blocklist checked before any page is
read.
```

**Data usage disclosures**

Caddy transmits nothing off the device, so none of the collection categories
apply. In the dashboard's data-use section:

| Question | Answer |
| --- | --- |
| Personally identifiable information | Not collected |
| Health information | Not collected |
| Financial and payment information | Not collected |
| Authentication information | Not collected |
| Personal communications | Not collected |
| Location | Not collected |
| Web history | Not collected |
| User activity | Not collected |
| Website content | Not collected |

Two of those deserve a note when you tick them, because a reviewer may push back:

- **Financial information.** Caddy stores which card PRODUCTS the user owns (for
  example, "Chase Freedom Unlimited"). It never sees or asks for a card number,
  a balance, a transaction, or a credit score, and what it does store never
  leaves the device. "Collect" in this form means handling data remotely; Caddy
  has no remote.
- **Web history.** The optional activity log is off unless the user turns it on,
  keeps at most the last thirty recommendations, stores only domain, category and
  card name, lives in `chrome.storage.local`, and is clearable from Settings in
  one click. It is never transmitted.

**Certifications** -- all three can be made truthfully:

- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL**

```
https://github.com/davidx7217/caddy/blob/main/store/privacy-policy.md
```

The file in this repository IS the published policy. That URL is stable, public
and versioned, which is all the store asks for, and it needs no Pages build to
fall out of date. Editing `store/privacy-policy.md` and pushing publishes the
change; the history shows what it said before, which is what the policy's own
"Changes" section promises.

---

## Assets still needed

The copy above is complete. These are not, and the listing cannot be submitted
without the first one.

| Asset | Spec | Status |
| --- | --- | --- |
| Screenshots | 1280x800, 1-5, at least 1 required | **All 3 current** -- regenerated 2026-09-13 |
| Small promo tile | 440x280 | Optional, not made |
| Marquee promo tile | 1400x560 | Optional, not made |
| Store icon | 128x128 | `icons/icon128.png` ships already |

**On screenshots.** Three are worth having, in this order. All three need the
extension loaded in a real Chrome and a browser window sized so the page viewport
is exactly **1280x800** -- the store rejects other sizes, and it does not scale.
All three are current as of 2026-09-13.

1. **The dock and panel on a real store at checkout.** DONE and committed:
   hotels.com, panel open, Citi Double Cash winning at 2.80% with the Sapphire
   Reserve portal note under it, no browser chrome and nothing personal in frame.
   This is the product, and
   it is the one that cannot be produced any other way: the overlay only exists
   inside a page the content script has run on. Turn on automatic mode, put a real
   item in a cart on a merchant in `data/merchants.json`, reach the payment step,
   and click the dock so the panel is open with a winner and a why-line showing.
   Do not mock this up. A screenshot of an overlay that does not behave like that
   in practice is the one kind of dishonesty this project has avoided everywhere
   else.
2. **Setup, step two.** `node tools/make-screenshots.mjs` makes this one. It
   opens the picker with an empty wallet and adds the same three cards the
   Settings shot owns, paging forward to reach the two that are not on the first
   page and returning to page one for the capture. At 1280x800 that frames as:
   the four-step rail, a centred title and blurb, the search box, six catalogue
   rows with Chase Freedom Unlimited showing as ADDED at the top, and the sticky
   footer reading "3 CARDS SELECTED". The pager sits just below the fold and the
   sixth row is clipped by the footer, which is expected -- the store captures a
   viewport, not a full page. Verified 2026-09-13.
3. **Settings, the Cards pane.** `node tools/make-screenshots.mjs` makes this one
   too, with three cards owned. At 1280x800 it frames as: the sidebar with the
   AUTO / LIGHT / DARK theme rail along its foot, YOUR CARDS with three rows, and
   the top of the ADD A CARD well showing the filter bar and the first two
   catalogue rows. The seed pins no theme, so the rail shows AUTO selected, which
   is the state a new install is in; the light colour comes from the capture
   emulating prefers-color-scheme rather than from a pinned setting, so the shot
   is the same on any machine. Verified 2026-09-13.

Framings 2 and 3 were checked at exactly 1280x800; both fill the frame with no
awkward cut and no scrollbar. Neither page fits entirely in 800px, which is fine:
the store captures a viewport, not a full page.
