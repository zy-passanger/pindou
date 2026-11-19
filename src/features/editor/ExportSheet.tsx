import { useEffect, useMemo, useRef, useState } from 'react';
import type { Project } from '@/core/model';
import { sanitizeFileName } from '@/core/projectFile';
import { computePagination, type PdfMode } from '@/core/pagination';
import type { ProjectStats } from '@/core/stats';
import { buildUsageCsv, exportUsageCsv } from '@/export/csv';
import { buildPdf, drawPdfPreview, exportPdf, type PdfExportOptions } from '@/export/pdf';
import { drawBlueprintPreview, measureBlueprint, type PngOptions } from '@/export/patternRenderer';
import { buildPng, exportPng } from '@/export/png';
import { shareBlob } from '@/export/share';
import { useAppStore } from '@/store/appStore';
import { beadStyle } from '@/ui/beadStyle';
import { Icon } from '@/ui/Icon';
import { Sheet } from '@/ui/Sheet';

type ExportFormat = 'png' | 'pdf' | 'csv';

interface ExportSheetProps {
  project: Project;
  stats: ProjectStats;
  onClose: () => void;
}

interface ToggleRowProps {
  title: string;
  hint: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}

function ToggleRow({ title, hint, checked, onChange, disabled = false }: ToggleRowProps) {
  return (
    <div className="option-row">
      <div className="option-row__copy">
        <div className="option-row__title">{title}</div>
        <div className="option-row__hint">{hint}</div>
      </div>
      <button
        type="button"
        className={`switch ${checked ? 'is-on' : ''}`}
        role="switch"
        aria-checked={checked}
        aria-label={title}
        disabled={disabled}
        onClick={() => onChange(!checked)}
      />
    </div>
  );
}

export function ExportSheet({ project, stats, onClose }: ExportSheetProps) {
  const layout = useAppStore((state) => state.layout);
  const settings = useAppStore((state) => state.settings);
  const showToast = useAppStore((state) => state.showToast);
  const previewRef = useRef<HTMLCanvasElement | null>(null);

  const [format, setFormat] = useState<ExportFormat>('png');
  const [pngScale, setPngScale] = useState(project.width * project.height <= 36000 ? 24 : 16);
  const [pngCodes, setPngCodes] = useState(true);
  const [pngCoords, setPngCoords] = useState(true);
  const [pngLegend, setPngLegend] = useState(true);
  const [pngPatternOnly, setPngPatternOnly] = useState(false);

  const [pdfMode, setPdfMode] = useState<PdfMode>('actual');
  const [pdfOverlap, setPdfOverlap] = useState(settings?.prefs.pdfOverlap ?? 1);
  const [pdfMirror, setPdfMirror] = useState(false);
  const [pdfCodes, setPdfCodes] = useState(true);
  const [pdfLegend, setPdfLegend] = useState(true);
  const [pdfDpi, setPdfDpi] = useState<200 | 300>(settings?.prefs.pdfDpi ?? 200);

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);

  const pngOptions = useMemo<PngOptions>(() => ({
    scale: pngCodes && !pngPatternOnly ? Math.max(16, pngScale) : pngScale,
    codes: pngCodes && !pngPatternOnly,
    coords: pngCoords && !pngPatternOnly,
    legend: pngLegend && !pngPatternOnly,
    patternOnly: pngPatternOnly,
  }), [pngScale, pngCodes, pngCoords, pngLegend, pngPatternOnly]);
  const pngError = useMemo(() => {
    try {
      measureBlueprint(project, stats, pngOptions);
      return '';
    } catch (error) {
      return error instanceof Error ? error.message : '图片过大，请降低每格像素';
    }
  }, [project, stats, pngOptions]);

  const pagination = useMemo(
    () => computePagination(project.width, project.height, {
      mode: pdfMode,
      cellMm: pdfMode === 'actual' ? project.beadSizeMm : 3.5,
      overlap: pdfOverlap,
      legendPage: pdfLegend,
      legendColorCount: stats.colorCount,
    }),
    [project.width, project.height, project.beadSizeMm, pdfMode, pdfOverlap, pdfLegend, stats.colorCount],
  );

  useEffect(() => {
    const canvas = previewRef.current;
    if (!canvas) return;
    if (format === 'png' && !pngError) {
      drawBlueprintPreview(canvas, project, stats, pngOptions);
    } else if (format === 'pdf') {
      drawPdfPreview(canvas, project, stats, {
        mode: pdfMode,
        overlap: pdfOverlap,
        dpi: pdfDpi,
        codes: pdfCodes,
        mirror: pdfMirror,
        legend: pdfLegend,
      });
    }
  }, [format, pngOptions, pngError, pdfMode, pdfOverlap, pdfDpi, pdfCodes, pdfMirror, pdfLegend, project, stats]);

  const fileName = format === 'png'
    ? `${sanitizeFileName(project.name)}_图纸.png`
    : format === 'pdf'
      ? `${sanitizeFileName(project.name)}_A4.pdf`
      : `${sanitizeFileName(project.name)}_用量.csv`;

  const pdfOptions = (onProgress?: (current: number, total: number) => void): PdfExportOptions => ({
    mode: pdfMode,
    overlap: pdfOverlap,
    mirror: pdfMirror,
    codes: pdfCodes,
    legend: pdfLegend,
    dpi: pdfDpi,
    onProgress,
  });

  const handleExport = async () => {
    if (busy) return;
    setBusy(true);
    setProgress(null);
    try {
      if (format === 'png') {
        await exportPng(project, stats, pngOptions);
        showToast('PNG 图纸已导出');
      } else if (format === 'pdf') {
        await exportPdf(project, stats, pdfOptions((current, total) => setProgress({ current, total })));
        showToast(`A4 PDF 已导出 · 共 ${pagination.totalPages} 页`);
      } else {
        exportUsageCsv(project, stats);
        showToast('用量 CSV 已导出');
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : '导出失败，请重试', 'warn');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const handleShare = async () => {
    if (busy) return;
    if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') {
      showToast('当前浏览器不支持文件分享，请直接导出', 'info');
      return;
    }
    setBusy(true);
    setProgress(null);
    try {
      let blob: Blob;
      if (format === 'png') {
        blob = await buildPng(project, stats, pngOptions);
      } else if (format === 'pdf') {
        blob = await buildPdf(project, stats, pdfOptions((current, total) => setProgress({ current, total })));
      } else {
        blob = new Blob([buildUsageCsv(project, stats)], { type: 'text/csv;charset=utf-8' });
      }
      const shared = await shareBlob(blob, fileName, `${project.name} · 拼豆图纸`);
      showToast(shared ? '已打开分享' : '当前浏览器不支持文件分享，请直接导出', shared ? 'success' : 'info');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '分享失败', 'warn');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const actionLabel = format === 'png' ? '导出 PNG' : format === 'pdf' ? '导出 PDF' : '导出 CSV';
  const actionIcon = format === 'png' ? 'image' : format === 'pdf' ? 'download' : 'stats';
  const busyLabel = format === 'pdf' && progress
    ? `正在渲染 ${progress.current}/${progress.total} 页`
    : '正在生成…';

  return (
    <Sheet
      title="导出图纸"
      onClose={onClose}
      variant={layout === 'phone' ? 'bottom' : 'right'}
      className="export-sheet"
      footer={(
        <div className="export-actions">
          <button
            type="button"
            className="btn btn--secondary"
            aria-label="分享导出文件"
            disabled={busy || (format === 'png' && !!pngError)}
            onClick={() => void handleShare()}
          >
            <Icon name="share" />
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={busy || stats.total === 0 || (format === 'png' && !!pngError)}
            onClick={() => void handleExport()}
          >
            {busy ? <Icon name="download" /> : <Icon name={actionIcon} />}
            {busy ? busyLabel : actionLabel}
          </button>
        </div>
      )}
    >
      <div className="export-tabs" role="tablist" aria-label="导出格式">
        {([
          ['png', 'PNG 图纸', 'image'],
          ['pdf', 'A4 PDF', 'download'],
          ['csv', '用量 CSV', 'stats'],
        ] as const).map(([value, label, icon]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={format === value}
            className={`export-tab ${format === value ? 'is-active' : ''}`}
            onClick={() => setFormat(value)}
            disabled={busy}
          >
            <Icon name={icon} />{label}
          </button>
        ))}
      </div>

      {format === 'png' && (
        <>
          <div className="export-preview">
            {pngError ? <p className="export-note" role="alert">{pngError}</p> : <canvas ref={previewRef} aria-label="PNG 图纸及逐格色号放大预览" />}
            <div className="export-preview__caption">
              <Icon name="image" />
              <strong>{project.width} × {project.height}</strong>
              <span>·</span>
              <span>{stats.total.toLocaleString('zh-CN')} 颗</span>
              <span>·</span>
              <span>每格 {pngOptions.scale}px</span>
              {pngOptions.codes && <><span>·</span><span>逐格标注</span></>}
              {pngPatternOnly && <><span>·</span><span>仅图案</span></>}
            </div>
          </div>
          <div className="export-section">
            <div className="export-section__title"><Icon name="grid" />图纸样式</div>
            <div className="option-row">
              <div className="option-row__copy">
                <div className="option-row__title">每格像素</div>
                <div className="option-row__hint">带色号至少 16px，推荐 24px</div>
              </div>
              <div className="segmented">
                {[8, 16, 24, 32].map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={pngOptions.scale === value ? 'is-active' : ''}
                    disabled={busy || (pngOptions.codes && value < 16)}
                    onClick={() => setPngScale(value)}
                  >
                    {value}px
                  </button>
                ))}
              </div>
            </div>
            <ToggleRow
              title="仅图案"
              hint="不含标题、坐标、色号和图例，适合二次排版"
              checked={pngPatternOnly}
              onChange={setPngPatternOnly}
            />
            <ToggleRow
              title="格内色号"
              hint="每个色块中央标注色号，自动切换黑白字"
              checked={pngCodes}
              onChange={setPngCodes}
              disabled={pngPatternOnly}
            />
            <ToggleRow
              title="行列坐标"
              hint="便于按行对照拼豆"
              checked={pngCoords}
              onChange={setPngCoords}
              disabled={pngPatternOnly}
            />
            <ToggleRow
              title="图例与用量"
              hint="附色号、名称和颗数"
              checked={pngLegend}
              onChange={setPngLegend}
              disabled={pngPatternOnly}
            />
          </div>
          <div className="file-name-row">
            <Icon name="image" /><span>文件名</span><strong>{fileName}</strong>
          </div>
          <div className="export-note">
            <Icon name="info" />
            <span>PNG 适合分享和电子查看；需要打印请使用 A4 PDF。</span>
          </div>
        </>
      )}

      {format === 'pdf' && (
        <>
          <div className="export-preview">
            <canvas ref={previewRef} aria-label="PDF 导出预览" />
            <div className="export-preview__caption">
              <Icon name="download" />
              <strong>A4 纵向</strong>
              <span>·</span>
              <span>{pdfMode === 'actual' ? `${project.beadSizeMm}mm / 格` : pdfMode === 'fit' ? '适配页面' : `${pagination.cellMm.toFixed(1)}mm / 格`}</span>
              <span>·</span>
              <span>{pagination.totalPages} 页</span>
              {pdfMirror && <><span>·</span><span>镜像</span></>}
            </div>
          </div>
          <div className="export-section">
            <div className="export-section__title"><Icon name="grid" />页面与比例</div>
            <div className="option-row">
              <div className="option-row__copy">
                <div className="option-row__title">每格尺寸</div>
                <div className="option-row__hint">
                  {pdfMode === 'actual'
                    ? `按 ${project.beadSizeMm}mm 实物打印，可 1:1 对照`
                    : pdfMode === 'fit' ? '整张图纸缩放到一页' : '按固定比例自动分页'}
                </div>
              </div>
              <div className="segmented">
                {([['fit', '适配'], ['actual', '1:1'], ['custom', '自定义']] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={pdfMode === value ? 'is-active' : ''}
                    onClick={() => setPdfMode(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="option-row">
              <div className="option-row__copy">
                <div className="option-row__title">重叠边</div>
                <div className="option-row__hint">相邻页重叠的格数，方便拼接</div>
              </div>
              <div className="stepper">
                <button
                  type="button"
                  aria-label="减少重叠"
                  disabled={pdfOverlap <= 0}
                  onClick={() => setPdfOverlap((value) => Math.max(0, value - 1))}
                >
                  <Icon name="minus" />
                </button>
                <span className="stepper__value">{pdfOverlap} 格</span>
                <button
                  type="button"
                  aria-label="增加重叠"
                  disabled={pdfOverlap >= 3}
                  onClick={() => setPdfOverlap((value) => Math.min(3, value + 1))}
                >
                  <Icon name="plus" />
                </button>
              </div>
            </div>
            <div className="option-row">
              <div className="option-row__copy">
                <div className="option-row__title">输出精度</div>
                <div className="option-row__hint">300 DPI 更清晰，文件也更大</div>
              </div>
              <div className="segmented">
                {([200, 300] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={pdfDpi === value ? 'is-active' : ''}
                    onClick={() => setPdfDpi(value)}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>
            <div className="export-summary">
              <Icon name="grid" />
              <span><strong>{pagination.pagesX}×{pagination.pagesY}</strong> 拼版 · 共 <strong>{pagination.totalPages}</strong> 页{pagination.legendPages > 0 ? '（含图例页）' : ''} · A4</span>
            </div>
            {progress && (
              <div className="export-note" aria-live="polite">
                <Icon name="download" />
                <span>正在渲染第 {progress.current}/{progress.total} 页，请保持当前页面打开。</span>
              </div>
            )}
          </div>
          <div className="export-section">
            <div className="export-section__title"><Icon name="settings" />打印选项</div>
            <ToggleRow
              title="镜像图纸"
              hint="熨烫后成品方向正确"
              checked={pdfMirror}
              onChange={setPdfMirror}
            />
            <ToggleRow
              title="格内色号"
              hint="逐格居中标注，字号随每格尺寸缩放"
              checked={pdfCodes}
              onChange={setPdfCodes}
            />
            <ToggleRow
              title="图例页"
              hint="单页附用量面板，多页附独立清单"
              checked={pdfLegend}
              onChange={setPdfLegend}
            />
          </div>
          <div className="file-name-row">
            <Icon name="download" /><span>文件名</span><strong>{fileName}</strong>
          </div>
          <div className="export-note">
            <Icon name="info" />
            <span>PDF 按 A4 自动分页，页边带页码与全局行列号；镜像只影响打印，不改变工程。</span>
          </div>
        </>
      )}

      {format === 'csv' && (
        <>
          <div className="export-section">
            <div className="export-section__title"><Icon name="stats" />用量清单预览</div>
            {stats.list.length === 0 ? (
              <div className="stat-empty">
                <Icon name="bead" />
                <div>还没有落下的豆子</div>
                <div style={{ marginTop: 4 }}>先画几颗，再导出用量清单。</div>
              </div>
            ) : (
              <table className="mini-table">
                <thead>
                  <tr><th>色号</th><th>名称</th><th>HEX</th><th>颗数</th><th>占比</th></tr>
                </thead>
                <tbody>
                  {stats.list.slice(0, 7).map((item) => (
                    <tr key={item.color.code}>
                      <td>
                        <span className="mini-table__color">
                          <span className="mini-table__swatch" style={beadStyle(item.color.hex)} />
                          {item.color.code}
                        </span>
                      </td>
                      <td>{item.color.name}</td>
                      <td style={{ fontFamily: 'var(--mono)' }}>{item.color.hex}</td>
                      <td>{item.count.toLocaleString('zh-CN')}</td>
                      <td>{stats.total ? `${((item.count / stats.total) * 100).toFixed(1)}%` : '0%'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {stats.list.length > 7 && (
              <div className="stat-footnote">仅预览前 7 行，CSV 包含全部 {stats.colorCount} 行。</div>
            )}
            <div className="export-note">
              <Icon name="info" />
              <span>CSV 含 UTF-8 BOM，Excel 直接打开不乱码；按用量从多到少排序。</span>
            </div>
          </div>
          <div className="file-name-row">
            <Icon name="stats" /><span>文件名</span><strong>{fileName}</strong>
          </div>
        </>
      )}
    </Sheet>
  );
}
