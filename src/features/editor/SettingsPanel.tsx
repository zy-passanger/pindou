import { useEffect, useState } from 'react';
import type { Project } from '@/core/model';
import { BOARD_PRESETS } from '@/core/model';
import type { ProjectStats } from '@/core/stats';
import { countInteriorHoles } from '@/core/fillHoles';
import type { EditorEngine } from '@/editor/EditorEngine';
import { useAppStore } from '@/store/appStore';
import { Icon } from '@/ui/Icon';
import { beadStyle } from '@/ui/beadStyle';

interface SettingsPanelProps {
  project: Project;
  stats: ProjectStats;
  engine: EditorEngine;
  onOpenMyPalette: () => void;
}

const ANCHORS = ['top-left', 'top', 'top-right', 'left', 'center', 'right', 'bottom-left', 'bottom', 'bottom-right'] as const;

/** 编辑页右侧「设置」tab：画布/显示/色卡集中修改，立即生效。 */
export function SettingsPanel({ project, stats, engine, onOpenMyPalette }: SettingsPanelProps) {
  const showCodes = useAppStore((state) => state.showCodes);
  const showGrid = useAppStore((state) => state.showGrid);
  const setShowCodes = useAppStore((state) => state.setShowCodes);
  const setShowGrid = useAppStore((state) => state.setShowGrid);
  const myPaletteCodes = useAppStore((state) => state.myPaletteCodes);
  const showToast = useAppStore((state) => state.showToast);

  const [width, setWidth] = useState(project.width);
  const [height, setHeight] = useState(project.height);
  const [anchor, setAnchor] = useState<(typeof ANCHORS)[number]>('center');
  const [beadSize, setBeadSize] = useState<2.6 | 5>(project.beadSizeMm);
  const [boardW, setBoardW] = useState(project.boardW);
  const [boardH, setBoardH] = useState(project.boardH);
  const [replaceFrom, setReplaceFrom] = useState(stats.list[0]?.index ?? -1);
  const [replaceTo, setReplaceTo] = useState(stats.list[1]?.index ?? stats.list[0]?.index ?? -1);

  useEffect(() => {
    setWidth(project.width);
    setHeight(project.height);
    setBeadSize(project.beadSizeMm);
    setBoardW(project.boardW);
    setBoardH(project.boardH);
  }, [project.width, project.height, project.beadSizeMm, project.boardW, project.boardH]);

  const interiorHoles = countInteriorHoles(engine.project.cells, engine.project.width, engine.project.height);

  const applyResize = () => {
    engine.resizeProject(width, height, anchor);
    setWidth(engine.project.width);
    setHeight(engine.project.height);
    showToast(`画布已调整为 ${engine.project.width}×${engine.project.height}`);
  };

  const applyBoard = () => {
    engine.setBoard(beadSize, boardW, boardH);
    showToast('板型已更新');
  };

  const chooseBead = (size: 2.6 | 5) => {
    const presets = BOARD_PRESETS[String(size) as '2.6' | '5'];
    const nextW = presets.includes(boardW) ? boardW : presets[0];
    const nextH = presets.includes(boardH) ? boardH : presets[0];
    setBeadSize(size);
    setBoardW(nextW);
    setBoardH(nextH);
    engine.setBoard(size, nextW, nextH);
    showToast(`已切换为 ${size}mm 豆，板型 ${nextW}×${nextH}`);
  };

  const applyBoardOnBlur = () => {
    engine.setBoard(beadSize, boardW, boardH);
  };

  const flip = (horizontal: boolean) => {
    engine.flip(horizontal);
    showToast(horizontal ? '已水平翻转' : '已垂直翻转');
  };

  const rotate = (left: boolean) => {
    engine.rotate(left);
    showToast(left ? '已左转 90°' : '已右转 90°');
  };

  const fillHoles = () => {
    const filled = engine.fillHoles();
    showToast(filled ? `已补全 ${filled} 个内部空格，可撤销` : '没有检测到被围住的空白', filled ? 'success' : 'info');
  };

  const applyReplace = () => {
    if (replaceFrom < 0 || replaceTo < 0 || replaceFrom === replaceTo) {
      showToast('请选择两个不同的颜色', 'warn');
      return;
    }
    if (engine.replaceColor(replaceFrom, replaceTo)) showToast('颜色已替换');
    else showToast('画布中没有这个颜色', 'info');
  };

  const clear = () => {
    engine.clear();
    showToast('画布已清空，可撤销恢复');
  };

  return (
    <div className="settings-panel">
      <div className="palette__head"><h2>设置</h2><span className="palette__compact-label">立即生效</span></div>

      <section className="settings-section">
        <div className="settings-section__title"><Icon name="grid" />画布尺寸（格）</div>
        <div className="size-row">
          <div className="field">
            <label className="field__label" htmlFor="panel-width">宽</label>
            <input id="panel-width" className="input" type="number" min={1} max={300} value={width} onChange={(e) => setWidth(Number(e.target.value) || 1)} />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="panel-height">高</label>
            <input id="panel-height" className="input" type="number" min={1} max={300} value={height} onChange={(e) => setHeight(Number(e.target.value) || 1)} />
          </div>
          <div className="anchor-grid" role="group" aria-label="缩放锚点">
            {ANCHORS.map((a) => (
              <button key={a} className={`anchor-btn ${anchor === a ? 'is-active' : ''}`} aria-label={`${a} 锚点`} onClick={() => setAnchor(a)} />
            ))}
          </div>
        </div>
        <button className="btn btn--secondary btn--sm" style={{ marginTop: 8 }} onClick={applyResize}><Icon name="crop" />应用尺寸</button>
      </section>

      <section className="settings-section">
        <div className="settings-section__title"><Icon name="bead" />豆子与板型</div>
        <div className="option-row">
          <div className="option-row__copy"><div className="option-row__title">豆径</div></div>
          <div className="segmented">
            <button className={beadSize === 2.6 ? 'is-active' : ''} onClick={() => chooseBead(2.6)}>2.6mm</button>
            <button className={beadSize === 5 ? 'is-active' : ''} onClick={() => chooseBead(5)}>5mm</button>
          </div>
        </div>
        <div className="size-row" style={{ marginTop: 6 }}>
          <div className="field">
            <label className="field__label" htmlFor="panel-boardw">板宽</label>
            <input id="panel-boardw" className="input" type="number" min={1} max={300} value={boardW} onChange={(e) => setBoardW(Number(e.target.value) || 1)} onBlur={applyBoardOnBlur} />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="panel-boardh">板高</label>
            <input id="panel-boardh" className="input" type="number" min={1} max={300} value={boardH} onChange={(e) => setBoardH(Number(e.target.value) || 1)} onBlur={applyBoardOnBlur} />
          </div>
        </div>
        <button className="btn btn--secondary btn--sm" style={{ marginTop: 8 }} onClick={applyBoard}><Icon name="check" />应用板型</button>
      </section>

      <section className="settings-section">
        <div className="settings-section__title"><Icon name="eye" />显示</div>
        <div className="option-row">
          <div className="option-row__copy"><div className="option-row__title">格内色号</div></div>
          <button className={`switch ${showCodes ? 'is-on' : ''}`} role="switch" aria-label="显示格内色号" aria-checked={showCodes} onClick={() => { setShowCodes(!showCodes); engine.redraw(); }} />
        </div>
        <div className="option-row">
          <div className="option-row__copy"><div className="option-row__title">网格与板线</div></div>
          <button className={`switch ${showGrid ? 'is-on' : ''}`} role="switch" aria-label="显示网格与板线" aria-checked={showGrid} onClick={() => { setShowGrid(!showGrid); engine.redraw(); }} />
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-section__title"><Icon name="palette" />我的色卡</div>
        <div className="option-row__hint" style={{ marginBottom: 8 }}>当前启用 {myPaletteCodes.length} 色；图片转换只使用这些颜色。</div>
        <button className="btn btn--secondary btn--block" onClick={onOpenMyPalette}><Icon name="bead" />编辑我的色卡</button>
      </section>

      <section className="settings-section">
        <div className="settings-section__title"><Icon name="layers" />空白修整</div>
        <div className="option-row__hint" style={{ marginBottom: 8 }}>
          {interiorHoles ? `检测到 ${interiorHoles} 个被围住的空格。` : '内部没有连片空白。'}
        </div>
        <button className="btn btn--secondary btn--block" onClick={fillHoles} disabled={!interiorHoles}>
          <Icon name="bead" />{interiorHoles ? `补全 ${interiorHoles} 个内部空格` : '无需补全'}
        </button>
      </section>

      <section className="settings-section">
        <div className="settings-section__title"><Icon name="layers" />整图变换</div>
        <div className="transform-grid">
          <button className="transform-btn" onClick={() => flip(true)}><Icon name="flip-h" />水平翻转</button>
          <button className="transform-btn" onClick={() => flip(false)}><Icon name="flip-v" />垂直翻转</button>
          <button className="transform-btn" onClick={() => rotate(true)}><Icon name="rotate-left" />左转 90°</button>
          <button className="transform-btn" onClick={() => rotate(false)}><Icon name="rotate-right" />右转 90°</button>
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-section__title"><Icon name="swap" />替换颜色</div>
        {stats.list.length ? (
          <>
            <div className="replace-row">
              <span className="replace-row__label">从</span>
              <div className="replace-strip">
                {stats.list.map((item) => (
                  <button key={`pf-${item.color.code}`} className={`replace-swatch ${replaceFrom === item.index ? 'is-active' : ''}`} style={beadStyle(item.color.hex)} aria-label={`从 ${item.color.code}`} onClick={() => setReplaceFrom(item.index)} />
                ))}
              </div>
            </div>
            <div className="replace-row">
              <span className="replace-row__label">为</span>
              <div className="replace-strip">
                {stats.list.map((item) => (
                  <button key={`pt-${item.color.code}`} className={`replace-swatch ${replaceTo === item.index ? 'is-active' : ''}`} style={beadStyle(item.color.hex)} aria-label={`替换为 ${item.color.code}`} onClick={() => setReplaceTo(item.index)} />
                ))}
              </div>
            </div>
            <button className="btn btn--secondary btn--sm" onClick={applyReplace}><Icon name="swap" />应用替换</button>
          </>
        ) : <div className="option-row__hint">还没有用过的颜色。</div>}
      </section>

      <section className="settings-section">
        <div className="settings-section__title"><Icon name="trash" />清空画布</div>
        <button className="btn btn--ghost btn--block" onClick={clear}><Icon name="trash" />清空（可撤销）</button>
      </section>
    </div>
  );
}
