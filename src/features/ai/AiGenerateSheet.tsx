import { useEffect, useMemo, useRef, useState } from 'react';
import type { Project } from '@/core/model';
import { newId } from '@/core/model';
import type {
  AiMode,
  AiProviderId,
  AiSettingsValue,
  GridData,
} from '@/core/imagegen/types';
import { AI_PROVIDERS, AI_SIZE_PRESETS, AI_STYLES, sizeOf, sizePresetFor } from '@/core/imagegen/types';
import {
  buildGridRepairPrompt,
  buildGridSystemPrompt,
  buildGridUserPrompt,
  gridPaletteEntries,
  parseGridResponse,
} from '@/core/imagegen/grid';
import {
  AI_HISTORY_LIMIT,
  DEFAULT_AI_SETTINGS,
  clearGenerations,
  deleteGeneration,
  getAiSettings,
  getGenerationImage,
  listRecentGenerations,
  saveAiSettings,
  saveGeneration,
} from '@/storage/aiRepository';
import type { GenerationRecord } from '@/storage/db';
import {
  generateGridText,
  generateImage,
  safeErrorMessage,
  type ImageClientOptions,
} from '@/services/imagegen/client';
import {
  downscaleImageBlob,
  generatedImageToBlob,
  imageElementFromBlob,
} from '@/services/imagegen/decode';
import { gridToBlob } from '@/services/imagegen/gridRender';
import { useAppStore } from '@/store/appStore';
import { Icon } from '@/ui/Icon';
import { Sheet } from '@/ui/Sheet';

interface AiGenerateSheetProps {
  entry: 'home' | 'editor';
  project?: Project | null;
  onClose: () => void;
}

interface PreviewState {
  mode: AiMode;
  provider: AiProviderId;
  model: string;
  prompt: string;
  width: number;
  height: number;
  maxColors: number;
  image: HTMLImageElement;
  url: string;
  blob: Blob;
  mime: string;
  imageWidth: number;
  imageHeight: number;
  grid?: GridData;
  revisedPrompt?: string;
  generationId?: string;
}

function cloneProviders(): Record<AiProviderId, AiSettingsValue['providers'][AiProviderId]> {
  return JSON.parse(JSON.stringify(DEFAULT_AI_SETTINGS.providers)) as AiSettingsValue['providers'];
}

function buildImagePrompt(prompt: string, style: string, enhance: boolean): string {
  if (!enhance) return prompt.trim();
  return `${prompt.trim()}

风格：${style}。
请生成适合做拼豆图纸的像素画：粗深色轮廓、清晰五官、纯色块、无明显渐变和抗锯齿、主体居中、背景简洁。`;
}

function errorDetails(error: unknown, apiKey: string): string {
  return safeErrorMessage(error, apiKey);
}

export function AiGenerateSheet({ entry, project, onClose }: AiGenerateSheetProps) {
  const layout = useAppStore((state) => state.layout);
  const showToast = useAppStore((state) => state.showToast);
  const startImportWithImage = useAppStore((state) => state.startImportWithImage);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  const [aiSettings, setAiSettings] = useState<AiSettingsValue | null>(null);
  const [providers, setProviders] = useState(cloneProviders);
  const [mode, setMode] = useState<AiMode>('image');
  const [provider, setProvider] = useState<AiProviderId>('openai-images');
  const [prompt, setPrompt] = useState('');
  const [style, setStyle] = useState(AI_STYLES[0]);
  const [enhance, setEnhance] = useState(true);
  const [sizePreset, setSizePreset] = useState<'44x52' | '52x52' | '78x78' | '104x104'>('52x52');
  const [maxColors, setMaxColors] = useState(12);
  const [rememberKey, setRememberKey] = useState(true);
  const [showKey, setShowKey] = useState(false);
  const [connectionOpen, setConnectionOpen] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [gridErrors, setGridErrors] = useState<string[]>([]);
  const [rawGridText, setRawGridText] = useState('');
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [history, setHistory] = useState<GenerationRecord[]>([]);
  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({});
  const [historyBusy, setHistoryBusy] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const previewUrlRef = useRef('');
  const transferredRef = useRef(false);

  const active = providers[provider];
  const target = entry === 'editor' && project
    ? { width: project.width, height: project.height }
    : sizeOf(sizePreset);
  const model = mode === 'image' ? active.imageModel : active.gridModel;
  const gridDisabled = mode === 'grid' && (target.width > 52 || target.height > 52);
  const providerChoices = useMemo(
    () => AI_PROVIDERS.filter((item) => mode === 'image' || item.id !== 'openai-images'),
    [mode],
  );
  const activeProviderLabel = AI_PROVIDERS.find((item) => item.id === provider)?.label ?? provider;

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const settings = await getAiSettings();
        if (!alive) return;
        setAiSettings(settings);
        setProviders(settings.providers);
        setMode(settings.defaults.mode);
        setProvider(
          settings.defaults.mode === 'grid' && settings.activeProvider === 'openai-images'
            ? 'openai-chat'
            : settings.activeProvider,
        );
        setSizePreset(settings.defaults.sizePreset);
        setMaxColors(settings.defaults.maxColors);
        setStyle(settings.defaults.style);
        setRememberKey(settings.defaults.rememberKey);
        setHistory(await listRecentGenerations());
      } catch (loadError) {
        if (alive) showToast(safeErrorMessage(loadError), 'warn');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
      abortRef.current?.abort();
    };
  }, [showToast]);

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  useEffect(() => {
    const urls: string[] = [];
    const next: Record<string, string> = {};
    for (const record of history) {
      if (!record.thumbnail) continue;
      const url = URL.createObjectURL(record.thumbnail);
      next[record.id] = url;
      urls.push(url);
    }
    setThumbUrls(next);
    return () => { urls.forEach((url) => URL.revokeObjectURL(url)); };
  }, [history]);

  useEffect(() => () => {
    abortRef.current?.abort();
    if (previewUrlRef.current && !transferredRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, []);

  const replacePreview = (next: PreviewState) => {
    if (previewUrlRef.current && previewUrlRef.current !== next.url) {
      URL.revokeObjectURL(previewUrlRef.current);
    }
    previewUrlRef.current = next.url;
    transferredRef.current = false;
    setPreview(next);
  };

  const clearPreview = () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = '';
    transferredRef.current = false;
    setPreview(null);
  };

  const updateProvider = (patch: Partial<AiSettingsValue['providers'][AiProviderId]>) => {
    setProviders((prev) => ({ ...prev, [provider]: { ...prev[provider], ...patch } }));
  };

  const setModel = (value: string) => {
    updateProvider(mode === 'image' ? { imageModel: value } : { gridModel: value });
  };

  const buildSettings = (): AiSettingsValue => {
    const base = aiSettings ?? DEFAULT_AI_SETTINGS;
    return {
      ...base,
      activeProvider: provider,
      providers,
      defaults: {
        ...base.defaults,
        mode,
        sizePreset,
        maxColors,
        style,
        rememberKey,
      },
    };
  };

  const persistSettings = async () => {
    try {
      const saved = await saveAiSettings(buildSettings());
      setAiSettings(saved);
    } catch (saveError) {
      showToast(`连接设置保存失败：${safeErrorMessage(saveError)}`, 'warn');
    }
  };

  const clearKey = () => {
    updateProvider({ apiKey: '' });
    setShowKey(false);
    void (async () => {
      try {
        await saveAiSettings({ ...buildSettings(), providers: { ...providers, [provider]: { ...active, apiKey: '' } } });
        showToast('已清除当前服务的 API Key');
      } catch (clearError) {
        showToast(`清除失败：${safeErrorMessage(clearError)}`, 'warn');
      }
    })();
  };

  const switchMode = (next: AiMode) => {
    setMode(next);
    setGridErrors([]);
    setRawGridText('');
    setError(null);
    if (next === 'grid' && provider === 'openai-images') setProvider('openai-chat');
    if (next === 'grid' && (sizePreset === '78x78' || sizePreset === '104x104')) setSizePreset('52x52');
    clearPreview();
  };

  const changeProvider = (next: AiProviderId) => {
    setProvider(next);
    setShowKey(false);
    setGridErrors([]);
  };

  const saveImagePreview = async (
    image: HTMLImageElement,
    url: string,
    blob: Blob,
    mime: string,
    source: { prompt: string; model: string; provider: AiProviderId; revisedPrompt?: string },
    controller: AbortController,
  ) => {
    let down: Awaited<ReturnType<typeof downscaleImageBlob>>;
    let thumb: Awaited<ReturnType<typeof downscaleImageBlob>>;
    try {
      down = await downscaleImageBlob(blob, 1024);
      thumb = await downscaleImageBlob(blob, 256);
    } catch (error) {
      URL.revokeObjectURL(url);
      throw error;
    }
    if (controller.signal.aborted) {
      URL.revokeObjectURL(url);
      return;
    }
    const record: GenerationRecord = {
      id: newId(),
      createdAt: Date.now(),
      mode: 'image',
      provider: source.provider,
      model: source.model,
      prompt: source.prompt,
      width: target.width,
      height: target.height,
      maxColors,
      revisedPrompt: source.revisedPrompt,
      mime: down.mime,
      imageWidth: down.width,
      imageHeight: down.height,
      thumbnail: thumb.blob,
    };
    try {
      await saveGeneration(record, down.blob, down.mime);
      setHistory((prev) => [record, ...prev].slice(0, AI_HISTORY_LIMIT));
    } catch (saveError) {
      showToast(`生成成功，但历史保存失败：${safeErrorMessage(saveError)}`, 'warn');
    }
    replacePreview({
      mode: 'image',
      provider: source.provider,
      model: source.model,
      prompt: source.prompt,
      width: target.width,
      height: target.height,
      maxColors,
      image,
      url,
      blob,
      mime,
      imageWidth: image.naturalWidth,
      imageHeight: image.naturalHeight,
      revisedPrompt: source.revisedPrompt,
      generationId: record.id,
    });
  };

  const saveGridPreview = async (grid: GridData, controller: AbortController) => {
    const blob = await gridToBlob(grid, 12);
    const { image, url } = await imageElementFromBlob(blob);
    let down: Awaited<ReturnType<typeof downscaleImageBlob>>;
    let thumb: Awaited<ReturnType<typeof downscaleImageBlob>>;
    try {
      down = await downscaleImageBlob(blob, 1024);
      thumb = await downscaleImageBlob(blob, 256);
    } catch (error) {
      URL.revokeObjectURL(url);
      throw error;
    }
    if (controller.signal.aborted) {
      URL.revokeObjectURL(url);
      return;
    }
    const record: GenerationRecord = {
      id: newId(),
      createdAt: Date.now(),
      mode: 'grid',
      provider,
      model,
      prompt,
      width: grid.width,
      height: grid.height,
      maxColors,
      mime: down.mime,
      imageWidth: down.width,
      imageHeight: down.height,
      thumbnail: thumb.blob,
      grid,
    };
    try {
      await saveGeneration(record, down.blob, down.mime);
      setHistory((prev) => [record, ...prev].slice(0, AI_HISTORY_LIMIT));
    } catch (saveError) {
      showToast(`生成成功，但历史保存失败：${safeErrorMessage(saveError)}`, 'warn');
    }
    replacePreview({
      mode: 'grid',
      provider,
      model,
      prompt,
      width: grid.width,
      height: grid.height,
      maxColors,
      image,
      url,
      blob,
      mime: 'image/png',
      imageWidth: image.naturalWidth,
      imageHeight: image.naturalHeight,
      grid,
      generationId: record.id,
    });
  };

  const runGenerate = async () => {
    if (busy || loading) return;
    const cleanPrompt = prompt.trim();
    if (!online) {
      setError('AI 生成需要联网；其余编辑和导出功能仍可离线使用。');
      return;
    }
    if (!cleanPrompt) {
      setError('请先输入想生成的内容。');
      return;
    }
    if (!active.baseUrl.trim() || !active.apiKey.trim() || !model.trim()) {
      setError('请先填写 Base URL、API Key 和模型名。');
      setConnectionOpen(true);
      return;
    }
    if (mode === 'grid' && (target.width > 52 || target.height > 52)) {
      setError('直接出色号图目前只支持 44×52 或 52×52；更大尺寸请使用生成图片。');
      return;
    }
    setError(null);
    setGridErrors([]);
    setRawGridText('');
    clearPreview();
    await persistSettings();
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    const options: ImageClientOptions = { signal: controller.signal };
    try {
      if (mode === 'image') {
        const result = await generateImage({
          provider,
          baseUrl: active.baseUrl,
          apiKey: active.apiKey,
          model,
          prompt: buildImagePrompt(cleanPrompt, style, enhance),
        }, options);
        const generated = result.images[0];
        if (!generated) throw new Error('模型没有返回图片');
        const { blob, mime } = await generatedImageToBlob(generated, controller.signal);
        const { image, url } = await imageElementFromBlob(blob);
        await saveImagePreview(image, url, blob, mime, {
          prompt: cleanPrompt,
          model,
          provider,
          revisedPrompt: generated.revisedPrompt,
        }, controller);
      } else {
        const system = buildGridSystemPrompt();
        const user = buildGridUserPrompt({
          prompt: cleanPrompt,
          style,
          width: target.width,
          height: target.height,
          maxColors,
          enhance,
        });
        const text = await generateGridText({
          provider,
          baseUrl: active.baseUrl,
          apiKey: active.apiKey,
          model,
          prompt: cleanPrompt,
          width: target.width,
          height: target.height,
          maxColors,
        }, system, user, options);
        if (controller.signal.aborted) return;
        const parsed = parseGridResponse(text, { width: target.width, height: target.height, maxColors });
        if (!parsed.ok || !parsed.grid) {
          setRawGridText(text);
          setGridErrors(parsed.errors);
          setError('模型返回的网格格式不正确，可以修正后重试。');
          return;
        }
        await saveGridPreview(parsed.grid, controller);
      }
    } catch (generateError) {
      if (controller.signal.aborted) {
        showToast('已取消生成', 'info');
      } else {
        setError(errorDetails(generateError, active.apiKey));
      }
    } finally {
      setBusy(false);
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  const repairGrid = async () => {
    if (busy || !rawGridText) return;
    if (!active.baseUrl.trim() || !active.apiKey.trim() || !model.trim()) {
      setError('请先填写 Base URL、API Key 和模型名。');
      setConnectionOpen(true);
      return;
    }
    setError(null);
    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const repair = buildGridRepairPrompt({
        original: rawGridText,
        errors: gridErrors,
        width: target.width,
        height: target.height,
        maxColors,
      });
      const text = await generateGridText({
        provider,
        baseUrl: active.baseUrl,
        apiKey: active.apiKey,
        model,
        prompt,
        width: target.width,
        height: target.height,
        maxColors,
      }, repair.system, repair.user, { signal: controller.signal });
      const parsed = parseGridResponse(text, { width: target.width, height: target.height, maxColors });
      if (!parsed.ok || !parsed.grid) {
        setRawGridText(text);
        setGridErrors(parsed.errors);
        setError('修正后的网格仍然不符合要求。');
        return;
      }
      setGridErrors([]);
      setRawGridText('');
      await saveGridPreview(parsed.grid, controller);
    } catch (repairError) {
      if (!controller.signal.aborted) setError(errorDetails(repairError, active.apiKey));
    } finally {
      setBusy(false);
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  const loadHistory = async (record: GenerationRecord) => {
    if (historyBusy || busy) return;
    setHistoryBusy(true);
    setError(null);
    try {
      const imageRecord = await getGenerationImage(record.id);
      if (!imageRecord) throw new Error('历史图片已不存在');
      // 网格记录优先从原始 JSON 重新渲染，避免历史 WebP 压缩引入色差。
      const blob = record.grid ? await gridToBlob(record.grid, 12) : imageRecord.blob;
      const { image, url } = await imageElementFromBlob(blob);
      setMode(record.mode);
      setProvider(record.provider);
      setPrompt(record.prompt);
      setMaxColors(record.maxColors);
      const preset = sizePresetFor(record.width, record.height);
      if (preset) setSizePreset(preset);
      replacePreview({
        mode: record.mode,
        provider: record.provider,
        model: record.model,
        prompt: record.prompt,
        width: record.width,
        height: record.height,
        maxColors: record.maxColors,
        image,
        url,
        blob,
        mime: blob.type || record.mime,
        imageWidth: image.naturalWidth,
        imageHeight: image.naturalHeight,
        grid: record.grid,
        revisedPrompt: record.revisedPrompt,
        generationId: record.id,
      });
    } catch (loadError) {
      showToast(safeErrorMessage(loadError), 'warn');
    } finally {
      setHistoryBusy(false);
    }
  };

  const removeHistory = async (id: string) => {
    try {
      await deleteGeneration(id);
      setHistory((prev) => prev.filter((item) => item.id !== id));
      if (preview?.generationId === id) {
        setPreview((prev) => prev ? { ...prev, generationId: undefined } : prev);
      }
      showToast('已删除这条生成记录', 'info');
    } catch (deleteError) {
      showToast(safeErrorMessage(deleteError), 'warn');
    }
  };

  const clearHistory = async () => {
    try {
      await clearGenerations();
      setHistory([]);
      setPreview((prev) => prev ? { ...prev, generationId: undefined } : prev);
      showToast('已清空生成历史', 'info');
    } catch (clearError) {
      showToast(safeErrorMessage(clearError), 'warn');
    }
  };

  const usePreview = () => {
    if (!preview) return;
    const preset = sizePresetFor(preview.width, preview.height);
    transferredRef.current = true;
    startImportWithImage(entry, {
      source: preview.image,
      url: preview.url,
      name: preview.mode === 'grid' ? 'AI 色号图纸' : 'AI 图纸',
      generationId: preview.generationId,
      autoFrame: preview.mode === 'image',
      startStep: preview.mode === 'grid' ? 3 : 2,
      size: { width: preview.width, height: preview.height },
      sizePreset: preset ?? undefined,
      paramOverrides: {
        maxColors: preview.maxColors,
        ...(preview.mode === 'grid' ? { removeBg: true, autoPalette: true } : {}),
      },
    });
    onClose();
  };

  const cancelGeneration = () => {
    abortRef.current?.abort();
    setBusy(false);
    showToast('已取消生成', 'info');
  };

  const footer = busy ? (
    <>
      <button className="btn btn--ghost" onClick={cancelGeneration}>取消生成</button>
      <button className="btn btn--primary" disabled>生成中…</button>
    </>
  ) : preview ? (
    <>
      <button className="btn btn--secondary" onClick={() => void runGenerate()} disabled={!online || gridDisabled}>重新生成</button>
      <button className="btn btn--primary" onClick={usePreview}>使用这张图</button>
    </>
  ) : (
    <>
      <button className="btn btn--ghost" onClick={onClose}>取消</button>
      <button className="btn btn--primary" onClick={() => void runGenerate()} disabled={loading || !online || gridDisabled}>
        {mode === 'grid' ? '生成色号图' : '生成图片'}
      </button>
    </>
  );

  return (
    <Sheet
      title="AI 生成图纸"
      onClose={onClose}
      variant={layout === 'phone' ? 'bottom' : 'dialog'}
      wide
      className={layout === 'phone' ? 'sheet--tall ai-sheet' : 'ai-sheet'}
      footer={footer}
    >
      <div className="segmented ai-mode-tabs" role="tablist" aria-label="生成方式">
        <button className={mode === 'image' ? 'is-active' : ''} onClick={() => switchMode('image')} role="tab" aria-selected={mode === 'image'}>
          <Icon name="image" />生成图片
        </button>
        <button className={mode === 'grid' ? 'is-active' : ''} onClick={() => switchMode('grid')} role="tab" aria-selected={mode === 'grid'}>
          <Icon name="grid" />直接出色号图
        </button>
      </div>

      <div className="control-card ai-connection">
        <button className="ai-section-head" onClick={() => setConnectionOpen((open) => !open)} aria-expanded={connectionOpen}>
          <span><Icon name="settings" />连接设置</span>
          <span className="ai-section-head__meta">{activeProviderLabel} · {model || '未填模型'}</span>
        </button>
        {connectionOpen && (
          <div className="ai-connection__body">
            <div className="field">
              <label className="field__label" htmlFor="ai-provider">接口格式</label>
              <select
                id="ai-provider"
                className="select"
                value={provider}
                onChange={(event) => changeProvider(event.target.value as AiProviderId)}
              >
                {providerChoices.map((item) => <option key={item.id} value={item.id}>{item.label} — {item.hint}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="field__label" htmlFor="ai-base-url">Base URL</label>
              <input
                id="ai-base-url"
                className="input"
                value={active.baseUrl}
                spellCheck={false}
                onChange={(event) => updateProvider({ baseUrl: event.target.value })}
                placeholder="https://api.openai.com/v1"
              />
            </div>
            <div className="field">
              <label className="field__label" htmlFor="ai-model">{mode === 'image' ? '图片模型' : '文本模型'}</label>
              <input
                id="ai-model"
                className="input"
                value={model}
                spellCheck={false}
                onChange={(event) => setModel(event.target.value)}
                placeholder={mode === 'image' ? '例如 gpt-image-1 / gemini-2.5-flash-image' : '例如 gpt-4o / gemini-2.5-flash'}
              />
            </div>
            <div className="field">
              <label className="field__label" htmlFor="ai-key">API Key</label>
              <div className="ai-key-row">
                <input
                  id="ai-key"
                  className="input"
                  type={showKey ? 'text' : 'password'}
                  value={active.apiKey}
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(event) => updateProvider({ apiKey: event.target.value })}
                  placeholder="只保存在本机 IndexedDB"
                />
                <button className="btn btn--ghost btn--sm" onClick={() => setShowKey((show) => !show)} aria-label={showKey ? '隐藏 API Key' : '显示 API Key'}>
                  <Icon name="eye" />
                </button>
              </div>
            </div>
            <div className="option-row ai-remember-row">
              <div className="option-row__copy">
                <div className="option-row__title">记住密钥</div>
                <div className="option-row__hint">关闭后只在当前页面内存中使用，不写入 IndexedDB。</div>
              </div>
              <button className={`switch ${rememberKey ? 'is-on' : ''}`} role="switch" aria-checked={rememberKey} aria-label="记住密钥" onClick={() => setRememberKey((value) => !value)} />
            </div>
            <div className="ai-connection__actions">
              <button className="btn btn--secondary btn--sm" onClick={() => void persistSettings()}>保存配置</button>
              <button className="btn btn--ghost btn--sm" onClick={clearKey}>清除密钥</button>
            </div>
            <p className="ai-note">
              <Icon name="info" />请求会从浏览器直接发往你配置的服务商，可能产生费用；Key 不写入工程文件，也不会被本项目上传。IndexedDB 不是加密保险箱。
            </p>
          </div>
        )}
      </div>

      <div className="control-card">
        <div className="control-card__head"><Icon name="sparkles" />提示词</div>
        <div className="field">
          <label className="field__label" htmlFor="ai-prompt">想生成什么</label>
          <textarea
            id="ai-prompt"
            className="textarea"
            data-autofocus
            rows={4}
            maxLength={2000}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="例如：粉发狐耳少女，Q 版，白色和红色巫女服，金色头饰，纯色浅背景"
          />
        </div>
        <div className="ai-style-row">
          {AI_STYLES.map((item) => (
            <button key={item} className={`chip ${style === item ? 'is-active' : ''}`} onClick={() => setStyle(item)}>{item}</button>
          ))}
        </div>
        <div className="option-row">
          <div className="option-row__copy">
            <div className="option-row__title">自动补充拼豆约束</div>
            <div className="option-row__hint">追加粗轮廓、清晰五官、纯色块、无渐变等要求。</div>
          </div>
          <button className={`switch ${enhance ? 'is-on' : ''}`} role="switch" aria-checked={enhance} aria-label="自动补充拼豆约束" onClick={() => setEnhance((value) => !value)} />
        </div>
      </div>

      <div className="control-card">
        <div className="control-card__head"><Icon name="grid" />输出设置</div>
        {entry === 'editor' && project ? (
          <div className="option-row">
            <div className="option-row__copy">
              <div className="option-row__title">目标画布</div>
              <div className="option-row__hint">跟随当前工程 {project.width}×{project.height}，应用时可选择替换或新建。</div>
            </div>
            <span className="badge badge--teal">{project.width}×{project.height}</span>
          </div>
        ) : (
          <div className="field">
            <span className="field__label">目标画布</span>
            <div className="segmented ai-size-row">
              {AI_SIZE_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  className={sizePreset === preset.id ? 'is-active' : ''}
                  onClick={() => setSizePreset(preset.id)}
                  disabled={mode === 'grid' && preset.width > 52}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="option-row">
          <div className="option-row__copy">
            <div className="option-row__title">最多颜色数</div>
            <div className="option-row__hint">会传给导入向导继续量化；直接网格建议 8–16 色。</div>
          </div>
          <div className="stepper">
            <button onClick={() => setMaxColors((value) => Math.max(4, value - 1))} aria-label="减少颜色">−</button>
            <span className="stepper__value">{maxColors}</span>
            <button onClick={() => setMaxColors((value) => Math.min(24, value + 1))} aria-label="增加颜色">＋</button>
          </div>
        </div>
        {mode === 'grid' && gridDisabled && (
          <div className="ds-error"><Icon name="warning" /><span>直接出色号图目前只支持 44×52 / 52×52；请改用生成图片。</span></div>
        )}
        {!online && <div className="ds-error"><Icon name="warning" /><span>当前处于离线状态，AI 生成不可用。</span></div>}
      </div>

      {error && (
        <div className="ds-error ai-error">
          <Icon name="warning" />
          <div>
            <div>{error}</div>
            {gridErrors.length > 0 && (
              <ul className="ai-errors">
                {gridErrors.slice(0, 3).map((item) => <li key={item}>{item}</li>)}
              </ul>
            )}
            {rawGridText && gridErrors.length > 0 && (
              <button className="btn btn--secondary btn--sm" onClick={() => void repairGrid()} disabled={busy}>让模型修正</button>
            )}
          </div>
        </div>
      )}

      {preview && (
        <div className="control-card ai-preview">
          <div className="control-card__head"><Icon name="eye" />生成预览</div>
          <div className="ai-preview__body">
            <img src={preview.url} alt="AI 生成预览" />
            <div className="ai-preview__meta">
              <div className="ai-preview__prompt">{preview.prompt}</div>
              <div className="ai-preview__tags">
                <span className="badge">{preview.mode === 'grid' ? '色号网格' : '图片'}</span>
                <span className="badge">{preview.provider}</span>
                <span className="badge">{preview.width}×{preview.height}</span>
                <span className="badge">{preview.maxColors} 色上限</span>
              </div>
              {preview.revisedPrompt && <div className="option-row__hint">模型修订：{preview.revisedPrompt}</div>}
              {preview.grid && (
                <div className="ai-palette">
                  {gridPaletteEntries(preview.grid).map((item) => (
                    <span key={item.key} className="ai-palette__swatch" style={{ background: item.hex }} title={`${item.key} ${item.hex}`} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="control-card ai-history">
        <div className="control-card__head">
          <Icon name="stats" />生成历史
          <span className="spacer" />
          {history.length > 0 && <button className="text-link" onClick={() => void clearHistory()}>清空</button>}
        </div>
        {history.length ? (
          <div className="ai-history__grid">
            {history.map((record) => (
              <div key={record.id} className="ai-history__item">
                <button className="ai-history__load" onClick={() => void loadHistory(record)} disabled={historyBusy || busy} aria-label={`载入 ${record.prompt}`}>
                  {thumbUrls[record.id]
                    ? <img src={thumbUrls[record.id]} alt="" />
                    : <span className="ai-history__placeholder"><Icon name="image" /></span>}
                  <span className="ai-history__caption">{record.mode === 'grid' ? '色号图' : '图片'} · {record.width}×{record.height}</span>
                </button>
                <button className="ai-history__delete" onClick={() => void removeHistory(record.id)} aria-label="删除这条历史"><Icon name="trash" /></button>
              </div>
            ))}
          </div>
        ) : (
          <div className="option-row__hint">还没有生成记录。生成成功后会保存在本机，可点击复用，不必重复付费。</div>
        )}
      </div>

      {loading && <div className="ai-loading"><span className="spinner" />正在读取本地 AI 配置…</div>}
    </Sheet>
  );
}
