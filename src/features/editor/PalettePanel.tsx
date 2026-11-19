import { useMemo } from 'react';
import type { BeadColor, Project } from '@/core/model';
import type { ProjectStats } from '@/core/stats';
import { INDEX_BY_CODE } from '@/core/palette';
import { seriesMatches, useAppStore, SERIES_FILTERS, type PaletteTab } from '@/store/appStore';
import { Icon } from '@/ui/Icon';
import { beadStyle } from '@/ui/beadStyle';

interface PalettePanelProps {
  project: Project;
  stats: ProjectStats;
  compact?: boolean;
  onOpenMyPalette: () => void;
  onSelectColor: (code: string) => void;
}

export function PalettePanel({ project, stats, compact = false, onOpenMyPalette, onSelectColor }: PalettePanelProps) {
  const paletteTab = useAppStore((state) => state.paletteTab);
  const paletteSearch = useAppStore((state) => state.paletteSearch);
  const seriesFilter = useAppStore((state) => state.seriesFilter);
  const myPaletteCodes = useAppStore((state) => state.myPaletteCodes);
  const selectedColorCode = useAppStore((state) => state.selectedColorCode);
  const setPaletteTab = useAppStore((state) => state.setPaletteTab);
  const setPaletteSearch = useAppStore((state) => state.setPaletteSearch);
  const setSeriesFilter = useAppStore((state) => state.setSeriesFilter);

  const colors = project.palette.colors;
  const mySet = useMemo(() => new Set(myPaletteCodes), [myPaletteCodes]);
  const myCount = useMemo(() => colors.filter((color) => mySet.has(color.code)).length, [colors, mySet]);
  const selected = colors.find((color) => color.code === selectedColorCode) ?? colors[0];
  const currentIndex = selected ? INDEX_BY_CODE.get(selected.code) : undefined;
  const currentCount = currentIndex !== undefined ? stats.counts[currentIndex] ?? 0 : 0;
  const query = paletteSearch.trim().toLowerCase();

  const items = useMemo(() => {
    let base: Array<{ color: BeadColor; count: number }>;
    if (paletteTab === 'used') {
      base = stats.list.map((item) => ({ color: item.color, count: item.count }));
    } else if (paletteTab === 'mine') {
      base = colors.filter((color) => mySet.has(color.code)).map((color) => ({
        color,
        count: stats.counts[INDEX_BY_CODE.get(color.code) ?? -1] ?? 0,
      }));
    } else {
      base = colors.map((color) => ({
        color,
        count: stats.counts[INDEX_BY_CODE.get(color.code) ?? -1] ?? 0,
      }));
    }
    return base.filter(({ color }) => {
      if (!seriesMatches(color, seriesFilter)) return false;
      if (!query) return true;
      return `${color.code} ${color.name}`.toLowerCase().includes(query);
    });
  }, [colors, mySet, paletteTab, query, seriesFilter, stats]);

  const tabs: Array<{ id: PaletteTab; label: string }> = [
    { id: 'used', label: `已用 ${stats.colorCount}` },
    { id: 'all', label: `全部 ${colors.length}` },
    { id: 'mine', label: `我的 ${myCount}` },
  ];

  const emptyText = paletteTab === 'used' && stats.list.length === 0
    ? '还没有用过的颜色'
    : '没有匹配的色号';
  const emptyHint = paletteTab === 'used' && stats.list.length === 0
    ? '切到「全部」，选一个颜色开始落豆'
    : '换个关键词或系列试试';

  return (
    <div className="palette">
      <div className="palette__head">
        {compact
          ? <span className="palette__compact-label">MARD · {colors.length} 色</span>
          : <h2>色板</h2>}
        <button className="text-link" onClick={onOpenMyPalette}>我的色卡<Icon name="chevron-right" /></button>
      </div>

      <div className="palette__current">
        <span className="bead-dot" style={beadStyle(selected?.hex ?? '#ddd')} />
        <div className="palette__current-copy">
          <div className="palette__current-code">{selected?.code ?? '—'}</div>
          <div className="palette__current-name">{selected?.name ?? ''}</div>
        </div>
        <div className="palette__current-count"><strong>{currentCount.toLocaleString('zh-CN')}</strong>颗</div>
      </div>

      <div className="palette__tabs" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`palette-tab ${paletteTab === tab.id ? 'is-active' : ''}`}
            role="tab"
            aria-selected={paletteTab === tab.id}
            onClick={() => setPaletteTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="palette__search">
        <div className="search-field">
          <Icon name="search" />
          <input
            type="search"
            value={paletteSearch}
            placeholder="搜索色号或颜色名"
            aria-label="搜索色板"
            onChange={(event) => setPaletteSearch(event.target.value)}
          />
        </div>
      </div>

      <div className="series-row">
        {SERIES_FILTERS.map((filter) => (
          <button
            key={filter}
            className={`series-chip ${seriesFilter === filter ? 'is-active' : ''}`}
            onClick={() => setSeriesFilter(filter)}
          >
            {filter === 'all' ? '全部' : filter}
          </button>
        ))}
      </div>

      <div className="swatch-grid">
        {items.length ? items.map(({ color, count }) => {
          const isSelected = color.code === selectedColorCode;
          return (
            <button
              key={color.code}
              className={`swatch ${isSelected ? 'is-selected' : ''}`}
              aria-label={`${color.code} ${color.name}${count ? `，${count} 颗` : ''}`}
              aria-pressed={isSelected}
              onClick={() => onSelectColor(color.code)}
            >
              <span className="swatch__bead" style={beadStyle(color.hex)} />
              <span className="swatch__code">{color.code}</span>
              {count ? <span className="swatch__badge">{count > 999 ? '999+' : count}</span> : null}
            </button>
          );
        }) : (
          <div className="swatch-grid__empty">
            <Icon name={paletteTab === 'used' && stats.list.length === 0 ? 'bead' : 'search'} />
            <div>{emptyText}</div>
            <div style={{ marginTop: 4, fontSize: 10 }}>{emptyHint}</div>
          </div>
        )}
      </div>

      <div className="palette__note">屏幕色值仅供参考，实物颜色以品牌色卡为准。</div>
    </div>
  );
}
