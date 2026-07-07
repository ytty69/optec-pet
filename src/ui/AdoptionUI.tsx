import { useState } from 'react';
import { usePetStore } from '../pet/state';
import { ANIMAL_LABELS } from '../pet/sprites';

export function AdoptionUI() {
  const phase = usePetStore((s) => s.phase);
  const selectedAnimal = usePetStore((s) => s.selectedAnimal);
  const setPetName = usePetStore((s) => s.setPetName);
  const confirmAdoption = usePetStore((s) => s.confirmAdoption);
  const isReAdopting = usePetStore((s) => s.isReAdopting);
  const cancelReAdoption = usePetStore((s) => s.cancelReAdoption);

  const [showNaming, setShowNaming] = useState(false);
  const [nameInput, setNameInput] = useState('');

  const showCancel =
    isReAdopting && (phase === 'going-to-zoo' || phase === 'picking');

  if (phase !== 'picking' && !showCancel) return null;

  const openNaming = () => {
    if (!selectedAnimal) return;
    setNameInput(ANIMAL_LABELS[selectedAnimal]);
    setShowNaming(true);
  };

  const confirmName = () => {
    if (!selectedAnimal) return;
    const finalName = nameInput.trim() || ANIMAL_LABELS[selectedAnimal];
    setPetName(finalName);
    setShowNaming(false);
    confirmAdoption();
  };

  return (
    <>
      {showCancel && (
        <button
          type="button"
          className="cancel-readopt"
          onClick={cancelReAdoption}
        >
          取消换一只
        </button>
      )}
      {phase === 'picking' && (
        <div className="picker-bar">
          <button
            type="button"
            className="picker-confirm"
            disabled={!selectedAnimal}
            onClick={openNaming}
          >
            领养 TA
          </button>
        </div>
      )}

      {showNaming && selectedAnimal && (
        <div className="name-backdrop" onClick={() => setShowNaming(false)}>
          <div className="name-modal" onClick={(e) => e.stopPropagation()}>
            <div className="name-title">给你的{ANIMAL_LABELS[selectedAnimal]}起个名字</div>
            <input
              className="name-input"
              type="text"
              value={nameInput}
              maxLength={12}
              autoFocus
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirmName();
                if (e.key === 'Escape') setShowNaming(false);
              }}
            />
            <div className="name-actions">
              <button
                type="button"
                className="name-btn name-btn-secondary"
                onClick={() => setShowNaming(false)}
              >
                取消
              </button>
              <button
                type="button"
                className="name-btn name-btn-primary"
                onClick={confirmName}
              >
                就叫这个
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
