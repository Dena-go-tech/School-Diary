import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createDiary } from './lib/diary.js';
import { addDays, nowHM, todayStr } from './lib/dates.js';
import { useDiary } from './lib/useDiary.js';
import AccountSheet from './components/AccountSheet.jsx';
import DayView from './components/DayView.jsx';
import LessonSheet from './components/LessonSheet.jsx';
import LoginScreen from './components/LoginScreen.jsx';
import RequestsSheet from './components/RequestsSheet.jsx';
import ScheduleEditor from './components/ScheduleEditor.jsx';
import UsersSheet from './components/UsersSheet.jsx';
import Toast, { useToast } from './components/Toast.jsx';

export default function App() {
  const [toastMsg, toast] = useToast();
  const { state, loadError, reload, login, logout, actions } = useDiary(toast);
  const [today, setToday] = useState(todayStr);
  const todayRef = useRef(today);
  const [now, setNow] = useState(nowHM);
  const [viewDate, setViewDate] = useState(todayStr);
  // Открытое окно: { type: 'lesson', date, idx } | { type: 'schedule' | 'requests' | 'account' | 'users' | 'login' }
  const [sheet, setSheet] = useState(null);
  const close = useCallback(() => setSheet(null), []);

  const diary = useMemo(() => (state ? createDiary(state) : null), [state]);
  // Без входа — посетитель-гость с правами ученика (профиль на сервере появится при первом действии)
  const me = useMemo(() => state?.me || (state ? { id: null, name: 'Гость', role: 'student', isGuest: true } : null), [state]);
  const isAdmin = me?.role === 'admin';

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

  // Сменился пользователь (вход, выход, истекла сессия) — закрываем окна, доступные не всем
  const meId = state?.me?.id ?? null;
  useEffect(() => {
    setSheet((s) => (s?.type === 'login' || s?.type === 'lesson' ? s : null));
  }, [meId]);

  const shiftDay = useCallback((n) => setViewDate((d) => addDays(d, n)), []);

  useEffect(() => {
    const onKey = (e) => {
      if (sheet || e.target.matches('input, textarea')) return;
      if (e.key === 'ArrowLeft') shiftDay(-1);
      if (e.key === 'ArrowRight') shiftDay(1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [sheet, shiftDay]);

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
        me={me}
        diary={diary}
        hasSchedule={state.versions.length > 0}
        viewDate={viewDate}
        today={today}
        now={now}
        onSelectDate={setViewDate}
        onShift={shiftDay}
        onOpenLesson={(idx) => setSheet({ type: 'lesson', date: viewDate, idx })}
        onOpenSchedule={() => setSheet({ type: 'schedule' })}
        onOpenRequests={() => setSheet({ type: 'requests' })}
        onOpenAccount={() => setSheet({ type: me.isGuest ? 'login' : 'account' })}
      />

      {sheet?.type === 'lesson' && (
        <LessonSheet me={me} diary={diary} date={sheet.date} idx={sheet.idx} actions={actions} toast={toast} onClose={close} />
      )}

      {sheet?.type === 'schedule' && isAdmin && (
        <ScheduleEditor state={state} diary={diary} actions={actions} toast={toast} onClose={close} />
      )}

      {sheet?.type === 'requests' && isAdmin && (
        <RequestsSheet diary={diary} actions={actions} toast={toast} onClose={close} />
      )}

      {sheet?.type === 'account' && (
        <AccountSheet me={me} toast={toast} onUsers={() => setSheet({ type: 'users' })} onLogout={logout} onClose={close} />
      )}

      {sheet?.type === 'users' && isAdmin && <UsersSheet me={me} toast={toast} onClose={close} />}

      {sheet?.type === 'login' && (
        <LoginScreen
          onLogin={async (u, p) => {
            await login(u, p);
            close();
          }}
          onClose={close}
        />
      )}

      <Toast message={toastMsg} />
    </>
  );
}
