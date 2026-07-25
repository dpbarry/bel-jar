import { Text } from '@codemirror/state';
import { parser } from '../beluga-parser.js';
import { spanFirstLineDiagnostic } from '../ide/beluga-diag.mjs';
import { syntaxLintTree } from '../ide/syntax-lint.mjs';
import { fileBase } from '../project-paths.mjs';

export const SUITE_PRELUDE_DIAG_SOURCE = 'suite-prelude';

export function isSuitePreludeBannerDiag(d) {
  return d?.source === SUITE_PRELUDE_DIAG_SOURCE;
}

export function preludeIssueIsActiveCaused(issue, findings) {
  for (const f of findings || []) {
    if (!f.atIsActive) continue;
    if (f.kind === 'pragma-leak' && (f.affectedNames || []).includes(issue.name)) return true;
  }
  return false;
}

// Full parse + full-tree lint — far too heavy to repeat. Health sweeps and the
// prelude banner call this once per development member, so memoize by the exact
// text: only a file whose content actually changed ever reparses.
const syntaxErrCache = new Map(); // src -> result|null
const SYNTAX_ERR_CACHE_CAP = 64;

export function firstSyntaxErrorInText(text) {
  const src = String(text ?? '');
  if (!src.trim()) return null;
  if (syntaxErrCache.has(src)) return syntaxErrCache.get(src);
  const doc = Text.of(src.split('\n'));
  const tree = parser.parse(src);
  const diags = syntaxLintTree(tree, doc);
  const err = diags.find((d) => d.severity === 'error');
  const out = !err ? null : {
    line: doc.lineAt(err.from).number,
    message: err.message || 'Syntax error',
    severity: 'error',
  };
  if (syntaxErrCache.size >= SYNTAX_ERR_CACHE_CAP) syntaxErrCache.clear();
  syntaxErrCache.set(src, out);
  return out;
}

export function firstBrokenMemberBefore(members, activeIndex, memberDiagnostics, getText) {
  if (!members?.length || activeIndex < 1) return null;
  let brokenCount = 0;
  let first = null;
  for (let i = 0; i < activeIndex; i += 1) {
    const m = members[i];
    const beluga = (memberDiagnostics?.[m.name] || []).filter((d) => d.severity === 'error');
    // BelJar's own lint locates a syntax fault on the faulty token; Beluga's
    // parser halts on the NEXT token (often the next line). When both see the
    // member broken, our location wins — the AST is the substrate.
    const syntax = firstSyntaxErrorInText(typeof getText === 'function' ? getText(m.id) : m.text);
    const hit = syntax || beluga[0];
    if (!hit) continue;
    brokenCount += 1;
    if (!first) {
      first = {
        id: m.id,
        name: m.name,
        line: hit.line,
        message: hit.message || 'Error in this file.',
      };
    }
  }
  if (!first) return null;
  return { ...first, more: Math.max(0, brokenCount - 1) };
}

function preludeBannerDiagnostic(doc, broken, { suiteFindings = [] } = {}) {
  if (!broken || !doc) return null;
  if (preludeIssueIsActiveCaused(broken, suiteFindings)) return null;
  const more = broken.more > 0 ? ` (+${broken.more} more in prelude)` : '';
  return spanFirstLineDiagnostic({
    from: 0,
    to: Math.min(1, doc.length),
    severity: 'error',
    message: `Error in earlier suite file ${fileBase(broken.name)}, line ${broken.line}${more}`,
    source: SUITE_PRELUDE_DIAG_SOURCE,
    // Where the ACTUAL error lives — click surfaces (inspector rows etc.) route
    // the jump into the earlier member file instead of this file's line 1.
    target: { fileId: broken.id ?? null, fileName: broken.name, line: broken.line },
  }, doc);
}

export function suitePreludeBannerDiagnostic(doc, broken, opts = {}) {
  return preludeBannerDiagnostic(doc, broken, opts);
}

export function suitePreludeBannerForActive({
  doc,
  members,
  activeId,
  memberDiagnostics,
  getText,
  suiteFindings = [],
}) {
  if (!doc || !members?.length || !activeId) return null;
  const activeIdx = members.findIndex((m) => m.id === activeId);
  if (activeIdx < 1) return null;
  const broken = firstBrokenMemberBefore(members, activeIdx, memberDiagnostics, getText);
  if (!broken) return null;
  return preludeBannerDiagnostic(doc, broken, { suiteFindings });
}
