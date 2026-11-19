import { useEffect, useState } from 'react';
import { applyUpdate, hasUpdate, subscribeUpdate } from '@/pwa';
import { useAppStore } from '@/store/appStore';
import { Icon } from '@/ui/Icon';

export function PwaUpdateBanner() {
  const showToast = useAppStore((state) => state.showToast);
  const [available, setAvailable] = useState(() => hasUpdate());
  const [updating, setUpdating] = useState(false);

  useEffect(() => subscribeUpdate(() => setAvailable(true)), []);

  if (!available) return null;

  return (
    <div className="pwa-update" role="status" aria-live="polite">
      <span className="pwa-update__icon"><Icon name="download" /></span>
      <span className="pwa-update__copy">
        <strong>有新版本可用</strong>
        <span>保存当前工程后更新</span>
      </span>
      <button type="button" className="pwa-update__later" onClick={() => setAvailable(false)} disabled={updating}>
        稍后
      </button>
      <button
        type="button"
        className="pwa-update__apply"
        disabled={updating}
        onClick={() => {
          setUpdating(true);
          void applyUpdate().catch(() => {
            setUpdating(false);
            showToast('更新失败，请刷新页面重试', 'warn');
          });
        }}
      >
        {updating ? '更新中…' : '保存并更新'}
      </button>
    </div>
  );
}
