// Launch Chrome and talk to it over the DevTools Protocol, with no dependency.
//
// node's WebSocket has been a global since v22, which is the whole reason this
// project can drive a real browser without Puppeteer. Two tools need it -- the
// redirect sweep and the screenshot maker -- so the plumbing lives here rather
// than twice.
//
// Everything launched here uses a THROWAWAY profile directory. It never touches
// your real Chrome, so nothing carries your cookies or your sessions, and
// `close()` takes the profile with it.
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CANDIDATES = [
  process.env.CHROME,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser'
].filter(Boolean);

export function chromePath() {
  const found = CANDIDATES.find(p => existsSync(p));
  if (!found) {
    console.error('No Chrome found. Set CHROME to the binary:\n' +
      "  CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \\\n" +
      '    node tools/<script>.mjs');
    process.exit(2);
  }
  return found;
}

/** One socket, many sessions. Returns a sender, an event tap, and a closer. */
export function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  const pending = new Map();
  const listeners = new Set();
  let id = 0;
  const ready = new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', rej, { once: true });
  });
  ws.addEventListener('message', ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? reject(new Error(m.error.message)) : resolve(m.result);
    } else if (m.method) {
      for (const fn of listeners) fn(m);
    }
  });
  return {
    ready,
    send(method, params = {}, sessionId) {
      const msgId = ++id;
      return new Promise((resolve, reject) => {
        pending.set(msgId, { resolve, reject });
        ws.send(JSON.stringify({ id: msgId, method, params, ...(sessionId ? { sessionId } : {}) }));
      });
    },
    on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    close() { try { ws.close(); } catch {} }
  };
}

/**
 * Launch Chrome and attach.
 *
 * `headless` defaults to false on purpose. See the measurement in
 * check-redirects-browser.mjs: headless silently gave a WRONG answer on the one
 * case that whole tool exists for. Anything that has to reflect what a person
 * would see should run headed.
 */
export async function launch({ headless = false, args = [] } = {}) {
  const profile = await mkdtemp(join(tmpdir(), 'caddy-cdp-'));
  const chrome = spawn(chromePath(), [
    ...(headless ? ['--headless=new'] : ['--no-startup-window']),
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check',
    '--disable-background-networking', '--disable-sync',
    '--disable-features=Translate,MediaRouter',
    ...args
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  const wsUrl = await new Promise((resolve, reject) => {
    let buf = '';
    const t = setTimeout(() => reject(new Error('Chrome did not report a DevTools endpoint')), 20000);
    chrome.stderr.on('data', d => {
      buf += d;
      const m = buf.match(/ws:\/\/[^\s]+/);
      if (m) { clearTimeout(t); resolve(m[0]); }
    });
    chrome.on('exit', c => { clearTimeout(t); reject(new Error(`Chrome exited (${c})`)); });
  });

  const cdp = connect(wsUrl);
  await cdp.ready;
  return {
    cdp,
    async close() {
      cdp.close();
      chrome.kill();
      await rm(profile, { recursive: true, force: true }).catch(() => {});
    }
  };
}

/** Open a tab and attach to it. Returns its sessionId and targetId. */
export async function newPage(cdp, url = 'about:blank') {
  const { targetId } = await cdp.send('Target.createTarget', { url });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  await cdp.send('Page.enable', {}, sessionId);
  return { targetId, sessionId };
}

/** Navigate and wait for load, with a ceiling. Resolves false on timeout. */
export async function goto(cdp, sessionId, url, timeoutMs = 25000) {
  const loaded = new Promise(resolve => {
    const off = cdp.on(m => {
      if (m.sessionId === sessionId && m.method === 'Page.loadEventFired') { off(); resolve(true); }
    });
    setTimeout(() => { off(); resolve(false); }, timeoutMs);
  });
  const nav = await cdp.send('Page.navigate', { url }, sessionId);
  if (nav && nav.errorText) return { ok: false, error: nav.errorText };
  return { ok: await loaded };
}

/** Run an expression in the page and return its value. */
export async function evaluate(cdp, sessionId, expression) {
  const { result, exceptionDetails } = await cdp.send('Runtime.evaluate',
    { expression, returnByValue: true, awaitPromise: true }, sessionId);
  if (exceptionDetails) throw new Error(exceptionDetails.text || 'evaluate failed');
  return result && result.value;
}

export const sleep = ms => new Promise(r => setTimeout(r, ms));
