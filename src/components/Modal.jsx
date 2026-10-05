import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

let openCount = 0; // блокировка прокрутки страницы, пока открыт хоть один диалог

// variant: 'sheet' — выезжает снизу на телефоне, 'page' — на весь экран на телефоне
export default function Modal({ title, subtitle, variant = 'sheet', onClose, headerRight, footer, children }) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const backdropRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => {
      const all = document.querySelectorAll('.backdrop');
      if (e.key === 'Escape' && all[all.length - 1] === backdropRef.current) closeRef.current();
    };
    document.addEventListener('keydown', onKey);
    if (openCount++ === 0) document.body.classList.add('locked');
    return () => {
      document.removeEventListener('keydown', onKey);
      if (--openCount === 0) document.body.classList.remove('locked');
    };
  }, []);

  return createPortal(
    <div
      ref={backdropRef}
      className={`backdrop backdrop-${variant}`}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className={`dialog dialog-${variant}`} role="dialog" aria-modal="true">
        {variant === 'sheet' && <div className="grabber" />}
        <div className="dialog-head">
          {variant === 'page' && (
            <button className="icon-btn" onClick={onClose} aria-label="Закрыть">✕</button>
          )}
          <div className="dialog-heading">
            <div className="dialog-title">{title}</div>
            {subtitle && <div className="muted small">{subtitle}</div>}
          </div>
          {headerRight}
          {variant === 'sheet' && (
            <button className="icon-btn" onClick={onClose} aria-label="Закрыть">✕</button>
          )}
        </div>
        <div className="dialog-body">{children}</div>
        {footer && <div className="dialog-footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
