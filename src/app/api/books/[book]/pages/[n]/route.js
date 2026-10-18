import fs from 'node:fs/promises';
import { getBook, pageFile } from '@server/books.js';

// Скан страницы книги. Файлы не меняются — кешируем надолго (и в браузере, и в Cloudflare)
export async function GET(request, { params }) {
  const { book: slug, n } = await params;
  const book = getBook(slug);
  const scan = Number(n);
  if (!book || !Number.isInteger(scan) || scan < 1 || scan > book.pages) {
    return Response.json({ error: 'not found' }, { status: 404 });
  }
  try {
    const data = await fs.readFile(pageFile(book, scan));
    return new Response(data, {
      headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'public, max-age=31536000, immutable' },
    });
  } catch {
    return Response.json({ error: 'Скан страницы не найден' }, { status: 404 });
  }
}
