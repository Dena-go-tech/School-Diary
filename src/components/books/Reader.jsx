'use client';

import Link from 'next/link';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { saveLastPage } from './lastPage.js';

// Скан почти у всех страниц 766×1181 — задаём размер заранее, чтобы лента не прыгала при загрузке
const PAGE_W = 766;
const PAGE_H = 1181;
const ZOOMS = [1, 1.25, 1.5, 2];

// Все страницы книги одной лентой. Текущая печатная страница — в адресе (#p118),
// поэтому ссылки из оглавления и «Продолжить» открывают нужное место даже без JS
export default function Reader({ slug, title, pages, offset, texts }) {
  const [current, setCurrent] = useState(null);
  const [zoom, setZoom] = useState(0);
  const [jumpOpen, setJumpOpen] = useState(false);
  const listRef = useRef(null);
  const currentRef = useRef(null);
  const zoomRef = useRef(zoom);
  const scans = Array.from({ length: pages }, (_, i) => i + 1);

  // Какая страница пересекает середину экрана — та и текущая
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const page = Number(e.target.dataset.page);
          currentRef.current = page;
          setCurrent(page);
          if (page > 0) {
            history.replaceState(history.state, '', `#p${page}`);
            saveLastPage(slug, page);
          }
        }
      },
      { rootMargin: '-50% 0px -50% 0px' },
    );
    listRef.current.querySelectorAll('figure').forEach((f) => io.observe(f));
    return () => io.disconnect();
  }, [slug]);

  // Сменился масштаб — высота страниц другая, возвращаемся к той же странице
  useLayoutEffect(() => {
    if (zoomRef.current === zoom) return;
    zoomRef.current = zoom;
    listRef.current.querySelector(`[data-page="${currentRef.current}"]`)?.scrollIntoView();
  }, [zoom]);

  const jump = (page) => {
    document.getElementById(`p${page}`)?.scrollIntoView();
    setJumpOpen(false);
  };

  const text = current && texts.find((t) => current >= t.from && current <= t.to);

  return (
    <>
      <header className="bk-topbar">
        <Link className="icon-btn" href={`/books/${slug}`} aria-label="Оглавление">‹</Link>
        <div className="bk-topbar-title">
          <div className="bk-title">{title}</div>
          <button className="bk-page-btn" onClick={() => setJumpOpen((v) => !v)}>
            {current > 0 ? `с. ${current}` : 'обложка'} ▾
          </button>
        </div>
        <div className="bk-zoom">
          <button className="icon-btn sm" onClick={() => setZoom((z) => Math.max(0, z - 1))} disabled={!zoom} aria-label="Уменьшить">−</button>
          <button className="icon-btn sm" onClick={() => setZoom((z) => Math.min(ZOOMS.length - 1, z + 1))} disabled={zoom === ZOOMS.length - 1} aria-label="Увеличить">+</button>
        </div>
      </header>

      {jumpOpen && <JumpForm max={pages - offset} current={current} onJump={jump} />}

      <div className="bk-pages" ref={listRef} style={{ '--zoom': ZOOMS[zoom] }}>
        {scans.map((scan) => {
          const page = scan - offset;
          return (
            <figure key={scan} id={page > 0 ? `p${page}` : undefined} data-page={page} className="bk-page">
              <img
                src={`/api/books/${slug}/pages/${scan}`}
                alt={page > 0 ? `Страница ${page}` : 'Обложка'}
                width={PAGE_W}
                height={PAGE_H}
                loading={scan <= 2 ? 'eager' : 'lazy'}
                decoding="async"
              />
              {page > 0 && <figcaption>{page}</figcaption>}
            </figure>
          );
        })}
      </div>

      {text && (
        <Link className="bk-float" href={`/books/${slug}/${text.text}`}>
          📖 Текст п. {text.n} с формулами
        </Link>
      )}
    </>
  );
}

function JumpForm({ max, current, onJump }) {
  const [value, setValue] = useState(current > 0 ? String(current) : '');
  const page = Number(value);
  const ok = Number.isInteger(page) && page >= 1 && page <= max;
  return (
    <form
      className="bk-jump"
      onSubmit={(e) => {
        e.preventDefault();
        if (ok) onJump(page);
      }}
    >
      <label htmlFor="bk-jump">Страница</label>
      <input
        id="bk-jump"
        type="number"
        inputMode="numeric"
        min={1}
        max={max}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        autoFocus
      />
      <span className="muted small">из {max}</span>
      <button className="btn primary" disabled={!ok}>Перейти</button>
    </form>
  );
}
