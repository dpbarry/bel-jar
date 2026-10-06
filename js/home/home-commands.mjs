/**
 * Home's commands: the palette, its chord and its gesture, from the one
 * registry (docs/COMMANDS.md). What both pages run comes from
 * js/commands/shared-commands.mjs; home adds the two that are its own way of
 * doing them (New Project, Import Folder), and its projects as what the palette
 * goes to when no mode is typed.
 *
 * ⛔ Only what the catalogue declares for home is attached, and the registry
 * refuses the rest: a command that needs an editor is not offered without one
 * (tests/test-page-commands.mjs).
 */
import { Commands } from '../commands/command-registry.mjs';
import '../ui/keybindings.mjs';
import '../ui/command-palette.mjs';
import '../ui/double-tap.mjs';
import { attachSharedCommands } from '../commands/shared-commands.mjs';
import { Routes } from '../frame/routes.mjs';

const g = globalThis;

/**
 * @param {object} home
 * @param {() => void} home.newProject
 * @param {() => void} home.pickFolder
 * @param {() => { id: string, name: string, detail: string }[]} home.projects   in the order home lists them
 * @param {(text: string) => void} home.say
 */
export function attachHomeCommands(home) {
  const palette = g.CommandPalette;
  palette.init();
  attachSharedCommands({ say: home.say });

  const on = (id, run, when) => Commands.attach(id, when ? { run, when } : { run });
  on('project.new', () => home.newProject());
  on('file.import-folder', () => home.pickFolder());
  on('app.reload', () => g.location.reload());

  // With no mode typed, the palette goes to a project: what a file is to the editor.
  palette.setProvider('files', () => home.projects().map((p) => ({
    title: p.name,
    detail: p.detail,
    section: 'Projects',
    run: () => Routes.go(Routes.editUrl(p.id)),
  })));
  palette.setModeMeta('anywhere', {
    label: 'Projects',
    placeholder: 'Go to a project, or > for a command…',
    helpTitle: 'Projects',
    helpDetail: 'Go to a project',
  });
}
