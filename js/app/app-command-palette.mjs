/**
 * Command behaviour + palette providers — injected into app.js.
 *
 * Titles, sections, chords and style policy live in `js/commands/command-catalog.mjs`.
 * This file wires the *actions* onto those ids: nothing here should restate a
 * title, and a new command's metadata belongs in the catalogue, not below.
 */
import { Commands } from '../commands/command-registry.mjs';
import { SETTINGS, settingId, applyValue, runSetOn } from '../commands/command-settings.mjs';

  export function create(deps) {
    var getPersist = deps.getPersist;
    var toggleSidePanel = deps.toggleSidePanel;
    var toggleTheme = deps.toggleTheme;
    var newProject = deps.newProject;
    var newFile = deps.newFile;
    var fileInputEl = deps.fileInputEl;
    var uploadFolderInputEl = deps.uploadFolderInputEl;
    var folderInputEl = deps.folderInputEl;
    var downloadCurrentFile = deps.downloadCurrentFile;
    var editorExec = deps.editorExec;
    var moduleNameFor = deps.moduleNameFor;
    var signatureFileCount = deps.signatureFileCount;
    var switchToFile = deps.switchToFile;
    var openFileAt = deps.openFileAt;
    var projectFileText = deps.projectFileText;
    var closeFile = deps.closeFile;
    var closeTabsForFiles = deps.closeTabsForFiles;
    var activeSuiteMembership = deps.activeSuiteMembership;
    var afterSuiteEdit = deps.afterSuiteEdit;

    {
      CommandPalette.init();
      const on = (id, run, when) => Commands.attach(id, when ? { run, when } : { run });

      const say = (text) => {
        if (typeof StatusStrip !== 'undefined' && StatusStrip.setMessage) StatusStrip.setMessage(text);
      };

      /** Re-apply after a preference write, so the change lands now, not on reload. */
      const reapplyPrefs = () => {
        if (typeof Persist.applyStoredEditorChrome === 'function') Persist.applyStoredEditorChrome();
        if (typeof BelEditor !== 'undefined' && BelEditor.applyEditorPrefs) BelEditor.applyEditorPrefs();
      };

      /** A `set.*` chord or palette row: toggle a boolean, cycle an enum. */
      const toggleSetting = (spec) => {
        const res = applyValue(Persist, spec, undefined);
        if (res.applied) reapplyPrefs();
        say(res.message);
        return res.ok;
      };

      /** `:set nu` · `:set nolist` · `:set ts=4`, from the bar or from Vim. */
      const runSet = (argText) => {
        const res = runSetOn(Persist, argText);
        if (res.applied) reapplyPrefs();
        say(res.message);
        return res.ok;
      };
      Commands.runSet = runSet;

      // Editor-scope commands reach the editor across the shell seam, never by
      // import. `when` doubles as the has-a-file gate, so they disappear from
      // the palette instead of failing silently when nothing is open.
      const currentEditor = () => window.CurrentEditor;
      const onEditor = (id, fn, ready) => Commands.attach(id, {
        run: () => {
          const e = currentEditor();
          if (!e) return false;
          if (typeof e.focus === 'function') e.focus();
          return fn(e);
        },
        when: () => {
          const e = currentEditor();
          if (!e) return false;
          return ready ? !!ready(e) : true;
        },
      });

      // A hole under the caret is what makes a prover move meaningful.
      const holeAtCaret = (e) => (typeof e.holeAtCursor === 'function' ? e.holeAtCursor() : null);

      const caretHead = (e) => {
        const view = typeof e.getView === 'function' ? e.getView() : null;
        return view ? view.state.selection.main.head : null;
      };

      const openTabIds = () => {
        if (typeof Persist.getOpenFileIds !== 'function') return [];
        return Persist.getOpenFileIds() || [];
      };

      const stepTab = (delta) => {
        const ids = openTabIds();
        if (ids.length < 2) return false;
        const current = getPersist() ? getPersist().getCurrentFileId() : null;
        const at = ids.indexOf(current);
        const next = ids[((at < 0 ? 0 : at + delta) % ids.length + ids.length) % ids.length];
        if (!next || next === current) return false;
        switchToFile(next);
        return true;
      };

      on('project.new', () => newProject());
      on('file.new', () => newFile());
      on('file.upload', () => fileInputEl.click());
      on('file.upload-folder', () => uploadFolderInputEl.click());
      on('file.import-folder', () => folderInputEl.click());
      on('file.download', downloadCurrentFile);
      on('tab.next', () => stepTab(1), () => openTabIds().length > 1);
      on('tab.prev', () => stepTab(-1), () => openTabIds().length > 1);
      on(
        'tab.close',
        () => {
          const id = getPersist() ? getPersist().getCurrentFileId() : null;
          if (!id) return false;
          closeFile(id);
          return true;
        },
        () => !!(getPersist() && getPersist().getCurrentFileId())
      );

      // Tabs to the right of the active one, in tab order.
      const tabsRightOf = () => {
        const ids = openTabIds();
        const at = ids.indexOf(getPersist() ? getPersist().getCurrentFileId() : null);
        return at < 0 ? [] : ids.slice(at + 1);
      };
      const otherTabs = () => {
        const current = getPersist() ? getPersist().getCurrentFileId() : null;
        return openTabIds().filter((id) => id !== current);
      };
      on('tab.close-others', () => { closeTabsForFiles(otherTabs()); return true; },
        () => otherTabs().length > 0);
      on('tab.close-right', () => { closeTabsForFiles(tabsRightOf()); return true; },
        () => tabsRightOf().length > 0);

      // `:w`. The autosave debounce is the only thing between an edit and disk,
      // so saving now means flushing it — and `flushCheckpoint` pulls the live
      // text through the same format/trim transforms the debounced save runs.
      on('file.save', () => {
        const p = getPersist();
        if (!p || typeof p.flushCheckpoint !== 'function') return false;
        p.flushCheckpoint();
        const file = Persist.getFileById ? Persist.getFileById(p.getCurrentFileId()) : null;
        say(file && file.name ? 'Saved ' + file.name : 'Saved.');
        return true;
      }, () => !!(getPersist() && getPersist().getCurrentFileId()
        && typeof getPersist().flushCheckpoint === 'function'));

      // `:e name` — by exact name first, then by basename, so `:e util.bel`
      // works without typing the folder.
      on('file.open', (ctx) => {
        const wanted = String((ctx && ctx.argText) || '').trim();
        if (!wanted) { say('Usage: :e <file>'); return false; }
        const files = Persist.listFiles() || [];
        const lower = wanted.toLowerCase();
        const base = (n) => n.slice(n.lastIndexOf('/') + 1).toLowerCase();
        const hit = files.find((f) => f.name.toLowerCase() === lower)
          || files.find((f) => base(f.name) === lower)
          || files.find((f) => f.name.toLowerCase().indexOf(lower) >= 0);
        if (!hit) { say(`No file matching "${wanted}".`); return false; }
        switchToFile(hit.id);
        return true;
      });

      // ── suite membership ──────────────────────────────────────────────────
      // `activeSuiteMembership` answers for the ACTIVE file: which suite owns
      // its directory, and whether the file is already listed.
      const membership = () => {
        const id = getPersist() ? getPersist().getCurrentFileId() : null;
        const file = id && Persist.getFileById ? Persist.getFileById(id) : null;
        if (!file || !file.name || !activeSuiteMembership) return null;
        const m = activeSuiteMembership(file.name);
        return m && m.cfg ? { ...m, file } : null;
      };
      const editSuite = (add) => {
        const m = membership();
        if (!m) return false;
        const dir = ProjectSource.dirOf(m.file.name);
        if (add) Persist.addEntryToCfg(m.cfg, m.file.name);
        else Persist.removeEntryFromCfg(m.cfg, m.file.name);
        afterSuiteEdit(dir, m.cfg);
        const cfgName = m.cfg.slice(m.cfg.lastIndexOf('/') + 1);
        say((add ? 'Added to ' : 'Removed from ') + cfgName);
        return true;
      };
      on('suite.add-file', () => editSuite(true), () => {
        const m = membership();
        return !!m && !m.member;
      });
      on('suite.remove-file', () => editSuite(false), () => {
        const m = membership();
        return !!m && m.member;
      });

      on('edit.undo', () => editorExec('undo'));
      on('edit.redo', () => editorExec('redo'));
      on('edit.find', () => editorExec('openSearch'));
      on('edit.search-project', () => CommandPalette.open({ mode: 'search' }));
      on('edit.toggle-comment', () => editorExec('toggleComment'));
      on('edit.format', () => editorExec('format'));
      onEditor('edit.rename', (e) => e.rename());
      onEditor('edit.select-all', (e) => e.selectAll());

      on('nav.symbol', () => CommandPalette.open({ mode: 'symbols' }));
      onEditor('nav.definition', (e) => e.goToDefinition());
      onEditor('nav.references', (e) => e.findReferences());
      onEditor('nav.enclosing-decl', (e) => {
        const head = caretHead(e);
        if (head == null) return false;
        const span = e.getDeclSpan(head);
        if (!span) return false;
        return e.jumpToRange({ from: span.from, to: span.from });
      });
      onEditor('nav.binder', (e) => e.revealBinder());
      onEditor('nav.inspector', (e) => e.revealInInspector());
      onEditor('nav.next-hole', (e) => e.cycleHole(1));
      onEditor('nav.prev-hole', (e) => e.cycleHole(-1));
      onEditor('nav.next-problem', (e) => e.jumpToNextError());
      onEditor('nav.prev-problem', (e) => e.jumpToPrevError());

      onEditor('prover.hole-intro', (e) => e.runHoleIntro(), holeAtCaret);
      onEditor('prover.hole-split', (e) => e.runHoleSplit(), holeAtCaret);
      onEditor('prover.hole-fill', (e) => e.runHoleFill(), holeAtCaret);
      onEditor('prover.open-in-harpoon', (e) => e.openHoleInHarpoon(), holeAtCaret);

      // ── driving the Harpoon lab ───────────────────────────────────────────
      // The lab is a shell surface, so these attach here rather than in
      // `editor-commands.mjs`. Every one resolves the session the user is
      // looking at on each run — a lab can be closed and reopened between two
      // presses of the same chord.
      const lab = () => {
        const H = window.Harpoon;
        return H && typeof H.activeSession === 'function' ? H.activeSession() : null;
      };
      const manualState = () => {
        const s = lab();
        return (s && s.manual && s.manual.state) || null;
      };
      /** `when` for a lab command: available only while a lab is actually open. */
      const onLab = (id, fn, ready) => Commands.attach(id, {
        run: () => {
          const s = lab();
          if (!s) return false;
          return fn(s) !== false;
        },
        when: () => {
          const s = lab();
          return !!s && (!ready || ready(s));
        },
      });

      // Focus moves between the OPEN goals of the current proof, wrapping. With
      // one goal there is nothing to move to, so the rows hide.
      const stepGoal = (delta) => (s) => {
        const st = s.manual && s.manual.state;
        if (!st || !st.holes || st.holes.length < 2) return false;
        const n = st.holes.length;
        s.manualFocus(((st.focusIdx < 0 ? 0 : st.focusIdx) + delta + n) % n);
        return true;
      };
      const manyGoals = (s) => {
        const st = s.manual && s.manual.state;
        return !!st && !!st.holes && st.holes.length > 1;
      };
      onLab('harpoon.next-goal', stepGoal(1), manyGoals);
      onLab('harpoon.prev-goal', stepGoal(-1), manyGoals);

      const editorApi = () => window.BelEditor || null;
      const canUndoMove = (s) => {
        const E = editorApi();
        const st = s.manual && s.manual.state;
        return !!(E && st && typeof E.manualCanUndo === 'function' && E.manualCanUndo(st));
      };
      const canRedoMove = (s) => {
        const E = editorApi();
        const st = s.manual && s.manual.state;
        return !!(E && st && typeof E.manualCanRedo === 'function' && E.manualCanRedo(st));
      };
      onLab('harpoon.undo-move', (s) => { s.manualStepBack(); return true; }, canUndoMove);
      onLab('harpoon.redo-move', (s) => { s.manualStepForward(); return true; }, canRedoMove);

      // Orca is a STATE of the lab, not a second screen: start it on the goal
      // in front of you, pause it, or take over from where it got to.
      const searching = (s) => !!s.nativeAuto;
      onLab('harpoon.orca-start', (s) => { s.runOrca(); return true; },
        (s) => !s.nativeAuto && !!(s.manual && s.manual.state));
      onLab('harpoon.orca-pause', (s) => { s.toggleOrcaPause(); return true; }, searching);
      onLab('harpoon.orca-absorb', (s) => { s.backToManual(); return true; }, searching);

      // Preferences: one attach per generated `set.*` command, plus the one
      // command line verb that reaches all of them by name.
      for (const spec of SETTINGS) {
        on(settingId(spec.slug), () => toggleSetting(spec));
      }
      on('settings.set', (ctx) => runSet(ctx && ctx.argText));

      on('cmdline.open', () => StatusStrip.openCommandLine(''));
      on('keys.full-keyboard', () => { FullKeyboard.toggle(); return true; },
        () => FullKeyboard.isSupported());
      on('keys.macros', () => AvailableMacros.open());
      // `@:` — the command line's own repeat, without reopening it.
      on('cmdline.repeat', () => StatusStrip.repeatLastCommand(),
        () => !!(typeof StatusStrip !== 'undefined' && StatusStrip.lastCommandLine
          && StatusStrip.lastCommandLine()));
      on('tools.palette', () => CommandPalette.open());
      // These three ship a chord that another layer handles — CodeMirror's
      // keymap for Ctrl-Space, the palette's own opener for Mod+K. Without a
      // `run` the chord worked but `M-x`, the palette and the line could not
      // reach the same act.
      on('nav.anywhere', () => CommandPalette.open());
      // ⚠ Through the SAME resolver the global chord uses, so `M-x`, `:tools…`
      // and the palette row cannot open different windows. See `runCommandEntry`.
      on('tools.commands', () => CommandPalette.runCommandEntry());
      onEditor('edit.autocomplete', (e) => e.toggleAutocomplete() !== false);
      on('tools.graph', () => window.CurrentEditor?.openDependencyGraph());
      on('tools.inspector', () => window.dispatchEvent(new Event('beljar:open-inspector')));

      // The Run button's resolution, shared so the status segment and the button
      // can never drift into meaning different things.
      const runDefault = () => {
        const id = getPersist() ? getPersist().getCurrentFileId() : Persist.getActiveFileId();
        const file = (Persist.listFiles() || []).filter((f) => f.id === id)[0] || null;
        if (file && /\.cfg$/i.test(file.name)) { BelugaRun.runModuleCfg(file.name); return true; }
        if (!file || !moduleNameFor(file.id)) { BelugaRun.runFile(); return true; }
        BelugaRun.runToHere();
        return true;
      };
      on('run.default', runDefault);
      on('run.file', () => { if (BelugaRun.runFile) BelugaRun.runFile(); });
      on('run.here', () => { if (BelugaRun.runToHere) BelugaRun.runToHere(); });
      on('run.module', () => { if (BelugaRun.runModule) BelugaRun.runModule(); }, () => !!moduleNameFor());
      on('run.project', () => { if (BelugaRun.runProject) BelugaRun.runProject(); }, () => signatureFileCount() > 1);
      on('run.clear-output', () => { ReplOutput.clearOutput(); });

      on('view.theme', toggleTheme);
      on('view.explorer', () => toggleSidePanel('explorer'));
      on('view.library', () => toggleSidePanel('library'));
      on('view.harpoon', () => toggleSidePanel('harpoon'));
      on('view.edit-history', () => { window.StatusStrip?.openHistory?.(); });
      on('view.settings', () => { SettingsUI.open(); });
      onEditor('fold.all', (e) => e.foldAll());
      onEditor('fold.unfold-all', (e) => e.unfoldAll());

      // Files: switch tabs straight from the palette (active file excluded).
      CommandPalette.setProvider('files', () => {
        const currentId = getPersist() ? getPersist().getCurrentFileId() : null;
        return Persist.listFiles()
          .filter((f) => f.id !== currentId)
          .map((f) => ({ title: f.name, detail: 'Switch to file', run: () => switchToFile(f.id) }));
      });

      // Symbols ("@" mode): global declarations in the active file, jump on select.
      CommandPalette.setProvider('symbols', () => {
        const ed = window.CurrentEditor;
        const engine = ed && ed.getSemanticEngine ? ed.getSemanticEngine() : null;
        const snap = engine && engine.getSnapshot ? engine.getSnapshot() : null;
        const symbols = snap && snap.symbols ? snap.symbols.globalSymbols : [];
        function statusPrefix(symbolId) {
          const node = snap && snap.graph && snap.graph.nodeMap
            ? snap.graph.nodeMap.get(symbolId)
            : null;
          const st = node && node.status;
          if (st === 'syntax-fault' || st === 'erroring') return '⚠ ';
          if (st === 'blocked') return '⊘ ';
          return '';
        }
        const items = symbols.map((s) => ({
          title: statusPrefix(s.id) + s.name,
          detail: s.label || '',
          run: () => ed.jumpToRange(s.nameRange || s.range),
        }));
        // Then every definition in the rest of the file's development group —
        // selecting one opens that file and jumps to the definition.
        const cross = ed && typeof ed.listProjectSymbols === 'function' ? ed.listProjectSymbols() : [];
        for (const s of cross) {
          items.push({
            title: s.name,
            detail: s.fileName.split('/').pop(),
            run: () => openFileAt(s.fileId, s.from, s.to),
          });
        }
        return items;
      });

      // Project text search ("#" mode / Ctrl+Shift+F): substring match across every
      // project file (live buffer for the active one), jump on select.
      CommandPalette.setProvider('search', (query) => {
        if (!query) return [];
        const activeId = getPersist() ? getPersist().getCurrentFileId() : Persist.getActiveFileId();
        const entries = Persist.listFiles().map((f) => ({
          id: f.id,
          name: f.name,
          text: projectFileText(f.id),
        }));
        return ProjectSource.scanProjectText(entries, query, 60).map((m) => ({
          title: m.lineText,
          mono: true,
          detail: m.name.split('/').pop() + ':' + m.line,
          run: () => openFileAt(m.id, m.from, m.to),
        }));
      });

    }
  }
