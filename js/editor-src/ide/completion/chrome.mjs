import { EditorView } from '@codemirror/view';

export function completionChrome() {
  const selectedRow = {
    backgroundColor: 'var(--editor-ac-row-bg)',
    color: 'var(--editor-ac-row-fg)',
  };
  return EditorView.baseTheme({
    '.cm-tooltip.cm-tooltip-autocomplete': {
      backgroundColor: 'transparent',
      border: 'none',
      color: 'inherit',
      padding: 0,
    },
    '.cm-tooltip.cm-tooltip-autocomplete > ul': {
      fontFamily: 'var(--mono, ui-monospace, monospace)',
      fontSize: '0.78rem',
      minWidth: '0',
      maxWidth: 'min(48rem, 94vw)',
      width: 'max-content',
      maxHeight: '17rem',
      padding: '2px 0',
      backgroundColor: 'var(--search-drop-bg)',
      border: '1px solid var(--search-drop-border)',
      borderRadius: 'var(--editor-ac-radius)',
      boxShadow: 'var(--search-drop-shadow)',
      scrollbarWidth: 'thin',
      scrollbarColor: 'color-mix(in srgb, var(--base-mid) 50%, transparent) transparent',
      '& > li': {
        padding: '0.3rem 0.62rem',
        lineHeight: 1.3,
        position: 'relative',
        transition: 'background 100ms ease',
      },
    },
    '&light .cm-tooltip-autocomplete ul li[aria-selected], &dark .cm-tooltip-autocomplete ul li[aria-selected]': selectedRow,
    '&light .cm-tooltip-autocomplete-disabled ul li[aria-selected], &dark .cm-tooltip-autocomplete-disabled ul li[aria-selected]': {
      backgroundColor: 'var(--editor-ac-row-bg)',
      color: 'var(--editor-ac-row-fg)',
    },
    '.cm-completionMatchedText': {
      textDecoration: 'none',
      fontWeight: '600',
      color: 'inherit',
    },
    // CM's type icons are single letters ("t", "f", "abc") — hide even if a
    // source forgets `icons: false` (CM baseTheme uses a more specific rule).
    '.cm-tooltip-autocomplete .cm-completionIcon': {
      display: 'none !important',
      width: '0',
      padding: '0',
      margin: '0',
    },
    '.cm-completionDetail': {
      marginLeft: '0.5em',
      fontStyle: 'normal',
      fontSize: '0.64rem',
      color: 'var(--muted-high)',
      opacity: 0.7,
    },
    '.cm-completionSignaturePrefix': {
      color: 'var(--muted-high)',
      opacity: 0.75,
    },
    '.cm-completionSignature': {
      display: 'inline-block',
      minWidth: '0',
      maxWidth: '64ch',
      marginLeft: '0.5em',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      fontFamily: 'var(--mono, ui-monospace, monospace)',
      fontSize: '0.64rem',
      lineHeight: 1.3,
      verticalAlign: 'middle',
    },
    '.cm-tooltip.cm-completionInfo': {
      padding: '0.34rem 0.55rem',
      backgroundColor: 'light-dark(var(--base-lowest), var(--base-lower))',
      color: 'var(--base-highest)',
      border: '1px solid light-dark(var(--muted-mid), var(--base-higher))',
      borderRadius: 'var(--radius-sm)',
      boxShadow: '0 0.06rem 0.16rem var(--tooltip-shadow-near)',
      fontFamily: 'var(--sans)',
      fontSize: '0.65rem',
      lineHeight: 1.35,
    },
  });
}
