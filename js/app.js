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

// --- Templates ---

function loadTemplate(name) {
  if (TEMPLATES[name]) {
    editor.value = TEMPLATES[name];
    editor.focus();
  }
}

// --- Theme ---

function toggleTheme() {
  document.documentElement.classList.toggle('light');
  const isLight = document.documentElement.classList.contains('light');
  localStorage.setItem('beljar-theme', isLight ? 'light' : 'dark');
}

if (localStorage.getItem('beljar-theme') === 'light') {
  document.documentElement.classList.add('light');
}

// --- Events ---

document.getElementById('btn-theme').addEventListener('click', toggleTheme);
document.getElementById('btn-template-nd').addEventListener('click', () => loadTemplate('nd'));
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
