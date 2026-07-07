import { useEffect, useRef } from 'react';
import { mountPetStage } from './pet/PetStage';
import { AdoptionUI } from './ui/AdoptionUI';
import { ManualUI } from './ui/ManualUI';
import { DebugOverlay } from './ui/DebugOverlay';
import { ContextMenu } from './ui/ContextMenu';
import { dlog, useDebug } from './pet/debug';

export default function App() {
  const canvasHostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!canvasHostRef.current) return;
    let disposed = false;
    let dispose: (() => void) | null = null;

    mountPetStage(canvasHostRef.current).then((d) => {
      if (disposed) d();
      else dispose = d;
    });

    const onWinPointerDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      dlog(`win pointerdown (${Math.round(e.clientX)},${Math.round(e.clientY)}) tag=${t?.tagName ?? '?'}`);
    };
    window.addEventListener('pointerdown', onWinPointerDown, true);

    // Suppress the default browser context menu — right-click drives our own.
    const onContextMenu = (e: MouseEvent) => e.preventDefault();
    window.addEventListener('contextmenu', onContextMenu);

    const offDebug = window.pet?.onDebug?.((msg) => dlog(msg));
    const offToggle = window.pet?.onToggleDebug?.(() => useDebug.getState().toggleVisible());

    return () => {
      disposed = true;
      dispose?.();
      window.removeEventListener('pointerdown', onWinPointerDown, true);
      window.removeEventListener('contextmenu', onContextMenu);
      offDebug?.();
      offToggle?.();
    };
  }, []);

  return (
    <>
      <div ref={canvasHostRef} className="pet-stage" />
      <AdoptionUI />
      <ManualUI />
      <ContextMenu />
      <DebugOverlay />
    </>
  );
}
