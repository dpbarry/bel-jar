/**
 * The commands both pages run (`pages: 'both'` in the catalogue), attached in
 * one place so home and the editor cannot come to mean different things by the
 * same name: the account and sync, the theme, the palette, reporting an issue,
 * and every preference that is not about an open file.
 *
 * Each page calls this once and then attaches what is its own: the editor its
 * hundred and fifty editing commands (js/app/app-command-palette.mjs), home New
 * Project and Import Folder (js/home/home-commands.mjs). What a page does not
 * declare is not attached here either: the registry holds that line.
 */
import { Commands } from './command-registry.mjs';
import { SETTINGS, settingId, applyValue, serverAnswers } from './command-settings.mjs';
import { Routes } from '../frame/routes.mjs';

const g = globalThis;

/**
 * @param {object} [page]
 * @param {(text: string) => void} [page.say]      news in passing: the strip in the editor, one line on home
 * @param {(spec: object) => void} [page.applied]  a preference was written (the editor re-applies itself)
 */
export function attachSharedCommands(page) {
  const say = page && typeof page.say === 'function' ? page.say : () => {};
  const applied = page && typeof page.applied === 'function' ? page.applied : () => {};
  const on = (id, run, when) => Commands.attach(id, when ? { run, when } : { run });

  // The account and sync, each only where it works: no server, no sign-in;
  // signed out, nothing to sync; nothing changed in two places, nothing to review.
  const account = () => g.Account || null;
  const sync = () => (g.Persist && typeof g.Persist.syncSummary === 'function' ? g.Persist.syncSummary() : null);
  on('account.sign-in', () => account().signIn(), () => !!account() && account().available() && !account().user());
  on('account.sign-out', () => account().signOut(), () => !!account() && !!account().user());
  on('sync.now', () => g.Persist.confirmSynced(), () => {
    const s = sync();
    return !!s && s.signedIn && s.state !== 'offline' && s.state !== 'held';
  });
  on('sync.review', () => g.SyncUI.review(), () => {
    const s = sync();
    return !!s && s.differs.length > 0;
  });
  on('sync.review-offline', () => g.SyncUI.reviewOffline(), () => {
    const s = sync();
    return !!s && s.state === 'held';
  });

  on('view.theme', () => g.Frame.toggleTheme());
  on('app.report-issue', () => Routes.reportIssue());
  on('tools.palette', () => g.CommandPalette.open());

  // Preferences: one attach per generated `set.*` command this page runs. A
  // chord or a palette row flips a boolean and cycles a choice, and says what
  // it is now. The account's exist only where a server answers.
  for (const spec of SETTINGS) {
    const id = settingId(spec.slug);
    if (!Commands.runsHere(id)) continue;
    on(id, () => {
      const res = applyValue(g.Settings, spec, undefined);
      if (res.applied) applied(spec);
      say(res.message);
      return res.ok;
    }, spec.needs === 'server' ? serverAnswers : undefined);
  }
}
