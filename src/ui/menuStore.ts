import { create } from 'zustand';

interface MenuState {
  open: boolean;
  x: number;
  y: number;
  show: (x: number, y: number) => void;
  hide: () => void;
}

export const useMenuStore = create<MenuState>((set) => ({
  open: false,
  x: 0,
  y: 0,
  show: (x, y) => set({ open: true, x, y }),
  hide: () => set({ open: false }),
}));
