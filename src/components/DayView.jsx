import { useRef } from 'react';
import { WD_FULL, WD_SHORT, addDays, fmtLong, parse, weekday } from '../lib/dates.js';

const SWIPE_MIN = 60;

export default function DayView({ diary, hasSchedule, viewDate, today, now, onSelectDate, onShift, onOpenLesson, onOpenSchedule }) {
  const wd = weekday(viewDate);
  const monday = addDays(viewDate, 1 - wd);
  const week = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const lessons = diary.lessonsFor(viewDate);
  const touch = useRef(null);

  // Свайп влево/вправо — следующий/предыдущий день
  const onTouchStart = (e) => {
    const t = e.touches[0];
    touch.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e) => {
    if (!touch.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touch.current.x;
    const dy = t.clientY - touch.current.y;
    touch.current = null;
    if (Math.abs(dx) > SWIPE_MIN && Math.abs(dx) > Math.abs(dy) * 1.5) onShift(dx < 0 ? 1 : -1);
  };

  return (
    <div className="day-screen" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div className="sticky-head">
        <header className="topbar">
          <button className="icon-btn" onClick={() => onShift(-1)} aria-label="Предыдущий день">‹</button>
          <button className="day-title" onClick={() => onSelectDate(today)}>
            <div className="day-name">{viewDate === today ? `Сегодня, ${WD_FULL[wd]}` : WD_FULL[wd]}</div>
            <div className="day-date">{fmtLong(viewDate)}</div>
          </button>
          <button className="icon-btn" onClick={() => onShift(1)} aria-label="Следующий день">›</button>
        </header>

        <div className="week-strip">
          {week.map((d, i) => (
            <button
              key={d}
              className={(d === viewDate ? 'active ' : '') + (d === today ? 'today' : '')}
              onClick={() => onSelectDate(d)}
            >
              <span className="wd">{WD_SHORT[i + 1]}</span>
              <span className="dn">{parse(d).getDate()}</span>
              <span className={'dot' + (diary.hasOpenHomework(d) ? ' on' : '')} />
            </button>
          ))}
        </div>
      </div>

      <main className="lessons">
        {viewDate !== today && (
          <button className="link-btn" onClick={() => onSelectDate(today)}>← К сегодняшнему дню</button>
        )}

        {!hasSchedule ? (
          <div className="empty">
            <div className="big">🗓</div>
            Расписание ещё не заполнено
            <br /><br />
            <button className="btn primary" onClick={onOpenSchedule}>Составить расписание</button>
          </div>
        ) : !lessons.length ? (
          <div className="empty">
            <div className="big">🌤</div>
            Уроков нет — выходной
          </div>
        ) : (
          lessons.map((l) => (
            <LessonCard
              key={l.idx}
              lesson={l}
              diary={diary}
              date={viewDate}
              today={today}
              now={now}
              onOpen={() => onOpenLesson(l.idx)}
            />
          ))
        )}
      </main>

      <button className="fab" onClick={onOpenSchedule}>
        <span aria-hidden>🗓</span> Расписание
      </button>
    </div>
  );
}

function LessonCard({ lesson: l, diary, date, today, now, onOpen }) {
  const s = diary.subject(l.subjectId);

  if (!s) {
    return (
      <div className="lesson window">
        <div className="time"><b>{l.start}</b>{l.end}</div>
        <div className="body muted">{l.idx + 1}. Окно</div>
      </div>
    );
  }

  const isNow = date === today && l.start && l.start <= now && now < l.end;
  const isPast = date < today || (date === today && l.end && l.end <= now);
  const due = diary.dueFor(date, l.idx, l.subjectId);
  const given = diary.givenAt(date, l.idx, l.subjectId);

  return (
    <button className={'lesson' + (isNow ? ' now' : isPast ? ' past' : '')} onClick={onOpen}>
      <div className="bar" style={{ background: s.color }} />
      <div className="time"><b>{l.start}</b>{l.end}</div>
      <div className="body">
        <div className="subj">
          <span className="num">{l.idx + 1}.</span>
          <span className="name">{s.name}</span>
          {isNow && <span className="badge">сейчас</span>}
        </div>
        {due.length ? (
          due.map((h) => (
            <div key={h.id} className={'hw' + (h.done ? ' done' : '')}>
              {h.done ? '✅' : '📝'} {h.text || 'Фото'}
              {h.photos.length > 0 && <span className="photo-badge">📷 {h.photos.length}</span>}
            </div>
          ))
        ) : (
          <div className="hw-none">ДЗ нет</div>
        )}
        {given && <div className="given">✓ Задано на следующий урок</div>}
      </div>
      <div className="chev" aria-hidden>›</div>
    </button>
  );
}
