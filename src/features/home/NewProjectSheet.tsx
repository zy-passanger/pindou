import { useState } from 'react';
import { BOARD_PRESETS, boardSizeForBead, createProject, type BeadSizeMm, type Project } from '@/core/model';
import { MARD_PALETTE } from '@/core/palette';
import { saveProjectWithThumbnail } from '@/storage/projectRepository';
import { useAppStore } from '@/store/appStore';
import { Icon } from '@/ui/Icon';
import { Sheet } from '@/ui/Sheet';
import { beadStyle } from '@/ui/beadStyle';

interface NewProjectSheetProps {
  onClose: () => void;
  onCreated: (project: Project) => void;
}

export function NewProjectSheet({ onClose, onCreated }: NewProjectSheetProps) {
  const layout = useAppStore((state) => state.layout);
  const myPaletteCodes = useAppStore((state) => state.myPaletteCodes);
  const showToast = useAppStore((state) => state.showToast);
  const [name, setName] = useState('未命名图纸');
  const [beadSize, setBeadSize] = useState<BeadSizeMm>(2.6);
  const [width, setWidth] = useState(52);
  const [height, setHeight] = useState(52);
  const [custom, setCustom] = useState(false);
  const [busy, setBusy] = useState(false);

  const key = beadSize === 5 ? '5' : '2.6';
  const presets = BOARD_PRESETS[key];
  const board = boardSizeForBead(beadSize);
  const boards = Math.ceil(width / board) * Math.ceil(height / board);
  const cmW = (width * beadSize / 10).toFixed(1);
  const cmH = (height * beadSize / 10).toFixed(1);
  const presetActive = (size: number) => !custom && width === size && height === size;
  const customActive = custom || !presets.includes(width) || width !== height;

  const chooseBeadSize = (next: BeadSizeMm) => {
    setBeadSize(next);
    const nextPresets = BOARD_PRESETS[next === 5 ? '5' : '2.6'];
    if (!nextPresets.includes(width)) {
      setWidth(nextPresets[0]);
      setHeight(nextPresets[0]);
      setCustom(false);
    }
  };

  const choosePreset = (size: number) => {
    setWidth(size);
    setHeight(size);
    setCustom(false);
  };

  const create = async () => {
    if (busy) return;
    const w = Math.max(1, Math.min(300, Math.round(width || 1)));
    const h = Math.max(1, Math.min(300, Math.round(height || 1)));
    setBusy(true);
    try {
      const project = createProject({
        name: name.trim() || '未命名图纸',
        width: w,
        height: h,
        beadSizeMm: beadSize,
        palette: MARD_PALETTE,
      });
      await saveProjectWithThumbnail(project);
      onCreated(project);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '创建图纸失败', 'warn');
      setBusy(false);
    }
  };

  return (
    <Sheet
      title="新建图纸"
      onClose={onClose}
      variant={layout === 'phone' ? 'bottom' : 'dialog'}
      footer={(
        <>
          <button className="btn btn--ghost" onClick={onClose}>取消</button>
          <button className="btn btn--primary" onClick={() => void create()} disabled={busy}>
            <Icon name="plus" />
            {busy ? '创建中…' : '创建图纸'}
          </button>
        </>
      )}
    >
      <div className="form-stack">
        <div className="field">
          <label className="field__label" htmlFor="new-project-name">图纸名称</label>
          <input
            id="new-project-name"
            className="input"
            data-autofocus
            value={name}
            maxLength={40}
            placeholder="给图纸起个名字"
            onChange={(event) => setName(event.target.value)}
          />
        </div>

        <div className="form-section">
          <div className="form-section__title"><Icon name="bead" />豆子规格</div>
          <div className="segmented" style={{ width: '100%' }}>
            <button className={beadSize === 2.6 ? 'is-active' : ''} style={{ flex: 1 }} onClick={() => chooseBeadSize(2.6)}>2.6mm 小豆</button>
            <button className={beadSize === 5 ? 'is-active' : ''} style={{ flex: 1 }} onClick={() => chooseBeadSize(5)}>5mm 中豆</button>
          </div>
        </div>

        <div className="form-section">
          <div className="form-section__title"><Icon name="grid" />板型尺寸</div>
          <div className="preset-grid">
            {presets.map((size) => (
              <button
                key={size}
                className={`preset-card ${presetActive(size) ? 'is-active' : ''}`}
                onClick={() => choosePreset(size)}
              >
                <span className="preset-card__icon"><Icon name="grid" /></span>
                <span className="preset-card__copy">
                  <span className="preset-card__name">{size} × {size}</span>
                  <span className="preset-card__meta">{(size * beadSize / 10).toFixed(1)} cm · {Math.ceil(size / board) ** 2} 块板</span>
                </span>
              </button>
            ))}
            <button className={`preset-card ${customActive ? 'is-active' : ''}`} onClick={() => setCustom(true)}>
              <span className="preset-card__icon"><Icon name="crop" /></span>
              <span className="preset-card__copy">
                <span className="preset-card__name">自定义尺寸</span>
                <span className="preset-card__meta">1–300 格</span>
              </span>
            </button>
          </div>
        </div>

        <div className="dimension-row">
          <div className="dimension-field">
            <label className="field__label" htmlFor="new-project-width">宽（格）</label>
            <div className="dimension-input-wrap">
              <input
                id="new-project-width"
                className="input"
                type="number"
                min={1}
                max={300}
                value={width}
                onChange={(event) => { setWidth(Number(event.target.value) || 1); setCustom(true); }}
              />
              <span className="dimension-input-wrap__unit">格</span>
            </div>
          </div>
          <button className="icon-btn" aria-label="交换宽高" style={{ marginBottom: 3 }} onClick={() => { setWidth(height); setHeight(width); setCustom(true); }}>
            <Icon name="swap" />
          </button>
          <div className="dimension-field">
            <label className="field__label" htmlFor="new-project-height">高（格）</label>
            <div className="dimension-input-wrap">
              <input
                id="new-project-height"
                className="input"
                type="number"
                min={1}
                max={300}
                value={height}
                onChange={(event) => { setHeight(Number(event.target.value) || 1); setCustom(true); }}
              />
              <span className="dimension-input-wrap__unit">格</span>
            </div>
          </div>
        </div>

        <div className="preview-summary">
          <div className="preview-summary__board" aria-hidden="true" />
          <div className="preview-summary__copy">
            <div className="preview-summary__title">{width} × {height} 格</div>
            <div className="preview-summary__meta">{cmW} × {cmH} cm · {boards} 块板 · {beadSize}mm 豆</div>
          </div>
        </div>

        <div className="palette-row">
          <span className="bead-dot" style={beadStyle('#F04A42')} />
          <div className="palette-row__copy">
            <div className="palette-row__title">MARD 融合豆 · 我的色卡</div>
            <div className="palette-row__meta">{myPaletteCodes.length} 色 · 图片转换只使用这些颜色</div>
          </div>
          <button className="text-link" onClick={() => showToast('在编辑器色板中调整我的色卡', 'info')}>调整</button>
        </div>
      </div>
    </Sheet>
  );
}
