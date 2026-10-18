import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getBook, listBooks } from '@server/books.js';
import ContinueReading from '../../../components/books/ContinueReading.jsx';
import TopBar from '../../../components/books/TopBar.jsx';

export const dynamicParams = false;
export const generateStaticParams = () => listBooks().map((b) => ({ book: b.slug }));

export async function generateMetadata({ params }) {
  const book = getBook((await params).book);
  return { title: book ? `${book.subject} ${book.grade} — Книги` : 'Книги' };
}

export default async function BookPage({ params }) {
  const book = getBook((await params).book);
  if (!book) notFound();
  const read = `/books/${book.slug}/read`;

  return (
    <>
      <TopBar back="/books" backLabel="Все книги" title={book.subject} subtitle={book.grade} />
      <main className="bk-main">
        <section className="bk-hero">
          <img className="bk-cover" src={`/api/books/${book.slug}/pages/1`} alt="" width={120} height={184} />
          <div>
            <h1 className="bk-h1">{book.title}</h1>
            <div className="muted small">{book.authors}</div>
            <div className="muted small">«{book.publisher}»</div>
            <ContinueReading slug={book.slug} href={read} />
          </div>
        </section>

        <h2 className="section-head">Оглавление</h2>
        <nav className="bk-toc">
          {book.toc.map((node, i) => <TocNode key={i} node={node} book={book} read={read} />)}
        </nav>
      </main>
    </>
  );
}

function TocNode({ node, book, read }) {
  if (node.children) {
    return (
      <details className={node.chapter ? 'bk-toc-chapter' : 'bk-toc-section'} open={!node.chapter || undefined}>
        <summary>
          {node.chapter && <span className="bk-chapter-n">Глава {node.chapter}</span>}
          <span>{node.title}</span>
        </summary>
        {node.children.map((c, i) => <TocNode key={i} node={c} book={book} read={read} />)}
      </details>
    );
  }
  const label = <>{node.n && <span className="bk-toc-n">{node.n}.</span>} <span className="grow">{node.title}</span></>;
  return (
    <div className="bk-toc-item">
      {node.page ? (
        <Link href={`${read}#p${node.page}`} className="bk-toc-link">
          {label}
          <span className="bk-toc-page">{node.page}</span>
        </Link>
      ) : (
        <div className="bk-toc-link muted">{label}<span className="bk-toc-page">—</span></div>
      )}
      {node.text && <Link href={`/books/${book.slug}/${node.text}`} className="bk-text-chip">Текст</Link>}
    </div>
  );
}
