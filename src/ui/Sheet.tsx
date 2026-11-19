import { useEffect, useRef, type ReactNode, type PointerEvent as ReactPointerEvent } from 'react';
import { Icon } from './Icon';

export type SheetVariant = 'right' | 'bottom' | 'dialog';

interface SheetProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  variant: SheetVariant;
  wide?: boolean;
  narrow?: boolean;
  className?: string;
}

export function Sheet({ title, onClose, children, footer, variant, wide = false, narrow = false, className = '' }: SheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ startY: number; dragging: boolean }>({ startY: 0, dragging: false });
  const dragOffset = useRef(0);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  useEffect(() => {
    const auto = sheetRef.current?.querySelector<HTMLElement>('[data-autofocus]');
    if (auto) {
      window.setTimeout(() => auto.focus(), 40);
    }
  }, []);

  const onGrabberDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (variant !== 'bottom') return;
    dragState.current = { startY: event.clientY, dragging: true };
    dragOffset.current = 0;
    event.currentTarget.setPointerCapture(event.pointerId);
    if (sheetRef.current) sheetRef.current.style.transition = 'none';
  };

  const onGrabberMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragState.current.dragging || !sheetRef.current) return;
    const offset = Math.max(0, event.clientY - dragState.current.startY);
    dragOffset.current = offset;
    sheetRef.current.style.transform = `translateY(${offset}px)`;
  };

  const onGrabberUp = () => {
    if (!dragState.current.dragging) return;
    dragState.current.dragging = false;
    if (sheetRef.current) {
      sheetRef.current.style.transition = '';
      sheetRef.current.style.transform = '';
    }
    if (dragOffset.current > 90) onClose();
  };

  const wrapperClass = (variant === 'dialog'
    ? `dialog ${wide ? 'dialog--wide' : ''} ${narrow ? 'dialog--narrow' : ''}`
    : `sheet sheet--${variant} ${wide ? 'sheet--wide' : ''}`).trim() + (className ? ` ${className}` : '');
  const headClass = variant === 'dialog' ? 'dialog__head' : 'sheet__head';
  const bodyClass = variant === 'dialog' ? 'dialog__body' : 'sheet__body';
  const footClass = variant === 'dialog' ? 'dialog__foot' : 'sheet__foot';

  return (
    <>
      <div className="scrim" data-action="close-overlay" onClick={onClose} />
      <div ref={sheetRef} className={wrapperClass} role="dialog" aria-modal="true" aria-label={title}>
        {variant === 'bottom' && (
          <div
            className="sheet__grabber"
            onPointerDown={onGrabberDown}
            onPointerMove={onGrabberMove}
            onPointerUp={onGrabberUp}
            onPointerCancel={onGrabberUp}
          />
        )}
        <div className={headClass}>
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="关闭">
            <Icon name="close" />
          </button>
        </div>
        <div className={bodyClass}>{children}</div>
        {footer ? <div className={footClass}>{footer}</div> : null}
      </div>
    </>
  );
}
