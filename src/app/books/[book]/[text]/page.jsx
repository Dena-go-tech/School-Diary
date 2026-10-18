import 'katex/dist/katex.min.css';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getBook, getSection, listBooks, textItems } from '@server/books.js';
import MathText from '../../../../components/books/MathText.jsx';
import TopBar from '../../../../components/books/TopBar.jsx';

export const dynamicParams = false;
export const generateStaticParams = () =>
  listBooks().flatMap((b) => textItems(b).map((i) => ({ book: b.slug, text: i.text })));

export async function generateMetadata({ params }) {
  const { book: slug, text } = await params;
  const item = getBook(slug)?.items.find((i) => i.text === text);
  return { title: item ? `${item.n}. ${item.title} — Книги` : 'Книги' };
}

export default async function SectionPage({ params }) {
  const { book: slug, text } = await params;
  const book = getBook(slug);
  const section = book && getSection(book, text);
  if (!section) notFound();
  const { item, prev, next, lastPage, blocks } = section;
  const read = `/books/${book.slug}/read`;

  return (
    <>
      <TopBar back={`/books/${book.slug}`} backLabel="Оглавление" title={`${book.subject} ${book.grade}`} subtitle={item.section?.title} />
      <main className="bk-main bk-article">
        <div className="bk-kicker">Глава {item.chapter.chapter} · {item.chapter.title}</div>
        <h1 className="bk-h1">{item.n}. {item.title}</h1>
        <Link className="bk-scan-link" href={`${read}#p${item.page}`}>
          📄 Скан учебника: с. {item.page}{lastPage > item.page && `–${lastPage}`}
        </Link>

        {blocks.map((b, i) => <Block key={i} block={b} />)}

        <nav className="bk-pager">
          {prev ? <ItemLink book={book} item={prev} dir="prev" /> : <span />}
          {next ? <ItemLink book={book} item={next} dir="next" /> : <span />}
        </nav>
      </main>
    </>
  );
}

function Block({ block: b }) {
  switch (b.type) {
    case 'example':
      return (
        <section className="bk-example">
          <div className="bk-label">{b.title}</div>
          <MathText>{b.body}</MathText>
        </section>
      );
    case 'rule':
      return <div className="bk-rule"><MathText>{b.body}</MathText></div>;
    case 'proof':
      return (
        <details className="bk-proof">
          <summary>Доказательство</summary>
          <MathText>{b.body}</MathText>
        </details>
      );
    case 'task':
      return (
        <section className="bk-task" id={`n${b.title}`}>
          <div className="bk-task-n">{b.title}.</div>
          <div className="bk-task-body">
            <MathText>{b.body}</MathText>
            {b.answer && (
              <details className="bk-answer">
                <summary>Ответ</summary>
                <MathText>{b.answer}</MathText>
              </details>
            )}
          </div>
        </section>
      );
    default:
      return <MathText>{b.body}</MathText>;
  }
}

// Соседний пункт: если у него есть текст — на текст, иначе — на скан страницы
function ItemLink({ book, item, dir }) {
  const href = item.text ? `/books/${book.slug}/${item.text}`
    : item.page ? `/books/${book.slug}/read#p${item.page}` : `/books/${book.slug}`;
  return (
    <Link className={`bk-pager-link ${dir}`} href={href}>
      <span className="muted small">{dir === 'prev' ? '‹ Назад' : 'Дальше ›'}{!item.text && ' · скан'}</span>
      <span>{item.n ? `${item.n}. ` : ''}{item.title}</span>
    </Link>
  );
}
