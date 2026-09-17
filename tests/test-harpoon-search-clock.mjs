// Live Orca clocks: the tree rail's "N checks · Xs" must tick between tactics,
// and reelStatText is the one string both the tooltip and the rail share.
import { create as createReel } from '../js/harpoon/harpoon-lab-reel.mjs';
import { create as createTreeUi } from '../js/harpoon/harpoon-lab-tree-ui.mjs';

let n = 0;
function expect(cond, msg) {
  n += 1;
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

function stubEl(tag, cls, text) {
  return {
    className: cls || '',
    textContent: text == null ? '' : String(text),
    children: [],
    querySelector: function () { return null; },
    appendChild: function (c) { this.children.push(c); return c; },
    addEventListener: function () {},
    setAttribute: function () {},
    classList: { add: function () {}, remove: function () {}, contains: function () { return false; }, toggle: function () {} },
  };
}

const reel = createReel({
  el: stubEl,
  tacticVerb: function (k) { return k; },
  setTip: function () {},
  bindStepGoalTip: function () {},
  bindChipTip: function () {},
  moveLead: function () { return ''; },
  appendMoveFacet: function () {},
  renderType: function () {},
  renderSource: function () {},
  nativeAutoSearchLabel: function () { return 'Trying fill…'; },
  resolveNativeAutoGoalDisplay: function () { return {}; },
  priorGoalBinders: function () { return []; },
  mountGoalPriors: function () {},
  E: function () { return null; },
  ICON_PLAY: '',
  ICON_PAUSE: '',
});

const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
const live = reel.reelStatText({ checks: 76, startedAt: now - 9300 });
expect(/^76 checks · 9\.\ds$/.test(live), 'elapsed time is live to a tenth, not a frozen snapshot: ' + live);
expect(/^1 check · 0\.\ds$/.test(reel.reelStatText({ checks: 1, startedAt: now })),
  'singular check');

const tree = createTreeUi({
  el: stubEl,
  iconBtn: function () { return stubEl('button'); },
  setTip: function () {},
  bindChipTip: function () {},
  renderType: function () {},
  renderSource: function () {},
  appendAutoTree: function () {},
  nativeAutoSearchLabel: function (na) { return na.searchLabel; },
  reelStatText: function (na) { return (na.checks || 0) + ' checks · ' + na._t + 's'; },
  autoSubtext: function () { return ''; },
  autoVerdictTitle: function () { return ''; },
  deriveMoveLead: function () { return ''; },
  liveFileText: function () { return ''; },
  lineColToOffset: function () { return 0; },
  labTitle: function (s) { return s; },
  FW: function () { return null; },
  E: function () { return null; },
  ICON_POPOUT: '',
  ICON_CHEVRON_LEFT: '',
  ICON_CHEVRON_RIGHT: '',
});

const main = { textContent: 'Trying fill…' };
const sub = { textContent: '76 checks · 9.3s' };
const session = {
  nativeAuto: { phase: 'searching', searchLabel: 'Trying fill…', checks: 80, _t: '9.5' },
  _treeExplorerEl: {
    querySelector: function (sel) {
      if (sel === '.hpt-detail-status-main') return main;
      if (sel === '.hpt-detail-status-sub') return sub;
      return null;
    },
  },
};
tree.syncTreeSearchClock.call(session);
expect(sub.textContent === '80 checks · 9.5s',
  'tree rail patches the frozen checks·time line in place: ' + sub.textContent);

session.nativeAuto.phase = 'solved';
sub.textContent = '80 checks · 9.5s';
tree.syncTreeSearchClock.call(session);
expect(sub.textContent === '80 checks · 9.5s', 'clock is a no-op once the search has ended');

console.log('OK test-harpoon-search-clock (' + n + ' assertions)');
