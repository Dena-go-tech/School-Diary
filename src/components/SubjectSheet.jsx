import { useState } from 'react';
import Modal from './Modal.jsx';

export const PRESET_COLORS = [
  '#e5484d', '#f76b15', '#ffb224', '#c2410c', '#46a758', '#30a46c', '#12a594', '#0091ff',
  '#4f7cff', '#3e63dd', '#5b5bd6', '#8e4ec6', '#d6409f', '#e93d82', '#ad7f58', '#6e6e6e',
];

// Создание (subject = null) или редактирование предмета: название и цвет
export default function SubjectSheet({ subject, subjects, onSave, onDelete, onClose }) {
  const [name, setName] = useState(subject?.name || '');
  const [color, setColor] = useState(subject?.color || PRESET_COLORS[8]);
  const [error, setError] = useState(null);

  function save() {
    const n = name.trim();
    if (!n) return setError('Введите название');
    const dup = subjects.find((s) => !s.deleted && s.id !== subject?.id && s.name.toLowerCase() === n.toLowerCase());
    if (dup) return setError('Такой предмет уже есть');
    onSave({ name: n, color });
    onClose();
  }

  return (
    <Modal
      title={subject ? 'Предмет' : 'Новый предмет'}
      onClose={onClose}
      footer={
        <>
          {subject && (
            <button className="btn danger" onClick={() => onDelete() !== false && onClose()}>Удалить</button>
          )}
          <button className="btn primary grow" onClick={save}>{subject ? 'Сохранить' : 'Добавить'}</button>
        </>
      }
    >
      <div className="subject-preview">
        <span className="chip big" style={{ background: color }}>{name.trim() || 'Название'}</span>
      </div>

      <h3>Название</h3>
      <input
        value={name}
        maxLength={40}
        placeholder="Например: Русский язык"
        onChange={(e) => { setName(e.target.value); setError(null); }}
        onKeyDown={(e) => e.key === 'Enter' && save()}
      />
      {error && <div className="error">{error}</div>}

      <h3>Цвет</h3>
      <div className="colors">
        {PRESET_COLORS.map((c) => (
          <button
            key={c}
            className={'swatch' + (c.toLowerCase() === color.toLowerCase() ? ' selected' : '')}
            style={{ background: c }}
            onClick={() => setColor(c)}
            aria-label={c}
          />
        ))}
        <label className="swatch custom" style={{ background: PRESET_COLORS.includes(color) ? undefined : color }} aria-label="Свой цвет">
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
          {PRESET_COLORS.includes(color) && '＋'}
        </label>
      </div>
    </Modal>
  );
}
