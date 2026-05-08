const output = document.getElementById('output');
const editor = document.getElementById('editor');
const cmdInput = document.getElementById('command-input');

const TEMPLATES = {
  nd: `% Natural Deduction
% Author: Brigitte Pientka

LF o : type =
  | ⊃ : o → o → o
  | ⊤ : o
  | ∧ : o → o → o
  | ∨ : o → o → o
  | ¬ : o → o
;

--prefix ¬ 10.
--infix ∧ 5 right.
--infix ∨ 4 right.
--infix ⊃ 3 right.

LF nd : o → type =
  | ⊃I : (nd A → nd B) → nd (A ⊃ B)
  | ⊃E : nd (A ⊃ B) → nd A → nd B
  | ∧I : nd A → nd B → nd (A ∧ B)
  | ∧El : nd (A ∧ B) → nd A
  | ∧Er : nd (A ∧ B) → nd B
  | ∨Il : nd A → nd (A ∨ B)
  | ∨Ir : nd B → nd (A ∨ B)
  | ∨E : nd (A ∨ B) → (nd A → nd C) → (nd B → nd C) → nd C
  | ⊤I : nd ⊤
;

rec p0 : [ ⊢ nd (A ∧ B ⊃ A)] =
[ ⊢ ⊃I (\\u. ∧El u)] ;

rec p1 : [ ⊢ nd ((A ∧ B) ⊃ (B ∧ A))] =
[ ⊢ ⊃I \\u. ∧I (∧Er u) (∧El u)];`
};

// --- Output ---

function appendOutput(text) {
  if (text && text.trim()) {
    output.textContent += '\n' + text;
    output.scrollTop = output.scrollHeight;
  }
}

function clearOutput() {
  output.textContent = '';
}

// --- Beluga bridge ---

function loadCode() {
  const code = editor.value;
  if (!code.trim()) return;
  try {
    appendOutput(Beluga.loadFromString(code));
  } catch (e) {
    appendOutput('Error: ' + e.message);
  }
}

function runCmd() {
  let cmd = cmdInput.value.trim();
  if (!cmd) return;
  if (!cmd.startsWith('%:')) cmd = '%:' + cmd;
  try {
    appendOutput('# ' + cmd);
    appendOutput(Beluga.runCommand(cmd));
  } catch (e) {
    appendOutput('Error: ' + e.message);
  }
  cmdInput.value = '';
}

// --- Prefabs / templates ---

function insertNd(where) {
  const code = TEMPLATES.nd;
  if (!code) return;
  if (where === 'top') {
    editor.value = code + '\n\n' + editor.value;
  } else {
    editor.value = (editor.value ? editor.value.replace(/\s*$/, '') + '\n\n' : '') + code;
  }
  editor.focus();
}

async function copyNd() {
  try {
    await navigator.clipboard.writeText(TEMPLATES.nd);
  } catch {
    appendOutput('Error: could not copy to clipboard');
  }
  editor.focus();
}

// --- Theme ---

function toggleTheme() {
  document.documentElement.classList.toggle('light');
  const isLight = document.documentElement.classList.contains('light');
  localStorage.setItem('beljar-theme', isLight ? 'light' : 'dark');
}

// --- Tooltips (FloatingRectPlacement; menus use mode: 'menu')

const TOOLTIP_MARGIN = FloatingRectPlacement.DEFAULT_MARGIN;
const TOOLTIP_GAP = FloatingRectPlacement.DEFAULT_GAP;
const TOUCH_SHOW_DELAY_MS = 400;

const tooltipRoot = document.getElementById('tooltip-root');
const prefersHover = () => window.matchMedia('(hover: hover)').matches;
const suppressedTooltipAnchors = new Set();

function layoutTooltip(anchor) {
  const tip = tooltipRoot.firstElementChild;
  if (!tip || tooltipRoot.hidden) return;

  const text = anchor.getAttribute('data-tooltip');
  if (!text) return;
  tip.textContent = text;

  tooltipRoot.classList.remove('is-visible');
  tooltipRoot.classList.add('is-measuring');

  const tw = tooltipRoot.offsetWidth;
  const th = tooltipRoot.offsetHeight;
  const tr = anchor.getBoundingClientRect();
  const { x, y } = FloatingRectPlacement.computePosition({
    anchor: tr,
    width: tw,
    height: th,
    margin: TOOLTIP_MARGIN,
    gap: TOOLTIP_GAP,
    preferPlacement: FloatingRectPlacement.PREFERENCE_TOOLTIP,
  });

  tooltipRoot.classList.remove('is-measuring');
  tooltipRoot.style.left = `${x}px`;
  tooltipRoot.style.top = `${y}px`;
  tooltipRoot.classList.add('is-visible');
}

let tooltipAnchor = null;
let touchShowTimer = null;

function ensureTooltipInner() {
  if (!tooltipRoot.querySelector('.tooltip-inner')) {
    const inner = document.createElement('div');
    inner.className = 'tooltip-inner';
    tooltipRoot.appendChild(inner);
  }
}

function showTooltip(anchor) {
  if (suppressedTooltipAnchors.has(anchor)) return;
  const text = anchor.getAttribute('data-tooltip');
  if (!text) return;
  ensureTooltipInner();
  tooltipAnchor = anchor;
  tooltipRoot.hidden = false;
  layoutTooltip(anchor);
}

function hideTooltip() {
  tooltipAnchor = null;
  tooltipRoot.classList.remove('is-visible', 'is-measuring');
  tooltipRoot.hidden = true;
  tooltipRoot.style.left = '';
  tooltipRoot.style.top = '';
}

function bindTooltips() {
  if (!tooltipRoot) return;
  document.querySelectorAll('[data-tooltip]').forEach((el) => {
    el.addEventListener('mouseenter', () => {
      if (!prefersHover()) return;
      showTooltip(el);
    });
    el.addEventListener('mouseleave', () => {
      if (!prefersHover()) return;
      if (tooltipAnchor === el) hideTooltip();
    });
    el.addEventListener('focusin', () => showTooltip(el));
    el.addEventListener('focusout', () => {
      if (tooltipAnchor === el) hideTooltip();
    });

    el.addEventListener(
      'touchstart',
      () => {
        if (prefersHover()) return;
        clearTimeout(touchShowTimer);
        touchShowTimer = setTimeout(() => showTooltip(el), TOUCH_SHOW_DELAY_MS);
      },
      { passive: true }
    );
    el.addEventListener('touchend', () => {
      clearTimeout(touchShowTimer);
      if (tooltipAnchor === el) hideTooltip();
    });
    el.addEventListener('touchcancel', () => {
      clearTimeout(touchShowTimer);
      if (tooltipAnchor === el) hideTooltip();
    });
  });

  window.addEventListener('resize', () => {
    if (tooltipAnchor) layoutTooltip(tooltipAnchor);
  });
  window.addEventListener(
    'scroll',
    () => {
      if (tooltipAnchor) layoutTooltip(tooltipAnchor);
    },
    true
  );
}

bindTooltips();

// --- Prefabs menu ---

const prefabsBtn = document.getElementById('btn-prefabs');
if (prefabsBtn) {
  prefabsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    hideTooltip();
    if (typeof Menu !== 'undefined' && Menu.isOpen() && Menu.rootAnchor() === prefabsBtn) {
      Menu.closeAll();
      return;
    }
    if (typeof Menu === 'undefined') return;
    suppressedTooltipAnchors.add(prefabsBtn);
    Menu.open({
      anchor: prefabsBtn,
      side: 'right',
      align: 'start',
      items: [
        {
          label: 'Natural Deduction',
          submenu: [
            { label: 'Insert at top', onSelect: () => insertNd('top') },
            { label: 'Insert at bottom', onSelect: () => insertNd('bottom') },
            { label: 'Copy to clipboard', onSelect: () => void copyNd() },
          ],
        },
      ],
      onClose: () => {
        suppressedTooltipAnchors.delete(prefabsBtn);
        prefabsBtn.setAttribute('aria-expanded', 'false');
      },
    });
    prefabsBtn.setAttribute('aria-expanded', 'true');
  });
}

// --- Events ---

document.getElementById('btn-theme').addEventListener('click', toggleTheme);
document.getElementById('btn-load').addEventListener('click', loadCode);
document.getElementById('btn-clear').addEventListener('click', clearOutput);
document.getElementById('btn-run').addEventListener('click', runCmd);

editor.addEventListener('keydown', (e) => {
  if (e.key === 'Tab') {
    e.preventDefault();
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    editor.value = editor.value.substring(0, start) + '  ' + editor.value.substring(end);
    editor.selectionStart = editor.selectionEnd = start + 2;
  }
});

cmdInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') runCmd();
});

// --- Init ---

if (typeof Beluga === 'undefined') {
  appendOutput('[FATAL] Beluga module failed to load.');
}
