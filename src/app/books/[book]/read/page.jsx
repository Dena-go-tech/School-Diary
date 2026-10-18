import { getBook, getSection, listBooks, textItems } from '@server/books.js';
import Reader from '../../../../components/books/Reader.jsx';

export const dynamicParams = false;
export const generateStaticParams = () => listBooks().map((b) => ({ book: b.slug }));

export async function generateMetadata({ params }) {
  const book = getBook((await params).book);
  return { title: `${book.subject} ${book.grade} — читать` };
}

export default async function ReadPage({ params }) {
  const book = getBook((await params).book);
  // Страницы пунктов с текстовой версией — на них читалка предложит открыть текст
  const texts = textItems(book).map((i) => ({ text: i.text, n: i.n, from: i.page, to: getSection(book, i.text).lastPage }));
  return (
    <Reader
      slug={book.slug}
      title={`${book.subject} ${book.grade}`}
      pages={book.pages}
      offset={book.pageOffset}
      texts={texts}
    />
  );
}
