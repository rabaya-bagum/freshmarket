// Keyboard focus for dialogs: on open, focus moves in · Tab stays inside · on close, focus returns to the opener.
// Each screen in the layer is keyed, so opening or switching screens replaces the layer's children,
// which is what the observer below watches for.
import { useEffect } from 'react';

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

// A selector that finds "the same" control again after a screen is redrawn
function focusKey(el) {
  if (!el || el === document.body) return null;
  if (el.id) return '#' + CSS.escape(el.id);
  for (const a of el.getAttributeNames()) if (a.startsWith('data-')) return `[${a}="${CSS.escape(el.getAttribute(a))}"]`;
  return null;
}

export function useDialogFocus(layerRef) {
  useEffect(() => {
    const layer = layerRef.current;
    let opener = null, openerKey = null, lastKey = null;
    const dialog = () => layer.querySelector('[role="dialog"]');

    function settle() {
      const dlg = dialog();
      if (!dlg) {
        const back = opener && opener.isConnected ? opener : openerKey && document.querySelector(openerKey);
        opener = openerKey = lastKey = null;
        if (back) back.focus();
        return;
      }
      if (!opener && !layer.contains(document.activeElement)) {
        opener = document.activeElement;
        openerKey = focusKey(opener);
      }
      if (dlg.contains(document.activeElement)) return;
      const same = lastKey && dlg.querySelector(lastKey);
      const first = dlg.querySelector('input:not([type=radio]):not([disabled]),select') || dlg.querySelector(FOCUSABLE);
      (same || first || dlg).focus();
    }

    const onFocusIn = (e) => { if (layer.contains(e.target)) lastKey = focusKey(e.target); };
    // A control that disappears while focused (e.g. "Add to cart" turning into a quantity stepper) would drop
    // focus to the page behind the dialog; put it back inside instead.
    const onFocusOut = (e) => {
      if (!layer.contains(e.target)) return;
      setTimeout(() => { if (!e.target.isConnected && dialog() && !dialog().contains(document.activeElement)) settle(); }, 0);
    };
    const onKeyDown = (e) => {
      if (e.key !== 'Tab') return;
      const dlg = dialog();
      if (!dlg) return;
      const f = [...dlg.querySelectorAll(FOCUSABLE)].filter((x) => x.offsetParent !== null);
      if (!f.length) return;
      const i = f.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && (i === -1 || i === f.length - 1)) { e.preventDefault(); f[0].focus(); }
    };

    const mo = new MutationObserver(settle);
    mo.observe(layer, { childList: true });
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      mo.disconnect();
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [layerRef]);
}
