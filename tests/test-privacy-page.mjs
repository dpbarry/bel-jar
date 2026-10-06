// What BelJar keeps (privacy.html, plan v6 c4): the page says what the code
// does. Every table the migrations make is something the page names, every
// number it gives is the code's, and the way to delete it is the one Settings
// has. Done when: "the page is live and linked, and what it says matches what
// c3 deletes".
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACCOUNT_ROWS, NAMES_NO_ACCOUNT, DELETION_RECORD, GRACE_MS } from '../server/deletion.mjs';
import { SESSION_MS, USED_STEP_MS } from '../server/auth.mjs';
import { finalTables } from './_schema.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
let n = 0;
function expect(cond, msg) {
  n += 1;
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const html = read('privacy.html');
// What a reader reads: the text, without tags or comments, on one line.
const text = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ')
  .replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ');

// ── every table is something the page names ─────────────────────────────────
// What each table holds, as the page says it. A table a migration adds has no
// entry, and fails here until the page says what it keeps.
const SAYS = {
  users: ['your handle and name', 'the address of your picture'],
  identities: ['your account’s number'],
  sessions: ['a rough name for it', 'when you signed in', 'when it was last used', 'a fingerprint of it'],
  projects: ['each project you have synced'],
  versions: ['every version of each project', 'stays in its earlier versions'],
  texts: ['the text of every file'],
  settings_heads: ['Your settings'],
  settings_versions: ['Your settings'],
  ended_sessions: ['keeps why under that fingerprint'],
  usage: ['counts how many projects you have and how much text you have stored'],
  [DELETION_RECORD]: ['A note that the account is being deleted, holding only its random number'],
};
const sql = fs.readdirSync(path.join(root, 'server', 'migrations')).filter((f) => f.endsWith('.sql')).sort()
  .map((f) => read(path.join('server', 'migrations', f))).join('\n');
const tables = [...finalTables().keys()];
void sql;
const unsaid = tables.filter((t) => !SAYS[t]);
expect(tables.length >= 10 && !unsaid.length, `every table the server keeps is one the page names (${unsaid.join(', ') || tables.length + ' tables'})`);
const missing = Object.entries(SAYS).flatMap(([t, phrases]) => phrases.filter((p) => !text.includes(p)).map((p) => `${t}: "${p}"`));
expect(!missing.length, `and the page says each (${missing.join('; ')})`);

// ── what Delete account removes is what the page says it removes ───────────
const deleted = new Set(ACCOUNT_ROWS.map(([t]) => t));
expect(['users', 'identities', 'sessions', 'projects', 'versions', 'texts', 'settings_heads', 'settings_versions', 'usage'].every((t) => deleted.has(t))
  && NAMES_NO_ACCOUNT.join() === 'ended_sessions',
  'Delete account removes the GitHub details, every sign-in, the projects with their versions and texts, and the settings');
expect(/Your GitHub details, every browser’s sign-in, your projects with all their versions, and your settings are deleted at once, and the text of your files with them/.test(text),
  'and the page says exactly that');
expect(GRACE_MS <= 24 * 60 * 60 * 1000 && /goes within a day too/.test(text), 'the deletion\'s own note goes within a day, as the page says');

// ── its numbers are the code's ──────────────────────────────────────────────
expect(SESSION_MS === 90 * 24 * 60 * 60 * 1000 && /A sign-in lasts 90 days/.test(text), 'a sign-in lasts 90 days, as the server has it');
expect(USED_STEP_MS === 60 * 60 * 1000 && /last used, to the hour/.test(text), '"last used" to the hour, as often as the server writes it');
const auth = read('server/auth.mjs');
expect(!/scope/.test(auth.slice(auth.indexOf('async function start'), auth.indexOf('function returnOf'))) && /asks GitHub for no permissions and keeps no GitHub token/.test(text),
  'no permissions asked of GitHub (the sign-in sets no scope), and no token kept');
expect(/up to 7 days/.test(text) && /last 30 days/.test(text), 'logs and database history at their longest (the paid plan\'s 7 and 30 days)');

// ── the way to delete is the one Settings has ───────────────────────────────
const settings = read('js/ui/settings-ui.mjs');
expect(/addSectionHead\(panelBodies\.account, 'Devices'\)/.test(settings) && /'Delete account',/.test(settings) && /'Sign out', function/.test(settings),
  'Settings > Account has Devices, each with Sign out, and Delete account');
expect(/Settings, Account, Delete account/.test(text) && /Settings, Account, Devices: Sign out beside it/.test(text), 'which the page names');

// ── linked, and served ──────────────────────────────────────────────────────
const routes = read('js/frame/routes.mjs');
expect(/export function privacyUrl\(/.test(routes), 'the page has an address, from routes.mjs like every other');
const home = read('js/home/home.mjs');
expect(/label: 'Privacy', href: Routes\.privacyUrl\(\)/.test(home), 'home\'s foot links it');
expect(/Routes\.privacyUrl\(\)/.test(home.slice(home.indexOf('function signInLine'), home.indexOf('function findNodes'))), 'and so does the line beside the sign-in');
for (const ref of [...html.matchAll(/(?:src|href)="([^"#:]+)"/g)].map((m) => m[1]).filter((r) => !r.startsWith('./?'))) {
  expect(fs.existsSync(path.join(root, ref)), `what the page loads is there (${ref})`);
}
// ⛔ The mark at its top is BelJar's own, whole: a copy that dropped the jar's base read as cut off.
const parts = (svg) => (svg || '').split('\n').map((l) => l.trim()).filter((l) => /^<(path|circle)\b/.test(l));
const homeMark = parts((/<svg class="header-logo"[^>]*>([\s\S]*?)<\/svg>/.exec(read('index.html')) || [])[1]);
const pageMark = parts((/<a class="doc-home"[\s\S]*?<svg[^>]*>([\s\S]*?)<\/svg>/.exec(html) || [])[1]);
expect(homeMark.length >= 8 && JSON.stringify(pageMark) === JSON.stringify(homeMark), `the page's mark is home's, every part of it (${pageMark.length} of ${homeMark.length})`);
const ignored = read('.assetsignore');
expect(!/privacy/.test(ignored), 'and none of it is kept out of the upload');
expect(!/—|–/.test(text), 'in the house voice: no dashes');

console.log(`OK privacy page (${n} checks: every table named, what Delete account removes said as it is, the code's own numbers, the way to delete, linked and served)`);
