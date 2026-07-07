import { useEffect } from 'react';
import { useMenuStore } from './menuStore';
import { usePetStore } from '../pet/state';

export function ContextMenu() {
  const open = useMenuStore((s) => s.open);
  const x = useMenuStore((s) => s.x);
  const y = useMenuStore((s) => s.y);
  const hide = useMenuStore((s) => s.hide);

  const restartAdoption = usePetStore((s) => s.restartAdoption);

  useEffect(() => {
    if (!open) return;
    // Force the window interactive while the menu is up — otherwise, once the
    // pet walks out from under the cursor, the main-process click-through
    // polling kicks back in and the menu becomes unclickable.
    window.pet?.setForceInteractive(true);
    // Close on any pointerdown outside the menu. Delay attaching one tick so
    // the same pointerdown that opened the menu doesn't immediately close it.
    const to = setTimeout(() => {
      const onDown = (e: PointerEvent) => {
        const target = e.target as HTMLElement;
        if (!target.closest('.pet-menu')) hide();
      };
      window.addEventListener('pointerdown', onDown, true);
      window.__petMenuCleanup = () => window.removeEventListener('pointerdown', onDown, true);
    }, 0);
    return () => {
      clearTimeout(to);
      window.__petMenuCleanup?.();
      window.__petMenuCleanup = undefined;
      // Restore click-through behavior based on current phase.
      const living = usePetStore.getState().phase === 'living';
      window.pet?.setForceInteractive(!living);
    };
  }, [open, hide]);

  if (!open) return null;

  const clickRestart = () => {
    hide();
    restartAdoption();
  };
  const clickHide = () => {
    hide();
    window.pet.hideWindow();
  };
  const clickQuit = () => {
    hide();
    window.pet.quit();
  };

  return (
    <div
      className="pet-menu"
      style={{ left: x, top: y }}
    >
      <button type="button" className="pet-menu-item" onClick={clickRestart}>
        换一只
      </button>
      <button type="button" className="pet-menu-item" onClick={clickHide}>
        隐藏 <span className="pet-menu-kbd">Ctrl+Alt+P</span>
      </button>
      <div className="pet-menu-sep" />
      <button
        type="button"
        className="pet-menu-item pet-menu-danger"
        onClick={clickQuit}
      >
        退出 <span className="pet-menu-kbd">Ctrl+Alt+Q</span>
      </button>
    </div>
  );
}

declare global {
  interface Window {
    __petMenuCleanup?: (() => void) | undefined;
  }
}
