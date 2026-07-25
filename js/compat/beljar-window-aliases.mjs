/**
 * Compatibility window: legacy BelJar* names → current system-noun globals.
 * Burn after callers (console / scratch / external) stop using BelJar*.
 * Soft-call seams and shell peers publish the new names; this re-exports legacy.
 */
const g = globalThis;

const ALIASES = [
  ['BelJarExplorerSuiteLayout', 'ExplorerSuiteLayout'],
  ['BelJarHarpoonGoalSections', 'HarpoonGoalSections'],
  ['BelJarEditHistoryInstall', 'EditHistoryInstall'],
  ['BelJarExplorerInlineName', 'ExplorerInlineName'],
  ['BelJarSuppressRefPeek', 'SuppressRefPeek'],
  ['BelJarLibraryPreview', 'LibraryPreview'],
  ['BelJarLibrarySearch', 'LibrarySearch'],
  ['BelJarLibrarySuites', 'LibrarySuites'],
  ['BelJarExplorerSearch', 'ExplorerSearch'],
  ['BelJarSidePanelResize', 'SidePanelResize'],
  ['BelJarWorkspaceState', 'WorkspaceState'],
  ['BelJarWorkspaceSplit', 'WorkspaceSplit'],
  ['BelJarProjectSource', 'ProjectSource'],
  ['BelJarNameConflicts', 'NameConflicts'],
  ['BelJarConflictDialog', 'ConflictDialog'],
  ['BelJarConfirmDialog', 'ConfirmDialog'],
  ['BelJarPromptDialog', 'PromptDialog'],
  ['BelJarSemanticTrace', 'SemanticTrace'],
  ['BelJarReplCommands', 'ReplCommands'],
  ['BelJarCurrentEditor', 'CurrentEditor'],
  ['BelJarHarpoonEngine', 'HarpoonEngine'],
  ['BelJarHarpoonPanel', 'HarpoonPanel'],
  ['BelJarHeaderSearch', 'HeaderSearch'],
  ['BelJarNotifications', 'Notifications'],
  ['BelJarDownloadZip', 'DownloadZip'],
  ['BelJarEditHistory', 'EditHistory'],
  ['BelJarReplPersist', 'ReplPersist'],
  ['BelJarReplStream', 'ReplStream'],
  ['BelJarReplOutput', 'ReplOutput'],
  ['BelJarNamePrompt', 'NamePrompt'],
  ['BelJarSettingsUI', 'SettingsUI'],
  ['BelJarKeybindings', 'Keybindings'],
  ['BelJarHarpoonIcon', 'HarpoonIcon'],
  ['BelJarBelugaRun', 'BelugaRun'],
  ['BelJarPerfDebug', 'PerfDebug'],
  ['BelJarPerfHud', 'PerfHud'],
  ['BelJarJumpLog', 'JumpLog'],
  ['BelJarTreeDnD', 'TreeDnD'],
  ['BelJarHarpoon', 'Harpoon'],
  ['BelJarExplorer', 'Explorer'],
  ['BelJarLibrary', 'Library'],
  ['BelJarPersist', 'Persist'],
  ['BelJarDialog', 'Dialog'],
  ['BelJarToasts', 'Toasts'],
  ['BelJarToggle', 'Toggle'],
  ['BelJarEditor', 'BelEditor'],
  ['BelJarHint', 'Hint'],
  ['BelJarRepl', 'Repl'],
  ['BelJarPerf', 'Perf'],
];

export function installBelJarWindowAliases() {
  for (const [legacy, neu] of ALIASES) {
    if (neu in g && g[neu] != null) g[legacy] = g[neu];
  }
}

installBelJarWindowAliases();
