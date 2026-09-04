/**
 * Solve conveyor / FLIP / working row — peer of `harpoon-lab.mjs`, bundled via `harpoon-ui.mjs`.
 */
const global = globalThis;
function createReel(deps) {
    var el = deps.el;
    var tacticVerb = deps.tacticVerb || function (k) { return k || 'move'; };
    var setTip = deps.setTip;
    var bindStepGoalTip = deps.bindStepGoalTip;
    var bindChipTip = deps.bindChipTip;
    var moveLead = deps.moveLead;
    var appendMoveFacet = deps.appendMoveFacet;
    var renderType = deps.renderType;
    var renderSource = deps.renderSource;
    var nativeAutoSearchLabel = deps.nativeAutoSearchLabel;
    var resolveNativeAutoGoalDisplay = deps.resolveNativeAutoGoalDisplay;
    var priorGoalBinders = deps.priorGoalBinders;
    var mountGoalPriors = deps.mountGoalPriors;
    var E = deps.E;
    var ICON_PLAY = deps.ICON_PLAY;
    var ICON_PAUSE = deps.ICON_PAUSE;

      function appendAutoStepRow(trail, s, i) {
        var item = el('li', 'harpoon-lab-auto-step');
        item.style.setProperty('--i', String(i));
        item.appendChild(el('span', 'harpoon-lab-auto-node'));
        var body = el('div', 'harpoon-lab-auto-step-body');
        var rowCopy = el('div', 'harpoon-lab-auto-step-copy');
        var verb = el('span', 'harpoon-lab-auto-move move-' + (s.move || 'move'));
        verb.textContent = tacticVerb(s.move);
        rowCopy.appendChild(verb);
        rowCopy.appendChild(el('span', 'harpoon-lab-auto-why', moveLead(s)));
        body.appendChild(rowCopy);
        appendMoveFacet(body, s);
        item.appendChild(body);
        bindStepGoalTip(verb, s.goal);
        trail.appendChild(item);
        return item;
      }

      // The live-record stat line ("N checks · Xs") — tooltip on the searching label/spinner.
      function reelStatText(na) {
        var checks = na && na.checks ? na.checks : 0;
        var secs = 0;
        if (na && na.startedAt != null) {
          var now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
          secs = Math.max(0, (now - na.startedAt) / 1000);
        }
        var t = secs < 10 ? secs.toFixed(1) : Math.round(secs);
        return checks + (checks === 1 ? ' check · ' : ' checks · ') + t + 's';
      }

      function syncReelStatTips(session, na) {
        if (!na) return;
        var tip = reelStatText(na);
        // ONE target. Binding the checks·time tooltip to the status TEXT as well
        // meant it fired from most of the band's width, so it read as appearing
        // at random. `_statTipEl` lets a surface nominate the small, stable thing
        // it belongs on — the working glyph.
        var node = session._statTipEl || session._autoSearchSpinner;
        if (!node) return;
        if (node.getAttribute('data-tooltip') === tip) return;
        if (global.Tooltips && global.Tooltips.set) {
          global.Tooltips.set(node, tip, { ariaLabel: false });
        } else if (tip) {
          node.setAttribute('data-tooltip', tip);
        }
      }

      var REEL_TICK_MS = 320;
      var REEL_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
      var REEL_CLICK_EASE = 'cubic-bezier(0.34, 1.22, 0.64, 1)';
      var REEL_OUT_MS = 150;
      var COMMIT_IN_MS = 280;

      function buildStepCopy(step) {
        var rowCopy = el('div', 'harpoon-lab-auto-step-copy');
        var verb = el('span', 'harpoon-lab-auto-move move-' + (step.move || 'move'));
        verb.textContent = tacticVerb(step.move);
        rowCopy.appendChild(verb);
        rowCopy.appendChild(el('span', 'harpoon-lab-auto-why', moveLead(step)));
        return rowCopy;
      }

      function installCommittedRow(row, step, animate) {
        row.classList.remove('is-working', 'is-committing', 'is-selected', 'is-settling', 'is-fresh');

        var conveyor = row.querySelector('.harpoon-conveyor');
        if (conveyor) conveyor.parentNode.removeChild(conveyor);

        var spine = row.querySelector('.harpoon-lab-auto-node');
        if (spine) spine.classList.remove('is-live');
        else row.insertBefore(el('span', 'harpoon-lab-auto-node'), row.firstChild);

        var priorBody = row.querySelector('.harpoon-lab-auto-step-body');
        if (priorBody) priorBody.parentNode.removeChild(priorBody);
        var priorCopy = row.querySelector(':scope > .harpoon-lab-auto-step-copy');
        if (priorCopy) priorCopy.parentNode.removeChild(priorCopy);
        var priorFacet = row.querySelector(':scope > .hpt-move-facet, :scope > .hpt-chain');
        if (priorFacet) priorFacet.parentNode.removeChild(priorFacet);

        var body = el('div', 'harpoon-lab-auto-step-body');
        var copy = buildStepCopy(step);
        if (animate) copy.classList.add('is-reveal');
        body.appendChild(copy);
        appendMoveFacet(body, step);
        row.appendChild(body);
        bindStepGoalTip(copy.querySelector('.harpoon-lab-auto-move'), step.goal);
      }

      function reelMotionOk() {
        if (typeof Persist !== 'undefined' && typeof Persist.prefersReducedMotion === 'function') {
          return !Persist.prefersReducedMotion();
        }
        return !(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
      }

      function reelClearMotion(el) {
        if (!el) return;
        el.style.transition = '';
        el.style.transform = '';
      }

      // FLIP tick: new chip spawns fully off the right edge; the trail shifts left at
      // the same rate so the belt reads as one physical unit.
      function reelAnimateTick(conveyor, newChip, existingEls, oldRects) {
        if (!reelMotionOk() || !newChip) return;
        var dur = REEL_TICK_MS;
        var conveyorRect = conveyor.getBoundingClientRect();
        var chipRect = newChip.getBoundingClientRect();
        var spawnX = conveyorRect.right - chipRect.left + 8;
        newChip.style.transform = 'translateX(' + spawnX + 'px)';

        var i, el, neu, dx;
        for (i = 0; i < existingEls.length; i += 1) {
          el = existingEls[i];
          if (el.classList.contains('is-rejected')) continue;
          neu = el.getBoundingClientRect();
          dx = oldRects[i].left - neu.left;
          if (Math.abs(dx) > 0.5) {
            el.style.transition = 'none';
            el.style.transform = 'translateX(' + dx + 'px)';
          }
        }

        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            var trailTrans = 'transform ' + dur + 'ms ' + REEL_EASE;
            for (i = 0; i < existingEls.length; i += 1) {
              el = existingEls[i];
              if (el.classList.contains('is-rejected')) continue;
              el.style.transition = trailTrans;
              el.style.transform = '';
            }
            newChip.style.transition = 'transform ' + dur + 'ms ' + REEL_CLICK_EASE;
            newChip.style.transform = '';
            var finished = false;
            function done() {
              if (finished) return;
              finished = true;
              for (i = 0; i < existingEls.length; i += 1) {
                if (!existingEls[i].classList.contains('is-rejected')) reelClearMotion(existingEls[i]);
              }
              reelClearMotion(newChip);
              newChip.classList.add('is-landing');
              newChip.addEventListener('animationend', function () {
                newChip.classList.remove('is-landing');
              }, { once: true });
            }
            newChip.addEventListener('transitionend', function (e) {
              if (e.propertyName === 'transform') done();
            });
            setTimeout(done, dur + 48);
          });
        });
      }

      function makeBranchGroup(branch, i) {
        var group = el('li', 'harpoon-lab-auto-branch');
        if (i != null) group.style.setProperty('--i', String(i));
        var caseRow = el('div', 'harpoon-lab-auto-case');
        caseRow.appendChild(el('span', 'harpoon-lab-auto-case-node'));
        var head = el('div', 'harpoon-lab-auto-branch-head');
        var label = el('span', 'harpoon-lab-auto-branch-label', 'case');
        head.appendChild(label);
        var pat = el('code', 'harpoon-lab-auto-branch-pat');
        renderType(pat, branch);
        head.appendChild(pat);
        // Same as move verbs: tip anchors to the keyword alone, not the pattern.
        bindChipTip(label, 'Case pattern; nested steps solve this branch', branch, 'type', 'below');
        caseRow.appendChild(head);
        group.appendChild(caseRow);
        var host = el('ol', 'harpoon-lab-auto-branch-steps');
        group.appendChild(host);
        return { group: group, host: host };
      }

      // Incremental, branch-aware append into the committed record. Mirrors
      // appendAutoTree's grouping (steps under their case-branch pattern) but appends
      // ONE step at a time so the live record never rebuilds. The record element
      // carries its running branch state on `_lastBranch` / `_branchHost`.
      function appendCommittedStepRow(record, s, i) {
        var b = s.branch || null;
        var host = record._branchHost || record;
        if (b !== record._lastBranch) {
          record._lastBranch = b;
          if (b) {
            var made = makeBranchGroup(b, i);
            record.appendChild(made.group);
            host = made.host;
            record._branchHost = host;
          } else {
            host = record;
            record._branchHost = null;
          }
        }
        return appendAutoStepRow(host, s, i);
      }

      // The PROOF TREE trail: steps grouped under the case-branch pattern each was
      // taken in (top-level moves stay flat). A branchy proof reads as its case
      // analysis, not as a wall of moves.
      function appendAutoTree(trail, steps) {
        var lastBranch = null;
        var host = trail;
        steps.forEach(function (s, i) {
          var b = s.branch || null;
          if (b !== lastBranch) {
            lastBranch = b;
            if (b) {
              var made = makeBranchGroup(b, i);
              trail.appendChild(made.group);
              host = made.host;
            } else {
              host = trail;
            }
          }
          appendAutoStepRow(host, s, i);
        });
      }

      function refreshNativeAutoGoalDisplay() {
        var na = this.nativeAuto;
        if (!na || !na.goalType || !this._autoGoalWrap) return;
        if (na.phase === 'solved' || na.complete) return;
        var hero = resolveNativeAutoGoalDisplay(this, na);
        na.goalType = hero.goalType;
        na.goalState = hero.goalState;
        na.priorBinders = priorGoalBinders(this, na.sourceGoalType, hero.goalType);
        var goalHost = this._autoGoalWrap.querySelector('.harpoon-hole-goal');
        var ed = E();
        if (goalHost && ed && typeof ed.mountHoleGoalTier === 'function') {
          ed.mountHoleGoalTier(goalHost, {
            surface: 'lab',
            goalState: hero.goalState,
            goal: hero.goalType,
          });
        }
        mountGoalPriors(this._autoGoalWrap, na.priorBinders);
      };

      function clearNativeAutoShell() {
        if (this.stopReelClock) this.stopReelClock();
        if (this._settleTimer) { clearTimeout(this._settleTimer); this._settleTimer = null; }
        if (this._settleFlush) { this._settleFlush = null; }
        this._autoSearchBox = null;
        this._autoSearchText = null;
        this._autoTrail = null;
        this._autoLiveTree = null;
        this._autoLiveCount = 0;
        this._autoPauseBtn = null;
        this._autoGoalWrap = null;
        this._compromiseBanner = null;
        // Live reel handles
        this._reelRecord = null;      // the committed-steps record (append-only)
        this._reelRecordCount = 0;    // how many steps are already in the record
        this._autoSearchSpinner = null;
        this._workingRow = null;      // the live in-place conveyor row (current hole)
        this._workingStrip = null;    // the conveyor strip inside the working row
        this._workingChips = null;    // [{ kind, head, status, el }] on the conveyor
        this._settleTimer = null;
        this._settleFlush = null;
      };

      function syncAutoPauseBtn() {
        var na = this.nativeAuto;
        var btn = this._autoPauseBtn;
        if (!na || !btn) return;
        var paused = !!na.paused;
        if (btn._belPauseState !== paused) {
          btn._belPauseState = paused;
          btn.innerHTML = paused ? ICON_PLAY : ICON_PAUSE;
          btn.setAttribute('aria-label', paused ? 'Resume search' : 'Pause search');
          if (global.Tooltips && global.Tooltips.set) {
            global.Tooltips.set(btn, paused ? 'Resume' : 'Pause');
          }
        }
        if (this._autoSearchBox) {
          this._autoSearchBox.classList.toggle('is-paused', paused);
        }
      };

      // During search: keep the committed record append-only; the live conveyor is
      // driven event-by-event by feedConveyor/markConveyor/settleWorkingRow. A plain
      // re-render (e.g. goal-tier tick) only needs to re-sync the status line, never
      // rebuild — and must catch up any committed steps that predate this DOM shell.
      function updateNativeAutoSearch() {
        var na = this.nativeAuto;
        if (!na || na.phase !== 'searching') return;
        // A step may be mid-settle (reel out → record in); count is already reserved.
        if (this._reelRecord && this._reelRecord.querySelector('.harpoon-lab-auto-step.is-committing')) {
          this.syncReelStatus();
          this.syncAutoPauseBtn();
          return;
        }
        if (this._reelRecord && this._reelRecordCount < (na.steps || []).length) {
          for (var i = this._reelRecordCount; i < na.steps.length; i += 1) {
            appendCommittedStepRow(this._reelRecord, na.steps[i], i);
          }
          this._reelRecordCount = na.steps.length;
        }
        this.syncLiveContext();
        this.syncReelStatus();
        this.syncAutoPauseBtn();
      };

      /** Refresh the context ledger IN PLACE from the search's latest hole report.
       *
       *  It has to be in place: while Orca runs, `render()` takes the fast path
       *  and returns, so a rebuild never happens — and forcing one per accepted
       *  step is the DOM thrash (and scroll loss) the fast path exists to avoid.
       *  Keyed on the rendered binders so an unchanged context touches nothing;
       *  most steps do not change it. */
      function syncLiveContext() {
        var na = this.nativeAuto;
        if (!na) return;
        var hole = (na.liveHoles && na.liveHoles.length) ? na.liveHoles[0] : null;
        var meta = (hole && hole.meta) || [];
        var ctx = (hole && hole.ctx) || [];
        var key = JSON.stringify([meta, ctx]);
        if (key === this._ctxKey) return;

        // ⛔ DO NOT record the key until the DOM work has actually happened.
        // The first accepted step can land before the first search render has
        // built the Orca band, so the anchor below is briefly null. Recording the
        // key up here meant that call bailed WITHOUT drawing but still marked the
        // context as rendered, and every later call short-circuited on the
        // unchanged key. The band then never appeared until a pause forced a full
        // rebuild — which is exactly "it only shows when I stop it".
        var wrap = this._ctxWrap;
        // ⛔ The band may not EXIST yet, and that is the common case rather than an
        // edge one: it renders only when the focus hole has binders, and a hole
        // with no move made at it has none. So on exactly the proofs where Orca
        // introduces the first binders there was nothing on screen to update, and
        // the context stayed blank until the run ended and a rebuild happened.
        // Create it on first need, drop it when it empties.
        if (!meta.length && !ctx.length) {
          if (wrap && wrap.parentNode) wrap.parentNode.removeChild(wrap);
          this._ctxWrap = null;
          this._ctxKey = key;
          return;
        }
        if (!wrap || !wrap.parentNode) {
          // The Orca band is the stable anchor: the ledger sits directly above it
          // in every branch of renderManual, so inserting before it keeps the same
          // running order without needing the renderer.
          var anchor = this._autoSearchBox;
          if (!anchor || !anchor.parentNode) return;
          wrap = el('div', 'harpoon-lab-context');
          anchor.parentNode.insertBefore(wrap, anchor);
          this._ctxWrap = wrap;
        }
        wrap.textContent = '';
        this.renderCtx(wrap, 'meta', meta);
        this.renderCtx(wrap, 'ctx', ctx);
        this._ctxKey = key;
      }

      // Reflect the search label + checks·time tooltip into the status row.
      function syncReelStatus() {
        var na = this.nativeAuto;
        if (!na) return;
        if (this._autoSearchText) this._autoSearchText.textContent = nativeAutoSearchLabel(na);
        syncReelStatTips(this, na);
        this.syncAutoPauseBtn();
      };

      // Ensure a live WORKING ROW exists at the bottom of the record — the in-place
      // reel for the hole currently being solved. Its copy area is a horizontal
      // CONVEYOR of candidate chips (newest at the right, in focus).
      function ensureWorkingRow() {
        if (!this._reelRecord) return null;
        if (this._workingRow && this._workingRow.isConnected
          && !this._workingRow.classList.contains('is-committing')) {
          return this._workingRow;
        }
        var i = this._reelRecordCount || 0;
        var item = el('li', 'harpoon-lab-auto-step is-working');
        item.style.setProperty('--i', String(i));
        item.appendChild(el('span', 'harpoon-lab-auto-node is-live'));
        var lane = el('div', 'harpoon-conveyor');
        var strip = el('div', 'harpoon-conveyor-strip');
        lane.appendChild(strip);
        item.appendChild(lane);
        // Append into the current branch host so the working row sits in the right
        // case-group, matching where the committed row will land.
        var host = this._reelRecord._branchHost || this._reelRecord;
        host.appendChild(item);
        this._workingRow = item;
        this._workingStrip = strip;
        this._workingChips = [];   // { kind, head, status, el }
        return item;
      };

      // Feed a wave of candidate terms onto the conveyor: each enters at the RIGHT in
      // focus; older chips shift left as one belt; trailing rejects are capped so the
      // strip stays a readable trail, not an unbounded list.
      function feedConveyor(wave) {
        var strip = this.ensureWorkingRow() && this._workingStrip;
        if (!strip) return;
        var conveyor = strip.parentElement;
        var motionOk = reelMotionOk();
        for (var i = 0; i < wave.length; i += 1) {
          var c = wave[i];
          var prev = this._workingChips[this._workingChips.length - 1];
          if (prev && prev.el) {
            prev.el.classList.remove('is-focus');
            prev.el.classList.add('is-trail');
          }
          var existingEls = motionOk ? Array.prototype.slice.call(strip.children) : [];
          var oldRects = motionOk
            ? existingEls.map(function (node) { return node.getBoundingClientRect(); })
            : [];

          var chip = el('div', 'harpoon-conveyor-chip is-trying is-focus move-' + (c.kind || 'move'));
          chip.appendChild(el('span', 'harpoon-conveyor-kind', c.kind || 'move'));
          var term = el('code', 'harpoon-conveyor-term');
          renderSource(term, c.head || '');
          chip.appendChild(term);
          strip.appendChild(chip);
          this._workingChips.push({ kind: c.kind, head: c.head, status: 'trying', el: chip });

          if (motionOk) reelAnimateTick(conveyor, chip, existingEls, oldRects);
        }
        this.trimConveyor();
      };

      // Mark the conveyor chip matching a verdict (kind+head) won/rejected.
      function markConveyor(v) {
        var na = this.nativeAuto;
        var chips = this._workingChips || [];
        var entry = null;
        for (var i = chips.length - 1; i >= 0; i -= 1) {
          if (chips[i].status === 'trying' && chips[i].kind === v.kind && chips[i].head === v.head) { entry = chips[i]; break; }
        }
        if (!entry) {
          // A guard-skipped candidate never entered as a wave chip — add it so the
          // rejection is still visible, then mark it.
          this.feedConveyor([{ kind: v.kind, head: v.head }]);
          entry = this._workingChips[this._workingChips.length - 1];
        }
        if (!entry && v.verdict === 'accepted') {
          // Split-prune can change effText so the accepted head no longer matches the
          // wave chip — fall back to the chip currently in focus for this kind.
          for (var j = chips.length - 1; j >= 0; j -= 1) {
            var trail = chips[j];
            if (trail.status === 'trying' && trail.kind === v.kind
              && trail.el && trail.el.classList.contains('is-focus')) {
              entry = trail;
              break;
            }
          }
        }
        if (!entry || !entry.el) return;
        entry.status = v.verdict === 'accepted' ? 'won' : 'rejected';
        entry.reason = v.reason || null;
        entry.el.classList.remove('is-trying', 'is-focus', 'is-trail');
        entry.el.classList.toggle('is-won', entry.status === 'won');
        entry.el.classList.toggle('is-rejected', entry.status === 'rejected');
        if (entry.status === 'rejected') {
          if (entry.reason) setTip(entry.el, entry.reason, { ariaLabel: false });
          if (na) na.checks = (na.checks || 0) + 1;
        }
      };

      // Cap the number of visible trailing (resolved) chips so the strip reads as a
      // short trail; the focus chip and a few recent rejects stay, older ones drop.
      function trimConveyor() {
        var MAX = 6;
        var chips = this._workingChips || [];
        var motionOk = reelMotionOk();
        while (chips.length > MAX) {
          var old = chips.shift();
          if (!old || !old.el || !old.el.parentNode) continue;
          var node = old.el;
          if (motionOk) {
            node.style.transition = 'transform 220ms ' + REEL_EASE + ', opacity 220ms ease';
            node.style.transform = 'translateX(-1.4rem)';
            node.style.opacity = '0';
            setTimeout(function (n) {
              if (n.parentNode) n.parentNode.removeChild(n);
              reelClearMotion(n);
            }, 230, node);
          } else {
            node.parentNode.removeChild(node);
          }
        }
      };

      // Working row → committed row: reel fades out, then record copy scales in.
      function settleWorkingRow(step, i) {
        var row = this._workingRow;
        if (!row || !row.isConnected) {
          appendCommittedStepRow(this._reelRecord, step, i);
          this._reelRecordCount = Math.max(this._reelRecordCount, i + 1);
          return;
        }
        var self = this;
        if (this._settleTimer) {
          clearTimeout(this._settleTimer);
          this._settleTimer = null;
          if (this._settleFlush) {
            this._settleFlush();
            this._settleFlush = null;
          }
        }
        var motionOk = reelMotionOk();
        this._reelRecordCount = Math.max(this._reelRecordCount, i + 1);
        // Next pulse must open a fresh working row, not feed this committing one.
        this._workingRow = null;
        this._workingStrip = null;
        this._workingChips = [];

        function finish() {
          self._settleTimer = null;
          self._settleFlush = null;
          if (!row.isConnected) return;
          installCommittedRow(row, step, motionOk);
          var b = step.branch || null;
          if (b !== self._reelRecord._lastBranch) {
            self._reelRecord._lastBranch = b;
            self._reelRecord._branchHost = b ? self._makeBranchGroup(b, i) : null;
          }
          self.refreshTreeExplorer();
        }

        this._settleFlush = finish;
        if (motionOk) {
          var spine = row.querySelector('.harpoon-lab-auto-node');
          if (spine) spine.classList.remove('is-live');
          row.classList.add('is-committing');
          this._settleTimer = setTimeout(finish, REEL_OUT_MS);
        } else {
          finish();
        }
      };

      // Create a case-branch group in the record and return its inner <ol> host.
      function _makeBranchGroup(branch, i) {
        var made = makeBranchGroup(branch, i);
        this._reelRecord.appendChild(made.group);
        return made.host;
      };

      // A light clock refreshing the status label + tooltip while searching.
      function startReelClock() {
        var self = this;
        this.stopReelClock();
        this._reelClock = setInterval(function () {
          var na = self.nativeAuto;
          if (!na || na.phase !== 'searching') { self.stopReelClock(); return; }
          if (self._autoSearchText) self._autoSearchText.textContent = nativeAutoSearchLabel(na);
          syncReelStatTips(self, na);
        }, 200);
      };
      function stopReelClock() {
        if (this._reelClock) { clearInterval(this._reelClock); this._reelClock = null; }
      };

    return {
      appendAutoStepRow: appendAutoStepRow,
      reelStatText: reelStatText,
      syncReelStatTips: syncReelStatTips,
      buildStepCopy: buildStepCopy,
      installCommittedRow: installCommittedRow,
      reelMotionOk: reelMotionOk,
      reelClearMotion: reelClearMotion,
      reelAnimateTick: reelAnimateTick,
      makeBranchGroup: makeBranchGroup,
      appendCommittedStepRow: appendCommittedStepRow,
      appendAutoTree: appendAutoTree,
      refreshNativeAutoGoalDisplay: refreshNativeAutoGoalDisplay,
      clearNativeAutoShell: clearNativeAutoShell,
      syncAutoPauseBtn: syncAutoPauseBtn,
      updateNativeAutoSearch: updateNativeAutoSearch,
      syncLiveContext: syncLiveContext,
      syncReelStatus: syncReelStatus,
      ensureWorkingRow: ensureWorkingRow,
      feedConveyor: feedConveyor,
      markConveyor: markConveyor,
      trimConveyor: trimConveyor,
      settleWorkingRow: settleWorkingRow,
      _makeBranchGroup: _makeBranchGroup,
      startReelClock: startReelClock,
      stopReelClock: stopReelClock,
    };
  }

export { createReel as create };
