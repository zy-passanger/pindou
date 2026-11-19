import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { createProject, type BeadSizeMm, type Project } from '@/core/model';
import { MARD_PALETTE } from '@/core/palette';
import { resampleArea } from '@/core/resample';
import { createSeedProjects } from '@/core/seed';
import { detectContentBounds, frameContentBounds } from '@/core/imageBounds';
import { getActiveEngine } from '@/editor/engineBridge';
import { createSampleImage, drawPatternCanvas } from '@/export/preview';
import { saveProjectWithThumbnail } from '@/storage/projectRepository';
import { markGenerationProject } from '@/storage/aiRepository';
import { useAppStore } from '@/store/appStore';
import { Icon } from '@/ui/Icon';
import { beadStyle } from '@/ui/beadStyle';

type Step = 1 | 2 | 3 | 4 | 5;
type ImageSource = HTMLImageElement | HTMLCanvasElement;

interface CropState {
  zoom: number;
  offsetX: number;
  offsetY: number;
  rotate: number;
  fit: 'fill' | 'contain';
}

interface Params {
  brightness: number;
  contrast: number;
  saturation: number;
  removeBg: boolean;
  tolerance: number;
  maxColors: number;
  dither: boolean;
  matchMode: 'standard' | 'faithful';
  resample: 'smooth' | 'sharp';
  autoPalette: boolean;
  mergeNear: number;
}

interface QuantizeResult {
  cells: Uint16Array;
  total: number;
  colorCount: number;
}

const DEFAULT_CROP: CropState = { zoom: 1, offsetX: 0, offsetY: 0, rotate: 0, fit: 'fill' };
const DEFAULT_PARAMS: Params = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  removeBg: true,
  tolerance: 2,
  maxColors: 12,
  dither: false,
  matchMode: 'faithful',
  resample: 'sharp',
  autoPalette: true,
  mergeNear: 0,
};

function previewSize(width: number, height: number, max = 720): { w: number; h: number } {
  return width >= height
    ? { w: max, h: Math.round((max * height) / width) }
    : { w: Math.round((max * width) / height), h: max };
}

function renderCrop(
  ctx: CanvasRenderingContext2D,
  cw: number,
  ch: number,
  image: ImageSource,
  crop: CropState,
  options: { background?: string; guides?: boolean } = {},
): void {
  ctx.clearRect(0, 0, cw, ch);
  if (options.background) {
    ctx.fillStyle = options.background;
    ctx.fillRect(0, 0, cw, ch);
  }
  const iw = image.width;
  const ih = image.height;
  if (!iw || !ih) return;
  const base = crop.fit === 'fill' ? Math.max(cw / iw, ch / ih) : Math.min(cw / iw, ch / ih);
  const scale = base * crop.zoom;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, cw, ch);
  ctx.clip();
  ctx.translate(cw / 2 + crop.offsetX * cw, ch / 2 + crop.offsetY * ch);
  ctx.rotate((crop.rotate * Math.PI) / 180);
  ctx.scale(scale, scale);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, -iw / 2, -ih / 2);
  ctx.restore();

  if (options.guides) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,.45)';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 2; i += 1) {
      const x = (cw * i) / 3;
      const y = (ch * i) / 3;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, ch);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(cw, y);
      ctx.stroke();
    }
    const corner = Math.min(22, Math.min(cw, ch) * 0.08);
    const inset = 7;
    ctx.strokeStyle = 'rgba(255,253,247,.9)';
    ctx.lineWidth = 2;
    ([
      [inset, inset, 1, 1],
      [cw - inset, inset, -1, 1],
      [inset, ch - inset, 1, -1],
      [cw - inset, ch - inset, -1, -1],
    ] as const).forEach(([x, y, dx, dy]) => {
      ctx.beginPath();
      ctx.moveTo(x + dx * corner, y);
      ctx.lineTo(x, y);
      ctx.lineTo(x, y + dy * corner);
      ctx.stroke();
    });
    ctx.restore();
  }
}

/** 用缩略图找主体边界，再换算成裁剪组件的 zoom/offset。 */
function autoFrameImage(image: ImageSource, targetW: number, targetH: number): CropState | null {
  const max = 640;
  const currentW = image.width;
  const currentH = image.height;
  if (!currentW || !currentH) return null;
  const scale = Math.min(1, max / Math.max(currentW, currentH));
  const width = Math.max(1, Math.round(currentW * scale));
  const height = Math.max(1, Math.round(currentH * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);
  const pixels = ctx.getImageData(0, 0, width, height);
  const bounds = detectContentBounds({ width, height, data: pixels.data });
  if (!bounds) return null;
  const inv = 1 / scale;
  const frame = frameContentBounds(
    currentW,
    currentH,
    { x: bounds.x * inv, y: bounds.y * inv, width: bounds.width * inv, height: bounds.height * inv },
    targetW,
    targetH,
  );
  return { ...frame, rotate: 0, fit: 'fill' };
}

function cornerColor(imageData: ImageData): string {
  const { width, height, data } = imageData;
  const points: Array<[number, number]> = [[0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1]];
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;
  points.forEach(([x, y]) => {
    const offset = (y * width + x) * 4;
    if (data[offset + 3] < 32) return;
    r += data[offset];
    g += data[offset + 1];
    b += data[offset + 2];
    count += 1;
  });
  if (!count) return '#FFFFFF';
  const toHex = (v: number) => Math.round(v / count).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

export function ImportWizard() {
  const layout = useAppStore((state) => state.layout);
  const entry = useAppStore((state) => state.importEntry) ?? 'home';
  const currentProject = useAppStore((state) => state.currentProject);
  const myPaletteCodes = useAppStore((state) => state.myPaletteCodes);
  const cancelImport = useAppStore((state) => state.cancelImport);
  const openProject = useAppStore((state) => state.openProject);
  const showToast = useAppStore((state) => state.showToast);

  const targetPalette = entry === 'editor' && currentProject ? currentProject.palette : MARD_PALETTE;
  const initialSeedRef = useRef(useAppStore.getState().pendingImport);
  const [sizePreset, setSizePreset] = useState<'44x52' | '52x52' | '78x78' | '104x104'>(initialSeedRef.current?.sizePreset ?? '52x52');
  const targetW = entry === 'editor' && currentProject ? currentProject.width : Number(sizePreset.split('x')[0]);
  const targetH = entry === 'editor' && currentProject ? currentProject.height : Number(sizePreset.split('x')[1]);
  const beadSize: BeadSizeMm = entry === 'editor' && currentProject ? currentProject.beadSizeMm : 2.6;
  const [step, setStep] = useState<Step>(initialSeedRef.current?.startStep ?? 1);
  const [generationId, setGenerationId] = useState<string | null>(initialSeedRef.current?.generationId ?? null);
  const [image, setImage] = useState<ImageSource | null>(null);
  const [imageUrl, setImageUrl] = useState('');
  const [imageName, setImageName] = useState('');
  const [crop, setCrop] = useState<CropState>(DEFAULT_CROP);
  const [params, setParams] = useState<Params>(DEFAULT_PARAMS);
  const [result, setResult] = useState<QuantizeResult | null>(null);
  const [processing, setProcessing] = useState(false);
  const [wizardError, setWizardError] = useState<string | null>(null);
  const [applyMode, setApplyMode] = useState<'replace' | 'new'>(entry === 'editor' ? 'replace' : 'new');
  const [name, setName] = useState('图片图纸');
  const [busy, setBusy] = useState(false);
  const [split, setSplit] = useState(50);

  const fileInput = useRef<HTMLInputElement>(null);
  const cropCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const compareBeforeRef = useRef<HTMLCanvasElement>(null);
  const compareAfterRef = useRef<HTMLCanvasElement>(null);
  const applyThumbRef = useRef<HTMLCanvasElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const jobRef = useRef(0);
  const compareRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ active: boolean; startX: number; startY: number; offsetX: number; offsetY: number }>({ active: false, startX: 0, startY: 0, offsetX: 0, offsetY: 0 });

  const samples = useMemo(() => {
    if (typeof document === 'undefined') return [];
    const seeds = createSeedProjects();
    return seeds.slice(0, 3).map((seed, index) => {
      const canvas = createSampleImage(seed.project, 640);
      return {
        id: seed.project.id,
        name: seed.project.name,
        hint: `2.6mm · ${seed.project.width}×${seed.project.height}`,
        canvas,
        url: canvas.toDataURL('image/png'),
        index,
      };
    });
  }, []);

  const selectedSample = samples.find((sample) => sample.url === imageUrl);

  useEffect(() => {
    const worker = new Worker(new URL('../../workers/quantize.worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;
    worker.onmessage = (event: MessageEvent) => {
      const message = event.data;
      if (!message || message.jobId !== jobRef.current) return;
      if (message.type === 'result') {
        setResult({ cells: message.cells, total: message.total, colorCount: message.colorCount });
        setProcessing(false);
        setWizardError(null);
      } else if (message.type === 'error') {
        setProcessing(false);
        setWizardError(message.message || '图片处理失败');
      }
    };
    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (imageUrl.startsWith('blob:')) URL.revokeObjectURL(imageUrl);
    };
  }, [imageUrl]);

  const selectImage = (
    source: ImageSource,
    url: string,
    label: string,
    options?: { autoFrame?: boolean; targetW?: number; targetH?: number; generationId?: string },
  ) => {
    setImage(source);
    setImageUrl(url);
    setImageName(label);
    // 透明留白或纯色背景留白会自动按主体边界取景，主体真正铺满画布；
    // 用户仍可在裁剪步骤手动拖动或点「自动取景」重算。
    // AI 色号网格是精确构图，关闭自动取景，避免裁掉主体边缘。
    const frameW = options?.targetW ?? targetW;
    const frameH = options?.targetH ?? targetH;
    setCrop(options?.autoFrame === false ? { ...DEFAULT_CROP } : (autoFrameImage(source, frameW, frameH) ?? { ...DEFAULT_CROP }));
    setResult(null);
    setWizardError(null);
    setGenerationId(options?.generationId ?? null);
    const baseName = label ? label.replace(/\.[^.]+$/, '') : '图片';
    setName(baseName.endsWith('图纸') ? baseName : `${baseName} 图纸`);
  };

  // AI 生成 Sheet 通过 pendingImport 把图片交进来。只消费一次；StrictMode 的
  // setup/cleanup 重跑时第二次读到 null，不会重复选图。
  useEffect(() => {
    const seed = useAppStore.getState().pendingImport;
    if (!seed) return;
    useAppStore.getState().consumePendingImport();
    if (seed.paramOverrides) {
      setParams((prev) => ({ ...prev, ...seed.paramOverrides }));
    }
    const size = seed.size ?? (seed.sizePreset
      ? { width: Number(seed.sizePreset.split('x')[0]), height: Number(seed.sizePreset.split('x')[1]) }
      : undefined);
    selectImage(seed.source, seed.url, seed.name, {
      autoFrame: seed.autoFrame,
      targetW: size?.width,
      targetH: size?.height,
      generationId: seed.generationId,
    });
    setStep(seed.startStep);
    // selectImage 每次渲染都会重建，但 pendingImport 是 mount 时的一次性输入；
    // 这里故意只在挂载时消费，避免依赖函数导致重复执行。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reframe = () => {
    if (!image) return;
    const frame = autoFrameImage(image, targetW, targetH);
    if (frame) {
      setCrop(frame);
      showToast('已按主体边界自动取景');
    } else {
      setCrop({ ...DEFAULT_CROP });
      showToast('没有检测到可裁剪的留白，已恢复整图', 'info');
    }
  };

  const chooseSample = (sample: (typeof samples)[number]) => {
    selectImage(sample.canvas, sample.url, sample.name);
    setStep(2);
  };

  const loadFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      showToast('请选择 JPG / PNG / WebP 图片', 'warn');
      return;
    }
    try {
      const url = URL.createObjectURL(file);
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('图片无法解码'));
        img.src = url;
      });
      selectImage(img, url, file.name);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '图片加载失败', 'warn');
    }
  };

  const drawCropPreview = useCallback(() => {
    const canvas = cropCanvasRef.current;
    if (!canvas || !image) return;
    const size = previewSize(targetW, targetH);
    if (canvas.width !== size.w || canvas.height !== size.h) {
      canvas.width = size.w;
      canvas.height = size.h;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    renderCrop(ctx, canvas.width, canvas.height, image, crop, { background: '#DCD0BD', guides: true });
  }, [crop, image, targetW, targetH]);

  useEffect(() => {
    if (step === 2) drawCropPreview();
  }, [step, drawCropPreview]);

  const buildTargetData = useCallback((): ImageData | null => {
    if (!image) return null;
    const canvas = document.createElement('canvas');
    if (params.resample === 'sharp') {
      // 按目标格子的 4×4 源像素做面积平均，避免浏览器插值把细线糊掉。
      const factor = 4;
      const big = document.createElement('canvas');
      big.width = targetW * factor;
      big.height = targetH * factor;
      const bctx = big.getContext('2d', { willReadFrequently: true });
      if (!bctx) return null;
      renderCrop(bctx, big.width, big.height, image, crop);
      const source = bctx.getImageData(0, 0, big.width, big.height).data;
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return null;
      const resampled = resampleArea(source, big.width, big.height, targetW, targetH);
      const out = ctx.createImageData(targetW, targetH);
      out.data.set(resampled.data);
      return out;
    }
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    renderCrop(ctx, targetW, targetH, image, crop);
    return ctx.getImageData(0, 0, targetW, targetH);
  }, [crop, image, params.resample, targetW, targetH]);

  const runQuantize = useCallback(() => {
    if (!image || !workerRef.current) return;
    const data = buildTargetData();
    if (!data) return;
    const allowed = new Uint8Array(targetPalette.colors.length);
    const mySet = new Set(myPaletteCodes);
    let any = false;
    targetPalette.colors.forEach((color, index) => {
      if (mySet.has(color.code)) {
        allowed[index] = 1;
        any = true;
      }
    });
    if (!any) allowed.fill(1);
    const jobId = jobRef.current + 1;
    jobRef.current = jobId;
    setProcessing(true);
    setWizardError(null);
    workerRef.current.postMessage({
      type: 'quantize',
      jobId,
      width: targetW,
      height: targetH,
      data: data.data,
      palette: targetPalette.colors,
      allowed,
      options: {
        brightness: params.brightness,
        contrast: params.contrast,
        saturation: params.saturation,
        removeBackground: params.removeBg,
        backgroundHex: cornerColor(data),
        backgroundTolerance: params.tolerance,
        alphaThreshold: 16,
        maxColors: params.maxColors,
        dither: params.dither,
        matchMode: params.matchMode,
        autoPalette: params.autoPalette,
        mergeNear: params.mergeNear,
      },
    }, [data.data.buffer]);
  }, [buildTargetData, image, myPaletteCodes, params, targetPalette.colors, targetW, targetH]);

  useEffect(() => {
    if (step < 3 || !image) return undefined;
    const timer = window.setTimeout(runQuantize, 140);
    return () => window.clearTimeout(timer);
  }, [step, image, crop, params, runQuantize]);

  useEffect(() => {
    if (!result) return;
    if (step === 3 && previewRef.current) {
      if (previewRef.current.width !== 640 || previewRef.current.height !== 640) {
        previewRef.current.width = 640;
        previewRef.current.height = 640;
      }
      drawPatternCanvas(previewRef.current, targetPalette.colors, targetW, targetH, result.cells, { grid: false });
    }
    if ((step === 4 || step === 5) && compareBeforeRef.current && compareAfterRef.current && image) {
      const size = previewSize(targetW, targetH, 640);
      [compareBeforeRef.current, compareAfterRef.current].forEach((canvas) => {
        if (canvas.width !== size.w || canvas.height !== size.h) {
          canvas.width = size.w;
          canvas.height = size.h;
        }
      });
      const beforeCtx = compareBeforeRef.current.getContext('2d');
      if (beforeCtx && image) renderCrop(beforeCtx, size.w, size.h, image, crop, { background: '#DCD0BD' });
      drawPatternCanvas(compareAfterRef.current, targetPalette.colors, targetW, targetH, result.cells, { grid: false });
    }
    if (step === 5 && applyThumbRef.current) {
      if (applyThumbRef.current.width !== 640 || applyThumbRef.current.height !== 640) {
        applyThumbRef.current.width = 640;
        applyThumbRef.current.height = 640;
      }
      drawPatternCanvas(applyThumbRef.current, targetPalette.colors, targetW, targetH, result.cells, { grid: false });
    }
  }, [crop, image, result, step, targetPalette.colors, targetH, targetW]);

  const onCropPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    dragRef.current = {
      active: true,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: crop.offsetX,
      offsetY: crop.offsetY,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    void rect;
  };

  const onCropPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!dragRef.current.active) return;
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const dx = (event.clientX - dragRef.current.startX) / (rect.width || 1);
    const dy = (event.clientY - dragRef.current.startY) / (rect.height || 1);
    setCrop((prev) => ({ ...prev, offsetX: dragRef.current.offsetX + dx, offsetY: dragRef.current.offsetY + dy }));
  };

  const onCropPointerUp = () => {
    dragRef.current.active = false;
  };

  const onComparePointer = (event: ReactPointerEvent<HTMLDivElement>, active: boolean) => {
    if (!active) return;
    const compare = compareRef.current;
    if (!compare) return;
    const rect = compare.getBoundingClientRect();
    const next = Math.max(5, Math.min(95, ((event.clientX - rect.left) / rect.width) * 100));
    setSplit(next);
    compare.style.setProperty('--split', `${next}%`);
  };

  const goStep = (next: Step) => {
    if (next > step) return;
    setStep(next);
    window.setTimeout(() => {
      const body = document.querySelector('.wizard__body');
      if (body) body.scrollTop = 0;
    }, 0);
  };

  const canNext = step === 1 ? !!image : step === 3 || step === 4 ? !!result : true;
  const next = () => {
    if (!canNext || step >= 5) return;
    setStep((step + 1) as Step);
    window.setTimeout(() => {
      const body = document.querySelector('.wizard__body');
      if (body) body.scrollTop = 0;
    }, 0);
  };

  const apply = async () => {
    if (!result || busy) return;
    setBusy(true);
    try {
      if (entry === 'editor' && currentProject && applyMode === 'replace') {
        const engine = getActiveEngine();
        if (engine && engine.project.id === currentProject.id) {
          engine.replaceAll(result.cells, targetW, targetH, 'import');
        } else {
          currentProject.width = targetW;
          currentProject.height = targetH;
          currentProject.cells = result.cells;
          currentProject.updatedAt = Date.now();
          await saveProjectWithThumbnail(currentProject);
        }
        if (generationId && currentProject) {
          await markGenerationProject(generationId, currentProject.id).catch(() => {});
        }
        cancelImport();
        showToast('已替换当前画布，可撤销恢复');
      } else {
        const finalName = name.trim() || `${imageName.replace(/\.[^.]+$/, '') || '图片'} 图纸`;
        const project: Project = createProject({
          name: finalName.slice(0, 40),
          width: targetW,
          height: targetH,
          beadSizeMm: beadSize,
          palette: targetPalette,
          cells: result.cells.slice(),
        });
        await saveProjectWithThumbnail(project);
        if (generationId) await markGenerationProject(generationId, project.id).catch(() => {});
        openProject(project);
        showToast('图纸已创建');
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : '应用失败', 'warn');
      setBusy(false);
    }
  };

  const steps: Array<{ n: Step; label: string }> = [
    { n: 1, label: '选图' }, { n: 2, label: '裁剪' }, { n: 3, label: '调色' }, { n: 4, label: '预览' }, { n: 5, label: '应用' },
  ];

  const hints = ['选择一张图片开始', '拖动图片或滑块调整裁剪', '调整后自动匹配 MARD 色号', '拖动滑块对比原图与图纸', '应用后仍可逐格修改'];

  return (
    <div className="app-screen">
      <div className="wizard">
        <div className="wizard__top">
          <button className="icon-btn" onClick={cancelImport} aria-label="关闭"><Icon name="close" /></button>
          <h1>图片转图纸</h1>
          <div className="stepper">
            {steps.map((item, index) => (
              <span key={item.n} style={{ display: 'contents' }}>
                <button
                  className={`step ${step === item.n ? 'is-active' : ''} ${step > item.n ? 'is-done' : ''}`}
                  onClick={() => goStep(item.n)}
                  disabled={item.n > step}
                >
                  <span className="step__num">{step > item.n ? <Icon name="check" /> : item.n}</span>
                  <span className="step__label">{item.label}</span>
                </button>
                {index < steps.length - 1 ? <span className="step__line" /> : null}
              </span>
            ))}
          </div>
        </div>

        <div className="wizard__body">
          <div className="wizard__inner">
            {step === 1 && (
              <>
                <div className="wizard-heading">
                  <div className="wizard-heading__eyebrow"><Icon name="image" />STEP 1 · 选择图片</div>
                  <h2>从一张图片开始</h2>
                  <p>主体清晰、背景简单的图片效果最好。也可以直接使用示例图片体验完整流程。</p>
                </div>
                <button className="dropzone" onClick={() => fileInput.current?.click()}>
                  <span className="dropzone__icon"><Icon name="upload" /></span>
                  <span className="dropzone__title">选择一张图片</span>
                  <span className="dropzone__hint">JPG / PNG / WebP，建议 1000px 以上</span>
                  <span className="dropzone__demo"><Icon name="sparkles" />也可以选择下方示例图片</span>
                </button>
                {image && (
                  <div className="selected-image">
                    <img src={imageUrl} alt="" />
                    <div className="selected-image__copy">
                      <strong>{imageName || '已选图片'}</strong>
                      <span>{image.width} × {image.height} px · 目标 {targetW}×{targetH}</span>
                    </div>
                    <span className="badge badge--teal">已选择</span>
                  </div>
                )}
                <div className="sample-section">
                  <div className="sample-section__head"><h3>示例图片</h3><span>点击选择</span></div>
                  <div className="sample-grid">
                    {samples.map((sample) => (
                      <button
                        key={sample.id}
                        className={`sample-card ${selectedSample?.id === sample.id ? 'is-active' : ''}`}
                        onClick={() => chooseSample(sample)}
                      >
                        <span className="sample-card__thumb">
                          <img src={sample.url} alt="" />
                          <span className="sample-card__check"><Icon name="check" /></span>
                        </span>
                        <span className="sample-card__body">
                          <span className="sample-card__name">{sample.name}</span>
                          <span className="sample-card__meta">{sample.hint}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = '';
                    if (file) void loadFile(file);
                  }}
                />
              </>
            )}

            {step === 2 && image && (
              <>
                <div className="wizard-heading">
                  <div className="wizard-heading__eyebrow"><Icon name="crop" />STEP 2 · 裁剪</div>
                  <h2>把主体放进画布</h2>
                  <p>裁剪框比例与目标图纸一致（{targetW}×{targetH}）。拖动图片、缩放或旋转。</p>
                </div>
                <div className="crop-layout">
                  <div className="crop-card">
                    <div className="crop-view" style={{ aspectRatio: `${targetW} / ${targetH}` }}>
                      <canvas
                        ref={cropCanvasRef}
                        className="crop-canvas"
                        onPointerDown={onCropPointerDown}
                        onPointerMove={onCropPointerMove}
                        onPointerUp={onCropPointerUp}
                        onPointerCancel={onCropPointerUp}
                      />
                      <span className="crop-view__badge">裁剪预览 · {targetW}×{targetH}</span>
                    </div>
                  </div>
                  <div className="crop-side">
                    <div className="crop-controls">
                      <div className="field">
                        <div className="field__label" style={{ justifyContent: 'space-between' }}>
                          <span>缩放</span><span className="tabular">{Math.round(crop.zoom * 100)}%</span>
                        </div>
                        <input
                          className="slider"
                          type="range"
                          min={100}
                          max={800}
                          value={Math.round(crop.zoom * 100)}
                          onChange={(event) => setCrop((prev) => ({ ...prev, zoom: Number(event.target.value) / 100 }))}
                        />
                      </div>
                      <div className="crop-controls__row" style={{ marginTop: 13, gap: 8 }}>
                        <button className="btn btn--secondary btn--sm" onClick={() => setCrop((prev) => ({ ...prev, rotate: (prev.rotate + 90) % 360 }))}>
                          <Icon name="rotate-right" />旋转 {crop.rotate}°
                        </button>
                        <button className="btn btn--secondary btn--sm" onClick={reframe}>
                          <Icon name="crop" />自动取景
                        </button>
                      </div>
                      <div className="crop-controls__row" style={{ marginTop: 10 }}>
                        <div className="segmented" style={{ width: '100%' }}>
                          <button className={crop.fit === 'fill' ? 'is-active' : ''} style={{ flex: 1 }} onClick={() => setCrop((prev) => ({ ...prev, fit: 'fill' }))}>填充</button>
                          <button className={crop.fit === 'contain' ? 'is-active' : ''} style={{ flex: 1 }} onClick={() => setCrop((prev) => ({ ...prev, fit: 'contain' }))}>适应</button>
                        </div>
                      </div>
                    </div>
                    <div className="crop-tip"><Icon name="info" /><span>已按主体边界自动取景；拖动可平移，点「自动取景」可重新计算。裁剪只影响转换范围。</span></div>
                  </div>
                </div>
              </>
            )}

            {step === 3 && image && (
              <>
                <div className="wizard-heading">
                  <div className="wizard-heading__eyebrow"><Icon name="sparkles" />STEP 3 · 调色</div>
                  <h2>让颜色更像拼豆</h2>
                  <p>调整色彩与色数，结果会自动匹配 MARD 色卡，并只使用「我的色卡」里的颜色。</p>
                </div>
                <div className="import-layout">
                  <div className="control-stack">
                    <div className="control-card">
                      <div className="control-card__head"><Icon name="sparkles" />色彩调整</div>
                      {([
                        ['亮度', 'brightness', 50, 150],
                        ['对比度', 'contrast', 50, 150],
                        ['饱和度', 'saturation', 0, 200],
                      ] as const).map(([label, key, min, max]) => (
                        <div className="control-slider" key={key}>
                          <span className="control-slider__label">{label}</span>
                          <input
                            className="slider"
                            type="range"
                            min={min}
                            max={max}
                            value={params[key]}
                            onChange={(event) => setParams((prev) => ({ ...prev, [key]: Number(event.target.value) }))}
                          />
                          <span className="control-slider__value">{params[key]}</span>
                        </div>
                      ))}
                    </div>
                    <div className="control-card">
                      <div className="control-card__head"><Icon name="image" />背景处理</div>
                      <div className="control-row">
                        <div className="control-label">自动移除浅色背景<div className="option-row__hint">自动取图片四角作为背景色；只移除与外边缘连通的区域。白底白主体建议容差 1–3</div></div>
                        <button className={`switch ${params.removeBg ? 'is-on' : ''}`} role="switch" aria-checked={params.removeBg} onClick={() => setParams((prev) => ({ ...prev, removeBg: !prev.removeBg }))} />
                      </div>
                      <div style={{ opacity: params.removeBg ? 1 : 0.45 }}>
                        <div className="control-slider">
                          <span className="control-slider__label">容差</span>
                          <input
                            className="slider"
                            type="range"
                            min={1}
                            max={60}
                            value={params.tolerance}
                            disabled={!params.removeBg}
                            onChange={(event) => setParams((prev) => ({ ...prev, tolerance: Number(event.target.value) }))}
                          />
                          <span className="control-slider__value">{params.tolerance}</span>
                        </div>
                      </div>
                    </div>
                                        <div className="control-card">
                      <div className="control-card__head"><Icon name="grid" />图纸尺寸</div>
                      {entry === 'editor' ? (
                        <div className="option-row__hint">当前工程 {targetW}×{targetH}；替换画布时保持原尺寸。</div>
                      ) : (
                        <div className="segmented" role="group" aria-label="图纸尺寸">
                          {(['44x52','52x52','78x78','104x104'] as const).map((preset) => (
                            <button key={preset} className={sizePreset === preset ? 'is-active' : ''} onClick={() => setSizePreset(preset)}>{preset}</button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="control-card">
                      <div className="control-card__head"><Icon name="sparkles" />匹配与采样</div>
                      <div className="control-row">
                        <div className="control-label">匹配模式<div className="option-row__hint">保色：优先保留原图色相；标准：纯最近色</div></div>
                        <div className="segmented">
                          <button className={params.matchMode === 'faithful' ? 'is-active' : ''} onClick={() => setParams((prev) => ({ ...prev, matchMode: 'faithful' }))}>保色</button>
                          <button className={params.matchMode === 'standard' ? 'is-active' : ''} onClick={() => setParams((prev) => ({ ...prev, matchMode: 'standard' }))}>标准</button>
                        </div>
                      </div>
                      <div className="control-row">
                        <div className="control-label">重采样<div className="option-row__hint">锐利：4×4 面积平均，保留深色线稿、眼睛高光和紫色/金色点缀；柔和：适合照片</div></div>
                        <div className="segmented">
                          <button className={params.resample === 'sharp' ? 'is-active' : ''} onClick={() => setParams((prev) => ({ ...prev, resample: 'sharp' }))}>锐利</button>
                          <button className={params.resample === 'smooth' ? 'is-active' : ''} onClick={() => setParams((prev) => ({ ...prev, resample: 'smooth' }))}>柔和</button>
                        </div>
                      </div>
                      <div className="control-row">
                        <div className="control-label">合并近色<div className="option-row__hint">OKLab 距离小于该值的色会被合并；默认 0（不合并）</div></div>
                        <input className="input input--sm" type="number" min={0} max={0.1} step={0.005} value={params.mergeNear} onChange={(event) => setParams((prev) => ({ ...prev, mergeNear: Math.max(0, Math.min(0.1, Number(event.target.value) || 0)) }))} style={{ width: 80 }} />
                      </div>
                    </div>
<div className="control-card">
                      <div className="control-card__head"><Icon name="palette" />色卡与颜色</div>
                      <div className="control-row">
                        <div className="control-label">最多颜色数<div className="option-row__hint">数值越少，图纸越简洁</div></div>
                        <div className="stepper">
                          <button onClick={() => setParams((prev) => ({ ...prev, maxColors: Math.max(4, prev.maxColors - 1) }))} aria-label="减少颜色"><Icon name="minus" /></button>
                          <span className="stepper__value">{params.maxColors}</span>
                          <button onClick={() => setParams((prev) => ({ ...prev, maxColors: Math.min(48, prev.maxColors + 1) }))} aria-label="增加颜色"><Icon name="plus" /></button>
                        </div>
                      </div>
                      <div className="control-row">
                        <div className="control-label">自动配色<div className="option-row__hint">按当前图片重新聚类主色，再匹配色卡；换图会重新计算，不沿用上一张的色号</div></div>
                        <button className={`switch ${params.autoPalette ? 'is-on' : ''}`} role="switch" aria-label="自动配色" aria-checked={params.autoPalette} onClick={() => setParams((prev) => ({ ...prev, autoPalette: !prev.autoPalette }))} />
                      </div>
                      <div className="control-row">
                        <div className="control-label">Floyd–Steinberg 抖动<div className="option-row__hint">用细密色点表现渐变</div></div>
                        <button className={`switch ${params.dither ? 'is-on' : ''}`} role="switch" aria-checked={params.dither} onClick={() => setParams((prev) => ({ ...prev, dither: !prev.dither }))} />
                      </div>
                      <div className="control-row">
                        <div className="control-label">使用色卡<div className="option-row__hint">MARD · 我的色卡 {myPaletteCodes.length} 色</div></div>
                        <button className="text-link" onClick={() => showToast('返回编辑器色板可调整我的色卡', 'info')}>调整</button>
                      </div>
                    </div>
                  </div>
                  <div className="import-preview">
                    <div className="import-preview__canvas">
                      <canvas ref={previewRef} />
                      <span className={`processing-pill ${processing ? 'is-on' : ''}`}><span className="spinner" />处理中</span>
                    </div>
                    <div className="import-preview__meta">
                      <span>{targetW}×{targetH} · {beadSize}mm</span>
                      <span className="spacer" />
                      <strong>{result?.total.toLocaleString('zh-CN') ?? '—'}</strong><span>颗</span><span>·</span>
                      <strong>{result?.colorCount ?? '—'}</strong><span>色</span>
                    </div>
                    {wizardError ? <div className="ds-error" style={{ marginTop: 10 }}><Icon name="warning" /><span>{wizardError}</span></div> : null}
                  </div>
                </div>
              </>
            )}

            {step === 4 && image && result && (
              <>
                <div className="wizard-heading">
                  <div className="wizard-heading__eyebrow"><Icon name="eye" />STEP 4 · 预览</div>
                  <h2>原图与图纸对比</h2>
                  <p>拖动中间滑块查看转换效果；如有偏差，可以返回上一步调整色彩或色数。</p>
                </div>
                <div
                  className="compare"
                  ref={compareRef}
                  style={{ ['--split' as string]: `${split}%`, aspectRatio: `${targetW} / ${targetH}` } as CSSProperties}
                  onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); onComparePointer(event, true); }}
                  onPointerMove={(event) => onComparePointer(event, event.buttons === 1)}
                >
                  <div className="compare__layer"><canvas ref={compareBeforeRef} /></div>
                  <div className="compare__layer compare__layer--after"><canvas ref={compareAfterRef} /></div>
                  <div className="compare__divider"><div className="compare__handle"><Icon name="chevron-right" /><Icon name="chevron-right" /></div></div>
                  <span className="compare__label compare__label--before">原图</span>
                  <span className="compare__label compare__label--after">图纸</span>
                </div>
                <div className="compare-hint"><Icon name="pan" />拖动中间滑块对比原图与转换结果</div>
              </>
            )}

            {step === 5 && result && (
              <>
                <div className="wizard-heading">
                  <div className="wizard-heading__eyebrow"><Icon name="check" />STEP 5 · 应用</div>
                  <h2>确认并放进画布</h2>
                  <p>应用后仍可逐格修改；替换当前画布时可通过撤销恢复原内容。</p>
                </div>
                <div className="apply-grid">
                  <div className="apply-thumb">
                    <div className="apply-thumb__canvas"><canvas ref={applyThumbRef} /></div>
                    <div className="apply-thumb__meta">{targetW}×{targetH} · {beadSize}mm · {(targetW * beadSize / 10).toFixed(1)} × {(targetH * beadSize / 10).toFixed(1)} cm</div>
                  </div>
                  <div className="apply-form">
                    <div className="summary-cards">
                      <div className="summary-card"><div className="summary-card__label">总颗数</div><div className="summary-card__value">{result.total.toLocaleString('zh-CN')}<small>颗</small></div></div>
                      <div className="summary-card"><div className="summary-card__label">颜色</div><div className="summary-card__value">{result.colorCount}<small>色</small></div></div>
                      <div className="summary-card"><div className="summary-card__label">画布</div><div className="summary-card__value">{targetW}<small>格</small></div></div>
                    </div>
                    {!(entry === 'editor' && applyMode === 'replace') && (
                      <div className="field">
                        <label className="field__label" htmlFor="import-name">图纸名称</label>
                        <input id="import-name" className="input" value={name} maxLength={40} onChange={(event) => setName(event.target.value)} />
                      </div>
                    )}
                    {entry === 'editor' && (
                      <div className="radio-cards">
                        <button className={`radio-card ${applyMode === 'replace' ? 'is-active' : ''}`} onClick={() => setApplyMode('replace')}>
                          <span className="radio-card__dot" />
                          <span className="radio-card__copy">
                            <span className="radio-card__title">替换当前画布</span>
                            <span className="radio-card__hint">保留工程名称，替换内容</span>
                          </span>
                        </button>
                        <button className={`radio-card ${applyMode === 'new' ? 'is-active' : ''}`} onClick={() => setApplyMode('new')}>
                          <span className="radio-card__dot" />
                          <span className="radio-card__copy">
                            <span className="radio-card__title">新建工程</span>
                            <span className="radio-card__hint">保留当前画布，另存新图纸</span>
                          </span>
                        </button>
                      </div>
                    )}
                    <div className="export-note" style={{ marginTop: 0 }}>
                      <Icon name="info" /><span>应用后仍可逐格修改；图片转换会尽量贴近我的色卡范围。</span>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="wizard__foot">
          <span className="wizard__hint">{hints[step - 1]}</span>
          {step > 1 && <button className="btn btn--ghost" onClick={() => goStep((step - 1) as Step)}><Icon name="back" />上一步</button>}
          {step < 5 ? (
            <button className="btn btn--primary" onClick={next} disabled={!canNext || processing}>
              {processing ? '处理中…' : '下一步'}<Icon name="arrow-right" />
            </button>
          ) : (
            <button className="btn btn--primary" onClick={() => void apply()} disabled={!result || processing || busy}>
              <Icon name="check" />{busy ? '应用中…' : '应用图纸'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
