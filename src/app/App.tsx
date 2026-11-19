import { useEffect, useState } from 'react';
import { useAppStore } from '@/store/appStore';
import { getSettings, listProjectSummaries, seedIfNeeded } from '@/storage/projectRepository';
import { useLayout } from '@/ui/useLayout';
import { ToastHost } from '@/ui/ToastHost';
import { beadStyle } from '@/ui/beadStyle';
import { HomeScreen } from '@/features/home/HomeScreen';
import { EditorScreen } from '@/features/editor/EditorScreen';
import { ImportWizard } from '@/features/import/ImportWizard';
import { PwaUpdateBanner } from './PwaUpdateBanner';

export function App() {
  const layout = useLayout();
  const view = useAppStore((state) => state.view);
  const importEntry = useAppStore((state) => state.importEntry);
  const currentProject = useAppStore((state) => state.currentProject);
  const setSettings = useAppStore((state) => state.setSettings);
  const setProjects = useAppStore((state) => state.setProjects);
  const showToast = useAppStore((state) => state.showToast);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const settings = await getSettings();
        if (!alive) return;
        setSettings(settings);
        await seedIfNeeded();
        const projects = await listProjectSummaries();
        if (!alive) return;
        setProjects(projects);
      } catch (error) {
        if (alive) showToast(error instanceof Error ? error.message : '本地数据加载失败', 'warn');
      } finally {
        if (alive) setReady(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [setProjects, setSettings, showToast]);

  const importFromEditor = view === 'import' && importEntry === 'editor' && !!currentProject;
  const showEditor = view === 'editor' || importFromEditor;

  return (
    <div id="app" data-layout={layout}>
      {!ready ? (
        <div className="app-boot">
          <div className="app-boot__beads" aria-hidden="true">
            <span style={beadStyle('#D95D4E')} />
            <span style={beadStyle('#C9933F')} />
            <span style={beadStyle('#2F6B62')} />
            <span style={beadStyle('#41CCFF')} />
          </div>
          <span>正在打开本机图纸…</span>
        </div>
      ) : (
        <>
          {showEditor && <EditorScreen />}
          {view === 'home' && <HomeScreen />}
          {view === 'import' && !importFromEditor && <ImportWizard />}
          {importFromEditor && (
            <div className="import-overlay">
              <ImportWizard />
            </div>
          )}
        </>
      )}
      <ToastHost />
      <PwaUpdateBanner />
    </div>
  );
}
