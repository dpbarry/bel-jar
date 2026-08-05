/**
 * Derivation section, tree panel, explorer, detail card — peer of `harpoon-lab.mjs`, bundled via `harpoon-ui.mjs`.
 */
const global = globalThis;
function createTreeUi(deps) {
    var el = deps.el;
    var iconBtn = deps.iconBtn;
    var setTip = deps.setTip;
    var bindChipTip = deps.bindChipTip;
    var renderType = deps.renderType;
    var renderSource = deps.renderSource;
    var appendAutoTree = deps.appendAutoTree;
    var nativeAutoSearchLabel = deps.nativeAutoSearchLabel;
    var reelStatText = deps.reelStatText;
    var autoSubtext = deps.autoSubtext;
    var autoVerdictTitle = deps.autoVerdictTitle;
    var deriveMoveLead = deps.deriveMoveLead;
    var liveFileText = deps.liveFileText;
    var lineColToOffset = deps.lineColToOffset;
    var labTitle = deps.labTitle;
    var FW = deps.FW;
    var E = deps.E;
    var ICON_POPOUT = deps.ICON_POPOUT;
    var ICON_CHEVRON_LEFT = deps.ICON_CHEVRON_LEFT;
    var ICON_CHEVRON_RIGHT = deps.ICON_CHEVRON_RIGHT;

      // The derivation section: a header with a List⇄Tree segmented toggle + a "Pop
      // out" button, then either the linear step list (default) or a compact inline
      // tree. The roomy experience lives in the pop-out explorer.
      function renderDerivationSection(box, na) {
        var self = this;
        var section = el('div', 'harpoon-deriv');
        var header = el('div', 'harpoon-deriv-header');
        header.appendChild(el('span', 'harpoon-lab-section-label is-steps', 'Derivation'));

        var toggle = el('div', 'harpoon-deriv-toggle');
        var views = [['list', 'List'], ['tree', 'Tree']];
        var view = 'list';
        var listHost = el('ol', 'harpoon-lab-auto-trail is-instant');
        appendAutoTree(listHost, na.steps || []);
        var treeHost = el('div', 'harpoon-deriv-treehost');
        var treeDrawn = false;

        function showView(v) {
          view = v;
          listHost.hidden = v !== 'list';
          treeHost.hidden = v !== 'tree';
          toggle.querySelectorAll('.harpoon-deriv-tab').forEach(function (t) {
            t.classList.toggle('is-active', t.dataset.view === v);
          });
          if (v === 'tree' && !treeDrawn) {
            treeDrawn = true;
            var mounted = self.mountTreePanel(treeHost, na, { compact: true, live: true });
            self._compactTreeRedraw = mounted.redraw;
          }
        }
        views.forEach(function (vv) {
          var t = el('button', 'harpoon-deriv-tab' + (vv[0] === view ? ' is-active' : ''), vv[1]);
          t.type = 'button';
          t.dataset.view = vv[0];
          t.addEventListener('click', function () { if (view !== vv[0]) showView(vv[0]); });
          toggle.appendChild(t);
        });
        header.appendChild(toggle);

        var popBtn = iconBtn(
          'icon-btn harpoon-deriv-popout',
          ICON_POPOUT,
          'Open the proof tree explorer',
          'Pop out tree',
          function () { self.openTreeExplorer(); },
        );
        header.appendChild(popBtn);
        section.appendChild(header);

        treeHost.hidden = true;
        section.appendChild(listHost);
        section.appendChild(treeHost);
        return section;
      };

      // Mount the SVG tree panel into a host. `opts.compact` = the inline side-panel
      // variant (smaller, detail card below); otherwise the roomy pop-out variant
      // (detail card in a side rail). `opts.live` = read the CURRENT session na on every
      // draw (so the tree grows during search, surviving the na reassignment at the end)
      // instead of a captured snapshot. Returns { wrap, redraw } — redraw re-lays the
      // tree from the latest na, preserving the chosen mode. Reuses HarpoonTree +
      // renderTreeDetail.
      function mountTreePanel(host, na, opts) {
        var self = this;
        opts = opts || {};
        host.textContent = '';
        var wrap = el('div', 'hpt-panel' + (opts.compact ? ' is-compact' : ' is-roomy'));
        var mode = 'path';
        var selectedNodeId = null;
        var treeHost = el('div', 'hpt-host');
        var card = el('div', 'hpt-card');
        card.hidden = true;

        // draw() rebuilds the whole SVG from scratch on every redraw (each step
        // settling during a live search). Left alone, that also resets pan/zoom
        // to the auto-fit default every time, yanking the view out from under
        // anyone who'd manually framed something. So: keep auto-fitting freely
        // until the user actually pans or zooms (userView goes null -> a vb),
        // then freeze on their view across redraws until they reset it (the
        // "Fit to view" menu action below).
        var userView = null;

        // The live variant tracks the session's current na (reassigned when the search
        // ends); the static variant renders the snapshot it was given.
        function cur() { return opts.live ? (self.nativeAuto || na) : na; }

        function draw() {
          if (!global.HarpoonTree) return;
          var n = cur();
          var root = global.HarpoonTree.buildModel({
            steps: n.steps || [],
            trace: n.trace || null,
            complete: !!n.complete,
            stuck: n.complete ? null : n.stuck,
            name: (self.prep && self.prep.name) || n.declName || 'theorem',
            goalType: n.goalType || '',
            theoremSnapshot: n.theoremSnapshot || null,
          });
          global.HarpoonTree.render(treeHost, root, {
            mode: mode,
            instant: !!opts.live,
            selectedId: selectedNodeId,
            initialView: userView,
            onViewChange: function (vb) { userView = vb; },
            onSelect: function (nn) {
              selectedNodeId = nn && nn.id != null ? nn.id : null;
              card._hptEverSelected = true;
              self.renderTreeDetail(card, nn, detailCtx(mode));
            },
          });
          if (opts.compact === false && !card._hptEverSelected) {
            self.renderTreeDetail(card, null, detailCtx(mode));
          }
        }

        function resetView() {
          userView = null;
          draw();
        }

        function detailCtx(treeMode) {
          var n = cur();
          return {
            na: n,
            declName: (self.prep && self.prep.name) || n.declName || 'theorem',
            treeMode: treeMode || mode,
          };
        }

        // The Path / Move-space toggle lives on the tree's own right-click menu
        // (dependency-graph convention) instead of a permanent tab bar.
        if (global.Menu && global.Menu.bindContextMenu) {
          global.Menu.bindContextMenu(treeHost, function () {
            var hasTrace = !!(cur().trace && cur().trace.length);
            return [
              {
                label: mode === 'space' ? 'Hide rejected moves' : 'Show full move space',
                disabled: !hasTrace,
                onSelect: function () {
                  mode = mode === 'space' ? 'path' : 'space';
                  draw();
                },
              },
              { type: 'separator' },
              { label: 'Fit to view', onSelect: resetView },
            ];
          }, { side: 'bottom', align: 'start' });
        }

        if (opts.compact) {
          wrap.appendChild(treeHost);
          wrap.appendChild(card);
        } else {
          // Roomy: tree on the left, detail card in a collapsible side rail.
          var split = el('div', 'hpt-split');
          var left = el('div', 'hpt-split-tree');
          left.appendChild(treeHost);
          var rail = el('div', 'hpt-split-rail');
          card.hidden = false;
          card.classList.add('is-rail');
          card._hptEverSelected = false;
          self.renderTreeDetail(card, null, detailCtx(mode));

          // Collapse / reopen the inspector rail — header toggle with a slim strip
          // when collapsed (never a zero-width rail or edge-straddling chevron).
          // State persists across redraws and app sessions via Persist.
          var persist = global.Persist;
          var collapsed = !!(persist && persist.readStoredHarpoonDetailsCollapsed
            && persist.readStoredHarpoonDetailsCollapsed());
          var railHead = el('div', 'hpt-rail-head');
          var railTitle = el('span', 'hpt-rail-title', 'Details');
          var toggle = el('button', 'icon-btn hpt-rail-toggle');
          toggle.type = 'button';
          railHead.appendChild(railTitle);
          railHead.appendChild(toggle);
          function applyCollapsed() {
            split.classList.toggle('is-rail-collapsed', collapsed);
            rail.classList.toggle('is-collapsed', collapsed);
            toggle.innerHTML = collapsed ? ICON_CHEVRON_LEFT : ICON_CHEVRON_RIGHT;
            var tip = collapsed ? 'Show details panel' : 'Hide details panel';
            setTip(toggle, tip);
            toggle.setAttribute('aria-label', tip);
            toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
          }
          toggle.addEventListener('click', function () {
            collapsed = !collapsed;
            if (persist && persist.writeStoredHarpoonDetailsCollapsed) {
              persist.writeStoredHarpoonDetailsCollapsed(collapsed);
            }
            applyCollapsed();
          });
          rail.appendChild(railHead);
          rail.appendChild(card);
          applyCollapsed();

          split.appendChild(left);
          split.appendChild(rail);
          wrap.appendChild(split);
        }
        host.appendChild(wrap);
        draw();
        return { wrap: wrap, redraw: draw };
      };

      // The roomy POP-OUT tree explorer — a second FloatingWindow with space for
      // pan/zoom, the right-click move-space toggle, and a detail side rail. Reuses
      // mountTreePanel. When
      // opened DURING the search it tracks the live na, so the tree GROWS as steps
      // settle (redraw driven by settleWorkingRow / the phase transition); opened after,
      // it shows the final derivation.
      function openTreeExplorer() {
        var self = this;
        var fw = FW();
        var na = this.nativeAuto;
        if (!fw || !na) return;
        if (this._treeWin) { this._treeWin.raise && this._treeWin.raise(); return; }
        var live = na.phase === 'searching';
        var content = el('div', 'harpoon-tree-explorer' + (live ? ' is-live' : ''));
        var mounted = this.mountTreePanel(content, na, { compact: false, live: live });
        this._treeRedraw = mounted.redraw;
        var name = (this.prep && this.prep.name) || na.declName || 'theorem';
        this._treeWin = fw.open({
          title: labTitle(name + ' · proof tree'),
          className: 'harpoon-tree-window',
          content: content,
          width: 760,
          height: 560,
          minWidth: 420,
          minHeight: 320,
          onClose: function () { self._treeWin = null; self._treeRedraw = null; },
        });
      };

      // Redraw the pop-out tree if it's open (throttled to one per frame). Called as the
      // live search settles steps and on the search→solved/stuck transition, so the
      // explorer grows in step with the reel without thrashing on rapid settles.
      function refreshTreeExplorer() {
        var self = this;
        if (!this._treeRedraw || this._treeRedrawPending) return;
        this._treeRedrawPending = true;
        requestAnimationFrame(function () {
          self._treeRedrawPending = false;
          if (self._treeRedraw) self._treeRedraw();
          if (self._compactTreeRedraw) self._compactTreeRedraw();
        });
      };

      // Render a synth step's DERIVATION CHAIN — the ordered rule/lemma names the
      // backward-chaining engine applied to close the hole (meta.chain), and whether
      // it closed by inhabitation or by contradiction (meta.refutation). Surfaces the
      // engine's own datum verbatim; never recomputes the chain. Returns null when
      // there is no chain to show. `variant`: 'full' (card), 'rail' (pop-out), or
      // 'inline' (list row).
      function renderSynthChain(meta, variant) {
        var chain = (meta && meta.chain) || [];
        if (!chain.length) return null;
        var refutation = !!(meta && meta.refutation);
        var links = chain.filter(function (c) { return c !== 'impossible'; });
        var wrap = el('div', 'hpt-chain'
          + (variant === 'inline' ? ' is-inline' : '')
          + (variant === 'rail' ? ' is-rail' : '')
          + (refutation ? ' is-refutation' : ''));
        if (variant === 'full') {
          wrap.appendChild(el('div', 'hpt-chain-label',
            refutation ? 'Refutation — derived to a contradiction'
              : 'Synthesis — backward-chained ' + links.length
                + ' step' + (links.length === 1 ? '' : 's')));
        }
        var seq = el('div', 'hpt-chain-seq');
        var linkTotal = links.length;
        links.forEach(function (name, i) {
          if (i > 0) seq.appendChild(el('span', 'hpt-chain-arrow', '→'));
          var stepNum = i + 1;
          var isClose = i === links.length - 1 && !refutation;
          var stepTip = isClose
            ? 'Calls ' + name + ' and closes this subgoal (' + stepNum + ' of ' + linkTotal + ')'
            : 'Calls ' + name + ' (' + stepNum + ' of ' + linkTotal + ')';
          if (variant === 'rail') {
            var railNm = el('code', 'hpt-chain-name');
            railNm.textContent = name;
            bindChipTip(railNm, stepTip);
            seq.appendChild(railNm);
            return;
          }
          var link = el('span', 'hpt-chain-link' + (isClose ? ' is-close' : ''));
          link.appendChild(el('span', 'hpt-chain-idx', String(stepNum)));
          var nm = el('code', 'hpt-chain-name');
          nm.textContent = name;
          link.appendChild(nm);
          bindChipTip(link, stepTip);
          seq.appendChild(link);
        });
        if (refutation) {
          seq.appendChild(el('span', 'hpt-chain-arrow', '→'));
          if (variant === 'rail') {
            var railImp = el('code', 'hpt-chain-name is-impossible', 'impossible');
            bindChipTip(railImp, 'This branch is impossible (contradiction)');
            seq.appendChild(railImp);
          } else {
            var impLink = el('span', 'hpt-chain-link is-impossible', 'impossible');
            bindChipTip(impLink, 'This branch is impossible (contradiction)');
            seq.appendChild(impLink);
          }
        }
        wrap.appendChild(seq);
        if (variant === 'full') {
          var refuted = (meta.uses && meta.uses.length) ? meta.uses[meta.uses.length - 1] : null;
          var note = el('div', 'hpt-chain-note');
          if (!refutation) {
            note.textContent = 'the final rule closes the goal';
          } else if (refuted) {
            note.appendChild(document.createTextNode('these rules refute '));
            var rc = el('code', 'hpt-chain-refuted');
            rc.textContent = refuted;
            note.appendChild(rc);
          } else {
            note.textContent = 'these rules refute a hypothesis';
          }
          wrap.appendChild(note);
        }
        return wrap;
      }

      function detailSection(label, bodyEl) {
        var sec = el('div', 'hpt-detail-section');
        if (label) sec.appendChild(el('span', 'harpoon-lab-section-label', label));
        var body = el('div', 'hpt-detail-section-body');
        body.appendChild(bodyEl);
        sec.appendChild(body);
        return sec;
      }

      function renderDetailMeta(meta, checks) {
        var parts = [];
        (meta.uses || []).forEach(function (u) { parts.push(u); });
        (meta.binds || []).forEach(function (b) { parts.push('⊕ ' + b); });
        if (typeof checks === 'number' && checks > 0) {
          parts.push(checks + ' check' + (checks === 1 ? '' : 's'));
        }
        if (!parts.length) return null;
        var foot = el('div', 'hpt-detail-foot');
        parts.forEach(function (p, i) {
          if (i > 0) foot.appendChild(el('span', 'hpt-detail-sep', '·'));
          foot.appendChild(el('span', 'hpt-detail-meta-item', p));
        });
        return foot;
      }

      function renderDetailBanner(moveKind, name, lead) {
        var banner = el('div', 'hpt-detail-banner');
        if (moveKind) {
          banner.appendChild(el('span', 'harpoon-lab-auto-move move-' + moveKind, moveKind));
        }
        banner.appendChild(el('div', 'hpt-detail-name', name));
        if (lead) banner.appendChild(el('p', 'hpt-detail-lead', lead));
        return banner;
      }

      function renderTreeRailOverview(mount, ctx) {
        var na = ctx.na || {};
        var name = ctx.declName || 'theorem';
        mount.appendChild(el('span', 'harpoon-lab-section-label is-steps', 'Overview'));
        var banner = el('div', 'hpt-detail-banner is-overview');
        banner.appendChild(el('div', 'hpt-detail-name', name));
        mount.appendChild(banner);
        if (na.goalType) {
          var g = el('div', 'hpt-detail-goal');
          renderType(g, na.goalType);
          mount.appendChild(detailSection('Theorem', g));
        }
        var snap = na.theoremSnapshot;
        if (snap && (snap.premiseCount || snap.totality)) {
          var meta = el('div', 'hpt-detail-theorem-meta');
          if (snap.premiseCount) {
            meta.appendChild(el('span', 'hpt-detail-meta-item', snap.premiseCount + ' premise' + (snap.premiseCount === 1 ? '' : 's')));
          }
          if (snap.totality && snap.totality.kind) {
            meta.appendChild(el('span', 'hpt-detail-meta-item', 'total ' + snap.totality.kind
              + (snap.totality.name ? ' ' + snap.totality.name : '')));
          }
          mount.appendChild(detailSection('Structure', meta));
        }
        var status = el('div', 'hpt-detail-status');
        if (na.phase === 'searching') {
          status.appendChild(el('div', 'hpt-detail-status-main', nativeAutoSearchLabel(na)));
          status.appendChild(el('div', 'hpt-detail-status-sub', reelStatText(na)));
        } else if (na.complete) {
          status.appendChild(el('div', 'hpt-detail-status-main', autoVerdictTitle(na)));
          var sc = (na.steps || []).length;
          var line = sc ? (sc + (sc === 1 ? ' step' : ' steps')) : '';
          if (na.checks) line += (line ? ' · ' : '') + na.checks + (na.checks === 1 ? ' check' : ' checks');
          if (line) status.appendChild(el('div', 'hpt-detail-status-sub', line));
        } else {
          status.appendChild(el('div', 'hpt-detail-status-main', autoVerdictTitle(na)));
          var sub = autoSubtext(na);
          if (sub) status.appendChild(el('div', 'hpt-detail-status-sub', sub));
          var sc2 = (na.steps || []).length;
          if (sc2) {
            status.appendChild(el('div', 'hpt-detail-status-sub',
              sc2 + (sc2 === 1 ? ' step' : ' steps') + ' recorded'));
          }
        }
        mount.appendChild(detailSection('Status', status));
        mount.appendChild(el('p', 'hpt-detail-hint', 'Click a node in the tree to inspect a move.'));
      }

      function renderTreeBreadcrumb(n) {
        if (!n || !global.HarpoonTree || typeof global.HarpoonTree.breadcrumb !== 'function') return null;
        var parts = global.HarpoonTree.breadcrumb(n);
        if (!parts.length) return null;
        function truncPart(s) {
          s = String(s || '');
          return s.length > 22 ? s.slice(0, 21) + '…' : s;
        }
        var row = el('div', 'hpt-breadcrumb');
        parts.forEach(function (p, i) {
          if (i > 0) row.appendChild(el('span', 'hpt-breadcrumb-sep', '/'));
          row.appendChild(el('span', 'hpt-breadcrumb-part', truncPart(p)));
        });
        return row;
      }

      function renderFocusLine(focus) {
        if (!focus) return null;
        var bits = [];
        if (focus.siblingCount > 1) bits.push(focus.siblingCount + ' open holes');
        if (focus.armLine) bits.push('deepest case arm (line ' + focus.armLine + ')');
        if (typeof focus.score === 'number') bits.push('priority score ' + focus.score);
        if (!bits.length) return null;
        return el('p', 'hpt-detail-focus', bits.join(' · '));
      }

      function renderAltRow(v, rail) {
        var li = el('li', 'hpt-tried is-' + v.verdict);
        li.appendChild(el('span', (rail ? 'harpoon-lab-auto-move' : 'hpt-card-kind') + ' move-' + v.kind, v.kind));
        var head = el('code', 'hpt-tried-head');
        renderSource(head, v.head || v.kind);
        li.appendChild(head);
        if (v.rationale) {
          var rat = el('span', 'hpt-tried-rationale');
          rat.textContent = v.rationale;
          li.appendChild(rat);
        }
        if (v.text && v.text !== v.head) {
          var full = el('pre', 'hpt-tried-text');
          renderSource(full, v.text);
          li.appendChild(full);
        }
        if (v.reason) {
          var reason = el('span', 'hpt-tried-reason');
          reason.textContent = (v.verdict === 'guard' ? 'Skipped: ' : 'Rejected: ') + v.reason;
          li.appendChild(reason);
        }
        return li;
      }

      function renderAlternativesTray(tried, opts) {
        opts = opts || {};
        if (!tried || !tried.length) return null;
        var groups = [
          { key: 'guard', label: 'Skipped (guard)',
            tip: 'Ruled out by BelJar’s own soundness guards before ever calling Beluga — '
              + 'no checker time spent.' },
          { key: 'rejected', label: 'Rejected (checker)',
            tip: 'Tried against Beluga, which reported a type error, so it was discarded.' },
          { key: 'accepted', label: 'Accepted',
            tip: 'Certified clean by Beluga and spliced into the proof.' },
        ];
        var wrap = el('div', 'hpt-alt-tray');
        groups.forEach(function (g) {
          var rows = tried.filter(function (v) { return v.verdict === g.key; });
          if (!rows.length) return;
          var sec = el('div', 'hpt-alt-group is-' + g.key);
          var groupLabel = el('div', 'hpt-alt-group-label', g.label + ' (' + rows.length + ')');
          if (g.tip) setTip(groupLabel, g.tip);
          sec.appendChild(groupLabel);
          var list = el('ul', 'hpt-detail-tried');
          rows.forEach(function (v) { list.appendChild(renderAltRow(v, opts.rail)); });
          sec.appendChild(list);
          wrap.appendChild(sec);
        });
        return wrap.childNodes.length ? wrap : null;
      }

      // The theorem being proved is not necessarily the ACTIVE editor tab (the
      // Harpoon lab can stay open while the user reads a different file), so a
      // same-file-only jump against a possibly-stale `this.view` silently no-ops.
      // Use the app's real cross-file jump path instead — the same one go-to-
      // definition and project search use — which switches tabs first if needed.
      function jumpToTreeHole(hole) {
        var fileId = this.fileId;
        if (!hole || !hole.line || !fileId) return;
        var text = liveFileText(fileId);
        if (!text) return;
        var from = lineColToOffset(text, hole.line, hole.col);
        if (typeof global.openFileAt === 'function') {
          global.openFileAt(fileId, from, from + 1, { line: hole.line, col: hole.col, name: hole.name });
        }
      };

      function renderWhereSection(self, n, st) {
        var where = el('div', 'hpt-detail-where');
        var crumb = renderTreeBreadcrumb(n);
        if (crumb) where.appendChild(crumb);
        var hole = (st && st.hole) || n.hole;
        if (hole && hole.line) {
          var loc = el('button', 'hpt-hole-loc');
          loc.type = 'button';
          loc.textContent = 'line ' + hole.line + (hole.col ? ':' + hole.col : '')
            + (hole.name ? ' (' + hole.name + ')' : '');
          loc.addEventListener('click', function () { self.jumpToTreeHole(hole); });
          where.appendChild(loc);
        }
        if (st && st.branch) {
          where.appendChild(el('div', 'hpt-detail-branch', 'in branch: ' + st.branch));
        }
        if (st && typeof st.checks === 'number' && st.checks > 0) {
          var showStats = typeof Persist === 'undefined' || Persist.readStoredAutosolveShowStats();
          if (showStats) {
            var checksEl = el('div', 'hpt-detail-checks', st.checks + ' checker call' + (st.checks === 1 ? '' : 's'));
            setTip(checksEl, 'Times BelJar asked Beluga to certify a candidate move at this hole '
              + 'before one type-checked clean.');
            where.appendChild(checksEl);
          }
        }
        return where.childNodes.length ? where : null;
      }

      function renderStateContext(self, mount, state, goalState) {
        if (!state) return;
        var ed = E();
        if (state.goal) {
          var goalHost = el('div', 'hpt-detail-goal');
          if (ed && typeof ed.mountHoleGoalTier === 'function') {
            ed.mountHoleGoalTier(goalHost, {
              surface: 'lab',
              goalState: goalState || 'live',
              goal: state.goal,
            });
          } else {
            renderType(goalHost, state.goal);
          }
          mount.appendChild(detailSection('Goal', goalHost));
        }
        if (state.meta && state.meta.length) {
          var metaWrap = el('div', 'hpt-detail-ctx');
          self.renderCtx(metaWrap, 'meta', state.meta);
          mount.appendChild(detailSection('Meta context', metaWrap));
        }
        if (state.ctx && state.ctx.length) {
          var ctxWrap = el('div', 'hpt-detail-ctx');
          self.renderCtx(ctxWrap, 'ctx', state.ctx);
          mount.appendChild(detailSection('Context', ctxWrap));
        }
      }

      // Proof-state inspector for a selected tree node.
      // `ctx` supplies theorem overview data when `n` is null (pop-out rail idle).
      function renderTreeDetail(card, n, ctx) {
        card.textContent = '';
        card.hidden = false;
        var rail = card.classList.contains('is-rail');
        if (!n) {
          if (rail && ctx) {
            var idle = el('div', 'hpt-detail');
            card.appendChild(idle);
            renderTreeRailOverview(idle, ctx);
          } else if (!rail) {
            card.hidden = true;
          }
          return;
        }

        var mount = rail ? el('div', 'hpt-detail') : card;
        if (rail) card.appendChild(mount);

        var self = this;
        var treeMode = (ctx && ctx.treeMode) || 'path';
        var goalState = (ctx && ctx.na && ctx.na.goalState) || 'live';
        var showAlts = treeMode === 'space';

        if (n.type === 'ghost') {
          var gh = n.ghost;
          var gBanner = renderDetailBanner(gh.kind, gh.head || gh.kind, 'candidate not taken');
          if (rail) mount.appendChild(gBanner);
          else card.appendChild(gBanner);
          if (gh.text && gh.text !== gh.head) {
            var gcode = rail ? el('div', 'hpt-detail-code') : el('div', 'hpt-card-code');
            renderSource(gcode, gh.text);
            if (rail) mount.appendChild(detailSection('Fragment', gcode));
            else card.appendChild(gcode);
          }
          var gverdict = el('div', 'hpt-detail-verdict is-' + gh.verdict,
            (gh.verdict === 'guard' ? 'skipped — ' : 'rejected — ') + (gh.reason || 'did not certify'));
          if (gh.rationale) gverdict.textContent += '\n' + gh.rationale;
          if (rail) mount.appendChild(gverdict);
          else card.appendChild(gverdict);
          return;
        }

        if (n.type === 'stuck') {
          mount.appendChild(renderDetailBanner('stuck', 'stuck', 'no certified move closes this goal'));
          var whereStuck = renderWhereSection(self, n, null);
          if (whereStuck) mount.appendChild(detailSection('Where', whereStuck));
          var focusStuck = renderFocusLine(n.focus);
          if (focusStuck) mount.appendChild(detailSection('Focus', focusStuck));
          renderStateContext(self, mount, n.state || { goal: n.goal }, goalState);
          var altStuck = renderAlternativesTray(n.tried || n.frontier || [], { rail: rail });
          if (altStuck) mount.appendChild(detailSection('Alternatives', altStuck));
          if (!rail) {
            // compact card already has content in mount when not rail - fix: for stuck non-rail, mount is card
          }
          return;
        }

        var st = n.step;
        if (!st) {
          var idleKind = n.type === 'theorem' ? null : (n.kind || n.type);
          var idleLead = n.sub || (n.type === 'arm' ? 'case branch' : '');
          mount.appendChild(renderDetailBanner(idleKind, n.label || '', idleLead));
          if (n.type === 'theorem' && ctx && ctx.na) {
            renderStateContext(self, mount, { goal: ctx.na.goalType }, ctx.na.goalState);
            var snap = ctx.na.theoremSnapshot;
            if (snap && snap.premiseCount) {
              mount.appendChild(detailSection('Structure',
                el('div', 'hpt-detail-theorem-meta', snap.premiseCount + ' premise(s)')));
            }
          } else if (n.type === 'arm' && n.pattern) {
            var pg = el('div', 'hpt-detail-goal');
            renderType(pg, n.pattern);
            mount.appendChild(detailSection('Branch pattern', pg));
          }
          return;
        }

        var meta = st.meta || {};
        var lead = st.lead || deriveMoveLead(st) || st.rationale || n.sub || '';
        mount.appendChild(renderDetailBanner(st.move, n.label || st.move || 'move', lead));
        var where = renderWhereSection(self, n, st);
        if (where) mount.appendChild(detailSection('Where', where));
        var focus = renderFocusLine(st.focus || n.focus);
        if (focus) mount.appendChild(detailSection('Focus', focus));
        renderStateContext(self, mount, n.state || {
          goal: st.goal,
          ctx: st.holeCtx,
          meta: st.holeMeta,
        }, goalState);
        var codeEl = el('div', rail ? 'hpt-detail-code' : 'hpt-card-code');
        renderSource(codeEl, st.text || '');
        mount.appendChild(detailSection('Fragment', codeEl));
        if (st.move === 'synth') {
          var chainEl = renderSynthChain(meta, rail ? 'rail' : 'full');
          if (chainEl) mount.appendChild(detailSection('Chain', chainEl));
        }
        if (st.move === 'split' && meta.armPatterns && meta.armPatterns.length) {
          if (meta.scrutinee) {
            var scrut = el('div', 'hpt-detail-goal');
            renderType(scrut, meta.scrutinee);
            mount.appendChild(detailSection('Scrutinee', scrut));
          }
          var armCount = meta.armPatterns.length;
          var arms = el('ul', 'hpt-detail-arms');
          meta.armPatterns.forEach(function (pat) {
            var li = el('li', 'hpt-detail-arm');
            renderType(li, pat);
            arms.appendChild(li);
          });
          var armsSection = detailSection('Arms (' + armCount + ')', arms);
          // A single-arm case has no choice to make — it just names the one shape
          // the scrutinee can take, i.e. it acts as a `let`/inversion, not a branch.
          if (armCount === 1) {
            var note = el('p', 'hpt-detail-note',
              'One arm — this case only binds the scrutinee’s components (it acts as a let).');
            armsSection.querySelector('.hpt-detail-section-body').appendChild(note);
          }
          mount.appendChild(armsSection);
        }
        var foot = renderDetailMeta(meta, st.checks);
        if (foot) mount.appendChild(foot);
        if (showAlts) {
          var alts = renderAlternativesTray(n.frontier || (n.traceEntry && n.traceEntry.tried) || [], { rail: rail });
          if (alts) mount.appendChild(detailSection('Alternatives', alts));
        }
      };

    return {
      renderDerivationSection: renderDerivationSection,
      mountTreePanel: mountTreePanel,
      openTreeExplorer: openTreeExplorer,
      refreshTreeExplorer: refreshTreeExplorer,
      renderSynthChain: renderSynthChain,
      jumpToTreeHole: jumpToTreeHole,
      renderTreeDetail: renderTreeDetail,
    };
  }

export { createTreeUi as create };
