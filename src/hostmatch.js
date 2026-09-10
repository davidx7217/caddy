// Blocklist host matching. A classic script, loaded ahead of content.js in the
// same isolated world, because a content script cannot import an ES module and
// this rule must run before any DOM is read.
//
// This is the ONLY copy. engine.js used to export a second, identical one that
// the engine tests exercised and the browser never ran -- the tested version was
// not the executing version -- the copy with the tests was not the copy that
// ran.
globalThis.__cpIsBlockedHost = function (hostname, blocked) {
  const host = String(hostname || '').toLowerCase().replace(/^www\./, '');
  if (!host) return false;
  return (blocked || []).some(b => {
    const d = String(b || '').toLowerCase().trim().replace(/^www\./, '');
    return d && (host === d || host.endsWith('.' + d));
  });
};
