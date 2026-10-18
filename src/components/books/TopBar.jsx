import Link from 'next/link';

// Шапка раздела книг: «назад» + заголовок (+ необязательная кнопка справа)
export default function TopBar({ back, backLabel, title, subtitle, children }) {
  return (
    <header className="bk-topbar">
      <Link className="icon-btn" href={back} aria-label={backLabel}>‹</Link>
      <div className="bk-topbar-title">
        <div className="bk-title">{title}</div>
        {subtitle && <div className="bk-subtitle">{subtitle}</div>}
      </div>
      {children || <span className="icon-spacer" />}
    </header>
  );
}
