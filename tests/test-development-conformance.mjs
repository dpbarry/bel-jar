import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  activeCfgResolver,
  cfgPathForActive as esmCfgPath,
  developmentForFile as esmDev,
  preludePathsFor as esmPrelude,
  workspaceDevelopments as esmWorkspace,
} from '../editor-src/development.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const psSrc = readFileSync(join(here, '..', 'js', 'project-source.js'), 'utf8');
const psWindow = {};
// eslint-disable-next-line no-new-func
new Function('window', psSrc)(psWindow);
const PS = psWindow.BelJarProjectSource;

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const WS = [
  { id: 'cfg', name: 'bisimulation/sources.cfg', text: 'picalc.bel\nbisimulation.bel\ninvariant.bel' },
  { id: 'pic', name: 'bisimulation/picalc.bel', text: 'LF tm : type;' },
  { id: 'bis', name: 'bisimulation/bisimulation.bel', text: 'LF sim : type;' },
  { id: 'inv', name: 'bisimulation/invariant.bel', text: 'LF inv : type;' },
  { id: 'howe', name: 'bisimulation/howes-method/howe.bel', text: 'LF h : type;' },
  { id: 'tofte', name: 'tofte-hoas.bel', text: 'LF th : type;' },
  { id: 'untitled', name: 'untitled.bel', text: 'LF o : type;' },
];
const text = (id) => WS.find((f) => f.id === id).text;
const bisimOpts = { activeCfgForDir: activeCfgResolver({ bisimulation: 'bisimulation/sources.cfg' }) };

const cr = [
  { id: 'c', name: 'church/ord.cfg', text: 'lam.elf\nord-red.elf\npar-red.elf\npar-lemmas.bel' },
  { id: 'l', name: 'church/lam.elf', text: 'LF term : type;' },
  { id: 're', name: 'church/par-red.elf', text: 'LF pred : term -> term -> type;' },
  { id: 'rb', name: 'church/par-red.bel', text: 'pred : term -> term -> type.' },
];
const crText = (id) => cr.find((f) => f.id === id).text;
const churchOpts = { activeCfgForDir: activeCfgResolver({ church: 'church/ord.cfg' }) };

function assertAgree(label, esmVal, psVal) {
  const a = JSON.stringify(esmVal);
  const b = JSON.stringify(psVal);
  expect(a === b, `${label}: ESM vs IIFE mismatch\n  esm=${a}\n  ps=${b}`);
}

for (const [id, opts] of [['bis', bisimOpts], ['howe', {}], ['tofte', {}], ['untitled', {}], ['inv', bisimOpts]]) {
  assertAgree(`cfgPathForActive ${id}`, esmCfgPath(WS, id, text, opts), PS.cfgPathForActive(WS, id, text, opts));
  assertAgree(`development ${id}`, esmDev(WS, id, text, opts), PS.developmentForFile(WS, id, text, opts));
  assertAgree(`prelude ${id}`, esmPrelude(WS, id, text, opts),
    PS.preludeFilesFor(WS, id, text, opts).map((f) => f.name));
}

assertAgree('unlisted church bel', esmDev(cr, 'rb', crText, churchOpts), PS.developmentForFile(cr, 'rb', crText, churchOpts));
assertAgree('unlisted church prelude', esmPrelude(cr, 'rb', crText, churchOpts),
  PS.preludeFilesFor(cr, 'rb', crText, churchOpts).map((f) => f.name));

assertAgree('workspaceDevelopments', esmWorkspace(WS, text), PS.workspaceDevelopments(WS, text));

console.log('OK development conformance (ESM ↔ project-source.js)');
