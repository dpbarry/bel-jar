import { activeCfgResolver } from '../editor-src/development.mjs';
import { findGroupSignature, buildPrelude } from '../editor-src/project-prelude.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const FILES = [
  { id: 'order', name: 'grp/order.cfg', text: 'base.bel\nuse.bel' },
  { id: 'alt', name: 'grp/alt.cfg', text: 'base2.bel\nuse.bel' },
  { id: 'base', name: 'grp/base.bel', text: 'LF tp : o → type;' },
  { id: 'base2', name: 'grp/base2.bel', text: 'LF tp : tp → type;' },
  { id: 'use', name: 'grp/use.bel', text: 'LF nd : tp → type;' },
];
const text = (id) => FILES.find((f) => f.id === id).text;

const orderOpts = { activeCfgForDir: activeCfgResolver({ grp: 'grp/order.cfg' }) };
const altOpts = { activeCfgForDir: activeCfgResolver({ grp: 'grp/alt.cfg' }) };

const sigOrder = findGroupSignature(FILES, 'use', 'tp', text, orderOpts);
const sigAlt = findGroupSignature(FILES, 'use', 'tp', text, altOpts);

expect(sigOrder?.type?.includes('o'), 'order cfg: tp defined as o → type');
expect(sigAlt?.type?.includes('tp'), 'alt cfg: tp defined as tp → type');
expect(sigOrder?.type !== sigAlt?.type, 'active cfg pivot changes cross-file signature for tp');

const preOrder = buildPrelude(FILES, 'use', text, orderOpts);
const preAlt = buildPrelude(FILES, 'use', text, altOpts);
expect(preOrder?.spans[0]?.name === 'grp/base.bel', 'order prelude uses base.bel');
expect(preAlt?.spans[0]?.name === 'grp/base2.bel', 'alt prelude uses base2.bel');

// File only in alt.cfg while order is active → standalone
const onlyAlt = [
  { id: 'order', name: 'grp/order.cfg', text: 'base.bel' },
  { id: 'alt', name: 'grp/alt.cfg', text: 'altonly.bel' },
  { id: 'base', name: 'grp/base.bel', text: 'LF o : type;' },
  { id: 'altonly', name: 'grp/altonly.bel', text: 'LF x : o → type;' },
];
const altOnlyText = (id) => onlyAlt.find((f) => f.id === id).text;
expect(findGroupSignature(onlyAlt, 'altonly', 'o', altOnlyText, orderOpts) === null,
  'file only in inactive cfg does not share when order is active');

console.log('OK active module pivot (cfg switch changes prelude and signatures)');
