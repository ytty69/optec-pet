import { useDebug } from '../pet/debug';
import { usePetStore } from '../pet/state';

export function DebugOverlay() {
  const visible = useDebug((s) => s.visible);
  const logs = useDebug((s) => s.logs);
  const phase = usePetStore((s) => s.phase);
  const selected = usePetStore((s) => s.selectedAnimal);

  if (!visible) return null;

  return (
    <div className="debug-overlay">
      <div className="debug-header">
        phase=<b>{phase}</b> · selected=<b>{selected ?? '—'}</b> ·{' '}
        <span className="debug-hint">Ctrl+Alt+F12 隐藏</span>
      </div>
      <div className="debug-logs">
        {logs.length === 0 ? <div className="debug-empty">no events yet</div> : null}
        {logs.map((line, i) => (
          <div key={i}>{line}</div>
        ))}
      </div>
    </div>
  );
}
