import { useMemo, useState } from 'react';
import type { Project } from '@/core/model';
import { parseCodeList } from '@/core/palette';
import { useAppStore } from '@/store/appStore';
import { beadStyle } from '@/ui/beadStyle';
import { Icon } from '@/ui/Icon';
import { Sheet } from '@/ui/Sheet';

interface MyPaletteSheetProps {
  project: Project;
  onClose: () => void;
}

type Preset = '221' | '291' | 'custom';

function presetFor(set: Set<string>, common: string[], all: string[]): Preset {
  if (set.size === all.length && all.every((code) => set.has(code))) return '291';
  if (set.size === common.length && common.every((code) => set.has(code))) return '221';
  return 'custom';
}

export function MyPaletteSheet({ project, onClose }: MyPaletteSheetProps) {
  const layout = useAppStore((state) => state.layout);
  const myPaletteCodes = useAppStore((state) => state.myPaletteCodes);
  const setMyPaletteCodes = useAppStore((state) => state.setMyPaletteCodes);
  const showToast = useAppStore((state) => state.showToast);
  const colors = project.palette.colors;
  const common = useMemo(() => colors.filter((color) => color.common).map((color) => color.code), [colors]);
  const all = useMemo(() => colors.map((color) => color.code), [colors]);
  const projectCodeSet = useMemo(() => new Set(all), [all]);
  const [draft, setDraft] = useState<Set<string>>(() => new Set(myPaletteCodes));
  const [preset, setPreset] = useState<Preset>(() => presetFor(new Set(myPaletteCodes), common, all));
  const [paste, setPaste] = useState('');

  const toggle = (code: string) => {
    setDraft((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code); else next.add(code);
      setPreset(presetFor(next, common, all));
      return next;
    });
  };

  const choosePreset = (next: Preset) => {
    setPreset(next);
    if (next === '221') setDraft(new Set(common));
    else if (next === '291') setDraft(new Set(all));
  };

  const seriesCodes = (series: string) => colors
    .filter((color) => (series === '其他'
      ? !['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].includes(color.series)
      : color.series === series))
    .map((color) => color.code);

  const toggleSeries = (series: string) => {
    const codes = seriesCodes(series);
    const allOn = codes.length > 0 && codes.every((code) => draft.has(code));
    setDraft((prev) => {
      const next = new Set(prev);
      codes.forEach((code) => { if (allOn) next.delete(code); else next.add(code); });
      setPreset('custom');
      return next;
    });
  };

  const parsePaste = () => {
    const parsed = parseCodeList(paste).filter((code) => projectCodeSet.has(code));
    if (!parsed.length) {
      showToast('没有识别到有效色号', 'warn');
      return;
    }
    setDraft((prev) => {
      const next = new Set(prev);
      parsed.forEach((code) => next.add(code));
      setPreset(presetFor(next, common, all));
      return next;
    });
    showToast(`已启用 ${parsed.length} 个色号`);
  };

  const save = () => {
    setMyPaletteCodes(Array.from(draft));
    showToast(`我的色卡已更新（${draft.size} 色）`);
    onClose();
  };

  const summaryTitle = preset === '291' ? `已启用全部 ${all.length} 色` : preset === '221' ? `已启用 ${common.length} 常用色` : `已启用 ${draft.size} 色`;

  return (
    <Sheet
      title="我的色卡"
      onClose={onClose}
      variant={layout === 'phone' ? 'bottom' : 'right'}
      wide
      footer={(
        <>
          <button className="btn btn--ghost" onClick={onClose}>取消</button>
          <button className="btn btn--primary" style={{ flex: 1 }} onClick={save}>
            <Icon name="check" />保存我的色卡
          </button>
        </>
      )}
    >
      <div className="my-palette-summary">
        <div className="my-palette-summary__num">
          {draft.size}<span style={{ fontSize: 11, color: '#6E958D' }}> / {all.length}</span>
        </div>
        <div className="my-palette-summary__copy">
          <div className="my-palette-summary__title">{summaryTitle}</div>
          <div className="my-palette-summary__hint">默认启用 221 常用；可增减或粘贴清单，图片转换只使用这些颜色。</div>
        </div>
      </div>

      <div className="preset-row">
        <button className={`preset-pill ${preset === '221' ? 'is-active' : ''}`} onClick={() => choosePreset('221')}>221 常用</button>
        <button className={`preset-pill ${preset === '291' ? 'is-active' : ''}`} onClick={() => choosePreset('291')}>291 全色</button>
        <button className={`preset-pill ${preset === 'custom' ? 'is-active' : ''}`} onClick={() => choosePreset('custom')}>自定义</button>
      </div>

      <div className="series-toggle-row">
        {['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', '其他'].map((series) => {
          const codes = seriesCodes(series);
          const allOn = codes.length > 0 && codes.every((code) => draft.has(code));
          return (
            <button key={series} className={`series-toggle ${allOn ? 'is-on' : ''}`} onClick={() => toggleSeries(series)}>
              {allOn ? <Icon name="check" /> : null}{series}
            </button>
          );
        })}
      </div>

      <div className="paste-box">
        <div className="paste-box__head"><Icon name="edit" />粘贴色号清单</div>
        <textarea
          className="textarea"
          value={paste}
          placeholder={'A01, A02, F04…\n支持逗号、空格或换行分隔，可粘贴 226 色套装清单'}
          onChange={(event) => setPaste(event.target.value)}
        />
        <div className="paste-box__foot">
          <span className="paste-box__hint">例如从商品页面复制的色号列表</span>
          <button className="btn btn--secondary btn--sm" onClick={parsePaste}>解析并启用</button>
        </div>
      </div>

      <div className="pick-grid">
        {colors.map((color) => {
          const on = draft.has(color.code);
          return (
            <button
              key={color.code}
              className={`pick-item ${on ? 'is-on' : ''}`}
              aria-pressed={on}
              onClick={() => toggle(color.code)}
            >
              <span className="pick-item__bead" style={beadStyle(color.hex)} />
              <span className="pick-item__copy">
                <span className="pick-item__code">{color.code}</span>
                <span className="pick-item__name">{color.name}</span>
              </span>
              <span className="pick-item__check"><Icon name="check" /></span>
            </button>
          );
        })}
      </div>

      <div className="stat-footnote" style={{ marginTop: 14 }}>
        完整 MARD {all.length} 色（{common.length} 常用 + {all.length - common.length} 特殊效果），默认启用 {common.length}；屏幕色值仅供参考。
      </div>
    </Sheet>
  );
}
