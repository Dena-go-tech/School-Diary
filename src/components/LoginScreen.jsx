import { useState } from 'react';

// Вход по логину и паролю — для администратора и учеников с аккаунтом. Смотреть сайт можно и без входа
export default function LoginScreen({ onLogin, onClose }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!username.trim() || !password) return setError('Введите логин и пароль');
    setBusy(true);
    setError(null);
    try {
      await onLogin(username.trim(), password);
    } catch (err) {
      setError(err.message || 'Не удалось войти');
      setBusy(false);
    }
  }

  return (
    <div className="login-screen overlay">
      <form className="login-card" onSubmit={submit}>
        <button type="button" className="icon-btn login-close" onClick={onClose} aria-label="Закрыть">✕</button>
        <img className="login-logo" src="/icon.svg" alt="" />
        <h1>Дневник</h1>
        <label>
          <span>Логин</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
          />
        </label>
        <label>
          <span>Пароль</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </label>
        {error && <div className="error">{error}</div>}
        <button className="btn primary block" disabled={busy}>{busy ? 'Вхожу…' : 'Войти'}</button>
        <div className="muted small login-hint">
          Входить не обязательно: смотреть расписание и предлагать ДЗ можно и так.
          Логин и пароль выдаёт администратор.
        </div>
      </form>
    </div>
  );
}
