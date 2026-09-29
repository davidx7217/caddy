# Caddy - Privacy Policy

Last updated: 13 September 2026
Describes: Caddy **1.0.0**

## The short version

Caddy collects nothing, transmits nothing, and has no server to transmit to.

This policy describes the version named above rather than every version there
will ever be. If a later release changes what Caddy does, this file changes with
it and the difference is visible in the repository's history. See Changes.

## What Caddy stores

Everything below lives in your own browser, in `chrome.storage.local`, on the
machine you are reading this on. None of it is uploaded, shared, sold, or seen by
anyone but you.

- **Your cards.** Which card products you told Caddy you carry -- for example
  "Chase Freedom Unlimited". Product names, not accounts.
- **Per-card choices.** Where a card requires one: the category a Bank of America
  Customized Cash card is set to, a Preferred Rewards tier, the two 5% categories
  on a U.S. Bank Cash+.
- **Your point valuations.** What you think a point is worth, in cents.
- **Your blocklist.** Domains you have told Caddy never to run on.
- **Your tie-breaks.** When two cards were within 10% and you chose one and asked
  Caddy to remember it.
- **Dock position and theme.** Where you dragged the dock to, and light or dark
  if you pinned one. Leaving it on Auto stores nothing: following the browser IS
  the absence of a stored value.
- **The activity log, if you turn it on.** Off by default. See below.

## What Caddy never sees

- Card numbers, CVVs, expiry dates. There is no field to enter one and no code
  that reads one.
- Balances, statements, transactions, credit scores, or anything from a bank.
  Caddy has no bank connection and asks for no credentials.
- Anything you type. The extension checks whether payment fields *exist* on a
  page in order to tell a checkout from a product page, and never reads what is
  in them.

  One precise exception, because "never reads a value" would be a claim the
  source contradicts: Caddy reads the `value` of `<input type="submit">`,
  `type="button"` and `type="reset"` elements, where that attribute holds the
  BUTTON'S LABEL -- "Place your order", "Pay $52.10" -- and is not something
  anyone typed. The check is written the narrow way round on purpose: a page can
  put `role="button"` on a text input, so the code tests the tag and the type
  before reading, rather than trusting the role. See `collectSignals` in
  `src/content.js`.
- Your name, email, or any account identity. This version has no account: there
  is nothing to sign up for, nothing to sign in to, and no identifier of you
  anywhere in what Caddy stores.

## What Caddy reads from the pages you visit

To decide whether to show a recommendation, and which one, Caddy looks at the
page you are on for:

- the domain, to identify the merchant;
- structured data the page publishes about itself (Schema.org markup, Open Graph
  tags), to tell a shop from an article from a video;
- whether commerce controls exist -- a cart link, a buy button, a card field, a
  billing form -- as existence checks only.

All of this happens **inside your browser** and the result goes nowhere. It is
used to render the overlay and then discarded when you leave the page.

## What "read your data on all websites" means here

Chrome's install prompt says Caddy can read and change your data on all websites.
That is the permission's name, not a description of what Caddy does with it.

What it reads is listed above: a domain, a page's own published markup, and
whether certain controls exist. What it changes is one thing -- it adds its own
dock to the corner of the page. It does not read what you type, it does not
touch other extensions or other tabs, and nothing it reads leaves your browser,
because it makes no network requests at all.

If you would rather it read nothing until asked, Settings -> Where it runs ->
"Only when you ask" unregisters the content scripts entirely.

## Network activity

Caddy makes no network requests of any kind. There is no analytics, no telemetry,
no crash reporting, no remote configuration and no update channel other than the
Chrome Web Store's own.

Card rates, the merchant table and the bundled font all ship inside the extension
package and are read from disk. The extension declares no web-accessible
resources, which also means no website can detect that you have it installed by
probing for one.

## The activity log

Caddy can keep a short local history so you can check its judgement. It is **off
until you turn it on** in Settings.

When on, it keeps the last **30** recommendations, and each row holds only: the
date, the domain, the spending category, the card it recommended, and the
effective rate. No URL path, no amount, no card number. It never leaves your
machine, and Settings has a one-click button to clear it.

## Permissions

- **storage** - saves the settings listed above on your machine.
- **activeTab** - when you click the toolbar icon, lets Caddy see that one tab's
  address and show the overlay on it, for that visit only.
- **scripting** - injects the overlay that displays the recommendation.
- **&lt;all_urls&gt;** - lets Caddy read the page you are on in order to tell a
  shop from a checkout from an article. It is asked for at install, because the
  extension does nothing useful without it. Settings -> Where it runs switches to
  click-to-run, which unregisters the content scripts so nothing reads any page
  until you click the toolbar icon.

## Your control

- Remove any card, or all of them, in Settings.
- Add any domain to the blocklist. Caddy checks it **before** reading anything on
  the page, so on a blocked site it collects nothing and runs nothing.
- Turn automatic mode off to return to click-to-run.
- Clear the activity log, or never turn it on.
- Export everything Caddy holds to a JSON file, and import it back.
- Uninstall. Removing the extension removes its storage with it.

## Children

Caddy is not directed at children and collects nothing from anyone.

## Changes

If this policy ever changes, the new version will be published in the repository
with the change visible in its history, and the version line at the top of this
file says which release it describes.

Two things are worth naming as things that could change, because this policy
would rather be honest than reassuring. Caddy today has no account and makes no
network requests. Neither is a promise about every future release: a paid tier
would need some way to tell a licence from no licence, and the obvious thing to
sell is fresher rate data, which requires fetching it. Nothing of the sort is
built or decided. If either arrives, it will be described here, in a release that
says so, before it ships.

What will not change: Caddy will never connect to a bank account, never ask for
or store a card number, and never take money from an issuer to recommend its
card.

## Contact

Issues and questions: https://github.com/davidx7217/caddy/issues

## Not financial advice

Caddy reports earning rates published by card issuers. It is not a financial
adviser, it does not know your balances or your spending, and issuer terms
change. Verify anything that matters against your issuer before relying on it.
