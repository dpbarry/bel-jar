/**
 * renderNativeAuto Acts + stuck card — peer of `harpoon-lab.mjs`, bundled via `harpoon-ui.mjs`.
 */
function createAuto(deps) {
    var el = deps.el;
    var iconBtn = deps.iconBtn;
    var setTip = deps.setTip;
    var renderType = deps.renderType;
    var renderSource = deps.renderSource;
    var nativeAutoSearchLabel = deps.nativeAutoSearchLabel;
    var autoSubtext = deps.autoSubtext;
    var autoVerdictTitle = deps.autoVerdictTitle;
    var autoVerdictTone = deps.autoVerdictTone;
    var appendAutoGoalHero = deps.appendAutoGoalHero;
    var resolveNativeAutoGoalDisplay = deps.resolveNativeAutoGoalDisplay;
    var priorGoalBinders = deps.priorGoalBinders;
    var setNativeSearchLabel = deps.setNativeSearchLabel;
    var appendCommittedStepRow = deps.appendCommittedStepRow;
    var solvedBodyOf = deps.solvedBodyOf;
    var buildBannerShell = deps.buildBannerShell;
    var stageNode = deps.stageNode;
    var appendAutoSolution = deps.appendAutoSolution;
    var buildPlaceStrip = deps.buildPlaceStrip;
    var renderCommitOutcome = deps.renderCommitOutcome;
    var ICON_PLAY = deps.ICON_PLAY;
    var ICON_PAUSE = deps.ICON_PAUSE;
    var ICON_POPOUT = deps.ICON_POPOUT;
    var ICON_CHECK = deps.ICON_CHECK;
    var ICON_STOP = deps.ICON_STOP;
    var ICON_CHEVRON_LEFT = deps.ICON_CHEVRON_LEFT;

      // The auto-solve panel — search → reveal → place.
      function renderNativeAuto(parent) {
        var na = this.nativeAuto;
        if (!na) return;
        var self = this;
        var box = el('div', 'harpoon-lab-auto is-' + na.phase + (na.paused ? ' is-paused' : '')
          + (self.isFrozenRetrospective() ? ' is-frozen' : ''));
        var stage = 0;

        if (na.goalType) {
          var hero = resolveNativeAutoGoalDisplay(self, na);
          var heroPriors = hero.goalType === na.goalType
            ? na.priorBinders
            : priorGoalBinders(self, na.sourceGoalType, hero.goalType);
          this._autoGoalWrap = appendAutoGoalHero(
            box, hero.goalType, na.declName, hero.goalState, heroPriors);
        }
        // Beneath the goal, with the other banners — same rule as the manual
        // surface, now that position follows call order.
        if (!self.isFrozenRetrospective()) this.renderCompromiseBanner(box);

        // ── Act I — searching. Goal stays visible; status line + pause/resume only. */
        if (na.phase === 'searching') {
          var controls = el('div', 'harpoon-lab-auto-controls');
          var searching = el('div', 'harpoon-lab-auto-searching');
          var spinnerEl = el('span', 'inspector-spinner harpoon-lab-auto-searching-spinner');
          spinnerEl.setAttribute('aria-hidden', 'true');
          var searchTextEl = el(
            'span',
            'harpoon-lab-auto-searching-text beljar-tip-shimmer',
            nativeAutoSearchLabel(na)
          );
          searchTextEl.style.setProperty('--shimmer-accent', 'var(--repl-holes-accent)');
          searching.appendChild(spinnerEl);
          searching.appendChild(searchTextEl);
          controls.appendChild(searching);
          var pauseBtn = iconBtn(
            'icon-btn harpoon-lab-auto-pause',
            na.paused ? ICON_PLAY : ICON_PAUSE,
            na.paused ? 'Resume search' : 'Pause search',
            na.paused ? 'Resume' : 'Pause',
            function () {
              if (!self.nativeAuto || self.nativeAuto.phase !== 'searching') return;
              self.nativeAuto.paused = !self.nativeAuto.paused;
              if (self.nativeAuto.paused) {
                setNativeSearchLabel(self.nativeAuto, 'Paused');
              } else {
                setNativeSearchLabel(self.nativeAuto, 'Resuming…');
              }
              self.updateNativeAutoSearch();
            },
          );
          controls.appendChild(pauseBtn);
          // Pop out the derivation TREE while solving — it grows live as steps settle.
          // The reel stays the panel's default; the tree is opt-in, same as the proved
          // view. (Reuses the exact explorer; openTreeExplorer detects the live phase.)
          var livePop = iconBtn(
            'icon-btn harpoon-lab-auto-popout',
            ICON_POPOUT,
            'Open the proof tree explorer (grows live)',
            'Pop out tree',
            function () { self.openTreeExplorer(); },
          );
          controls.appendChild(livePop);
          box.appendChild(controls);

          // The live surface: ONE record. Committed steps are static rows; the hole
          // being solved is a live WORKING ROW whose copy area is an in-place conveyor
          // of candidate moves. When a move is accepted the working row morphs into the
          // committed row and the next hole's working row opens below it.
          var live = el('div', 'harpoon-reel');
          var record = el('ol', 'harpoon-lab-auto-trail harpoon-reel-record is-live');
          live.appendChild(record);
          box.appendChild(live);

          this._autoSearchBox = box;
          this._autoSearchText = searchTextEl;
          this._autoSearchSpinner = spinnerEl;
          this._autoTrail = null;
          this._autoLiveTree = null;
          this._autoLiveCount = 0;
          this._autoPauseBtn = pauseBtn;
          this._reelRecord = record;
          this._reelRecordCount = 0;
          this._workingRow = null;
          this._workingStrip = null;
          this._workingChips = [];
          record._lastBranch = null;
          record._branchHost = null;
          pauseBtn._belPauseState = !!na.paused;
          parent.appendChild(box);
          // Replay any steps already accepted before this render into the record.
          for (var si = 0; si < (na.steps || []).length; si += 1) {
            appendCommittedStepRow(record, na.steps[si], si);
          }
          this._reelRecordCount = (na.steps || []).length;
          this.syncReelStatus();
          // Tick the elapsed-time readout while searching.
          this.startReelClock();
          return;
        }

        if (na.complete) {
          var solutionBody = solvedBodyOf(na.code, na.declName || (this.prep && this.prep.name));
        }

        // ── Verdict — proven / stopped (below goal, above solution). */
        var sub = autoSubtext(na);
        var head = buildBannerShell({
          className: 'harpoon-lab-auto-head harpoon-lab-strip harpoon-lab-banner '
            + (na.complete ? 'is-solved' : 'is-stuck')
            + (self._verdictPopPlayed ? ' is-verdict-seen' : ''),
          tone: autoVerdictTone(na),
          icon: na.complete ? ICON_CHECK : ICON_STOP,
          badgeClass: 'harpoon-lab-auto-badge' + (na.complete ? ' is-solved' : ' is-stuck'),
          copyClass: 'harpoon-lab-auto-head-copy',
          titleClass: 'harpoon-lab-auto-title',
          subClass: 'harpoon-lab-auto-sub',
          title: autoVerdictTitle(na),
          sub: sub,
        });
        stageNode(head, stage);
        stage += 1;
        box.appendChild(head);
        if (na.complete) self._verdictPopPlayed = true;

        // ── The STUCK card (diagnostic): the open goal + every candidate the search
        //    tried at that hole with the checker's objection. This card should never
        //    need to show; when it does, it tells you what to fix. */
        if (!na.complete && na.stuck && na.stuck.goal) {
          var stuckCard = this.renderStuckCard(na);
          stageNode(stuckCard, stage);
          stage += 1;
          box.appendChild(stuckCard);
        }
        // ── File errors: the search never had a checkable program — show the error. */
        if (!na.complete && na.stuck && na.stuck.reason === 'file-errors' && na.stuck.error) {
          var errWrap = el('div', 'harpoon-lab-auto-stuck harpoon-lab-auto-panel tone-error');
          errWrap.appendChild(el('span', 'harpoon-lab-auto-stuck-label', 'Checker error'));
          errWrap.appendChild(el('div', 'harpoon-lab-auto-stuck-goal', na.stuck.error));
          stageNode(errWrap, stage);
          stage += 1;
          box.appendChild(errWrap);
        }

        // ── Back to hand-proving. Brutus is a TACTIC inside the manual session,
        //    so its result must be returnable — a stalled search hands its partial
        //    derivation back instead of dead-ending, and a solved one can still be
        //    inspected by hand before placing. Only shown when we came from manual. */
        if (this.manual && !self.isFrozenRetrospective()) {
          var backStrip = buildBannerShell({
            tag: 'button',
            className: 'harpoon-lab-resume harpoon-lab-strip harpoon-lab-banner',
            tone: na.complete ? 'goal' : 'action',
            icon: ICON_CHEVRON_LEFT,
            badgeClass: 'harpoon-lab-resume-badge',
            titleClass: 'harpoon-lab-resume-title',
            subClass: 'harpoon-lab-resume-sub',
            title: na.complete ? 'Take it back by hand' : 'Continue by hand',
            sub: na.complete
              ? 'Review the steps, or undo before placing'
              : ((na.steps && na.steps.length)
                ? 'Keep the ' + na.steps.length + ' step' + (na.steps.length === 1 ? '' : 's')
                  + ' Brutus found and carry on'
                : 'Pick the next move yourself'),
            onClick: function () { self.backToManual(); },
          });
          stageNode(backStrip, stage);
          stage += 1;
          box.appendChild(backStrip);
        }

        // ── Place the solution (deferred commit). */
        if (na.complete) {
          var commit = self.getCommitState();
          if (commit.status === 'failed' || (commit.status === 'placed' && !commit.dismissed)) {
            stageNode(
              renderCommitOutcome(box, commit, na.declName || (self.prep && self.prep.name),
                commit.canRetry ? function () { self.resetCommitForRetry(); } : null),
              stage
            );
            stage += 1;
          } else if (commit.status !== 'placed') {
            var blocked = self.compromise && self.compromise.level === 'block';
            var place = buildPlaceStrip(self, {
              blocked: blocked,
              extraCls: ' harpoon-lab-auto-place is-instant',
              title: 'Place the proof',
              onClick: function () { self.commitNativeAuto(); },
            });
            stageNode(place, stage);
            stage += 1;
            box.appendChild(place);
            if (commit.status === 'checking') self.updateCommitPlace();
          }
          if (solutionBody) {
            stageNode(appendAutoSolution(box, solutionBody), stage);
            stage += 1;
          }
        }

        // ── Derivation — LIST (default) ⇄ TREE, with a pop-out to the full explorer. */
        var steps = na.steps || [];
        if (steps.length) {
          var derivSection = this.renderDerivationSection(box, na);
          stageNode(derivSection, stage);
          box.appendChild(derivSection);
          stage += 1;
        }

        parent.appendChild(box);
      };

      // Short location for the stuck hole — the anchor for "where it went wrong".
      function stuckWhere(stuck) {
        if (!stuck) return '';
        var h = stuck.hole || null;
        if (h && h.name) return h.name;
        if (h && typeof h.line === 'number') return 'line ' + (h.line + 1) + (typeof h.col === 'number' ? ':' + (h.col + 1) : '');
        return '';
      }

      // Trim a checker objection down to the signal: drop the internal trial-splice
      // location prefix (`File "input.bel", line N, column M `) and the redundant
      // `Error:` label — the coordinates are into the throwaway splice, not the user's
      // file, so they're noise on this card. Keep the actual message.
      function stuckReason(reason) {
        if (!reason) return '';
        return String(reason)
          .replace(/^File\s+"[^"]*",\s*line\s+\d+,\s*column\s+\d+\s*/i, '')
          .replace(/^Error:\s*/i, '')
          .trim();
      }

      // A one-word tag for why the search halted — terse, diagnostic.
      var STUCK_REASON = {
        'no-move': 'no move certified',
        'step-bound': 'step limit',
        'search-bound': 'search bound hit',
        'file-errors': 'file errors',
        'coinductive-out-of-fragment': 'coinductive goal — out of fragment',
        'no-totality-measure': 'no totality measure — recursion unavailable',
        stopped: 'stopped',
        cancelled: 'cancelled',
      };

      // The STUCK card. This card should never need to show — a complete solve replaces
      // it. When it DOES show, it is a debugging surface: what the search reached and
      // exactly why every candidate at that hole failed. No consolation copy — the open
      // goal, and each tried move with the checker's own objection. Data is the engine's
      // (na.stuck + the trace's non-advanced entry); nothing is recomputed.
      function renderStuckCard(na) {
        var stuck = na.stuck;
        var card = el('div', 'harpoon-lab-auto-stuck harpoon-lab-auto-panel tone-warn harpoon-stuck');

        // Header: the reason + where. The "went wrong" anchor.
        var head = el('div', 'harpoon-stuck-head');
        head.appendChild(el('span', 'harpoon-lab-auto-stuck-label', STUCK_REASON[stuck.reason] || stuck.reason || 'stuck'));
        var where = stuckWhere(stuck);
        if (where) head.appendChild(el('code', 'harpoon-stuck-where', where));
        card.appendChild(head);

        // The open goal — the type nothing inhabited.
        if (stuck.goal) {
          var goal = el('div', 'harpoon-hole-goal harpoon-lab-auto-stuck-goal');
          renderType(goal, stuck.goal);
          card.appendChild(goal);
        }

        // The tried candidates for the stuck hole — the trace's non-advanced entry.
        var stuckTrace = null;
        var trace = na.trace || null;
        if (trace) {
          for (var t = 0; t < trace.length; t += 1) {
            if (!trace[t].advanced) stuckTrace = trace[t];
          }
        }
        var tried = (stuckTrace && stuckTrace.tried) || [];
        // Rejected (reached the checker, has an objection) FIRST — the real signal —
        // then guard-skipped (pre-filtered, never checked) as muted completeness.
        var rejected = tried.filter(function (v) { return v.verdict === 'rejected'; });
        var guarded = tried.filter(function (v) { return v.verdict === 'guard'; });

        if (rejected.length || guarded.length) {
          card.appendChild(el('div', 'harpoon-stuck-sub',
            rejected.length + ' rejected by the checker'
            + (guarded.length ? ' · ' + guarded.length + ' skipped' : '')));
          var list = el('ul', 'harpoon-stuck-tried');
          var addRow = function (v) {
            var li = el('li', 'harpoon-stuck-tried-row is-' + v.verdict);
            li.appendChild(el('span', 'hpt-card-kind hpt-kind--' + v.kind, v.kind));
            var hd = el('code', 'harpoon-stuck-tried-head');
            renderSource(hd, v.head);
            li.appendChild(hd);
            var reason = stuckReason(v.reason);
            if (reason) {
              var rn = el('span', 'harpoon-stuck-tried-reason', reason);
              setTip(rn, v.reason, { ariaLabel: false });
              li.appendChild(rn);
            }
            list.appendChild(li);
          };
          rejected.forEach(addRow);
          guarded.forEach(addRow);
          card.appendChild(list);
        } else if (stuck.reason === 'no-move') {
          // No trace (collectTrace off) — say so plainly rather than imply nothing tried.
          card.appendChild(el('div', 'harpoon-stuck-sub', 'no candidate reached this goal'));
        }
        return card;
      };

    return {
      renderNativeAuto: renderNativeAuto,
      stuckWhere: stuckWhere,
      stuckReason: stuckReason,
      renderStuckCard: renderStuckCard,
    };
  }

export { createAuto as create };
