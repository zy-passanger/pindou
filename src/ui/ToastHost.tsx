import { useAppStore } from '@/store/appStore';
import { Icon } from './Icon';

export function ToastHost() {
  const toasts = useAppStore((state) => state.toasts);
  return (
    <div className="toast-root" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast is-visible${toast.tone === 'info' ? ' toast--info' : toast.tone === 'warn' ? ' toast--warn' : ''}`}>
          <Icon name={toast.tone === 'warn' ? 'warning' : toast.tone === 'info' ? 'info' : 'check'} />
          <span>{toast.message}</span>
        </div>
      ))}
    </div>
  );
}
