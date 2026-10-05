import { useState } from 'react';
import { fmtShort } from '../lib/dates.js';
import { photoUrl } from '../lib/useDiary.js';

// Запрос ученика на ДЗ: текст, фото и (для админа) кнопки «Принять» / «Отклонить»
export default function RequestCard({ hw, diary, actions, toast, onPhotos, showLesson, hasOfficial }) {
  const [busy, setBusy] = useState(false);
  const s = diary.subject(hw.subjectId);
  const next = diary.nextLesson(hw.subjectId, hw.fromDate);

  async function approve() {
    setBusy(true);
    if (await actions.approveHomework(hw.id)) {
      toast(hasOfficial ? 'Принято — добавлено к уже заданному ДЗ' : 'Принято — ДЗ видно всем');
    }
    setBusy(false);
  }

  function reject() {
    if (!confirm(`Отклонить запрос${hw.authorName ? ` от ${hw.authorName}` : ''}?`)) return;
    actions.deleteHomework(hw.id);
    toast('Запрос отклонён');
  }

  return (
    <div className="request-card" style={{ borderLeftColor: s?.color }}>
      {showLesson && (
        <div className="request-lesson">
          <b>{s?.name}</b> · урок {fmtShort(hw.fromDate)}, {hw.fromIdx + 1}-й
          {next && <span className="muted"> → к {fmtShort(next.date)}</span>}
        </div>
      )}
      <div className="muted small">от {hw.authorName || 'удалённого пользователя'}</div>
      {hw.text && <div className="t">{hw.text}</div>}
      {hw.photos.length > 0 && (
        <div className="thumbs">
          {hw.photos.map((id, i) => (
            <button key={id} className="thumb" onClick={() => onPhotos(hw.photos.map(photoUrl), i)}>
              <img src={photoUrl(id)} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}
      <div className="request-actions">
        <button className="btn danger" onClick={reject} disabled={busy}>Отклонить</button>
        <button className="btn primary grow" onClick={approve} disabled={busy}>{busy ? 'Принимаю…' : 'Принять'}</button>
      </div>
      {hasOfficial && <div className="muted small">К этому уроку ДЗ уже задано — текст и фото допишутся к нему</div>}
    </div>
  );
}
