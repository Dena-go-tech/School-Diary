/* Модель данных
 *  subjects: [{ id, name, color, deleted? }]
 *  versions: [{ effectiveFrom: 'YYYY-MM-DD', bells: [{start, end}], days: { 1..7: [subjectId|null] } }]
 *            — версии расписания, привязанные к дате. Для дня берётся последняя версия
 *              с effectiveFrom <= дата, поэтому прошлые недели не меняются.
 *  homework: [{ id, subjectId, fromDate, fromIdx, text, done, createdAt }]
 *            — ДЗ, заданное на уроке (fromDate, fromIdx). На какой урок оно попадает,
 *              вычисляется: следующий урок того же предмета после fromDate.
 */
import { addDays, todayStr, weekday } from './dates.js';

export const CUTOFF_HOUR = 8; // до 8:00 новое расписание действует с сегодняшнего дня
export const FIRST_DATE = '1970-01-01';
export const EDIT_DAYS = [1, 2, 3, 4, 5, 6];
const SEARCH_DAYS = 120;

export const DEFAULT_BELLS = [
  ['08:00', '08:45'], ['08:55', '09:40'], ['09:50', '10:35'], ['10:55', '11:40'],
  ['11:50', '12:35'], ['12:45', '13:30'], ['13:40', '14:25'], ['14:35', '15:20'],
].map(([start, end]) => ({ start, end }));

export const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export function normalizeState(s) {
  return {
    subjects: s?.subjects || [],
    versions: [...(s?.versions || [])].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom)),
    homework: (s?.homework || []).map((h) => ({ ...h, photos: h.photos || [] })),
  };
}

// Набор запросов к состоянию с кешем; создаётся заново при каждом изменении state
export function createDiary(state) {
  const nextCache = new Map();

  const subject = (id) => state.subjects.find((s) => s.id === id);

  function versionFor(date) {
    let found = null;
    for (const v of state.versions) if (v.effectiveFrom <= date) found = v;
    return found;
  }

  function lessonsFor(date) {
    const v = versionFor(date);
    if (!v) return [];
    return (v.days[weekday(date)] || []).map((subjectId, idx) => ({
      idx,
      subjectId,
      start: v.bells[idx]?.start || '',
      end: v.bells[idx]?.end || '',
    }));
  }

  // Следующий урок предмета строго после даты (в другой день)
  function nextLesson(subjectId, fromDate) {
    const key = subjectId + '|' + fromDate;
    if (nextCache.has(key)) return nextCache.get(key);
    let res = null;
    for (let i = 1; i <= SEARCH_DAYS; i++) {
      const d = addDays(fromDate, i);
      const l = lessonsFor(d).find((x) => x.subjectId === subjectId);
      if (l) {
        res = { date: d, idx: l.idx };
        break;
      }
    }
    nextCache.set(key, res);
    return res;
  }

  // ДЗ, которое нужно сделать к уроку (date, idx)
  function dueFor(date, idx, subjectId) {
    if (!subjectId) return [];
    const first = lessonsFor(date).find((l) => l.subjectId === subjectId);
    if (!first || first.idx !== idx) return []; // при сдвоенных уроках ДЗ показываем на первом
    return state.homework
      .filter((h) => h.subjectId === subjectId && h.fromDate < date)
      .filter((h) => nextLesson(h.subjectId, h.fromDate)?.date === date)
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  // ДЗ, заданное на уроке (date, idx)
  const givenAt = (date, idx, subjectId) =>
    state.homework.find((h) => h.fromDate === date && h.fromIdx === idx && h.subjectId === subjectId);

  const hasOpenHomework = (date) =>
    lessonsFor(date).some((l) => dueFor(date, l.idx, l.subjectId).some((h) => !h.done));

  return { subject, versionFor, lessonsFor, nextLesson, dueFor, givenAt, hasOpenHomework };
}

// С какой даты начнёт действовать расписание, сохранённое прямо сейчас
export function effectiveDateNow(state, now = new Date()) {
  if (!state.versions.length) return FIRST_DATE;
  const today = todayStr();
  return now.getHours() < CUTOFF_HOUR ? today : addDays(today, 1);
}

// Новая версия заменяет все версии, начинающиеся с той же даты или позже
export function withVersion(state, version) {
  const versions = state.versions.filter((v) => v.effectiveFrom < version.effectiveFrom);
  versions.push(version);
  versions.sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  return { ...state, versions };
}
