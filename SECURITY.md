# Security policy

## Supported versions

Only the latest version gets security fixes: the one on the Chrome Web Store and
on `main`. That is 1.0.0 today.

## Reporting a vulnerability

Please do not open a public issue. Report it privately through GitHub instead:
the repository's **Security** tab, then **Report a vulnerability**, or directly at
https://github.com/davidx7217/caddy/security/advisories/new.

Include what you found, the steps to reproduce it, your Caddy and Chrome versions,
and what an attacker could do with it.

You should hear back within 7 days. Once a fix ships, the advisory is published,
and you are credited in it if you want to be.

## What counts

Caddy runs a content script on every page you visit and keeps your card list in
Chrome's local storage on your device. It makes no network calls. So these are
security issues:

- a web page reading or changing what Caddy stores, or learning which cards you
  hold
- a web page running script in Caddy's popup, settings or setup pages
- anything that makes Caddy send data off your device
- a way to make Caddy do more than its declared permissions (`storage`,
  `activeTab`, `scripting`, `<all_urls>`) are for

These are not, but are welcome as ordinary issues at
https://github.com/davidx7217/caddy/issues:

- a wrong earning rate or category
- the dock appearing on a page where there is nothing to buy

Out of scope: vulnerabilities in the sites Caddy runs on or in Chrome itself, and
anything that needs an attacker who already controls your computer or browser
profile.
