/**
 * Keyboard-macro registers. Pure: no DOM, no CodeMirror, no globals.
 *
 * A macro is a list of KEYSTROKES, not a list of commands. That distinction is
 * the whole reason this exists rather than being a list of command ids: what
 * you type inside a macro — the literal characters of an insert, the `w` of a
 * `dw` — is not a command and has no id.
 *
 * ⛔ One store for every editing style. Vim's registers are `a`–`z`, `0`–`9`;
 * Emacs and Standard have no register concept and use `DEFAULT_REGISTER`, whose
 * name is deliberately something vim cannot type, so the two schemes share a
 * store without ever colliding.
 */

/** Emacs and Standard record here. Vim cannot name it, so nothing collides. */
export const DEFAULT_REGISTER = 'default';

/** A macro longer than this is a stuck key, not a macro. */
export const KEY_CAP = 4000;

/** Pure: is this a register a vim `q`/`@` can name? */
export function isVimRegister(name) {
  return typeof name === 'string' && /^[a-zA-Z0-9]$/.test(name);
}

/** Pure: the name to record into, given whatever the caller asked for. */
export function registerName(requested) {
  return isVimRegister(requested) ? requested : DEFAULT_REGISTER;
}

/**
 * Pure: how a register reads in the status strip and in a message.
 *
 * Vim says `recording @a`; Emacs has no register to name, so it just records.
 */
export function registerLabel(name) {
  return isVimRegister(name) ? '@' + name : '';
}

export function createMacroStore() {
  const registers = new Map();
  let last = '';

  return {
    /**
     * Replace a register's keys. An empty list clears it.
     *
     * ⛔ The STYLE is stored with them. A keystroke only means something inside
     * the keymap it was pressed in: `j` recorded in Vim's Normal mode is "down
     * a line", and replayed under Standard it is the letter j. Keeping the
     * style is what lets replay refuse rather than corrupt the buffer.
     */
    set(name, keys, style) {
      const n = registerName(name);
      if (!keys || !keys.length) registers.delete(n);
      else registers.set(n, { keys: keys.slice(0, KEY_CAP), style: style || 'default' });
      last = n;
      return n;
    },
    get(name) {
      return registers.get(registerName(name)) || null;
    },
    has(name) {
      return registers.has(registerName(name));
    },
    /** The register a `@@` should repeat: the last one recorded OR replayed. */
    last() {
      return last;
    },
    touch(name) {
      last = registerName(name);
      return last;
    },
    names() {
      return [...registers.keys()];
    },
    clear() {
      registers.clear();
      last = '';
    },
  };
}
