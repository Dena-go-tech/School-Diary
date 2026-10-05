import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { normalizeState, withVersion } from './diary.js';

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

let onUnauthorized = null; // сессия истекла — перечитываем данные как посетитель без входа

export async function request(method, url, body) {
  const isFile = body instanceof Blob;
  const r = await fetch('/api' + url, {
    method,
    headers: body ? { 'Content-Type': isFile ? body.type : 'application/json' } : undefined,
    body: body ? (isFile ? body : JSON.stringify(body)) : undefined,
    cache: 'no-store',
  });
  if (!r.ok) {
    const message = (await r.json().catch(() => null))?.error || r.statusText;
    if (r.status === 401 && !url.startsWith('/auth/')) onUnauthorized?.();
    throw new ApiError(r.status, message);
  }
  return r.status === 204 ? null : r.json();
}

const mapItem = (list, id, patch) => list.map((x) => (x.id === id ? { ...x, ...patch } : x));
const mapHomework = (st, id, fn) => ({ ...st, homework: st.homework.map((h) => (h.id === id ? fn(h) : h)) });

export const photoUrl = (id) => `/api/photos/${id}`;

// Состояние дневника с сервера и действия над ним.
// Изменения сразу применяются в интерфейсе, а при ошибке сервера данные перезагружаются.
// state.me === null — посетитель без входа: он видит расписание и ДЗ, а его первое действие
// (запрос на ДЗ, отметка) создаёт на сервере гостевой профиль.
export function useDiary(onError) {
  const [state, setState] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const reload = useCallback(async () => {
    try {
      setState(normalizeState(await request('GET', '/state')));
      setLoadError(null);
    } catch (e) {
      setLoadError(e.message);
    }
  }, []);

  onUnauthorized = () => {
    onError?.('Сессия закончилась — войдите снова');
    reload();
  };

  useEffect(() => {
    reload();
  }, [reload]);

  const login = useCallback(async (username, password) => {
    await request('POST', '/auth/login', { username, password });
    await reload();
  }, [reload]);

  const logout = useCallback(async () => {
    await request('POST', '/auth/logout').catch(() => {});
    await reload();
  }, [reload]);

  const actions = useMemo(() => {
    const fail = (prefix) => (e) => {
      if (e.status !== 401) onError?.(`${prefix}: ${e.message}`);
    };

    // Возвращает промис: true — сервер сохранил, false — ошибка (данные перезагружены)
    const run = (optimistic, method, url, body) => {
      const anonymous = !stateRef.current?.me;
      setState((st) => optimistic(st));
      return request(method, url, body).then(
        async () => {
          if (anonymous) await reload(); // сервер создал гостевой профиль — подтягиваем его
          return true;
        },
        (e) => {
          fail('Не удалось сохранить')(e);
          if (e.status !== 401) reload();
          return false;
        },
      );
    };

    return {
      addSubject: (subject) =>
        run((st) => ({ ...st, subjects: [...st.subjects, subject] }), 'POST', '/subjects', subject),

      updateSubject: (id, patch) =>
        run((st) => ({ ...st, subjects: mapItem(st.subjects, id, patch) }), 'PATCH', `/subjects/${id}`, patch),

      saveVersion: (version) =>
        run((st) => withVersion(st, version), 'PUT', '/versions', version),

      // Админ задаёт ДЗ сразу, ученик — отправляет запрос. Статус решает сервер, здесь он — для мгновенного показа
      addHomework: (hw) =>
        run(
          (st) => ({
            ...st,
            homework: [...st.homework, {
              photos: [], done: false, createdBy: st.me?.id ?? null, authorName: st.me?.name ?? null,
              status: st.me?.role === 'admin' ? 'approved' : 'pending', ...hw,
            }],
          }),
          'POST', '/homework', hw,
        ),

      updateHomework: (id, patch) =>
        run((st) => ({ ...st, homework: mapItem(st.homework, id, patch) }), 'PATCH', `/homework/${id}`, patch),

      // Личная отметка «выполнено»
      setDone: (id, done) =>
        run((st) => ({ ...st, homework: mapItem(st.homework, id, { done }) }), 'PUT', `/homework/${id}/done`, { done }),

      deleteHomework: (id) =>
        run((st) => ({ ...st, homework: st.homework.filter((h) => h.id !== id) }), 'DELETE', `/homework/${id}`),

      // Принять запрос: сервер может слить его с уже заданным ДЗ, поэтому после ответа перечитываем данные
      approveHomework: async (id) => {
        try {
          await request('POST', `/homework/${id}/approve`);
          return true;
        } catch (e) {
          fail('Не удалось принять')(e);
          return false;
        } finally {
          await reload();
        }
      },

      // Фото появляется в состоянии только после успешной загрузки
      uploadPhoto: async (homeworkId, photoId, blob) => {
        try {
          await request('POST', `/homework/${homeworkId}/photos?id=${photoId}`, blob);
        } catch (e) {
          fail('Не удалось загрузить фото')(e);
          return false;
        }
        setState((st) => mapHomework(st, homeworkId, (h) => ({ ...h, photos: [...h.photos, photoId] })));
        return true;
      },

      reorderPhotos: (homeworkId, ids) =>
        run((st) => mapHomework(st, homeworkId, (h) => ({ ...h, photos: ids })), 'PUT', `/homework/${homeworkId}/photos/order`, { ids }),

      deletePhoto: (homeworkId, photoId) =>
        run(
          (st) => mapHomework(st, homeworkId, (h) => ({ ...h, photos: h.photos.filter((p) => p !== photoId) })),
          'DELETE',
          `/photos/${photoId}`,
        ),
    };
  }, [onError, reload]);

  return { state, loadError, reload, login, logout, actions };
}
