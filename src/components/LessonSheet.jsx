import { useEffect, useRef, useState } from 'react';
import Modal from './Modal.jsx';
import PhotoViewer from './PhotoViewer.jsx';
import SortablePhotos from './SortablePhotos.jsx';
import { fmtShort } from '../lib/dates.js';
import { uid } from '../lib/diary.js';
import { compressImage } from '../lib/images.js';
import { photoUrl } from '../lib/useDiary.js';

const MAX_PHOTOS = 10;

export default function LessonSheet({ diary, date, idx, actions, toast, onClose }) {
  const lesson = diary.lessonsFor(date)[idx];
  const s = diary.subject(lesson.subjectId);
  const due = diary.dueFor(date, idx, lesson.subjectId);
  const given = diary.givenAt(date, idx, lesson.subjectId);
  const next = diary.nextLesson(lesson.subjectId, date);

  const [text, setText] = useState(given?.text || '');
  // Фото в нужном порядке: уже загруженные { key, id, url } и новые { key, id, url, blob }
  const [photos, setPhotos] = useState(() => (given?.photos || []).map((id) => ({ key: id, id, url: photoUrl(id) })));
  const [removed, setRemoved] = useState([]); // загруженные фото, которые удалятся при сохранении
  const [processing, setProcessing] = useState(0);
  const [saving, setSaving] = useState(false);
  const [viewer, setViewer] = useState(null); // { urls, start }
  const fileRef = useRef(null);

  const photosRef = useRef(photos);
  photosRef.current = photos;
  useEffect(() => () => photosRef.current.forEach((p) => p.blob && URL.revokeObjectURL(p.url)), []);

  const pending = photos.filter((p) => p.blob);
  const photoCount = photos.length;
  // Счётчик с учётом фото, которые ещё сжимаются — чтобы не превысить лимит при быстрой вставке
  const photoCountRef = useRef(photoCount);
  photoCountRef.current = photoCount + processing;
  const savingRef = useRef(saving);
  savingRef.current = saving;

  function removePhoto(i) {
    const p = photos[i];
    if (p.blob) URL.revokeObjectURL(p.url);
    else setRemoved((r) => [...r, p.id]);
    setPhotos((list) => list.filter((x) => x !== p));
  }

  function movePhoto(from, to) {
    setPhotos((list) => {
      const next = [...list];
      const [x] = next.splice(from, 1);
      next.splice(to, 0, x);
      return next;
    });
  }

  async function addFiles(list) {
    const files = list.slice(0, MAX_PHOTOS - photoCountRef.current);
    if (list.length > files.length) toast(`Можно прикрепить не больше ${MAX_PHOTOS} фото`);
    photoCountRef.current += files.length;
    setProcessing((n) => n + files.length);
    for (const file of files) {
      try {
        const blob = await compressImage(file);
        const id = uid('p');
        setPhotos((list) => [...list, { key: id, id, blob, url: URL.createObjectURL(blob) }]);
      } catch {
        photoCountRef.current--;
        toast('Не удалось открыть изображение');
      } finally {
        setProcessing((n) => n - 1);
      }
    }
  }

  function onFiles(e) {
    const files = [...e.target.files];
    e.target.value = '';
    addFiles(files);
  }

  // Ctrl/Cmd+V или «Вставить» из меню долгого нажатия на поле — где угодно в окне урока
  useEffect(() => {
    const onPaste = (e) => {
      const files = [...(e.clipboardData?.items || [])]
        .filter((it) => it.kind === 'file' && it.type.startsWith('image/'))
        .map((it) => it.getAsFile())
        .filter(Boolean);
      if (!files.length || savingRef.current) return; // обычный текст вставляется как обычно
      e.preventDefault();
      addFiles(files);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  });

  async function save() {
    const t = text.trim();
    if (!t && photoCount === 0) {
      if (given) actions.deleteHomework(given.id);
      onClose();
      return;
    }

    setSaving(true);
    let hwId = given?.id;
    if (!given) {
      hwId = uid('h');
      const ok = await actions.addHomework({
        id: hwId, subjectId: lesson.subjectId, fromDate: date, fromIdx: idx, text: t, done: false, createdAt: Date.now(), photos: [],
      });
      if (!ok) return setSaving(false);
    } else if (given.text !== t || pending.length) {
      actions.updateHomework(given.id, { text: t, done: false });
    }

    removed.forEach((id) => actions.deletePhoto(hwId, id));
    let failed = 0;
    const uploaded = new Set();
    for (const p of pending) {
      if (await actions.uploadPhoto(hwId, p.id, p.blob)) uploaded.add(p.id);
      else failed++;
    }

    // На сервере сейчас: прежние фото в старом порядке + новые в конце. Если на экране иначе — сохраняем порядок
    const order = photos.filter((p) => !p.blob || uploaded.has(p.id)).map((p) => p.id);
    const serverOrder = [
      ...(given?.photos || []).filter((id) => !removed.includes(id)),
      ...pending.filter((p) => uploaded.has(p.id)).map((p) => p.id),
    ];
    if (order.join() !== serverOrder.join()) actions.reorderPhotos(hwId, order);

    if (!failed) toast(next ? `ДЗ добавлено к уроку ${fmtShort(next.date)}` : 'ДЗ сохранено');
    onClose();
  }

  function remove() {
    if (!confirm('Удалить заданное ДЗ вместе с фото?')) return;
    actions.deleteHomework(given.id);
    onClose();
  }

  return (
    <Modal
      title={<><span className="dot-lg" style={{ background: s.color }} />{s.name}</>}
      subtitle={`${fmtShort(date)} · ${idx + 1}-й урок · ${lesson.start}–${lesson.end}`}
      onClose={() => !saving && onClose()}
      footer={
        <>
          {given && <button className="btn danger" onClick={remove} disabled={saving}>Удалить</button>}
          <button className="btn primary grow" onClick={save} disabled={saving || processing > 0}>
            {saving ? (pending.length ? 'Загружаю фото…' : 'Сохраняю…') : 'Сохранить'}
          </button>
        </>
      }
    >
      <h3>Задано на этот урок</h3>
      <div className="hw-list">
        {due.length === 0 && <div className="muted">Ничего не задано</div>}
        {due.map((h) => (
          <div key={h.id} className={'hw-item' + (h.done ? ' done' : '')}>
            <input
              type="checkbox"
              checked={h.done}
              aria-label="Выполнено"
              onChange={(e) => actions.updateHomework(h.id, { done: e.target.checked })}
            />
            <div className="grow">
              {h.text && <div className="t">{h.text}</div>}
              {h.photos.length > 0 && (
                <div className="thumbs">
                  {h.photos.map((id, i) => (
                    <button key={id} className="thumb" onClick={() => setViewer({ urls: h.photos.map(photoUrl), start: i })}>
                      <img src={photoUrl(id)} alt="" loading="lazy" />
                    </button>
                  ))}
                </div>
              )}
              <div className="from">задано {fmtShort(h.fromDate)}</div>
            </div>
          </div>
        ))}
      </div>

      <h3>Задать ДЗ</h3>
      <div className="muted small hint-line">
        {next
          ? `→ подставится к уроку ${fmtShort(next.date)}, ${next.idx + 1}-й урок`
          : 'Следующий урок этого предмета в расписании не найден — ДЗ сохранится, но не будет показано на уроке'}
      </div>
      <textarea
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === 'Enter' && save()}
        placeholder="Например: упр. 125, выучить правило на с. 40"
      />

      <SortablePhotos
        items={photos}
        disabled={saving}
        onMove={movePhoto}
        onRemove={removePhoto}
        onOpen={(i) => setViewer({ urls: photos.map((p) => p.url), start: i })}
      >
        {Array.from({ length: processing }, (_, i) => <div key={'proc' + i} className="thumb loading-thumb" />)}
        {photoCount + processing < MAX_PHOTOS && (
          <button className="thumb add-photo" onClick={() => fileRef.current.click()} disabled={saving}>
            <span>📷</span>Фото
          </button>
        )}
      </SortablePhotos>
      {photoCount > 1 && <div className="muted small hint-line">Чтобы поменять порядок, задержите палец на фото и перетащите</div>}
      <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={onFiles} />

      {viewer && <PhotoViewer urls={viewer.urls} start={viewer.start} onClose={() => setViewer(null)} />}
    </Modal>
  );
}
