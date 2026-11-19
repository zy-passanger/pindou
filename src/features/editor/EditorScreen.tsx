import { useCallback, useEffect, useRef, useState } from 'react';
import { boardCount, physicalSize, type Project } from '@/core/model';
import { INDEX_BY_CODE } from '@/core/palette';
import { computeStats, type ProjectStats } from '@/core/stats';
import { saveProjectWithThumbnail } from '@/storage/projectRepository';
import { useAppStore, TOOL_LABELS, type ToolId } from '@/store/appStore';
import type { CellCoord, ChangeReason, Symmetry } from '@/editor/types';
import { EditorEngine } from '@/editor/EditorEngine';
import { setActiveEngine } from '@/editor/engineBridge';
import { READABLE_CODE_CELL } from '@/rendering/cellLabels';
import { setFlushSave } from '@/app/saveBridge';
import { beadStyle } from '@/ui/beadStyle';
import { Icon } from '@/ui/Icon';
import { Sheet } from '@/ui/Sheet';
import { CanvasStage } from './CanvasStage';
import { PalettePanel } from './PalettePanel';
import { StatsSheet } from './StatsSheet';
import { MyPaletteSheet } from './MyPaletteSheet';
import { SettingsSheet } from './SettingsSheet';
import { SettingsPanel } from './SettingsPanel';
import { ExportSheet } from './ExportSheet';

type Overlay = null | 'palette' | 'mypalette' | 'stats' | 'settings' | 'settingsPanel' | 'export';
type SaveState = 'saved' | 'saving' | 'error';

const RAIL_TOOLS: ToolId[] = ['pencil', 'eraser', 'fill', 'eyedropper', 'line', 'rect', 'ellipse', 'pan'];
const DOCK_TOOLS: ToolId[] = ['pencil', 'eraser', 'fill', 'eyedropper', 'line', 'rect', 'ellipse'];

function symLabel(symmetry: Symmetry): string {
  return symmetry === 'h' ? '水平' : symmetry === 'v' ? '垂直' : symmetry === 'both' ? '四向' : '关';
}

export function EditorScreen() {
  const project = useAppStore((state) => state.currentProject);
  const layout = useAppStore((state) => state.layout);
  const editor = useAppStore((state) => state.editor);
  const selectedColorCode = useAppStore((state) => state.selectedColorCode);
  const tool = useAppStore((state) => state.tool);
  const brushSize = useAppStore((state) => state.brushSize);
  const symmetry = useAppStore((state) => state.symmetry);
  const showCodes = useAppStore((state) => state.showCodes);
  const showGrid = useAppStore((state) => state.showGrid);
  const myPaletteCodes = useAppStore((state) => state.myPaletteCodes);
  const closeEditor = useAppStore((state) => state.closeEditor);
  const startImport = useAppStore((state) => state.startImport);
  const setTool = useAppStore((state) => state.setTool);
  const setBrushSize = useAppStore((state) => state.setBrushSize);
  const setSymmetry = useAppStore((state) => state.setSymmetry);
  const setShowCodes = useAppStore((state) => state.setShowCodes);
  const setShowGrid = useAppStore((state) => state.setShowGrid);
  const setSelectedColorCode = useAppStore((state) => state.setSelectedColorCode);
  const setEditorSnapshot = useAppStore((state) => state.setEditorSnapshot);
  const showToast = useAppStore((state) => state.showToast);

  const engineRef = useRef<EditorEngine | null>(null);
  const [engine, setEngine] = useState<EditorEngine | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [sideTab, setSideTab] = useState<'palette' | 'settings'>('palette');
  const [cursor, setCursor] = useState<CellCoord | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const saveTimer = useRef<number | undefined>(undefined);

  const stats: ProjectStats = editor.stats ?? (project ? computeStats(project.cells, project.palette) : { total: 0, colorCount: 0, counts: new Uint32Array(0), list: [] });
  const selectedColor = project?.palette.colors.find((color) => color.code === selectedColorCode) ?? project?.palette.colors[0];
  const selectedIndex = selectedColor ? INDEX_BY_CODE.get(selectedColor.code) : undefined;
  const selectedCount = selectedIndex !== undefined ? stats.counts[selectedIndex] ?? 0 : 0;
  const myCount = project ? project.palette.colors.filter((color) => myPaletteCodes.includes(color.code)).length : 0;

  const saveProjectNow = useCallback(async (target: EditorEngine) => {
    window.clearTimeout(saveTimer.current);
    setSaveState('saving');
    try {
      await saveProjectWithThumbnail(target.project);
      setSaveState('saved');
    } catch (error) {
      setSaveState('error');
      showToast(error instanceof Error ? error.message : '保存失败', 'warn');
    }
  }, [showToast]);

  useEffect(() => {
    setFlushSave(async () => {
      if (engineRef.current) await saveProjectNow(engineRef.current);
    });
    return () => setFlushSave(null);
  }, [saveProjectNow]);

  const scheduleSave = useCallback((target: EditorEngine) => {
    window.clearTimeout(saveTimer.current);
    setSaveState('saving');
    const snapshotProject = target.project;
    saveTimer.current = window.setTimeout(async () => {
      try {
        await saveProjectWithThumbnail(snapshotProject);
        setSaveState('saved');
      } catch (error) {
        setSaveState('error');
        showToast(error instanceof Error ? error.message : '保存失败', 'warn');
      }
    }, 800);
  }, [showToast]);

  const handleChange = useCallback((_reason: ChangeReason) => {
    const active = engineRef.current;
    if (!active) return;
    const nextStats = computeStats(active.project.cells, active.project.palette);
    setEditorSnapshot({
      stats: nextStats,
      canUndo: active.canUndo,
      canRedo: active.canRedo,
      zoom: active.getZoom(),
      cellSize: active.getCellSize(),
    });
    void scheduleSave(active);
  }, [scheduleSave, setEditorSnapshot]);

  const handleReady = useCallback((active: EditorEngine) => {
    engineRef.current = active;
    setActiveEngine(active);
    setEngine(active);
    const nextStats = computeStats(active.project.cells, active.project.palette);
    setEditorSnapshot({
      stats: nextStats,
      canUndo: active.canUndo,
      canRedo: active.canRedo,
      zoom: active.getZoom(),
    });
  }, [setEditorSnapshot]);

  const handleBack = useCallback(async () => {
    if (engineRef.current) await saveProjectNow(engineRef.current);
    closeEditor();
  }, [closeEditor, saveProjectNow]);

  const selectColor = useCallback((code: string) => {
    setSelectedColorCode(code);
    if (useAppStore.getState().tool === 'eraser') setTool('pencil');
    engineRef.current?.onOptionsChanged();
    if (overlay === 'palette') setOverlay(null);
  }, [overlay, setSelectedColorCode, setTool]);

  const chooseTool = useCallback((next: ToolId) => {
    setTool(next);
    engineRef.current?.onOptionsChanged();
  }, [setTool]);

  const cycleBrush = () => {
    const next = brushSize === 1 ? 2 : brushSize === 2 ? 3 : 1;
    setBrushSize(next);
    showToast(`笔刷 ${next}×${next}`);
  };

  const cycleSymmetry = () => {
    const next: Symmetry = symmetry === 'none' ? 'h' : symmetry === 'h' ? 'v' : symmetry === 'v' ? 'both' : 'none';
    setSymmetry(next);
    engineRef.current?.onOptionsChanged();
    showToast(`对称绘制：${symLabel(next)}`);
  };

  const toggleCodes = () => {
    setShowCodes(!showCodes);
    engineRef.current?.redraw();
  };

  const toggleGrid = () => {
    setShowGrid(!showGrid);
    engineRef.current?.redraw();
  };

  const undo = () => {
    engineRef.current?.undo();
  };

  const redo = () => {
    engineRef.current?.redo();
  };

  const openOverlay = (next: Exclude<Overlay, null>) => {
    setMenuOpen(false);
    setOverlay(next);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && menuOpen) {
        setMenuOpen(false);
        return;
      }
      if (overlay) return;
      const mod = event.ctrlKey || event.metaKey;
      if (mod && (event.key === 'z' || event.key === 'Z')) {
        event.preventDefault();
        if (event.shiftKey) redo(); else undo();
      } else if (mod && (event.key === 'y' || event.key === 'Y')) {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen, overlay]);

  useEffect(() => () => { setActiveEngine(null); }, []);

  useEffect(() => {
    const flush = () => {
      if (engineRef.current) void saveProjectNow(engineRef.current);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flush);
      flush();
      window.clearTimeout(saveTimer.current);
    };
  }, [saveProjectNow]);

  if (!project) {
    return (
      <div className="app-screen">
        <div className="editor-placeholder">
          <div className="canvas-empty" style={{ position: 'static', transform: 'none' }}>
            <h3>工程未加载</h3>
            <p>请返回首页重新打开图纸。</p>
            <button className="btn btn--primary btn--sm" onClick={closeEditor}>返回首页</button>
          </div>
        </div>
      </div>
    );
  }

  const saveLabel = saveState === 'saving' ? '保存中…' : saveState === 'error' ? '保存失败' : '已保存';
  const saveColor = saveState === 'error' ? 'var(--danger)' : saveState === 'saving' ? 'var(--gold)' : 'var(--success)';

  return (
    <div className="app-screen">
      <div className="editor">
        <div className="editor__top">
          <button className="icon-btn" onClick={() => void handleBack()} aria-label="返回首页"><Icon name="back" /></button>
          <div className="editor__title">
            <h1>{project.name}</h1>
            <div className="editor__meta">
              <span>{project.width}×{project.height}</span>
              <span className="dot-sep" />
              <span>{project.beadSizeMm}mm</span>
              <span className="dot-sep dot-sep--save" />
              <span className="save-state" style={{ color: saveColor }}>
                <i className="save-dot" style={{ background: saveColor }} />{saveLabel}
              </span>
            </div>
          </div>
          <div className="editor__top-spacer" />
          <div className="editor__actions">
            <button className="icon-btn" onClick={undo} disabled={!editor.canUndo} aria-label="撤销"><Icon name="undo" /></button>
            <button className="icon-btn" onClick={redo} disabled={!editor.canRedo} aria-label="重做"><Icon name="redo" /></button>
            <span className="v-divider" />
            {layout !== 'wide' && (
              <button className="icon-btn" onClick={() => openOverlay('palette')} aria-label="色板"><Icon name="palette" /></button>
            )}
            <button className="icon-btn" onClick={() => (layout === 'wide' ? setSideTab('settings') : openOverlay('settingsPanel'))} aria-label="设置"><Icon name="settings" /></button>
            <button className="icon-btn desktop-only" onClick={() => openOverlay('stats')} aria-label="用量统计"><Icon name="stats" /></button>
            <button className="btn btn--primary btn--sm desktop-only" onClick={() => openOverlay('export')}>
              <Icon name="download" /><span>导出</span>
            </button>
            <button className="icon-btn" onClick={() => setMenuOpen((open) => !open)} aria-label="更多"><Icon name="more" /></button>
          </div>
        </div>

        <div className="editor__body">
          <aside className="toolrail" aria-label="绘图工具">
            {RAIL_TOOLS.map((id) => (
              <button
                key={id}
                className={`tool-btn ${tool === id ? 'is-active' : ''}`}
                onClick={() => chooseTool(id)}
                aria-label={TOOL_LABELS[id]}
                aria-pressed={tool === id}
              >
                <Icon name={id} />
                <span>{TOOL_LABELS[id]}</span>
                {id === 'pencil' ? <span className="tool-btn__badge">{brushSize}</span> : null}
              </button>
            ))}
            <div className="toolrail__divider" />
            <button className="tool-btn" onClick={cycleSymmetry} aria-label="对称绘制">
              <Icon name="symmetry" /><span>对称</span>
              <span className="tool-btn__badge tool-btn__badge--soft" style={{ display: symmetry === 'none' ? 'none' : undefined }}>{symLabel(symmetry)}</span>
            </button>
            <button className="tool-btn" onClick={cycleBrush} aria-label="笔刷大小">
              <Icon name="pencil" /><span>笔刷</span><span className="tool-btn__badge">{brushSize}</span>
            </button>
            <div className="toolrail__spacer" />
            <button className="tool-btn" onClick={() => openOverlay('stats')} aria-label="用量统计">
              <Icon name="stats" /><span>统计</span>
            </button>
          </aside>

          <div className="canvas-wrap">
            <CanvasStage
              key={project.id}
              project={project}
              onReady={handleReady}
              onChange={handleChange}
              onZoom={(zoom) => setEditorSnapshot({ zoom, cellSize: engineRef.current?.getCellSize() ?? 0 })}
              onHover={setCursor}
              onPick={(index) => {
                const color = engineRef.current?.project.palette.colors[index];
                if (!color) return;
                setSelectedColorCode(color.code);
                setTool('pencil');
                engineRef.current?.onOptionsChanged();
                showToast(`已吸取 ${color.code} ${color.name}`);
              }}
            />
            <div className="canvas-chip">
              <Icon name="bead" />{project.width}×{project.height} · {project.beadSizeMm}mm · {physicalSize(project)}
            </div>
            {layout === 'phone' && (
              <div className="canvas-stats">
                <Icon name="bead" /><strong>{stats.total.toLocaleString('zh-CN')}</strong> 颗<span className="dot-sep" />
                <strong>{stats.colorCount}</strong> 色
              </div>
            )}
            <div className="zoom-pill">
              {showCodes && stats.total > 0 && engine && editor.cellSize < READABLE_CODE_CELL - 0.1 && (
                <button className="code-zoom-hint" onClick={() => engineRef.current?.zoomToCodes()}>
                  <Icon name="zoom-in" />放大查看色号
                </button>
              )}
              <button
                className={`zoom-pill__codes ${showCodes ? 'is-active' : ''}`}
                aria-label="显示格内色号"
                aria-pressed={showCodes}
                onClick={toggleCodes}
                title="每个有豆子的格子中央显示对应色号"
              >
                <Icon name="code" />色号
              </button>
              <span className="zoom-pill__divider" aria-hidden="true" />
              <button onClick={() => engineRef.current?.zoomOut()} aria-label="缩小"><Icon name="zoom-out" /></button>
              <span className="zoom-pill__value">{Math.round(editor.zoom * 100)}%</span>
              <button onClick={() => engineRef.current?.zoomIn()} aria-label="放大"><Icon name="zoom-in" /></button>
              <button onClick={() => engineRef.current?.fit()} aria-label="适应屏幕"><Icon name="fit" /></button>
            </div>
            {stats.total === 0 && (
              <div className="canvas-empty">
                <div className="canvas-empty__beads" aria-hidden="true">
                  <span style={beadStyle('#F77C31')} /><span style={beadStyle('#F551A2')} />
                  <span style={beadStyle('#41CCFF')} /><span style={beadStyle('#5DE035')} />
                </div>
                <h3>空白画布，等你落第一颗豆</h3>
                <p>从色板选一个颜色点按画布开始，也可以导入图片自动生成图纸。</p>
                <button className="btn btn--primary btn--sm" onClick={() => startImport('editor')}><Icon name="image" />从图片开始</button>
              </div>
            )}
          </div>

          {layout === 'wide' && (
            <aside className="palette-panel" aria-label="色板与设置">
              <div className="side-tabs" role="tablist" aria-label="右侧面板">
                <button className={`side-tab ${sideTab === 'palette' ? 'is-active' : ''}`} role="tab" aria-selected={sideTab === 'palette'} onClick={() => setSideTab('palette')}><Icon name="palette" />色板</button>
                <button className={`side-tab ${sideTab === 'settings' ? 'is-active' : ''}`} role="tab" aria-selected={sideTab === 'settings'} onClick={() => setSideTab('settings')} disabled={!engine}><Icon name="settings" />设置</button>
              </div>
              {sideTab === 'palette' ? (
                <PalettePanel
                  project={project}
                  stats={stats}
                  onOpenMyPalette={() => openOverlay('mypalette')}
                  onSelectColor={selectColor}
                />
              ) : engine ? (
                <SettingsPanel
                  project={project}
                  stats={stats}
                  engine={engine}
                  onOpenMyPalette={() => openOverlay('mypalette')}
                />
              ) : null}
            </aside>
          )}
        </div>

        {layout !== 'phone' && (
          <div className="statusbar">
            <span className="statusbar__item"><Icon name="pan" /><span>{cursor ? `x ${cursor.x + 1}  y ${cursor.y + 1}` : '—'}</span></span>
            <span className="statusbar__item"><Icon name="bead" /><span><strong>{stats.total.toLocaleString('zh-CN')}</strong> 颗</span></span>
            <span className="statusbar__item">
              <span className="color-dot" style={beadStyle(selectedColor?.hex ?? '#ddd')} />
              <span><strong>{stats.colorCount}</strong> 色</span>
            </span>
            <span className="statusbar__right">
              <span>{project.beadSizeMm}mm · {project.width}×{project.height} · {physicalSize(project)}</span>
              <span>缩放 <strong>{Math.round(editor.zoom * 100)}%</strong></span>
            </span>
          </div>
        )}

        {layout === 'phone' && (
          <div className="editor-dock">
            <div className="dock-row">
              <div className="dock-tools">
                {DOCK_TOOLS.map((id) => (
                  <button
                    key={id}
                    className={`dock-tool ${tool === id ? 'is-active' : ''}`}
                    onClick={() => chooseTool(id)}
                    aria-label={TOOL_LABELS[id]}
                  >
                    <Icon name={id} /><span>{TOOL_LABELS[id]}</span>
                    {id === 'pencil' ? <span className="dock-tool__badge">{brushSize}</span> : null}
                  </button>
                ))}
              </div>
              <span className="dock-divider" />
              <button className="dock-current" onClick={() => openOverlay('palette')} aria-label={`当前颜色 ${selectedColor?.code ?? ''}，打开色板`}>
                <span className="dock-current__ring" />
                <span className="bead-dot" style={beadStyle(selectedColor?.hex ?? '#ddd')} />
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="overlay-root">
        {menuOpen && (
          <>
            <div className="menu-scrim" onClick={() => setMenuOpen(false)} />
            <div className="menu-popover" role="menu">
              <button className="menu-item" onClick={() => { setMenuOpen(false); startImport('editor'); }}><Icon name="image" />从图片导入</button>
              <button className="menu-item" onClick={() => openOverlay('mypalette')}><Icon name="bead" />我的色卡</button>
              <button className="menu-item" onClick={() => { setMenuOpen(false); if (layout === 'wide') setSideTab('settings'); else openOverlay('settingsPanel'); }} disabled={!engine}><Icon name="settings" />画布设置</button>
              <div className="menu-sep" />
              <button className="menu-item" onClick={toggleCodes}><Icon name="code" />显示格内色号<span className={`menu-item__check ${showCodes ? 'is-on' : ''}`}><Icon name="check" /></span></button>
              <button className="menu-item" onClick={toggleGrid}><Icon name="grid" />显示网格<span className={`menu-item__check ${showGrid ? 'is-on' : ''}`}><Icon name="check" /></span></button>
              <button className="menu-item" onClick={cycleSymmetry}><Icon name="symmetry" />对称绘制<span className="menu-item__meta">{symLabel(symmetry)}</span></button>
              <button className="menu-item" onClick={cycleBrush}><Icon name="pencil" />笔刷大小<span className="menu-item__meta">{brushSize}×{brushSize}</span></button>
              <div className="menu-sep" />
              <button className="menu-item" onClick={() => openOverlay('stats')}><Icon name="stats" />用量统计</button>
              <button className="menu-item" onClick={() => openOverlay('export')}><Icon name="download" />导出图纸</button>
              <div className="menu-sep" />
              <button className="menu-item" onClick={() => { setMenuOpen(false); void handleBack(); }}><Icon name="back" />返回首页</button>
            </div>
          </>
        )}

        {overlay === 'palette' && (
          <Sheet title="色板" onClose={() => setOverlay(null)} variant={layout === 'phone' ? 'bottom' : 'right'} className="palette-sheet">
            <PalettePanel
              project={project}
              stats={stats}
              compact
              onOpenMyPalette={() => openOverlay('mypalette')}
              onSelectColor={selectColor}
            />
          </Sheet>
        )}

        {overlay === 'mypalette' && (
          <MyPaletteSheet project={project} onClose={() => setOverlay(null)} />
        )}

        {overlay === 'stats' && (
          <StatsSheet project={project} stats={stats} onClose={() => setOverlay(null)} />
        )}

        {overlay === 'settings' && engine && (
          <SettingsSheet project={project} stats={stats} engine={engine} onClose={() => setOverlay(null)} />
        )}

        {overlay === 'settingsPanel' && engine && (
          <Sheet title="设置" onClose={() => setOverlay(null)} variant={layout === 'phone' ? 'bottom' : 'right'}>
            <SettingsPanel project={project} stats={stats} engine={engine} onOpenMyPalette={() => openOverlay('mypalette')} />
          </Sheet>
        )}

        {overlay === 'export' && (
          <ExportSheet project={project} stats={stats} onClose={() => setOverlay(null)} />
        )}
      </div>

      <div className="sr-only" aria-live="polite">
        当前图纸 {project.name}，{stats.total} 颗豆子，{stats.colorCount} 色。我的色卡 {myCount} 色。画布 {project.width}×{project.height}，{boardCount(project)} 块板。
      </div>
    </div>
  );
}
