#!/usr/bin/env node
// Builds caddy-<version>.zip: exactly the files Chrome loads, and nothing else.
//
// The repo root is not loadable as a zip -- it carries tools/, store/, design/,
// the README and a real wallet. This walks the manifest's world instead, so the
// zip is what "Load unpacked" would have seen minus everything it ignores.

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

// data/wallet.json is a person's real card list. It is gitignored for that
// reason and must never reach a zip that gets handed to anyone.
const EXCLUDE = new Set(['wallet.json', '.DS_Store']);

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(join(root, dir))) {
    if (EXCLUDE.has(entry)) continue;
    const rel = join(dir, entry);
    if (statSync(join(root, rel)).isDirectory()) out.push(...walk(rel));
    else out.push(rel);
  }
  return out;
}

const files = ['manifest.json', ...walk('src'), ...walk('icons'), ...walk('data')];

const { version } = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
const name = `caddy-${version}.zip`;

// Clear out every build, not just this version's, so bumping the manifest does
// not leave an older zip sitting next to the new one for someone to grab.
for (const entry of readdirSync(root)) {
  if (/^caddy-.*\.zip$/.test(entry)) rmSync(join(root, entry));
}

// -X drops the macOS extended attributes that would otherwise ride along.
execFileSync('zip', ['-q', '-X', name, ...files], { cwd: root });

const kb = Math.round(statSync(join(root, name)).size / 1024);
console.log(`${name}  ${files.length} files  ${kb} KB`);
