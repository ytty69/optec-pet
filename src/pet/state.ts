import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type Animal = 'cat' | 'dog' | 'rabbit';

export type Phase =
  | 'going-to-zoo' // scene 1: character walks to the zoo entrance
  | 'picking'      // scene 2: user chooses an animal
  | 'adopting'     // scene 3: adoption certificate ceremony + envelope reveal
  | 'manual'       // scene 4: adoption manual displayed as a DOM overlay
  | 'living';      // scene 5: pet lives on the desktop

interface PetState {
  phase: Phase;
  animal: Animal;              // the pet currently living on desktop
  selectedAnimal: Animal | null; // provisional selection during 'picking'
  petName: string;             // custom name given during adoption
  isReAdopting: boolean;       // true while the user is going through the
                               // "换一只" flow — enables the cancel button

  setPhase: (phase: Phase) => void;
  selectAnimal: (animal: Animal) => void;
  setPetName: (name: string) => void;
  confirmAdoption: () => void;   // picking → adopting
  finishAdoption: () => void;    // adopting → living (commits selectedAnimal → animal)
  restartAdoption: () => void;   // living → going-to-zoo (换一只)
  cancelReAdoption: () => void;  // abort re-adoption, keep the existing pet
}

export const usePetStore = create<PetState>()(
  persist(
    (set, get) => ({
      phase: 'going-to-zoo',
      animal: 'cat',
      selectedAnimal: null,
      petName: '',
      isReAdopting: false,

      setPhase: (phase) => set({ phase }),
      selectAnimal: (animal) => set({ selectedAnimal: animal }),
      setPetName: (name) => set({ petName: name }),

      confirmAdoption: () => {
        if (!get().selectedAnimal) return;
        set({ phase: 'adopting' });
      },

      finishAdoption: () => {
        const chosen = get().selectedAnimal;
        if (!chosen) return;
        set({ phase: 'living', animal: chosen, selectedAnimal: null, isReAdopting: false });
      },

      restartAdoption: () =>
        // Keep animal + petName so cancelReAdoption can restore them cleanly.
        set({ phase: 'going-to-zoo', selectedAnimal: null, isReAdopting: true }),

      cancelReAdoption: () =>
        set({ phase: 'living', selectedAnimal: null, isReAdopting: false }),
    }),
    {
      name: 'optec-pet-state',
      storage: createJSONStorage(() => localStorage),
      // Only persist the settled bits — transient picking state should reset
      // on every launch. If someone quits mid-adoption, next launch restarts
      // the flow rather than resuming a half-picked animal.
      partialize: (state) => {
        if (state.phase !== 'living') return { phase: 'going-to-zoo' as Phase };
        return {
          phase: state.phase,
          animal: state.animal,
          petName: state.petName,
        };
      },
    },
  ),
);
