import { useEffect } from 'react';
import { useAppStore, type Layout } from '@/store/appStore';

export function computeLayout(width: number): Layout {
  if (width < 600) return 'phone';
  if (width < 900) return 'tablet';
  return 'wide';
}

export function useLayout(): Layout {
  const layout = useAppStore((state) => state.layout);
  const setLayout = useAppStore((state) => state.setLayout);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const width = document.documentElement.clientWidth || window.innerWidth;
      const next = computeLayout(width);
      if (useAppStore.getState().layout !== next) setLayout(next);
    };
    const onResize = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener('resize', onResize);
    const observer = new ResizeObserver(onResize);
    observer.observe(document.documentElement);
    return () => {
      window.removeEventListener('resize', onResize);
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [setLayout]);

  return layout;
}
