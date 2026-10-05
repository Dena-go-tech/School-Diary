import { useState } from 'react';
import Modal from './Modal.jsx';
import PhotoViewer from './PhotoViewer.jsx';
import RequestCard from './RequestCard.jsx';

// Все запросы учеников, ждущие проверки (только для администратора)
export default function RequestsSheet({ diary, actions, toast, onClose }) {
  const [viewer, setViewer] = useState(null);
  const list = [...diary.pending].sort((a, b) => a.fromDate.localeCompare(b.fromDate) || a.fromIdx - b.fromIdx || a.createdAt - b.createdAt);

  return (
    <Modal title="Запросы на ДЗ" subtitle={list.length ? `Ждут проверки: ${list.length}` : null} onClose={onClose}>
      {list.length === 0 && <div className="empty small-empty">Новых запросов нет</div>}
      <div className="hw-list">
        {list.map((hw) => (
          <RequestCard
            key={hw.id}
            hw={hw}
            diary={diary}
            actions={actions}
            toast={toast}
            showLesson
            hasOfficial={!!diary.givenAt(hw.fromDate, hw.fromIdx, hw.subjectId)}
            onPhotos={(urls, start) => setViewer({ urls, start })}
          />
        ))}
      </div>
      {viewer && <PhotoViewer urls={viewer.urls} start={viewer.start} onClose={() => setViewer(null)} />}
    </Modal>
  );
}
