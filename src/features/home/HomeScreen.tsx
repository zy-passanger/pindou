import { useCallback, useEffect, useRef, useState } from 'react';
import {
  boardCount,
  physicalSize,
  type Project,
  type ProjectSummary,
} from '@/core/model';
import { encodeProjectFile, sanitizeFileName } from '@/core/projectFile';
import {
  deleteProject,
  duplicateProject,
  getProject,
  importProjectFile,
  listProjectSummaries,
  saveProject,
} from '@/storage/projectRepository';
import { useAppStore } from '@/store/appStore';
import { Icon } from '@/ui/Icon';
import { Sheet } from '@/ui/Sheet';
import { beadStyle } from '@/ui/beadStyle';
import { downloadText } from '@/utils/download';
import { NewProjectSheet } from './NewProjectSheet';
import { ProjectThumb } from './ProjectThumb';

type HomeOverlay =
  | null
  | { type: 'new' }
  | { type: 'menu'; project: ProjectSummary }
  | { type: 'rename'; project: ProjectSummary }
  | { type: 'delete'; project: ProjectSummary };

function relativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  if (diff < 172_800_000) return '昨天';
  if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)} 天前`;
  return new Date(timestamp).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}

export function HomeScreen() {
  const projects = useAppStore((state) => state.projects);
  const layout = useAppStore((state) => state.layout);
  const setProjects = useAppStore((state) => state.setProjects);
  const openProject = useAppStore((state) => state.openProject);
  const startImport = useAppStore((state) => state.startImport);
  const showToast = useAppStore((state) => state.showToast);
  const [overlay, setOverlay] = useState<HomeOverlay>(null);
  const [renameValue, setRenameValue] = useState('');
  const [busy, setBusy] = useState(false);
  const importInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    setProjects(await listProjectSummaries());
  }, [setProjects]);

  useEffect(() => { void refresh(); }, [refresh]);

  const open = useCallback(async (id: string) => {
    try {
      const project = await getProject(id);
      if (!project) {
        showToast('工程加载失败', 'warn');
        return;
      }
      openProject(project);
    } catch {
      showToast('工程加载失败', 'warn');
    }
  }, [openProject, showToast]);

  const handleNewCreated = async (project: Project) => {
    await refresh();
    setOverlay(null);
    openProject(project);
    showToast('图纸已创建');
  };

  const exportProjectFile = async (project: ProjectSummary) => {
    try {
      const full = await getProject(project.id);
      if (!full) throw new Error('工程加载失败');
      downloadText(encodeProjectFile(full), `${sanitizeFileName(full.name)}.pindou.json`);
      setOverlay(null);
      showToast('工程文件已导出');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '导出失败', 'warn');
    }
  };

  const copyProject = async (project: ProjectSummary) => {
    if (busy) return;
    setBusy(true);
    try {
      const full = await getProject(project.id);
      if (!full) throw new Error('工程加载失败');
      await duplicateProject(full);
      await refresh();
      setOverlay(null);
      showToast('已复制图纸');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '复制失败', 'warn');
    } finally {
      setBusy(false);
    }
  };

  const renameProject = async () => {
    if (!overlay || overlay.type !== 'rename' || busy) return;
    const nextName = renameValue.trim();
    if (!nextName) return;
    setBusy(true);
    try {
      const full = await getProject(overlay.project.id);
      if (!full) throw new Error('工程加载失败');
      full.name = nextName.slice(0, 40);
      await saveProject(full);
      await refresh();
      setOverlay(null);
      showToast('已重命名');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '重命名失败', 'warn');
    } finally {
      setBusy(false);
    }
  };

  const removeProject = async () => {
    if (!overlay || overlay.type !== 'delete' || busy) return;
    setBusy(true);
    try {
      await deleteProject(overlay.project.id);
      await refresh();
      setOverlay(null);
      showToast('图纸已删除', 'info');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '删除失败', 'warn');
    } finally {
      setBusy(false);
    }
  };

  const onImportFile = async (file: File) => {
    try {
      const text = await file.text();
      const project = await importProjectFile(text, file.name);
      await refresh();
      openProject(project);
      showToast('工程已导入');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '导入失败', 'warn');
    }
  };

  const sheetVariant = layout === 'phone' ? 'bottom' : 'dialog';
  const totalBeads = projects.reduce((sum, project) => sum + project.totalBeads, 0);

  return (
    <div className="app-screen">
      <div className="home">
        <div className="home__inner">
          <header className="home__header">
            <div className="brand">
              <div className="brand__mark">
                <span className="logo-mark" aria-hidden="true"><i /><i /><i /><i /></span>
              </div>
              <div className="brand__copy">
                <div className="brand__name">拼豆工坊</div>
                <div className="brand__sub">PINDOU STUDIO</div>
              </div>
            </div>
            <div className="home__actions">
              <button className="btn btn--secondary" onClick={() => startImport('home')} aria-label="从图片开始">
                <Icon name="image" /><span>从图片开始</span>
              </button>
              <button className="btn btn--primary" onClick={() => setOverlay({ type: 'new' })}>
                <Icon name="plus" /><span>新建图纸</span>
              </button>
            </div>
          </header>

          <section className="hero">
            <div className="hero__copy">
              <div className="hero__eyebrow"><Icon name="sparkles" />2.6MM 融合豆 · MARD 色卡</div>
              <h1 className="hero__title">把灵感，拼成<br /><em>一颗颗豆子。</em></h1>
              <p className="hero__sub">导入图片或从空白开始，自动匹配真实色号，逐格调整后导出能直接照着拼的图纸。</p>
            </div>
            <div className="hero__beads" aria-hidden="true">
              <span className="hero-bead" /><span className="hero-bead" /><span className="hero-bead" />
              <span className="hero-bead" /><span className="hero-bead" /><span className="hero-bead" />
            </div>
          </section>

          <div className="section-head">
            <h2>最近工程</h2>
            <span className="section-head__count">{projects.length}</span>
            <span className="section-head__hint">共 {totalBeads.toLocaleString('zh-CN')} 颗豆子</span>
          </div>

          {projects.length ? (
            <div className="project-grid">
              {projects.map((project) => (
                <div
                  key={project.id}
                  className="project-card"
                  role="button"
                  tabIndex={0}
                  aria-label={`打开 ${project.name}`}
                  onClick={() => void open(project.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      void open(project.id);
                    }
                  }}
                >
                  <div className="project-card__thumb">
                    <ProjectThumb project={project} />
                    <span className="project-card__badge">
                      <Icon name="bead" />{project.width}×{project.height} · {project.beadSizeMm}mm
                    </span>
                    <button
                      className="project-card__more"
                      aria-label="更多操作"
                      onClick={(event) => {
                        event.stopPropagation();
                        setOverlay({ type: 'menu', project });
                      }}
                    >
                      <Icon name="more" />
                    </button>
                  </div>
                  <div className="project-card__body">
                    <div className="project-card__title">{project.name}</div>
                    <div className="project-card__meta">
                      <span>{physicalSize(project)}</span><span className="dot-sep" />
                      <span>{project.colorCount} 色</span><span className="dot-sep" />
                      <span>{boardCount(project)} 块板</span>
                    </div>
                    <div className="project-card__foot">
                      <span className="project-card__count"><Icon name="bead" />{project.totalBeads.toLocaleString('zh-CN')} 颗</span>
                      <span>{relativeTime(project.updatedAt)}</span>
                      <span className="project-card__open">打开<Icon name="chevron-right" /></span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="project-grid">
              <div className="home-empty">
                <div className="home-empty__beads" aria-hidden="true">
                  <span style={beadStyle('#F77C31')} />
                  <span style={beadStyle('#F551A2')} />
                  <span style={beadStyle('#41CCFF')} />
                </div>
                <h3>还没有图纸</h3>
                <p>新建一张空白图纸，或从图片开始自动生成色号图纸。</p>
                <div className="home-empty__actions">
                  <button className="btn btn--primary" onClick={() => setOverlay({ type: 'new' })}><Icon name="plus" />新建图纸</button>
                  <button className="btn btn--secondary" onClick={() => startImport('home')}><Icon name="image" />从图片开始</button>
                </div>
              </div>
            </div>
          )}

          <footer className="home__footer">
            <Icon name="info" />
            <span>屏幕色值仅作预览参考，实物颜色请以品牌色卡为准。工程与我的色卡保存在本机。</span>
            <button className="text-link" onClick={() => importInput.current?.click()}>
              <Icon name="upload" />导入工程文件
            </button>
          </footer>
        </div>
      </div>

      <input
        ref={importInput}
        type="file"
        accept=".json,application/json"
        style={{ display: 'none' }}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void onImportFile(file);
        }}
      />

      <div className="overlay-root">
        {overlay?.type === 'new' && (
          <NewProjectSheet onClose={() => setOverlay(null)} onCreated={(project) => void handleNewCreated(project)} />
        )}

        {overlay?.type === 'menu' && (
          <Sheet
            title={overlay.project.name}
            onClose={() => setOverlay(null)}
            variant={sheetVariant}
            narrow
            footer={undefined}
          >
            <button className="menu-item" onClick={() => { setOverlay(null); void open(overlay.project.id); }}>
              <Icon name="arrow-right" />打开图纸
            </button>
            <button className="menu-item" onClick={() => void copyProject(overlay.project)} disabled={busy}>
              <Icon name="copy" />复制一份
            </button>
            <button className="menu-item" onClick={() => { setRenameValue(overlay.project.name); setOverlay({ type: 'rename', project: overlay.project }); }}>
              <Icon name="edit" />重命名
            </button>
            <button className="menu-item" onClick={() => void exportProjectFile(overlay.project)}>
              <Icon name="download" />导出工程文件
            </button>
            <div className="menu-sep" />
            <button className="menu-item menu-item--danger" onClick={() => setOverlay({ type: 'delete', project: overlay.project })}>
              <Icon name="trash" />删除图纸
            </button>
          </Sheet>
        )}

        {overlay?.type === 'rename' && (
          <Sheet
            title="重命名图纸"
            onClose={() => setOverlay(null)}
            variant={sheetVariant}
            narrow
            footer={(
              <>
                <button className="btn btn--ghost" onClick={() => setOverlay({ type: 'menu', project: overlay.project })}>取消</button>
                <button className="btn btn--primary" onClick={() => void renameProject()} disabled={busy || !renameValue.trim()}>保存</button>
              </>
            )}
          >
            <div className="field">
              <label className="field__label" htmlFor="rename-project">名称</label>
              <input
                id="rename-project"
                className="input"
                data-autofocus
                value={renameValue}
                maxLength={40}
                onChange={(event) => setRenameValue(event.target.value)}
              />
            </div>
          </Sheet>
        )}

        {overlay?.type === 'delete' && (
          <Sheet
            title="删除这张图纸？"
            onClose={() => setOverlay({ type: 'menu', project: overlay.project })}
            variant={sheetVariant}
            narrow
            footer={(
              <>
                <button className="btn btn--ghost" onClick={() => setOverlay({ type: 'menu', project: overlay.project })}>取消</button>
                <button className="btn btn--danger" onClick={() => void removeProject()} disabled={busy}>删除</button>
              </>
            )}
          >
            <p style={{ color: 'var(--muted)', fontSize: 12, lineHeight: 1.7 }}>
              「{overlay.project.name}」会从本机删除，无法恢复。建议先导出工程文件备份。
            </p>
          </Sheet>
        )}
      </div>
    </div>
  );
}
