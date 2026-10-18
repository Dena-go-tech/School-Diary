import '../styles.css';

export const metadata = {
  title: 'Дневник',
  manifest: '/manifest.webmanifest',
  icons: { icon: { url: '/icon.svg', type: 'image/svg+xml' } },
  appleWebApp: { capable: true, title: 'Дневник', statusBarStyle: 'default' },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f2f4f8' },
    { media: '(prefers-color-scheme: dark)', color: '#0f1218' },
  ],
};

export default function RootLayout({ children }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
