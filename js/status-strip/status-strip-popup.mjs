/**
 * Where a strip popup sits: flush on the strip's top border, lined up with the
 * segment that opened it.
 *
 * `position: fixed` + a measured offset, not a percentage `bottom` — that
 * resolves against whichever ancestor happens to be positioned and drifts.
 * ⛔ No gap: two popups on the same bar floating at different distances from
 * it read as two different applications.
 */
const PAD = 6;

/**
 * `textSel` lines the panel's text column up with the segment's own label, so
 * the word you clicked and the words above it share one left edge.
 */
export function anchorAbove(panel, segSelector, align, textSel) {
  const strip = document.querySelector('.jar-strip');
  if (!strip || !panel) return;
  const bar = strip.getBoundingClientRect();
  panel.style.bottom = Math.max(0, Math.round(window.innerHeight - bar.top)) + 'px';
  const segEl = strip.querySelector(segSelector);
  const seg = segEl?.getBoundingClientRect();
  const width = panel.offsetWidth || 0;
  const label = segEl?.querySelector('.jar-strip__label')?.getBoundingClientRect();
  const text = textSel && panel.querySelector(textSel)?.getBoundingClientRect();
  const inset = label && text ? (text.left - panel.getBoundingClientRect().left) - (label.left - seg.left) : 0;
  const want = align === 'left'
    ? (seg ? seg.left - inset : bar.left + PAD)
    : (seg ? seg.right - width : bar.right - width - PAD);
  panel.style.left = Math.max(PAD, Math.round(Math.min(want, window.innerWidth - width - PAD))) + 'px';
}
