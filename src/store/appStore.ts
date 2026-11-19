import { create } from 'zustand';
import type { Project, ProjectSummary } from '@/core/model';
import { DEFAULT_MY_PALETTE, MARD_PALETTE } from '@/core/palette';
import { computeStats, mostUsedIndex, type ProjectStats } from '@/core/stats';
import type { AppSettings } from '@/storage/db';
import { saveMyPaletteCodes, saveSettings } from '@/storage/projectRepository';
import type { AiSizePreset } from '@/core/imagegen/types';

export type View = 'home' | 'editor' | 'import';
export type Layout = 'wide' | 'tablet' | 'phone';
export type PaletteTab = 'used' | 'all' | 'mine';
export type ToolId = 'pencil' | 'eraser' | 'fill' | 'eyedropper' | 'line' | 'rect' | 'ellipse' | 'pan';
export type Symmetry = 'none' | 'h' | 'v' | 'both';
export type ToastTone = 'success' | 'info' | 'warn';

export interface EditorSnapshot {
  stats: ProjectStats | null;
  canUndo: boolean;
  canRedo: boolean;
  zoom: number;
  cellSize: number;
  cursor: { x: number; y: number } | null;
  revision: number;
}

export interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

export interface PendingImport {
  source: HTMLImageElement | HTMLCanvasElement;
  url: string;
  name: string;
  generationId?: string;
  autoFrame: boolean;
  startStep: 2 | 3;
  size?: { width: number; height: number };
  sizePreset?: AiSizePreset;
  paramOverrides?: {
    removeBg?: boolean;
    tolerance?: number;
    autoPalette?: boolean;
    maxColors?: number;
    mergeNear?: number;
    dither?: boolean;
    matchMode?: 'standard' | 'faithful';
    resample?: 'smooth' | 'sharp';
  };
}

interface AppState {
  view: View;
  layout: Layout;
  importEntry: 'home' | 'editor' | null;
  pendingImport: PendingImport | null;
  projects: ProjectSummary[];
  currentProject: Project | null;
  settings: AppSettings | null;
  myPaletteCodes: string[];
  selectedColorCode: string;
  tool: ToolId;
  brushSize: number;
  symmetry: Symmetry;
  showCodes: boolean;
  showGrid: boolean;
  paletteTab: PaletteTab;
  paletteSearch: string;
  seriesFilter: string;
  editor: EditorSnapshot;
  toasts: ToastItem[];

  setLayout: (layout: Layout) => void;
  setView: (view: View) => void;
  setProjects: (projects: ProjectSummary[]) => void;
  openProject: (project: Project) => void;
  finishImport: (project: Project) => void;
  closeEditor: () => void;
  startImport: (entry: 'home' | 'editor') => void;
  startImportWithImage: (entry: 'home' | 'editor', seed: PendingImport) => void;
  consumePendingImport: () => void;
  cancelImport: () => void;
  setSettings: (settings: AppSettings) => void;
  setMyPaletteCodes: (codes: string[]) => void;
  setSelectedColorCode: (code: string) => void;
  setTool: (tool: ToolId) => void;
  setBrushSize: (size: number) => void;
  setSymmetry: (symmetry: Symmetry) => void;
  setShowCodes: (value: boolean) => void;
  setShowGrid: (value: boolean) => void;
  setPaletteTab: (tab: PaletteTab) => void;
  setPaletteSearch: (search: string) => void;
  setSeriesFilter: (series: string) => void;
  setEditorSnapshot: (snapshot: Partial<EditorSnapshot>) => void;
  resetEditor: () => void;
  showToast: (message: string, tone?: ToastTone) => void;
  dismissToast: (id: number) => void;
}

const emptyEditor: EditorSnapshot = {
  stats: null,
  canUndo: false,
  canRedo: false,
  zoom: 1,
  cellSize: 8,
  cursor: null,
  revision: 0,
};

function defaultColorCode(project: Project): string {
  const stats = computeStats(project.cells, project.palette);
  const index = mostUsedIndex(stats);
  if (index !== null && project.palette.colors[index]) return project.palette.colors[index].code;
  return project.palette.colors.some((color) => color.code === 'F04') ? 'F04' : project.palette.colors[0]?.code ?? 'F04';
}

let toastSeq = 0;

export const useAppStore = create<AppState>((set, get) => ({
  view: 'home',
  layout: 'wide',
  importEntry: null,
  pendingImport: null,
  projects: [],
  currentProject: null,
  settings: null,
  myPaletteCodes: [...DEFAULT_MY_PALETTE],
  selectedColorCode: 'F04',
  tool: 'pencil',
  brushSize: 1,
  symmetry: 'none',
  showCodes: true,
  showGrid: true,
  paletteTab: 'used',
  paletteSearch: '',
  seriesFilter: 'all',
  editor: emptyEditor,
  toasts: [],

  setLayout: (layout) => set({ layout }),
  setView: (view) => set({ view }),
  setProjects: (projects) => set({ projects }),

  openProject: (project) => {
    const stats = computeStats(project.cells, project.palette);
    set({
      currentProject: project,
      view: 'editor',
      importEntry: null,
      pendingImport: null,
      selectedColorCode: defaultColorCode(project),
      tool: 'pencil',
      paletteTab: 'used',
      paletteSearch: '',
      seriesFilter: 'all',
      editor: {
        stats,
        canUndo: false,
        canRedo: false,
        zoom: 1,
        cellSize: 8,
        cursor: null,
        revision: 0,
      },
    });
  },

  finishImport: (project) => get().openProject(project),
  closeEditor: () => set({ view: 'home', currentProject: null, importEntry: null, pendingImport: null, editor: emptyEditor }),
  startImport: (entry) => set({ view: 'import', importEntry: entry, pendingImport: null }),
  startImportWithImage: (entry, seed) => set({ view: 'import', importEntry: entry, pendingImport: seed }),
  consumePendingImport: () => set({ pendingImport: null }),
  cancelImport: () => {
    const { importEntry, currentProject } = get();
    set({
      view: importEntry === 'editor' && currentProject ? 'editor' : 'home',
      importEntry: null,
      pendingImport: null,
    });
  },

  setSettings: (settings) => set({
    settings,
    myPaletteCodes: settings.myPaletteCodes,
    showGrid: settings.prefs.showGrid,
    showCodes: settings.prefs.showCodes,
  }),

  setMyPaletteCodes: (codes) => {
    const settings = get().settings;
    set({ myPaletteCodes: codes });
    if (settings) {
      const next = { ...settings, myPaletteCodes: codes };
      set({ settings: next });
      void saveSettings(next);
    } else {
      void saveMyPaletteCodes(codes);
    }
  },

  setSelectedColorCode: (code) => set({ selectedColorCode: code }),
  setTool: (tool) => set({ tool }),
  setBrushSize: (size) => set({ brushSize: Math.max(1, Math.min(3, size)) }),
  setSymmetry: (symmetry) => set({ symmetry }),

  setShowCodes: (value) => {
    set({ showCodes: value });
    const settings = get().settings;
    if (settings) {
      const next = { ...settings, prefs: { ...settings.prefs, showCodes: value } };
      set({ settings: next });
      void saveSettings(next);
    }
  },

  setShowGrid: (value) => {
    set({ showGrid: value });
    const settings = get().settings;
    if (settings) {
      const next = { ...settings, prefs: { ...settings.prefs, showGrid: value } };
      set({ settings: next });
      void saveSettings(next);
    }
  },

  setPaletteTab: (tab) => set({ paletteTab: tab }),
  setPaletteSearch: (search) => set({ paletteSearch: search }),
  setSeriesFilter: (series) => set({ seriesFilter: series }),
  setEditorSnapshot: (snapshot) => set((state) => ({
    editor: { ...state.editor, ...snapshot, revision: state.editor.revision + 1 },
  })),
  resetEditor: () => set({ editor: emptyEditor }),

  showToast: (message, tone = 'success') => {
    const id = ++toastSeq;
    set((state) => ({ toasts: [...state.toasts, { id, message, tone }] }));
    setTimeout(() => get().dismissToast(id), 2600);
  },
  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
}));

export const TOOL_LABELS: Record<ToolId, string> = {
  pencil: '画笔',
  eraser: '橡皮',
  fill: '填充',
  eyedropper: '吸管',
  line: '直线',
  rect: '矩形',
  ellipse: '椭圆',
  pan: '平移',
};

export const SERIES_FILTERS = ['all', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', '其他'];

export function seriesMatches(color: { series: string }, filter: string): boolean {
  if (filter === 'all') return true;
  if (filter === '其他') return !['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].includes(color.series);
  return color.series === filter;
}

export { MARD_PALETTE };
