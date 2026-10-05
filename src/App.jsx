import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createDiary } from './lib/diary.js';
import { addDays, nowHM, todayStr } from './lib/dates.js';
import { useDiary } from './lib/useDiary.js';
import DayView from './components/DayView.jsx';
import LessonSheet from './components/LessonSheet.jsx';
import ScheduleEditor from './components/ScheduleEditor.jsx';
import Toast, { useToast } from './components/Toast.jsx';

export default function App() {
  const [toastMsg, toast] = useToast();
  const { state, loadError, reload, actions } = useDiary(toast);
  const [today, setToday] = useState(todayStr);
  const todayRef = useRef(today);
  const [now, setNow] = useState(nowHM);
  const [viewDate, setViewDate] = useState(todayStr);
  const [openLesson, setOpenLesson] = useState(null); // { date, idx }
  const [scheduleOpen, setScheduleOpen] = useState(false);

  const diary = useMemo(() => (state ? createDiary(state) : null), [state]);

  // Раз в минуту обновляем «текущий урок» и переходим на новый день после полуночи
  useEffect(() => {
    const t = setInterval(() => {
      const prev = todayRef.current;
      const next = todayStr();
      setNow(nowHM());
      if (prev !== next) {
        todayRef.current = next;
        setToday(next);
        setViewDate((v) => (v === prev ? next : v));
      }
    }, 60 * 1000);
    return () => clearInterval(t);
  }, []);

  // Вернулись в приложение (телефон разблокирован) — подтягиваем свежие данные
  useEffect(() => {
    const onVisible = () => document.visibilityState === 'visible' && reload();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [reload]);

  const dialogOpen = openLesson || scheduleOpen;
  const shiftDay = useCallback((n) => setViewDate((d) => addDays(d, n)), []);

  useEffect(() => {
    const onKey = (e) => {
      if (dialogOpen || e.target.matches('input, textarea')) return;
      if (e.key === 'ArrowLeft') shiftDay(-1);
      if (e.key === 'ArrowRight') shiftDay(1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [dialogOpen, shiftDay]);

  if (!diary) {
    return (
      <div className="loading">
        {loadError ? (
          <>
            <div className="big">⚠️</div>
            Нет связи с сервером
            <br /><br />
            <button className="btn primary" onClick={reload}>Повторить</button>
          </>
        ) : 'Загрузка…'}
      </div>
    );
  }

  return (
    <>
      <DayView
        diary={diary}
        hasSchedule={state.versions.length > 0}
        viewDate={viewDate}
        today={today}
        now={now}
        onSelectDate={setViewDate}
        onShift={shiftDay}
        onOpenLesson={(idx) => setOpenLesson({ date: viewDate, idx })}
        onOpenSchedule={() => setScheduleOpen(true)}
      />

      {openLesson && (
        <LessonSheet
          diary={diary}
          date={openLesson.date}
          idx={openLesson.idx}
          actions={actions}
          toast={toast}
          onClose={() => setOpenLesson(null)}
        />
      )}

      {scheduleOpen && (
        <ScheduleEditor
          state={state}
          diary={diary}
          actions={actions}
          toast={toast}
          onClose={() => setScheduleOpen(false)}
        />
      )}

      <Toast message={toastMsg} />
    </>
  );
}
