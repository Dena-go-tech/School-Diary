import { useEffect, useMemo, useRef, useState } from 'react';

const LONG_PRESS_MS = 250; // на телефоне: задержать палец — и можно тащить, иначе обычная прокрутка
const MOVE_TOLERANCE = 8;

// Миниатюры фото, которые можно переставлять перетаскиванием (мышь и сенсорный экран).
// Короткое нажатие открывает фото, ✕ — убирает.
export default function SortablePhotos({ items, onMove, onOpen, onRemove, disabled, children }) {
  const ref = useRef(null);
  const drag = useRef(null); // { idx, x, y, pointerId, active, mouse, timer }
  const [dragKey, setDragKey] = useState(null);
  const latest = useRef({});
  latest.current = { items, onMove, onOpen, disabled };

  // Пока тащим — блокируем прокрутку страницы пальцем (нужен не-passive обработчик)
  useEffect(() => {
    const el = ref.current;
    const block = (e) => drag.current?.active && e.preventDefault();
    el.addEventListener('touchmove', block, { passive: false });
    return () => el.removeEventListener('touchmove', block);
  }, []);

  // Обработчики создаются один раз (читают всё через ref), чтобы removeEventListener снимал ровно те же функции
  const handlers = useMemo(() => {
    function activate() {
      const d = drag.current;
      if (!d) return;
      d.active = true;
      setDragKey(latest.current.items[d.idx].key);
      navigator.vibrate?.(15);
    }

    // Во время перетаскивания события слушаем на window: при перестановке React переносит
    // DOM-узел миниатюры, и привязанные к нему события указателя теряются
    function reset() {
      const d = drag.current;
      if (d) {
        clearTimeout(d.timer);
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        window.removeEventListener('pointercancel', reset);
      }
      drag.current = null;
      setDragKey(null);
    }

    function onPointerDown(e, idx) {
      if (latest.current.disabled || e.button > 0 || e.target.closest('.thumb-x')) return;
      reset();
      drag.current = { idx, x: e.clientX, y: e.clientY, pointerId: e.pointerId, active: false, mouse: e.pointerType === 'mouse' };
      if (!drag.current.mouse) drag.current.timer = setTimeout(activate, LONG_PRESS_MS);
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointercancel', reset);
    }

    function onPointerMove(e) {
      const d = drag.current;
      if (!d || e.pointerId !== d.pointerId) return;
      if (!d.active) {
        const moved = Math.hypot(e.clientX - d.x, e.clientY - d.y) > MOVE_TOLERANCE;
        if (!moved) return;
        if (!d.mouse) return reset(); // палец сдвинулся до долгого нажатия — это прокрутка
        activate();
      }
      // Новое место — миниатюра, ближайшая к пальцу
      const thumbs = [...ref.current.querySelectorAll('[data-sort]')];
      let target = d.idx;
      let best = Infinity;
      thumbs.forEach((t, i) => {
        const r = t.getBoundingClientRect();
        const dist = Math.hypot(r.left + r.width / 2 - e.clientX, r.top + r.height / 2 - e.clientY);
        if (dist < best) { best = dist; target = i; }
      });
      if (target !== d.idx) {
        latest.current.onMove(d.idx, target);
        d.idx = target;
      }
    }

    function onPointerUp(e) {
      const d = drag.current;
      if (!d || e.pointerId !== d.pointerId) return;
      if (!d.active) latest.current.onOpen(d.idx); // короткое нажатие — открыть фото
      reset();
    }

    return { onPointerDown, reset };
  }, []);

  useEffect(() => handlers.reset, [handlers]);

  return (
    <div
      ref={ref}
      className="thumbs editor"
      onContextMenu={(e) => e.target.closest('[data-sort]') && e.preventDefault()}
    >
      {items.map((p, i) => (
        <div
          key={p.key}
          data-sort
          className={'thumb sortable-thumb' + (dragKey === p.key ? ' dragging' : '')}
          onPointerDown={(e) => handlers.onPointerDown(e, i)}
        >
          <img src={p.url} alt="" draggable={false} />
          <span className="thumb-n">{i + 1}</span>
          <button className="thumb-x" onClick={() => onRemove(i)} aria-label="Убрать фото" disabled={disabled}>✕</button>
        </div>
      ))}
      {children}
    </div>
  );
}
