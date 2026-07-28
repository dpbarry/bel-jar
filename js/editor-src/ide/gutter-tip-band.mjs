// One hover region for gutter tooltips. Tip content lives as attributes on
// gutter cells (hole tip, stacked diagnostics), but a single pointer controller
// over the whole gutter band decides what is shown: the row under the pointer
// owns the tooltip no matter which gutter segment (numbers, fold strip) the
// pointer is in. Crossing segments on the same row never hides/reshows, so the
// tooltip is flicker-free — cells carry no mouseenter/leave bindings of their own.
import { ViewPlugin } from '@codemirror/view';

const hasTip = (el) => el.hasAttribute('data-tooltip') || el.hasAttribute('data-tooltip-errors');

// The tooltip-carrying cell for the row at (x, y), or null. Gutters are walked
// left to right, so the line-number cell (which carries diagnostic tips) wins
// over the fold-strip cell when both are present.
function tippableCellAt(view, x, y) {
  const gutters = view.dom.querySelector('.cm-gutters');
  if (!gutters) return null;
  const gr = gutters.getBoundingClientRect();
  if (x < gr.left || x > gr.right || y < gr.top || y > gr.bottom) return null;
  for (const gutter of gutters.querySelectorAll('.cm-gutter')) {
    for (const cell of gutter.children) {
      if (!cell.classList.contains('cm-gutterElement')) continue;
      if (cell.style.visibility === 'hidden') continue; // CM's measuring spacer
      const r = cell.getBoundingClientRect();
      if (y < r.top || y >= r.bottom) continue;
      if (hasTip(cell)) return cell;
      break; // found the row in this gutter, no tip here → try the next gutter
    }
  }
  return null;
}

export function gutterTooltipBand() {
  return ViewPlugin.fromClass(class {
    constructor(view) {
      this.view = view;
      this.current = null;
      this.onMove = (e) => this.handleMove(e);
      this.onLeave = () => this.release();
      this.onDown = () => this.release();
      this.onScroll = () => this.release();
      view.dom.addEventListener('mousemove', this.onMove);
      view.dom.addEventListener('mouseleave', this.onLeave);
      view.dom.addEventListener('mousedown', this.onDown, true);
      view.scrollDOM.addEventListener('scroll', this.onScroll);
    }

    destroy() {
      this.view.dom.removeEventListener('mousemove', this.onMove);
      this.view.dom.removeEventListener('mouseleave', this.onLeave);
      this.view.dom.removeEventListener('mousedown', this.onDown, true);
      this.view.scrollDOM.removeEventListener('scroll', this.onScroll);
      this.release();
    }

    handleMove(e) {
      const g = typeof window !== 'undefined' ? window : null;
      const T = g?.Tooltips;
      if (!T) return;
      if (g.FloatingRectPlacement && !g.FloatingRectPlacement.prefersFineHover()) return;
      if (e.buttons) return; // mid-drag (gutter line selection etc.) — stay hidden
      const cell = tippableCellAt(this.view, e.clientX, e.clientY);
      if (!cell) {
        this.release();
        return;
      }
      if (cell === this.current && T.activeAnchor?.() === cell) return;
      this.current = cell;
      T.show(cell);
    }

    // Hide only a tooltip this controller owns — other systems (hover tips,
    // prelude-row tips) manage their own anchors.
    release() {
      if (!this.current) return;
      const T = typeof window !== 'undefined' ? window.Tooltips : null;
      if (T?.activeAnchor?.() === this.current) T.hideImmediate();
      this.current = null;
    }
  });
}
