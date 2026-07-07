import { create } from 'zustand';

interface DebugState {
  logs: string[];
  visible: boolean;
  push: (msg: string) => void;
  clear: () => void;
  toggleVisible: () => void;
}

export const useDebug = create<DebugState>((set) => ({
  logs: [],
  visible: false,
  push: (msg) =>
    set((s) => {
      const stamp = new Date().toISOString().slice(11, 19);
      return { logs: [...s.logs.slice(-14), `${stamp}  ${msg}`] };
    }),
  clear: () => set({ logs: [] }),
  toggleVisible: () => set((s) => ({ visible: !s.visible })),
}));

export const dlog = (msg: string) => useDebug.getState().push(msg);
