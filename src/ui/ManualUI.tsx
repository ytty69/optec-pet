import { usePetStore } from '../pet/state';

export function ManualUI() {
  const phase = usePetStore((s) => s.phase);
  const finishAdoption = usePetStore((s) => s.finishAdoption);

  if (phase !== 'manual') return null;

  return (
    <div className="manual-backdrop">
      <div className="manual-panel">
        <div className="manual-header">
          <img
            className="manual-logo"
            src={`${import.meta.env.BASE_URL}assets/logo.png`}
            alt="Optec Zoo"
          />
          <h1>Optec Pet · 领养手册</h1>
          <p className="manual-sub">
            恭喜你，从 Optec 动物园领养了一位新伙伴。<br />
            这是园长 Yuki 塞给你的领养手册 🐾
          </p>
        </div>

        <div className="manual-section">
          <h2>宠物互动方式</h2>
          <ul>
            <li>
              <strong>戳戳 TA</strong>：大部分时候只是让 TA 蹦一下打招呼，但偶尔会解锁一段小小的互动
            </li>
            <li>
              <strong>拖着 TA 走</strong>：按住鼠标右键拖动，可以把 TA 放在屏幕任何角落，连扩展屏也没问题。TA 会乖乖跟着你走。
            </li>
            <li>
              <strong>想安静一会儿</strong>：右键打开菜单选择隐藏，或者点右下角托盘的爪印，TA 就藏起来；再按一次，TA 又跑出来了。
            </li>
            <li>
              <strong>想换一只</strong>：右键打开菜单选"换一只"，可以重新走一遍领养流程。
            </li>
            <li>
              <strong>说再见</strong>：右键打开菜单选"退出"。
            </li>
          </ul>
        </div>

        <div className="manual-footer">
          <p className="manual-blessing">祝相处愉快 🐈🐕🐇</p>
          <button
            type="button"
            className="manual-button"
            onClick={finishAdoption}
          >
            开始相处
          </button>
        </div>
      </div>
    </div>
  );
}
