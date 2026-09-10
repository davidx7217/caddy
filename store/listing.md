# Chrome Web Store listing

Copy for the developer dashboard. Every claim here is checkable against the code
in this repo, and several of them are the kind a reviewer will check, so do not
soften them into marketing that the source then contradicts.

Fill the dashboard from this file rather than writing fresh copy in the form:
the permission justifications in particular are read by a human reviewer, and
the reason each permission exists is already written down here and in the README.

---

## Item details

**Name**

```
Caddy
```

**Short description** (132 characters max; this is 121)

```
Tells you which of your credit cards earns the most on the site you're on. No account, no bank linking, no network calls.
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

No account. There is nothing to sign up for and nothing to sign in to.

No bank linking. Caddy never sees a transaction, a balance, or a card number. It
does not ask for one, and there is no field to type one into.

No network calls. Every rate ships inside the extension. Caddy does not phone
home, because there is no home to phone: no server, no analytics, no telemetry.
Your card list and your settings live in your browser and are never uploaded.

No affiliate links. Most "best card for this purchase" sites are paid by the
issuers they recommend. Caddy earns nothing from what it tells you, which is why
it will happily tell you your no-fee card beats your premium one.

HOW IT DECIDES

Caddy reads the domain of the page you are on and, on that page only, whether
you have reached a checkout. It matches the site against a hand-verified table of
83 merchants mapped to 19 spending categories, then ranks the cards you told it
you own against their published issuer terms.

It knows about caps, activation requirements, rotating quarterly categories, and
the difference between booking a hotel direct and booking it through an online
travel agency. When two cards are within 10% of each other it shows both and asks
rather than guessing, and it remembers your answer if you want it to.

It also tells you when it does not know. A rate that has expired, a quarterly
category that has lapsed, a card record older than 90 days: each says so on the
card rather than quietly falling back to a base rate.

THE DATA

20 cards from 9 issuers, every one verified against the issuer's own published
terms, each carrying the source URL and the date it was read. Not scraped, not
crowd-sourced, not copied from a blog. When an issuer's page could not confirm a
rate, that rate is not in here -- there are cards deliberately left out of the
catalogue for exactly that reason, and the repository names them and says why.

PERMISSIONS, AND WHY INSTALLING ASKS FOR NOTHING

Installing Caddy prompts you for no permissions at all. Out of the box it runs
only when you click its toolbar icon, on that one page, for that one visit.

If you want the dock to appear by itself on stores, setup offers to turn that on,
and Chrome asks you then. You can turn it off again in Settings, and you can add
any domain to a blocklist where Caddy will not read the page at all -- checked
before it looks at anything, so on a blocked site it collects nothing, sends
nothing and starts no timers.

OPEN SOURCE

MIT licensed. The rates, the merchant table, the ranking engine and the reasoning
behind every judgement call are all in the repository, including the mistakes
that were found and fixed along the way.

https://github.com/davidx7217/card-picker

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
When the user clicks the toolbar icon, Caddy needs the hostname of the tab they
are on in order to identify the merchant, and needs to inject its overlay into
that one page to display the recommendation. activeTab grants both for that
single visit only, which is what allows the extension to be useful with no host
permission granted at install.
```

`scripting`

```
Used to inject the content script that draws the recommendation overlay. Two
cases: on a toolbar click, injected into the active tab for that visit only; and,
if the user has turned on automatic mode, registered as a content script so the
dock can appear on stores by itself. The script only reads page structure to
determine whether the page sells anything and whether it is a checkout. It reads
no text the user has entered: the one place it touches an input's `value` is on
submit and button inputs, where that attribute is the button's own label, and the
element's tag and type are both checked first so that a text field wearing
role="button" cannot be read that way.
```

`<all_urls>` (optional host permission)

```
Optional and off by default. Requested only if the user explicitly chooses
"On every shop" during setup or in Settings, which is what lets the dock appear
without clicking the toolbar icon. It is coarse rather than a list of merchant
domains on purpose: the merchant table grows with data releases, and a declared
host-permission list that changes causes Chrome to disable the extension until
the user re-approves it. The user can revoke this at any time in Settings, and
the extension keeps working in click-to-run mode. No page content is transmitted
anywhere.
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

`store/privacy-policy.md` in this repository is the text. Publish it at a stable
URL before submitting -- GitHub Pages on this repo is enough, and the raw file
URL is acceptable to the store.

---

## Assets still needed

The copy above is complete. These are not, and the listing cannot be submitted
without the first one.

| Asset | Spec | Status |
| --- | --- | --- |
| Screenshots | 1280x800 or 640x400, 1-5, at least 1 required | **Not made** |
| Small promo tile | 440x280 | Optional, not made |
| Marquee promo tile | 1400x560 | Optional, not made |
| Store icon | 128x128 | `icons/icon128.png` ships already |

**On screenshots.** Three are worth having, in this order. All three need the
extension loaded in a real Chrome and a browser window sized so the page viewport
is exactly **1280x800** -- the store rejects other sizes, and it does not scale.

1. **The dock and panel on a real store at checkout.** This is the product, and
   it is the one that cannot be produced any other way: the overlay only exists
   inside a page the content script has run on. Turn on automatic mode, put a real
   item in a cart on a merchant in `data/merchants.json`, reach the payment step,
   and click the dock so the panel is open with a winner and a why-line showing.
   Do not mock this up. A screenshot of an overlay that does not behave like that
   in practice is the one kind of dishonesty this project has avoided everywhere
   else.
2. **Setup, step two.** Open `src/welcome.html`, click Continue once, and pick
   three cards including one that is already ADDED at the top of the list. At
   1280x800 this frames as: the four-step rail, the title and blurb, the search
   box, five catalogue rows, and the sticky footer reading "3 CARDS SELECTED".
   Verified 2026-09-10.
3. **Settings, the Cards pane.** Open Options with three cards owned. At 1280x800
   this frames as: the sidebar, YOUR CARDS with three rows, and the top of the
   ADD A CARD well showing the filter bar and the first two catalogue rows.
   Verified 2026-09-10.

Framings 2 and 3 were checked at exactly 1280x800; both fill the frame with no
awkward cut and no scrollbar. Neither page fits entirely in 800px, which is fine:
the store captures a viewport, not a full page.
