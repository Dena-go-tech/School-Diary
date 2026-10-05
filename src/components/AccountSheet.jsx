import { useState } from 'react';
import Modal from './Modal.jsx';
import { request } from '../lib/useDiary.js';

export const ROLE_NAMES = { admin: 'Администратор', student: 'Ученик' };

export default function AccountSheet({ me, toast, onUsers, onLogout, onClose }) {
  const [changing, setChanging] = useState(false);
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function changePassword(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await request('POST', '/auth/password', { current, password });
      toast('Пароль изменён. На других устройствах нужно войти заново');
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Modal title={me.name} subtitle={`${ROLE_NAMES[me.role]} · логин ${me.username}`} onClose={onClose}>
      <div className="menu-list">
        {me.role === 'admin' && (
          <button className="subject-row" onClick={onUsers}>
            <span>👥</span><span className="grow">Пользователи</span><span className="chev">›</span>
          </button>
        )}
        <button className="subject-row" onClick={() => setChanging((v) => !v)}>
          <span>🔑</span><span className="grow">Сменить пароль</span><span className="chev">{changing ? '⌄' : '›'}</span>
        </button>
      </div>

      {changing && (
        <form className="stack" onSubmit={changePassword}>
          <input type="password" placeholder="Текущий пароль" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
          <input type="password" placeholder="Новый пароль (минимум 6 символов)" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          {error && <div className="error">{error}</div>}
          <button className="btn primary" disabled={busy || !current || password.length < 6}>Сохранить пароль</button>
        </form>
      )}

      <button className="btn danger block" onClick={onLogout}>Выйти</button>
    </Modal>
  );
}
