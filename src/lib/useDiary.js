import { useCallback, useEffect, useMemo, useState } from 'react';
import { normalizeState, withVersion } from './diary.js';

async function request(method, url, body) {
  const isFile = body instanceof Blob;
  const r = await fetch('/api' + url, {
    method,
    headers: body ? { 'Content-Type': isFile ? body.type : 'application/json' } : undefined,
    body: body ? (isFile ? body : JSON.stringify(body)) : undefined,
    cache: 'no-store',
  });
  if (!r.ok) throw new Error((await r.json().catch(() => null))?.error || r.statusText);
  return r.status === 204 ? null : r.json();
}

const mapItem = (list, id, patch) => list.map((x) => (x.id === id ? { ...x, ...patch } : x));
const mapHomework = (st, id, fn) => ({ ...st, homework: st.homework.map((h) => (h.id === id ? fn(h) : h)) });

export const photoUrl = (id) => `/api/photos/${id}`;

// Состояние дневника с сервера и действия над ним.
// Изменения сразу применяются в интерфейсе, а при ошибке сервера данные перезагружаются.
export function useDiary(onError) {
  const [state, setState] = useState(null);
  const [loadError, setLoadError] = useState(null);

  const reload = useCallback(async () => {
    try {
      setState(normalizeState(await request('GET', '/state')));
      setLoadError(null);
    } catch (e) {
      setLoadError(e.message);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const actions = useMemo(() => {
    // Возвращает промис: true — сервер сохранил, false — ошибка (данные перезагружены)
    const run = (optimistic, method, url, body) => {
      setState((st) => optimistic(st));
      return request(method, url, body).then(
        () => true,
        (e) => {
          onError?.(`Не удалось сохранить: ${e.message}`);
          reload();
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

      addHomework: (hw) =>
        run((st) => ({ ...st, homework: [...st.homework, hw] }), 'POST', '/homework', hw),

      updateHomework: (id, patch) =>
        run((st) => ({ ...st, homework: mapItem(st.homework, id, patch) }), 'PATCH', `/homework/${id}`, patch),

      deleteHomework: (id) =>
        run((st) => ({ ...st, homework: st.homework.filter((h) => h.id !== id) }), 'DELETE', `/homework/${id}`),

      // Фото появляется в состоянии только после успешной загрузки
      uploadPhoto: async (homeworkId, photoId, blob) => {
        try {
          await request('POST', `/homework/${homeworkId}/photos?id=${photoId}`, blob);
        } catch (e) {
          onError?.(`Не удалось загрузить фото: ${e.message}`);
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

  return { state, loadError, reload, actions };
}
