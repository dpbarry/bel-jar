/**
 * The BelJar command registry — one list behind keybindings, the palette, the
 * editor status strip, menus and gestures. Published as `window.Commands`.
 *
 * Two-part registration, on purpose:
 *   `define()`  static metadata (title, section, chord, style policy). The
 *               catalogue is defined at load, so `Keybindings` can project its
 *               chord table before `app.js` exists.
 *   `attach()`  behaviour (`run`, `when`), wired by whoever owns the action.
 *
 * Only commands with a `run` are runnable; the palette lists those, so a
 * catalogue entry nobody has wired stays invisible instead of failing on click.
 */
import { CATALOG } from './command-catalog.mjs';
import {
  chordShadow, STYLE_TAKES, STYLE_CHORDS, specFromStyleKey, readableStyleChord,
} from './command-shadows.mjs';
import {
  SETTINGS, findSetting, nextValue, nearestSetting, settingId, parseSet, describeChange, optionCandidates,
} from './command-settings.mjs';
import { mxNameFor, exNamesFor, titleFor } from './command-names.mjs';

const global = globalThis;

/** Style policies, weakest claim to strongest. */
const POLICIES = ['off', 'yield', 'insert-only', 'always'];
const DEFAULT_POLICY = 'always';

const order = [];
const byId = Object.create(null);
let version = 0;

function normalize(record) {
  const id = String(record.id);
  return Object.assign({}, record, {
    id,
    title: titleFor(id, record.title),
    section: record.section || '',
    scope: record.scope || 'global',
    keybindable: !!record.keybindable,
    palette: !!record.palette,
    cmdline: record.cmdline === false ? false : true,
    ex: exNamesFor(record.ex),
    mx: mxNameFor(id, record.mx),
    styles: record.styles || null,
  });
}

/** Add or update a descriptor. Provided keys win; everything else is kept. */
function define(desc) {
  if (!desc || typeof desc !== 'object') return false;
  const id = desc.id == null ? '' : String(desc.id);
  if (!id) return false;
  const prev = byId[id];
  if (!prev) order.push(id);
  byId[id] = normalize(Object.assign({}, prev || {}, desc, { id }));
  version += 1;
  return true;
}

function defineAll(list) {
  if (!Array.isArray(list)) return 0;
  let n = 0;
  for (const desc of list) if (define(desc)) n += 1;
  return n;
}

/** Wire behaviour onto an existing or new descriptor. */
function attach(id, behaviour) {
  if (!id || !behaviour) return false;
  const patch = { id: String(id) };
  if (typeof behaviour.run === 'function') patch.run = behaviour.run;
  if (typeof behaviour.when === 'function') patch.when = behaviour.when;
  if (typeof behaviour.preview === 'function') patch.preview = behaviour.preview;
  return define(patch);
}

function unregister(id) {
  const key = String(id == null ? '' : id);
  if (!byId[key]) return false;
  delete byId[key];
  const at = order.indexOf(key);
  if (at >= 0) order.splice(at, 1);
  version += 1;
  return true;
}

function get(id) {
  return byId[String(id == null ? '' : id)] || null;
}

function has(id) {
  return !!get(id);
}

/** `when()` must never take a surface down with it. */
function isAvailable(cmd, ctx) {
  if (!cmd || typeof cmd.when !== 'function') return true;
  try {
    return !!cmd.when(ctx);
  } catch (_) {
    return false;
  }
}

/**
 * Catalogue order, narrowed by `filter`:
 *   palette / keybindable / cmdline   boolean flags
 *   runnable                      has a `run`
 *   available                     `when()` passes (pass a ctx to widen it)
 *   scope / section               exact match
 */
function list(filter) {
  const f = filter || {};
  const out = [];
  for (const id of order) {
    const cmd = byId[id];
    if (!cmd) continue;
    if (f.palette === true && !cmd.palette) continue;
    if (f.keybindable === true && !cmd.keybindable) continue;
    if (f.cmdline === true && !cmd.cmdline) continue;
    if (f.runnable === true && typeof cmd.run !== 'function') continue;
    if (f.scope && cmd.scope !== f.scope) continue;
    if (f.section && cmd.section !== f.section) continue;
    if (f.available === true && !isAvailable(cmd, f.ctx)) continue;
    out.push(cmd);
  }
  return out;
}

/**
 * Every command whose policy under `style` is exactly `policy` — and only where
 * the catalogue states it, never by inference from the default.
 */
function idsWithStyle(style, policy) {
  const out = [];
  for (const id of order) {
    const cmd = byId[id];
    if (cmd && cmd.styles && cmd.styles[style] === policy) out.push(id);
  }
  return out;
}

/** What this command's chord does under `style`. */
function styleFor(id, style) {
  const cmd = get(id);
  if (!cmd || !cmd.styles) return DEFAULT_POLICY;
  const p = cmd.styles[style];
  return POLICIES.indexOf(p) >= 0 ? p : DEFAULT_POLICY;
}


/**
 * The chord the style binds for this command, or '' — see `STYLE_CHORDS`.
 *
 * ⛔ Spoken in BelJar's spelling, not the style's. `STYLE_CHORDS` is written the
 * way the style writes it (`C-s`, `C-x h`), and a surface that groups keys by
 * shape cannot have two spellings in play — that produced blocks headed `C`,
 * `C+S` and `Ctrl+x`, each holding whichever rows happened to be written that
 * way.
 */
function styleChordFor(id, style) {
  return readableStyleChord((STYLE_CHORDS[style] || {})[id] || '');
}

/**
 * Who else claims `spec`, according to BelJar's own chord table.
 *
 * ⛔ Read from `Keybindings`, never from a second copy: a chord the user has
 * rebound must stop colliding on its own, and a chord they have rebound ONTO
 * must start.
 */
function baseOwnerOf(spec, exceptId) {
  const KB = global.Keybindings;
  if (!spec || !KB || typeof KB.findConflict !== 'function') return null;
  const id = KB.findConflict(spec, exceptId);
  if (!id) return null;
  const cmd = get(id);
  return cmd ? { id, title: cmd.title } : null;
}

/**
 * The single formatter for "how do I invoke this" — palette rail, Keybindings
 * sheet, available macros, `:help`. Nothing else may format a chord.
 */
/**
 * How to invoke this command, and what contests it.
 *
 * ⛔ `shadow` is computed from a CHORD, not from the command. A tag exists for
 * exactly one reason — the chord on the row is claimed by something other than
 * the row — so a surface says which chord it is going to display and gets the
 * answer for that chord. Pass `showing: 'style'` where the row shows the chord
 * that works under the style rather than BelJar's own.
 *
 * The old shape hung a tag on the command and said "without Emacs, Redo is
 * Ctrl+Y": a sentence about a keymap you are not using, on a row whose chord was
 * in collision with nothing, while the seven chords Emacs actually takes carried
 * no tag at all on the surface that lists them.
 */
function describe(id, opts) {
  const cmd = get(id);
  if (!cmd) return null;
  const o = opts || {};
  const style = o.style || 'default';
  const KB = global.Keybindings;
  let spec = '';
  let chord = '';
  if (KB && typeof KB.has === 'function' && KB.has(cmd.id)) {
    spec = KB.resolve(cmd.id, o.isMac) || '';
    chord = KB.labelFor(cmd.id, o.isMac) || '';
  } else if (cmd.shortcut && KB && typeof KB.formatShortcut === 'function') {
    spec = KB.normalizeSpec ? KB.normalizeSpec(cmd.shortcut) : '';
    chord = KB.formatShortcut(cmd.shortcut, o.isMac) || '';
  }
  const policy = styleFor(cmd.id, style);
  // The chord that WORKS under the style, where the style binds one of its own.
  const styleChord = styleChordFor(cmd.id, style);
  const showingStyle = o.showing === 'style' && !!styleChord;
  // ⛔ The style's own chord still has to be normalized, or the `shadowing`
  // case — a style chord taking a base chord from another command — can never
  // fire, which is the whole reason the tag exists.
  const shownSpec = showingStyle ? specFromStyleKey(styleChord) : spec;
  const shownLabel = showingStyle ? styleChord : chord;
  return {
    id: cmd.id,
    title: cmd.title,
    section: cmd.section,
    scope: cmd.scope,
    chord,
    spec,
    styleChord,
    ex: cmd.ex.slice(),
    mx: cmd.mx,
    keybindable: cmd.keybindable,
    palette: cmd.palette,
    runnable: typeof cmd.run === 'function',
    policy,
    availableInStyle: policy !== 'off',
    shadow: chordShadow({
      style,
      policy,
      commandId: cmd.id,
      spec: shownSpec,
      label: shownLabel,
      fromStyle: showingStyle,
      baseOwnerOf: (s) => baseOwnerOf(s, cmd.id),
    }),
  };
}

/** The chord table `Keybindings` resolves against. */
function defaults() {
  return list({ keybindable: true }).map((c) => ({
    id: c.id,
    title: c.title,
    section: c.section,
    scope: c.scope,
    defaultSpec: c.defaultSpec || '',
    macDefaultSpec: c.macDefaultSpec || '',
  }));
}

function run(id, ctx) {
  const cmd = get(id);
  if (!cmd || typeof cmd.run !== 'function') return false;
  if (!isAvailable(cmd, ctx)) return false;
  return cmd.run(ctx) !== false;
}

defineAll(CATALOG);

export const Commands = {
  define,
  defineAll,
  attach,
  unregister,
  get,
  has,
  list,
  describe,
  defaults,
  run,
  styleFor,
  idsWithStyle,
  // The preference table, so the editor's `:set` resolves through the same
  // source as the palette rows without importing across the bundle seam.
  settings: {
    list: () => SETTINGS.slice(),
    find: findSetting,
    next: nextValue,
    nearest: nearestSetting,
    id: settingId,
    parse: parseSet,
    describe: describeChange,
    candidates: optionCandidates,
  },
  /**
   * The tag for an arbitrary chord shown for a command — for surfaces that
   * render a style's OWN maps (`gd`, `C-x C-s`) rather than a catalogue chord.
   *
   * ⛔ One entry point, so nothing else decides when a chord is contested.
   */
  chordShadowFor(opts) {
    const o = opts || {};
    const cmd = get(o.commandId);
    return chordShadow({
      style: o.style,
      policy: 'always',
      commandId: o.commandId,
      spec: specFromStyleKey(o.keys),
      label: o.keys,
      // Always: this entry point only ever describes a STYLE's own map.
      fromStyle: true,
      baseOwnerOf: (s) => baseOwnerOf(s, cmd ? cmd.id : null),
    });
  },
  isAvailable,
  version: () => version,
  _pure: { normalize, POLICIES, DEFAULT_POLICY, chordShadow, STYLE_TAKES, STYLE_CHORDS, specFromStyleKey, CATALOG },
};

global.Commands = Commands;
