/**
 * A button that opens a menu (js/ui/menu.mjs): the header's menus and popovers
 * on both pages. Opens on pointer down, as a menu bar does, and on Enter or
 * Space through the click; pressing its own button again closes it.
 */

const g = typeof window !== 'undefined' ? window : globalThis;

/**
 * @param {Element | null} btn
 * @param {{ items: object[] | (() => object[]), side?: string, align?: string }} menuOpts
 *   `items` as a function is called at each opening, so the menu says what is true now.
 */
export function wireMenuTrigger(btn, menuOpts) {
  if (!btn) return;
  let suppressNextClick = false;

  function setOpen(open) {
    btn.classList.toggle('is-active', open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function quietTooltip() {
    if (!g.Tooltips) return;
    g.Tooltips.suppressAnchor(btn);
    g.Tooltips.hide();
  }

  function runMenuInteraction() {
    const Menu = g.Menu;
    if (!Menu) return;
    if (Menu.isOpen() && Menu.rootAnchor() === btn) {
      Menu.closeAll();
      return;
    }
    const items = typeof menuOpts.items === 'function' ? menuOpts.items() : menuOpts.items;
    Menu.open({
      anchor: btn,
      side: menuOpts.side,
      align: menuOpts.align,
      items,
      onClose: () => setOpen(false),
    });
    setOpen(true);
  }

  btn.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    suppressNextClick = true;
    quietTooltip();
    runMenuInteraction();
  });

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (suppressNextClick) {
      suppressNextClick = false;
      return;
    }
    quietTooltip();
    runMenuInteraction();
  });
}

g.MenuTrigger = { wire: wireMenuTrigger };
