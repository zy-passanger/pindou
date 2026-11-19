import type { Project } from '@/core/model';
import { boardCount, physicalSize } from '@/core/model';
import type { ProjectStats } from '@/core/stats';
import { exportUsageCsv } from '@/export/csv';
import { useAppStore } from '@/store/appStore';
import { beadStyle } from '@/ui/beadStyle';
import { Icon } from '@/ui/Icon';
import { Sheet } from '@/ui/Sheet';

interface StatsSheetProps {
  project: Project;
  stats: ProjectStats;
  onClose: () => void;
}

export function StatsSheet({ project, stats, onClose }: StatsSheetProps) {
  const layout = useAppStore((state) => state.layout);
  const showToast = useAppStore((state) => state.showToast);
  const max = stats.list[0]?.count ?? 1;

  return (
    <Sheet
      title="用量统计"
      onClose={onClose}
      variant={layout === 'phone' ? 'bottom' : 'right'}
      footer={(
        <button
          className="btn btn--secondary btn--block"
          onClick={() => {
            try {
              exportUsageCsv(project, stats);
              showToast('用量 CSV 已导出');
            } catch {
              showToast('导出失败', 'warn');
            }
          }}
        >
          <Icon name="download" />导出用量 CSV
        </button>
      )}
    >
      {stats.total === 0 ? (
        <div className="stat-empty">
          <Icon name="bead" />
          <div>还没有落下的豆子</div>
          <div style={{ marginTop: 4 }}>在画布上画几颗，或从图片生成图纸。</div>
        </div>
      ) : (
        <>
          <div className="stat-cards">
            <div className="stat-card stat-card--accent">
              <div className="stat-card__value">{stats.total.toLocaleString('zh-CN')}<small>颗</small></div>
              <div className="stat-card__label">总用量</div>
            </div>
            <div className="stat-card">
              <div className="stat-card__value">{stats.colorCount}<small>色</small></div>
              <div className="stat-card__label">色号数量</div>
            </div>
            <div className="stat-card">
              <div className="stat-card__value">{boardCount(project)}<small>块</small></div>
              <div className="stat-card__label">按板估算</div>
            </div>
          </div>
          <div className="stat-list__head">
            <span>按用量排序</span>
            <span>{project.width}×{project.height} · {physicalSize(project)}</span>
          </div>
          <div className="stat-list">
            {stats.list.map((item) => {
              const percent = (item.count / stats.total) * 100;
              return (
                <div className="stat-row" key={item.color.code}>
                  <span className="stat-row__bead" style={beadStyle(item.color.hex)} />
                  <span className="stat-row__copy">
                    <span className="stat-row__code">{item.color.code}</span>
                    <span className="stat-row__name">{item.color.name}</span>
                  </span>
                  <span className="stat-row__bar">
                    <i style={{ width: `${Math.max(2, (item.count / max) * 100)}%`, ...beadStyle(item.color.hex) }} />
                  </span>
                  <span className="stat-row__count">{item.count.toLocaleString('zh-CN')}</span>
                  <span className="stat-row__pct">{percent < 1 ? '<1' : Math.round(percent)}%</span>
                </div>
              );
            })}
          </div>
          <div className="stat-footnote">用量按已放置的豆子统计，空格不计入。建议按统计多备 5% 左右的损耗。</div>
        </>
      )}
    </Sheet>
  );
}
