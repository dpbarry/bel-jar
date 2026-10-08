// When a paste chord has to read the clipboard, and how the explanation
// dialog follows the permission (js/ui/clipboard-read.mjs).
import {
  situation, isNativePasteSpec, pasteReadsClipboard, shouldOpen, initialView, reduce,
  isDismissed, rememberDismissal, copyFor, COPY,
} from '../js/ui/clipboard-read.mjs';
import { settingRow, isSyncedSetting, normalizeSetting } from '../js/persist/settings-schema.mjs';

let n = 0;
function expect(cond, msg) {
  n += 1;
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

expect(isNativePasteSpec('Mod+V') && isNativePasteSpec('Shift+Insert'), 'the browser paste keys');
expect(!isNativePasteSpec('Mod+Shift+V') && !isNativePasteSpec(''), 'anything else is not one');
expect(!pasteReadsClipboard(null) && !pasteReadsClipboard('') && !pasteReadsClipboard('Mod+V'), 'unbound and native chords do not read');
expect(pasteReadsClipboard('Alt+V'), 'a rebound Paste chord reads');

expect(situation({ style: 'default', pasteSpec: 'Mod+V' }) === null, 'standard Paste on Ctrl+V needs nothing');
expect(situation({ style: 'vim', pasteSpec: 'Mod+V' }) === null, 'Vim does not read the clipboard');
expect(situation({ style: 'vim', yankSource: 'system', pasteSpec: 'Shift+Insert' }) === null, 'Shift+Insert still pastes on its own');
expect(situation({ style: 'default', pasteSpec: null }) === null, 'an unbound Paste is not a rebind');
expect(situation({ style: 'emacs', yankSource: 'kill-ring', pasteSpec: 'Mod+Shift+V' }) === null, 'the kill ring does not read, and Emacs has turned Paste off');

const emacs = situation({ style: 'emacs', yankSource: 'system', pasteSpec: 'Mod+V' });
expect(emacs && emacs.id === 'emacs-system' && emacs.kind === 'emacs' && emacs.chord === 'C-y', 'Emacs C-y from the system clipboard');
expect(situation({ style: 'EMACS', pasteSpec: 'Alt+V' }).id === 'emacs-system', 'Emacs wins over a Paste rebind');
expect(situation({ style: 'emacs' }).id === 'emacs-system', 'a missing yank source is the system clipboard');

const rebound = situation({ style: 'default', pasteSpec: 'Mod+Shift+V' });
expect(rebound.id === 'paste:Mod+Shift+V' && rebound.kind === 'rebind' && rebound.chord === 'Mod+Shift+V', 'a Paste rebind is its own situation');
expect(situation({ style: 'vim', pasteSpec: 'Alt+V' }).id === 'paste:Alt+V', 'Vim insert still runs a rebound Paste');
expect(situation({ style: 'default', yankSource: 'kill-ring', pasteSpec: 'Mod+Y' }).id === 'paste:Mod+Y', 'the kill ring only applies to Emacs');

const row = settingRow('clipboardReadDismissed');
expect(row && row.reset === false && !isSyncedSetting(row) && Array.isArray(row.default) && row.default.length === 0,
  'dismissal stays on this browser and survives Reset');
expect(JSON.stringify(normalizeSetting(row, ['emacs-system', 'emacs-system', '', 4])) === '["emacs-system"]', 'dismissal is a list of ids');
expect(normalizeSetting(row, 'emacs-system') === undefined, 'a non-list is refused');

expect(isDismissed(['emacs-system'], 'emacs-system') && !isDismissed(['paste:Alt+V'], 'emacs-system'), 'one situation dismissed is not the other');
expect(JSON.stringify(rememberDismissal(['emacs-system'], 'paste:Alt+V')) === '["emacs-system","paste:Alt+V"]', 'a new situation is remembered beside the old');
expect(JSON.stringify(rememberDismissal(['emacs-system'], 'emacs-system')) === '["emacs-system"]', 'remembering twice does not duplicate');
expect(JSON.stringify(rememberDismissal(null, '')) === '[]', 'nothing to remember stays empty');

expect(!shouldOpen('granted', emacs, []) && !shouldOpen('prompt', null, []) && !shouldOpen('unknown', emacs, []), 'granted, no situation, or an unreadable permission stays quiet');
expect(shouldOpen('prompt', emacs, []) && shouldOpen('denied', emacs, []), 'prompt and blocked both need the card');
expect(!shouldOpen('prompt', emacs, ['emacs-system']) && shouldOpen('prompt', rebound, ['emacs-system']), 'Ignore covers that situation only');

expect(initialView('prompt').phase === 'offer' && initialView('denied').phase === 'denied' && initialView('granted').phase === 'granted', 'the card opens on the permission it already has');

let view = initialView('prompt');
view = reduce(view, { type: 'allow' });
expect(view.phase === 'asking', 'Allow waits on Chrome');
expect(reduce(view, { type: 'allow' }).phase === 'asking', 'Allow again does not restart');
view = reduce(view, { type: 'permission', state: 'prompt' });
expect(view.phase === 'offer' && view.noted, 'closing Chrome\'s prompt changes nothing');
view = reduce(view, { type: 'allow' });
view = reduce(view, { type: 'read', ok: false, permission: 'prompt' });
expect(view.phase === 'offer' && view.noted, 'a failed read while still prompt is the same close');
view = reduce(view, { type: 'allow' });
view = reduce(view, { type: 'read', ok: false, permission: 'denied' });
expect(view.phase === 'denied', 'Block lands on the blocked card');
view = reduce(view, { type: 'permission', state: 'granted' });
expect(view.phase === 'granted', 'turning clipboard on while the card is open is Allowed');
view = reduce(view, { type: 'permission', state: 'prompt' });
expect(view.phase === 'offer' && !view.noted, 'resetting the grant returns to the offer, not the closed note');

view = reduce(initialView('prompt'), { type: 'allow' });
view = reduce(view, { type: 'read', ok: true, permission: 'prompt' });
expect(view.phase === 'granted', 'a read that returns text is a grant');
view = reduce(initialView('denied'), { type: 'permission', state: 'denied' });
expect(view.phase === 'denied', 'blocked stays blocked');
const left = reduce(initialView('offer'), { type: 'ignore' });
expect(left.phase === 'closed' && left.remember === true, 'Ignore is remembered');
const passed = reduce({ phase: 'granted', noted: false }, { type: 'ignore' });
expect(passed.phase === 'closed' && passed.remember === false, 'closing after Allowed is not Ignore');
expect(reduce(initialView('denied'), { type: 'allow' }).phase === 'denied', 'Allow does nothing once Chrome will not ask');

const offer = copyFor(initialView('prompt'), emacs);
expect(offer.message === COPY.emacsOffer.message && offer.note === COPY.emacsOffer.note && offer.lead === '', 'Emacs states C-y');
expect(offer.buttons.map((b) => b.label).join() === 'Ignore,Allow' && offer.buttons[1].variant === 'primary', 'Allow is the primary, after Ignore');
const noted = copyFor({ phase: 'offer', noted: true }, emacs);
expect(noted.note === COPY.closed.note && noted.message === COPY.emacsOffer.message, 'a closed prompt keeps the problem and says nothing changed');
const asking = copyFor({ phase: 'asking', noted: false }, rebound);
expect(asking.message === COPY.asking.message && asking.buttons[1].disabled && asking.lead === 'Mod+Shift+V', 'while Chrome asks, Allow is disabled and the chord stays');
const denied = copyFor(initialView('denied'), emacs);
expect(denied.message === COPY.denied.message && denied.note === COPY.denied.note && denied.buttons.length === 1 && denied.buttons[0].label === 'Close', 'blocked explains the lock, and Close is Ignore');
const granted = copyFor({ phase: 'granted', noted: false }, emacs);
expect(granted.message === COPY.emacsGranted.message && granted.buttons.length === 0, 'Allowed names C-y and closes itself');
const grantedKey = copyFor({ phase: 'granted', noted: false }, rebound);
expect(grantedKey.message === COPY.rebindGranted.message && grantedKey.lead === 'Mod+Shift+V', 'Allowed names the rebound key');
const rebindOffer = copyFor(initialView('prompt'), rebound);
expect(rebindOffer.lead === 'Mod+Shift+V' && rebindOffer.message === COPY.rebindOffer.message, 'a rebind shows its chord and why');

console.log(`OK clipboard read (${n} checks: Emacs and a rebound Paste, and the card follows the grant)`);
