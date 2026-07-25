// HarpoonTree model: steps (+trace) → proof tree. Pins arm attachment, chain order,
// ghost alignment, stuck leaf, enriched state snapshots, and alt counts.
import fs from 'node:fs';
import vm from 'node:vm';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const src = fs.readFileSync(new URL('../js/harpoon/harpoon-ui.js', import.meta.url), 'utf8');
const sandbox = { window: undefined, self: {} };
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
const HT = sandbox.HarpoonTree;
expect(HT && typeof HT.buildModel === 'function', 'HarpoonTree loads in a bare context');

const steps = [
  {
    move: 'intro', lead: "opened the goal's binders", rationale: "opened the goal's binders",
    goal: '[ |- A -> B]', branch: null,
    text: 'fn d => ?', status: 'open', meta: { introduced: ['d'] },
    holeCtx: [], holeMeta: [{ name: 'g', type: 'ctx' }],
    focus: { armLine: 5, score: 10, siblingCount: 1 },
  },
  {
    move: 'split', lead: 'case on d', rationale: 'case on d', goal: '[g |- eq A B]', branch: null,
    text: 'case d of\n| [ |- c1 X] =>\n  ?\n| [ |- c2 Y] =>\n  ?', status: 'open',
    meta: { scrutinee: 'd', arms: 2, armPatterns: ['[ |- c1 X]', '[ |- c2 Y]'] },
    holeCtx: [{ name: 'd', type: 'A -> B' }], holeMeta: [{ name: 'g', type: 'ctx' }],
  },
  {
    move: 'synth', lead: '2-step chain closing eq', rationale: '2-step chain closing eq',
    goal: '[ |- eq X X]', branch: '[ |- c1 X]',
    text: 'let …', status: 'open', meta: { chain: ['f', 'g'], uses: ['X'], goalHead: 'eq' },
    holeCtx: [], holeMeta: [],
  },
  {
    move: 'fill', lead: 'closed eq', rationale: 'closed eq', goal: '[ |- eq Y Y]', branch: '[ |- c2 Y]',
    text: '[ |- refl]', status: 'solved', meta: { filler: '[ |- refl]', goalHead: 'eq' },
  },
];
const trace = [
  {
    goal: steps[0].goal, branch: null, holeCtx: [], holeMeta: steps[0].holeMeta,
    tried: [{ kind: 'intro', text: 'fn d => ?', head: 'fn d => ?', rationale: 'intro', verdict: 'accepted' }],
    advanced: true,
  },
  {
    goal: steps[1].goal, branch: null,
    tried: [
      { kind: 'fill', text: '[ |- junk]', head: '[ |- junk]', rationale: 'try fill', verdict: 'rejected', reason: 'ill-typed' },
      { kind: 'split', text: 'case d of', head: 'case d of', rationale: 'case', verdict: 'accepted' },
    ],
    advanced: true,
  },
  { goal: steps[2].goal, branch: '[ |- c1 X]', tried: [{ kind: 'synth', head: 'let …', verdict: 'accepted' }], advanced: true },
  { goal: steps[3].goal, branch: '[ |- c2 Y]', tried: [{ kind: 'fill', head: '[ |- refl]', verdict: 'accepted' }], advanced: true },
  {
    goal: '[ |- eq Z Z]', branch: '[ |- c2 Y]',
    tried: [{ kind: 'fill', text: '[ |- bad]', head: '[ |- bad]', verdict: 'rejected', reason: 'nope' }],
    advanced: false,
  },
];

const root = HT.buildModel({
  steps,
  trace,
  stuck: { reason: 'no-move', goal: '[ |- eq Z Z]', hole: { line: 9, col: 1 } },
  name: 'thm',
  goalType: '[ |- A -> B]',
  theoremSnapshot: { premiseCount: 2, totality: { kind: '1' } },
});

expect(root.type === 'theorem' && root.label === 'thm', 'root is the theorem');
expect(root.premiseCount === 2, 'theorem carries premise count on model');
const intro = root.children[0];
expect(intro.binderChip === '1Δ', 'intro move shows binder chip');
expect(intro.kind === 'intro', 'intro chains under root');
expect(intro.step && intro.step.lead === "opened the goal's binders", 'move carries lead for UI');
const split = intro.children[0];
expect(split.kind === 'split' && split.children.length === 2, 'split fans into 2 arms');
expect(split.altCount === 1, 'split has alt count from rejected fill');
// Arm count is an inspector detail now (no corner badge on the node); the count
// remains available structurally as the number of arm children.
expect(split.effectBadge === undefined, 'split node carries no arm-count badge');
expect(split.children.length === 2, 'arm count available from split children');
const [arm1, arm2] = split.children;
expect(arm1.type === 'arm' && /c1 X/.test(arm1.label), 'arm 1 labeled by its pattern');
expect(arm1.label.includes('⊢') && !arm1.label.includes('|-'), 'arm label uses turnstile glyph');
expect(arm1.children[0] && arm1.children[0].kind === 'synth', 'synth attaches to its arm');
expect(arm2.children[0] && arm2.children[0].kind === 'fill' && arm2.children[0].closed === true,
  'fill attaches to arm 2 and is marked closed');
expect(split.ghosts && split.ghosts.length === 1 && split.ghosts[0].verdict === 'rejected',
  'ghosts = non-accepted tried candidates of the aligned trace entry');
const stuckNode = arm2.children[0].children[0];
expect(stuckNode && stuckNode.type === 'stuck' && stuckNode.tried.length === 1,
  'stuck leaf attaches to its branch with the tried list');
expect(stuckNode.state && stuckNode.state.goal, 'stuck node carries proof state');

const crumb = HT.breadcrumb(split);
expect(crumb.length >= 3 && crumb[0] === 'thm', 'breadcrumb walks to theorem');

console.log('OK test-harpoon-tree (model: arms, chains, ghosts, stuck, enrichment)');
