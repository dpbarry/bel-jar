/**
 * Command palette registration + providers — injected into app.js.
 */

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

    {
      CommandPalette.init();
      const reg = CommandPalette.register;

      reg({ id: 'project.new', title: 'New Project…', section: 'File', run: () => newProject() });
      reg({ id: 'file.new', title: 'New file…', section: 'File', run: () => newFile() });
      reg({ id: 'file.upload', title: 'Upload File', section: 'File', run: () => fileInputEl.click() });
      reg({ id: 'file.upload-folder', title: 'Upload Folder', section: 'File', run: () => uploadFolderInputEl.click() });
      reg({ id: 'file.import-folder', title: 'Import Folder as New Project', section: 'File', run: () => folderInputEl.click() });
      reg({ id: 'file.download', title: 'Download Current File', section: 'File', run: downloadCurrentFile });

      reg({ id: 'edit.undo', title: 'Undo', section: 'Edit', shortcut: 'Mod+Z', run: () => editorExec('undo') });
      reg({ id: 'edit.redo', title: 'Redo', section: 'Edit', shortcut: 'Mod+Y', run: () => editorExec('redo') });
      reg({ id: 'edit.find', title: 'Find…', section: 'Edit', shortcut: 'Mod+F', run: () => editorExec('openSearch') });
      reg({
        id: 'edit.search-project',
        title: 'Search in Project…',
        section: 'Edit',
        shortcut: 'Mod+Shift+F',
        run: () => CommandPalette.open({ mode: 'search' }),
      });
      reg({ id: 'edit.toggle-comment', title: 'Toggle Line Comment', section: 'Edit', shortcut: 'Mod+/', run: () => editorExec('toggleComment') });
      reg({
        id: 'edit.format',
        title: 'Format Document',
        section: 'Edit',
        shortcut: 'Alt+Shift+F',
        run: () => editorExec('format'),
      });

      reg({
        id: 'nav.symbol',
        title: 'Go to Symbol…',
        section: 'Navigate',
        shortcut: 'Mod+Shift+O',
        run: () => CommandPalette.open({ mode: 'symbols' }),
      });
      reg({
        id: 'tools.palette',
        title: 'Open Command Palette',
        section: 'Tools',
        shortcut: 'Mod+K',
        run: () => CommandPalette.open(),
      });
      reg({
        id: 'tools.graph',
        title: 'Open Dependency Graph',
        section: 'Tools',
        run: () => window.CurrentEditor?.openDependencyGraph(),
      });
      reg({
        id: 'tools.inspector',
        title: 'Open Inspector',
        section: 'Tools',
        run: () => window.dispatchEvent(new Event('beljar:open-inspector')),
      });

      reg({
        id: 'run.file',
        title: 'Run File',
        section: 'Run',
        run: () => { if (BelugaRun.runFile) BelugaRun.runFile();  },
      });
      reg({
        id: 'run.here',
        title: 'Run Suite to Here',
        section: 'Run',
        run: () => { if (BelugaRun.runToHere) BelugaRun.runToHere();  },
      });
      reg({
        id: 'run.module',
        title: 'Run Suite',
        section: 'Run',
        when: () => !!moduleNameFor(),
        run: () => { if (BelugaRun.runModule) BelugaRun.runModule();  },
      });
      reg({
        id: 'run.project',
        title: 'Run Project',
        section: 'Run',
        when: () => signatureFileCount() > 1,
        run: () => { if (BelugaRun.runProject) BelugaRun.runProject();  },
      });
      reg({
        id: 'run.clear-output',
        title: 'Clear Output',
        section: 'Run',
        run: () => { ReplOutput.clearOutput();  },
      });

      reg({ id: 'view.theme', title: 'Toggle Theme', section: 'View', run: toggleTheme });
      reg({ id: 'view.explorer', title: 'Toggle Explorer', section: 'View', run: () => toggleSidePanel('explorer') });
      reg({
        id: 'view.settings',
        title: 'Open Settings…',
        section: 'View',
        run: () => { SettingsUI.open();  },
      });

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
          if (st === 'syntax-fault' || st === 'erroring') return '\u26a0 ';
          if (st === 'blocked') return '\u2298 ';
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
        if (!query || query.length < 2) return [];
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
