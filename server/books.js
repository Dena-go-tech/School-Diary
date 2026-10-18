/* Книги
 *  content/books/<slug>/book.json — описание и оглавление (лежит в репозитории):
 *    { title, grade, subject, authors, publisher, pages, pageOffset, toc }
 *    pages — число страниц скана; pageOffset — сдвиг: страница скана = печатная страница + pageOffset.
 *    toc — дерево: { title, page?, chapter?, n?, text?, children? }; page — печатная страница.
 *    text — имя файла <text>.md с текстовой версией пункта (формулы — LaTeX в $…$ и $$…$$).
 *  <BOOKS_DIR>/<slug>/pages/0001.webp … — сканы страниц (большие файлы — не в git, в Docker это том).
 */
import fs from 'node:fs';
import path from 'node:path';

const CONTENT_DIR = path.join(process.cwd(), 'content', 'books');
const PAGES_DIR = process.env.BOOKS_DIR || path.join(process.cwd(), 'books');
const SLUG_RE = /^[a-z0-9-]+$/;

export function listBooks() {
  return fs.readdirSync(CONTENT_DIR).filter((s) => SLUG_RE.test(s)).sort().map(getBook);
}

export function getBook(slug) {
  if (!SLUG_RE.test(slug)) return null;
  const file = path.join(CONTENT_DIR, slug, 'book.json');
  if (!fs.existsSync(file)) return null;
  const book = { slug, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
  // Пункты по порядку, с главой и параграфом — для навигации «назад/вперёд»
  book.items = [];
  const walk = (nodes, parents) => {
    for (const node of nodes) {
      if (node.children) walk(node.children, [...parents, node]);
      else book.items.push({ ...node, chapter: parents.find((p) => p.chapter), section: parents.find((p) => !p.chapter) });
    }
  };
  walk(book.toc, []);
  return book;
}

export const scanOf = (book, page) => page + book.pageOffset;
export const printedOf = (book, scan) => scan - book.pageOffset;

export const textItems = (book) => book.items.filter((i) => i.text);

// Текстовая версия пункта: сам пункт, соседи по оглавлению, диапазон страниц и блоки текста
export function getSection(book, text) {
  const idx = book.items.findIndex((i) => i.text === text);
  if (idx < 0) return null;
  const item = book.items[idx];
  const nextWithPage = book.items.slice(idx + 1).find((i) => i.page);
  const md = fs.readFileSync(path.join(CONTENT_DIR, book.slug, `${text}.md`), 'utf8');
  return {
    item,
    prev: book.items[idx - 1] || null,
    next: book.items[idx + 1] || null,
    lastPage: nextWithPage ? nextWithPage.page : item.page,
    blocks: parseBlocks(md),
  };
}

// Блоки «::: тип заголовок» … «:::» (example, rule, proof, task); между ними — обычный Markdown.
// В задаче строка «Ответ: …» и всё после неё — ответ (показывается по нажатию)
export function parseBlocks(md) {
  const blocks = [];
  let cur = { type: 'text', lines: [] };
  const push = () => {
    const body = cur.lines.join('\n').trim();
    if (body) {
      const [task, answer] = cur.type === 'task' ? body.split(/^Ответ:\s*/m) : [body];
      blocks.push({ type: cur.type, title: cur.title, body: task.trim(), answer: answer?.trim() });
    }
  };
  for (const line of md.split('\n')) {
    const open = cur.type === 'text' && line.match(/^:::\s*(\w+)\s*(.*)$/);
    if (open) {
      push();
      cur = { type: open[1], title: open[2].trim(), lines: [] };
    } else if (cur.type !== 'text' && line.trim() === ':::') {
      push();
      cur = { type: 'text', lines: [] };
    } else {
      cur.lines.push(line);
    }
  }
  push();
  return blocks;
}

export function pageFile(book, scan) {
  return path.join(PAGES_DIR, book.slug, 'pages', `${String(scan).padStart(4, '0')}.webp`);
}
