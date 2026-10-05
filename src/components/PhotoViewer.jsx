import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// Просмотр фото на весь экран: свайп или стрелки — листать, нажатие на фон или ✕ — закрыть
export default function PhotoViewer({ urls, start = 0, onClose }) {
  const [i, setI] = useState(start);
  const touch = useRef(null);
  const go = (d) => setI((x) => Math.min(urls.length - 1, Math.max(0, x + d)));

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        onClose();
      }
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'ArrowRight') go(1);
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  });

  return createPortal(
    <div
      className="viewer"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      onTouchStart={(e) => { touch.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        const dx = e.changedTouches[0].clientX - (touch.current ?? 0);
        if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
      }}
    >
      <img src={urls[i]} alt="" onClick={onClose} />
      <button className="viewer-close" onClick={onClose} aria-label="Закрыть">✕</button>
      {urls.length > 1 && (
        <>
          {i > 0 && <button className="viewer-nav prev" onClick={() => go(-1)} aria-label="Предыдущее">‹</button>}
          {i < urls.length - 1 && <button className="viewer-nav next" onClick={() => go(1)} aria-label="Следующее">›</button>}
          <div className="viewer-count">{i + 1} / {urls.length}</div>
        </>
      )}
    </div>,
    document.body,
  );
}
