'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { loadLastPage } from './lastPage.js';

export default function ContinueReading({ slug, href }) {
  const [page, setPage] = useState(null);
  useEffect(() => setPage(loadLastPage(slug)), [slug]);

  return (
    <Link className="btn primary bk-read-btn" href={page ? `${href}#p${page}` : href}>
      {page ? `Продолжить — с. ${page}` : 'Читать'}
    </Link>
  );
}
