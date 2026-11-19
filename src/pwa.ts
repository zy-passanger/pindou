import { registerSW } from 'virtual:pwa-register';
import { useAppStore } from '@/store/appStore';
import { flushSave } from '@/app/saveBridge';

type UpdateServiceWorker = (reloadPage?: boolean) => Promise<void>;

let updateServiceWorker: UpdateServiceWorker | null = null;
let needRefresh = false;
const listeners = new Set<() => void>();

export function registerPwa(): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  updateServiceWorker = registerSW({
    immediate: true,
    onNeedRefresh() {
      needRefresh = true;
      listeners.forEach((listener) => listener());
    },
    onOfflineReady() {
      window.setTimeout(() => {
        useAppStore.getState().showToast('已缓存到本机，可离线使用');
      }, 1600);
    },
  });
}

export function subscribeUpdate(listener: () => void): () => void {
  listeners.add(listener);
  if (needRefresh) listener();
  return () => {
    listeners.delete(listener);
  };
}

export async function applyUpdate(): Promise<void> {
  await flushSave();
  if (updateServiceWorker) await updateServiceWorker(true);
}

export function hasUpdate(): boolean {
  return needRefresh;
}
