// Shared “follow editor selection” toggle for floating graph / inspector windows.

import { EditorView } from '@codemirror/view';

export const FOLLOW_CURSOR_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" '
  + 'stroke-linecap="round" stroke-linejoin="miter" aria-hidden="true">'
  + '<path d="M4 4l7.07 16.97 2.51-7.39 7.39-2.51z"/></svg>';

const TIP_OFF = 'Follow editor selection';
const TIP_ON = 'Stop following editor selection';

const targets = [];

export function registerEditorFollow(entry) {
  targets.push(entry);
  return () => {
    const i = targets.indexOf(entry);
    if (i >= 0) targets.splice(i, 1);
  };
}

export function createFollowWindowAction(onToggle) {
  const ref = {};
  return {
    ref,
    action: {
      label: TIP_OFF,
      labelOn: TIP_ON,
      icon: FOLLOW_CURSOR_ICON,
      toggle: true,
      pressed: false,
      ref,
      onToggle,
    },
  };
}

export function editorFollow() {
  let timer = null;
  return EditorView.updateListener.of((update) => {
    if (!update.selectionSet && !update.docChanged) return;
    const active = targets.filter((t) => t.view === update.view && t.isActive());
    if (!active.length) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      for (const t of active) {
        if (t.view === update.view && t.isActive()) t.sync();
      }
    }, 120);
  });
}
