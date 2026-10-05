import { useRef, useState } from 'react';

// Список, который можно переставлять пальцем или мышью за ручку ⠿ (pointer events работают и на телефонах)
export default function SortableList({ items, onMove, renderItem }) {
  const listRef = useRef(null);
  const drag = useRef(null); // { idx, pointerId }
  const [dragIdx, setDragIdx] = useState(null);

  function onPointerDown(e, idx) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { idx, pointerId: e.pointerId };
    setDragIdx(idx);
    navigator.vibrate?.(10);
  }

  function onPointerMove(e) {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    const rows = [...listRef.current.children];
    // Новая позиция = сколько других строк выше пальца
    let target = 0;
    rows.forEach((row, j) => {
      if (j === d.idx) return;
      const r = row.getBoundingClientRect();
      if (r.top + r.height / 2 < e.clientY) target++;
    });
    if (target !== d.idx) {
      onMove(d.idx, target);
      d.idx = target;
      setDragIdx(target);
    }
  }

  function onPointerUp() {
    drag.current = null;
    setDragIdx(null);
  }

  return (
    <div className="sortable" ref={listRef}>
      {items.map((item, idx) =>
        renderItem(item, idx, {
          dragging: dragIdx === idx,
          handle: (
            <span
              className="handle"
              aria-label="Перетащить"
              onPointerDown={(e) => onPointerDown(e, idx)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              ⠿
            </span>
          ),
        }),
      )}
    </div>
  );
}
