import Link from 'next/link';
import { listBooks } from '@server/books.js';
import TopBar from '../../components/books/TopBar.jsx';

export const metadata = { title: 'Книги — Дневник' };

export default function BooksPage() {
  const books = listBooks();
  return (
    <>
      <TopBar back="/" backLabel="К дневнику" title="Книги" />
      <main className="bk-main">
        <div className="bk-shelf">
          {books.map((b) => (
            <Link key={b.slug} href={`/books/${b.slug}`} className="bk-card">
              <img className="bk-cover" src={`/api/books/${b.slug}/pages/1`} alt="" width={120} height={184} />
              <div className="bk-card-body">
                <div className="bk-card-subject">{b.subject} · {b.grade}</div>
                <div className="bk-card-title">{b.title}</div>
                <div className="muted small">{b.authors}</div>
              </div>
            </Link>
          ))}
        </div>
      </main>
    </>
  );
}
