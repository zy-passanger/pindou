import { useMemo, useState } from 'react';
import type { Project } from '@/core/model';
import type { ProjectStats } from '@/core/stats';
import type { EditorEngine } from '@/editor/EditorEngine';
import type { Anchor } from '@/core/geometry';
import { countInteriorHoles } from '@/core/fillHoles';
import { useAppStore } from '@/store/appStore';
import { beadStyle } from '@/ui/beadStyle';
import { Icon } from '@/ui/Icon';
import { Sheet } from '@/ui/Sheet';

interface SettingsSheetProps {
  project: Project;
  stats: ProjectStats;
  engine: EditorEngine;
  onClose: () => void;
}

const ANCHORS: Array<{ id: Anchor; label: string }> = [
  { id: 'top-left', label: '左上' }, { id: 'top', label: '上' }, { id: 'top-right', label: '右上' },
  { id: 'left', label: '左' }, { id: 'center', label: '中' }, { id: 'right', label: '右' },
  { id: 'bottom-left', label: '左下' }, { id: 'bottom', label: '下' }, { id: 'bottom-right', label: '右下' },
];

export function SettingsSheet({ project, stats, engine, onClose }: SettingsSheetProps) {
  const layout = useAppStore((state) => state.layout);
  const showToast = useAppStore((state) => state.showToast);
  const [width, setWidth] = useState(project.width);
  const [height, setHeight] = useState(project.height);
  const [anchor, setAnchor] = useState<Anchor>('center');
  const [confirmingClear, setConfirmingClear] = useState(false);
  const used = stats.list;
  const [replaceFrom, setReplaceFrom] = useState(used[0]?.index ?? -1);
  const [replaceTo, setReplaceTo] = useState(used[1]?.index ?? used[0]?.index ?? -1);
  const fromColor = used.find((item) => item.index === replaceFrom)?.color ?? used[0]?.color;
  const toColor = used.find((item) => item.index === replaceTo)?.color ?? used[1]?.color ?? used[0]?.color;

  const applyResize = () => {
    engine.resizeProject(width, height, anchor);
    showToast(`画布已调整为 ${Math.round(width)}×${Math.round(height)}`);
  };

  const rotate = (left: boolean) => {
    engine.rotate(left);
    setWidth(engine.project.width);
    setHeight(engine.project.height);
    showToast(left ? '已左转 90°' : '已右转 90°');
  };

  const flip = (horizontal: boolean) => {
    engine.flip(horizontal);
    showToast(horizontal ? '已水平翻转' : '已垂直翻转');
  };

  const applyReplace = () => {
    if (replaceFrom < 0 || replaceTo < 0 || replaceFrom === replaceTo) {
      showToast('请选择两个不同的颜色', 'warn');
      return;
    }
    if (engine.replaceColor(replaceFrom, replaceTo)) {
      showToast('颜色已替换');
    } else {
      showToast('画布中没有这个颜色', 'info');
    }
  };

  const interiorHoles = useMemo(
    () => countInteriorHoles(engine.project.cells, engine.project.width, engine.project.height),
    [engine.project.cells, engine.project.width, engine.project.height],
  );

  const fillHoles = () => {
    const filled = engine.fillHoles();
    if (filled) showToast(`已补全 ${filled} 个内部空格，可撤销`);
    else showToast('没有检测到被围住的空白', 'info');
  };

  const clear = () => {
    engine.clear();
    setConfirmingClear(false);
    showToast('画布已清空，可撤销恢复');
  };

  return (
    <Sheet
      title="画布设置"
      onClose={onClose}
      variant={layout === 'phone' ? 'bottom' : 'dialog'}
      wide
      footer={<button className="btn btn--primary btn--block" onClick={onClose}>完成</button>}
    >
      <div className="settings-section">
        <div className="settings-section__title"><Icon name="grid" />画布尺寸</div>
        <div className="size-row">
          <div className="field">
            <label className="field__label" htmlFor="settings-width">宽（格）</label>
            <input id="settings-width" className="input" type="number" min={1} max={300} value={width} onChange={(event) => setWidth(Number(event.target.value) || 1)} />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="settings-height">高（格）</label>
            <input id="settings-height" className="input" type="number" min={1} max={300} value={height} onChange={(event) => setHeight(Number(event.target.value) || 1)} />
          </div>
          <div className="anchor-grid" role="group" aria-label="缩放锚点">
            {ANCHORS.map((item) => (
              <button
                key={item.id}
                className={`anchor-btn ${anchor === item.id ? 'is-active' : ''}`}
                aria-label={`${item.label}锚点`}
                onClick={() => setAnchor(item.id)}
              />
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
          <button className="btn btn--secondary btn--sm" onClick={applyResize}><Icon name="crop" />应用尺寸</button>
          <span className="settings-section__hint" style={{ margin: 0 }}>缩小会裁掉超出范围的豆子，可撤销。</span>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section__title"><Icon name="layers" />空白修整</div>
        <div className="option-row" style={{ borderTop: 0, minHeight: 0, paddingBottom: 10 }}>
          <div className="option-row__copy">
            <div className="option-row__title">补全内部空白</div>
            <div className="option-row__hint">
              {interiorHoles
                ? `检测到 ${interiorHoles} 个被图案围住的空格，多为图片背景移除误删的白色区域。`
                : '图案内部没有发现连片空白；画布外圈留白不会被补。'}
            </div>
          </div>
        </div>
        <button className="btn btn--secondary btn--block" onClick={fillHoles} disabled={!interiorHoles}>
          <Icon name="bead" />{interiorHoles ? `补全 ${interiorHoles} 个内部空格` : '无需补全'}
        </button>
      </div>

      <div className="settings-section">
        <div className="settings-section__title"><Icon name="layers" />整图变换</div>
        <div className="transform-grid">
          <button className="transform-btn" onClick={() => flip(true)}><Icon name="flip-h" />水平翻转</button>
          <button className="transform-btn" onClick={() => flip(false)}><Icon name="flip-v" />垂直翻转</button>
          <button className="transform-btn" onClick={() => rotate(true)}><Icon name="rotate-left" />左转 90°</button>
          <button className="transform-btn" onClick={() => rotate(false)}><Icon name="rotate-right" />右转 90°</button>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section__title"><Icon name="swap" />整图替换颜色</div>
        {used.length ? (
          <div className="replace-block">
            <div className="replace-row">
              <span className="replace-row__label">从</span>
              <div className="replace-strip">
                {used.map((item) => (
                  <button
                    key={`from-${item.color.code}`}
                    className={`replace-swatch ${replaceFrom === item.index ? 'is-active' : ''}`}
                    style={beadStyle(item.color.hex)}
                    aria-label={item.color.code}
                    onClick={() => setReplaceFrom(item.index)}
                  />
                ))}
              </div>
            </div>
            <div className="replace-row">
              <span className="replace-row__label">替换为</span>
              <div className="replace-strip">
                {used.map((item) => (
                  <button
                    key={`to-${item.color.code}`}
                    className={`replace-swatch ${replaceTo === item.index ? 'is-active' : ''}`}
                    style={beadStyle(item.color.hex)}
                    aria-label={item.color.code}
                    onClick={() => setReplaceTo(item.index)}
                  />
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 2 }}>
              <div className="replace-preview">
                {fromColor ? <span className="bead-dot bead-dot--sm" style={beadStyle(fromColor.hex)} /> : null}
                <strong>{fromColor?.code ?? '—'}</strong><span>→</span>
                {toColor ? <span className="bead-dot bead-dot--sm" style={beadStyle(toColor.hex)} /> : null}
                <strong>{toColor?.code ?? '—'}</strong>
              </div>
              <button
                className="btn btn--secondary btn--sm"
                disabled={!fromColor || !toColor || replaceFrom === replaceTo}
                onClick={applyReplace}
              >
                应用替换
              </button>
            </div>
          </div>
        ) : <div className="settings-section__hint">画布还没有使用任何颜色。</div>}
      </div>

      <div className="settings-section" style={{ marginBottom: 0, paddingBottom: 0, borderBottom: 0 }}>
        <div className="danger-zone">
          <div className="danger-zone__copy">
            <div className="danger-zone__title">清空画布</div>
            <div className="danger-zone__hint">删除所有豆子，可通过撤销恢复。</div>
          </div>
          {confirmingClear ? (
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn--ghost btn--sm" onClick={() => setConfirmingClear(false)}>取消</button>
              <button className="btn btn--danger btn--sm" onClick={clear}>确认清空</button>
            </div>
          ) : (
            <button className="btn btn--quiet-danger btn--sm" onClick={() => setConfirmingClear(true)}>清空</button>
          )}
        </div>
      </div>
    </Sheet>
  );
}
