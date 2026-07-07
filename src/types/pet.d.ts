declare global {
  interface Window {
    pet: {
      updateBounds: (bounds: { x: number; y: number; w: number; h: number }) => void;
      setForceInteractive: (force: boolean) => void;
      setDragMode: (drag: boolean) => void;
      quit: () => Promise<void>;
      hideWindow: () => void;
      getWorkArea: () => Promise<{ x: number; y: number; width: number; height: number }>;
      onDebug: (cb: (msg: string) => void) => () => void;
      onToggleDebug: (cb: () => void) => () => void;
      onDragCursor: (cb: (pos: { x: number; y: number }) => void) => () => void;
    };
  }
}

export {};
