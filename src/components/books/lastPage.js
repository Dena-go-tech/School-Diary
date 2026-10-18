// Последняя открытая страница книги — только в этом браузере (без входа и без сервера)
const key = (slug) => `book:${slug}:page`;

export function loadLastPage(slug) {
  try {
    return Number(localStorage.getItem(key(slug))) || null;
  } catch {
    return null;
  }
}

export function saveLastPage(slug, page) {
  try {
    localStorage.setItem(key(slug), String(page));
  } catch {
    /* приватный режим и т. п. — просто не запоминаем */
  }
}
