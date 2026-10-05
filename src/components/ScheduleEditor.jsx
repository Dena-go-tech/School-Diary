import { useState } from 'react';
import Modal from './Modal.jsx';
import SortableList from './SortableList.jsx';
import SubjectSheet from './SubjectSheet.jsx';
import { WD_FULL, WD_SHORT, addMinutes, fmtShort, todayStr, weekday } from '../lib/dates.js';
import { CUTOFF_HOUR, DEFAULT_BELLS, EDIT_DAYS, FIRST_DATE, effectiveDateNow, uid } from '../lib/diary.js';

const ALL_DAYS = [...EDIT_DAYS, 7];
const TABS = [['lessons', 'Уроки'], ['subjects', 'Предметы'], ['bells', 'Звонки']];

function effectiveLabel(eff) {
  if (eff === FIRST_DATE) return 'Первое расписание — будет действовать для всех дат';
  if (eff === todayStr()) return `Вступит в силу сегодня (сейчас до ${CUTOFF_HOUR}:00)`;
  return `Вступит в силу с ${fmtShort(eff)}. Прошлые дни не изменятся.`;
}

function makeDraft(state, diary) {
  const eff = effectiveDateNow(state);
  const base = diary.versionFor(eff === FIRST_DATE ? todayStr() : eff);
  const days = {};
  for (const d of ALL_DAYS) days[d] = [...(base?.days[d] || [])];
  return { bells: (base?.bells || DEFAULT_BELLS).map((b) => ({ ...b })), days };
}

function withBells(bells, n) {
  const res = [...bells];
  while (res.length < n) {
    const last = res[res.length - 1];
    const start = last ? addMinutes(last.end, 10) : '08:00';
    res.push({ start, end: addMinutes(start, 45) });
  }
  return res;
}

export default function ScheduleEditor({ state, diary, actions, toast, onClose }) {
  const [draft, setDraft] = useState(() => makeDraft(state, diary));
  const [tab, setTab] = useState('lessons');
  const [day, setDay] = useState(() => Math.min(weekday(todayStr()), 6));
  const [editing, setEditing] = useState(null); // { subject } | { subject: null } — открыт редактор предмета
  const [replacing, setReplacing] = useState(null); // индекс урока, у которого меняем предмет

  const subjects = state.subjects.filter((s) => !s.deleted);
  const list = draft.days[day];
  const maxUsed = Math.max(0, ...ALL_DAYS.map((d) => draft.days[d].length));
  const eff = effectiveDateNow(state);

  const updateDay = (d, fn) =>
    setDraft((dr) => {
      const next = fn([...dr.days[d]]);
      return { bells: withBells(dr.bells, next.length), days: { ...dr.days, [d]: next } };
    });

  function onPick(subjectId) {
    if (replacing != null) {
      updateDay(day, (l) => { l[replacing] = subjectId; return l; });
      setReplacing(null);
    } else {
      updateDay(day, (l) => [...l, subjectId]);
    }
  }

  function move(from, to) {
    updateDay(day, (l) => {
      const [x] = l.splice(from, 1);
      l.splice(to, 0, x);
      return l;
    });
  }

  function copyFrom(src) {
    if (list.length && !confirm(`Заменить уроки (${WD_SHORT[day]}) уроками из дня ${WD_SHORT[src]}?`)) return;
    updateDay(day, () => [...draft.days[src]]);
  }

  function saveSubject(data) {
    const s = editing.subject;
    if (s) {
      actions.updateSubject(s.id, data);
      return;
    }
    const existing = state.subjects.find((x) => x.deleted && x.name.toLowerCase() === data.name.toLowerCase());
    if (existing) actions.updateSubject(existing.id, { ...data, deleted: false });
    else actions.addSubject({ id: uid('s'), ...data });
  }

  function deleteSubject() {
    const s = editing.subject;
    if (!confirm(`Удалить предмет «${s.name}»? Из нового расписания он будет убран, прошлые недели и ДЗ сохранятся.`)) return false;
    actions.updateSubject(s.id, { deleted: true });
    setDraft((dr) => {
      const days = {};
      for (const d of ALL_DAYS) days[d] = dr.days[d].filter((id) => id !== s.id);
      return { ...dr, days };
    });
  }

  function setBell(i, key, value) {
    setDraft((dr) => ({ ...dr, bells: dr.bells.map((b, j) => (j === i ? { ...b, [key]: value } : b)) }));
  }

  function removeLastBell() {
    if (draft.bells.length <= maxUsed) return toast('Сначала уберите последний урок из дней недели');
    setDraft((dr) => ({ ...dr, bells: dr.bells.slice(0, -1) }));
  }

  function save() {
    const effNow = effectiveDateNow(state); // время проверяется в момент сохранения
    actions.saveVersion({ effectiveFrom: effNow, bells: draft.bells.slice(0, Math.max(maxUsed, 1)), days: draft.days });
    toast(
      effNow === FIRST_DATE ? 'Расписание сохранено'
        : effNow === todayStr() ? 'Расписание изменено с сегодняшнего дня'
        : `Новое расписание начнёт действовать с ${fmtShort(effNow)}`,
    );
    onClose();
  }

  return (
    <Modal
      variant="page"
      title="Расписание"
      onClose={onClose}
      headerRight={<button className="btn primary" onClick={save}>Сохранить</button>}
    >
      <div className="banner">{effectiveLabel(eff)}</div>

      <div className="segmented">
        {TABS.map(([id, label]) => (
          <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      {tab === 'lessons' && (
        <>
          <div className="day-tabs">
            {EDIT_DAYS.map((d) => (
              <button key={d} className={d === day ? 'active' : ''} onClick={() => { setDay(d); setReplacing(null); }}>
                {WD_SHORT[d]}
                <small>{draft.days[d].length || '—'}</small>
              </button>
            ))}
          </div>

          <div className="section-head">
            <span className="cap">{WD_FULL[day]}</span>
            <select className="copy-select" value="" onChange={(e) => e.target.value && copyFrom(Number(e.target.value))}>
              <option value="">Скопировать из…</option>
              {EDIT_DAYS.filter((d) => d !== day && draft.days[d].length).map((d) => (
                <option key={d} value={d}>{WD_FULL[d]}</option>
              ))}
            </select>
          </div>

          {list.length === 0 && <div className="empty small-empty">Уроков нет. Нажмите на предмет ниже, чтобы добавить.</div>}

          <SortableList
            items={list}
            onMove={move}
            renderItem={(sid, idx, { handle, dragging }) => {
              const s = diary.subject(sid);
              const b = draft.bells[idx] || {};
              return (
                <div
                  key={idx}
                  className={'row' + (dragging ? ' dragging' : '') + (replacing === idx ? ' replacing' : '')}
                  style={{ borderLeftColor: s ? s.color : 'var(--line)' }}
                >
                  {handle}
                  <button className="row-main" onClick={() => setReplacing(replacing === idx ? null : idx)}>
                    <span className="n">{idx + 1}</span>
                    <span className="nm">{s ? s.name : <span className="muted">Окно</span>}</span>
                    <span className="tm">{b.start}–{b.end}</span>
                  </button>
                  <button className="icon-btn sm" aria-label="Убрать урок" onClick={() => updateDay(day, (l) => l.filter((_, i) => i !== idx))}>✕</button>
                </div>
              );
            }}
          />

          <div className="picker">
            <div className="picker-title">
              {replacing != null ? `Заменить ${replacing + 1}-й урок на:` : 'Добавить урок:'}
              {replacing != null && <button className="link-btn inline" onClick={() => setReplacing(null)}>отмена</button>}
            </div>
            <div className="palette">
              {subjects.map((s) => (
                <button key={s.id} className="chip" style={{ background: s.color }} onClick={() => onPick(s.id)}>{s.name}</button>
              ))}
              <button className="chip window-chip" onClick={() => onPick(null)}>Окно</button>
              <button className="chip add-chip" onClick={() => setEditing({ subject: null })}>＋ предмет</button>
            </div>
          </div>
        </>
      )}

      {tab === 'subjects' && (
        <>
          <div className="muted small hint-line">Нажмите на предмет, чтобы изменить название или цвет</div>
          <div className="subject-list">
            {subjects.map((s) => (
              <button key={s.id} className="subject-row" onClick={() => setEditing({ subject: s })}>
                <span className="dot-lg" style={{ background: s.color }} />
                <span className="grow">{s.name}</span>
                <span className="chev">›</span>
              </button>
            ))}
          </div>
          <button className="btn block" onClick={() => setEditing({ subject: null })}>＋ Новый предмет</button>
        </>
      )}

      {tab === 'bells' && (
        <>
          <div className="muted small hint-line">Время начала и конца каждого урока</div>
          {draft.bells.map((b, i) => (
            <div key={i} className="bell-row">
              <span className="n">{i + 1}</span>
              <input type="time" value={b.start} onChange={(e) => setBell(i, 'start', e.target.value)} />
              <span className="muted">–</span>
              <input type="time" value={b.end} onChange={(e) => setBell(i, 'end', e.target.value)} />
              {i === draft.bells.length - 1 ? (
                <button className="icon-btn sm" aria-label="Убрать" onClick={removeLastBell}>✕</button>
              ) : <span className="icon-spacer" />}
            </div>
          ))}
          <button className="btn block" onClick={() => setDraft((dr) => ({ ...dr, bells: withBells(dr.bells, dr.bells.length + 1) }))}>
            ＋ Добавить урок
          </button>
        </>
      )}

      {editing && (
        <SubjectSheet
          subject={editing.subject}
          subjects={state.subjects}
          onSave={saveSubject}
          onDelete={deleteSubject}
          onClose={() => setEditing(null)}
        />
      )}
    </Modal>
  );
}
