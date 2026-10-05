import { useEffect, useState } from 'react';
import Modal from './Modal.jsx';
import { ROLE_NAMES } from './AccountSheet.jsx';
import { request } from '../lib/useDiary.js';

// Список пользователей (только для администратора)
export default function UsersSheet({ me, toast, onClose }) {
  const [users, setUsers] = useState(null);
  const [editing, setEditing] = useState(null); // { user } | { user: null } — новый

  const load = () => request('GET', '/users').then(setUsers, (e) => toast(e.message));
  useEffect(() => {
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Modal title="Пользователи" subtitle="Ученики видят расписание и ДЗ и могут предлагать ДЗ" onClose={onClose}>
      {!users ? (
        <div className="muted">Загрузка…</div>
      ) : (
        <div className="subject-list">
          {users.map((u) => (
            <button key={u.id} className="subject-row" onClick={() => setEditing({ user: u })}>
              <span className="avatar">{u.name.slice(0, 1).toUpperCase()}</span>
              <span className="grow">
                {u.name}{u.id === me.id && <span className="muted"> (вы)</span>}
                <span className="muted small block-line">{u.username} · {ROLE_NAMES[u.role]}</span>
              </span>
              <span className="chev">›</span>
            </button>
          ))}
        </div>
      )}
      <button className="btn block" onClick={() => setEditing({ user: null })}>＋ Добавить ученика</button>

      {editing && (
        <UserSheet
          user={editing.user}
          me={me}
          toast={toast}
          onDone={() => { setEditing(null); load(); }}
          onClose={() => setEditing(null)}
        />
      )}
    </Modal>
  );
}

function UserSheet({ user, me, toast, onDone, onClose }) {
  const isNew = !user;
  const [name, setName] = useState(user?.name || '');
  const [username, setUsername] = useState(user?.username || '');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState(user?.role || 'student');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setError(null);
    setBusy(true);
    try {
      if (isNew) {
        await request('POST', '/users', { name, username, password, role });
        toast(`Пользователь создан. Логин: ${username}`);
      } else {
        const patch = { name, role };
        if (password) patch.password = password;
        await request('PATCH', `/users/${user.id}`, patch);
        toast(password ? 'Сохранено. Новый пароль действует сразу' : 'Сохранено');
      }
      onDone();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(`Удалить пользователя «${user.name}»? Его запросы на ДЗ останутся без автора.`)) return;
    try {
      await request('DELETE', `/users/${user.id}`);
      toast('Пользователь удалён');
      onDone();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <Modal
      title={isNew ? 'Новый пользователь' : user.name}
      onClose={onClose}
      footer={
        <>
          {!isNew && user.id !== me.id && <button className="btn danger" onClick={remove} disabled={busy}>Удалить</button>}
          <button className="btn primary grow" onClick={save} disabled={busy}>{isNew ? 'Создать' : 'Сохранить'}</button>
        </>
      }
    >
      <h3>Имя</h3>
      <input value={name} maxLength={60} placeholder="Например: Иван Петров" onChange={(e) => setName(e.target.value)} />

      <h3>Логин</h3>
      {isNew ? (
        <input
          value={username}
          maxLength={32}
          placeholder="латиница, цифры, . _ -"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          onChange={(e) => setUsername(e.target.value)}
        />
      ) : (
        <div className="muted">{user.username}</div>
      )}

      <h3>{isNew ? 'Пароль' : 'Новый пароль'}</h3>
      <input
        type="text"
        value={password}
        placeholder={isNew ? 'минимум 6 символов' : 'оставьте пустым, чтобы не менять'}
        autoComplete="new-password"
        autoCapitalize="none"
        onChange={(e) => setPassword(e.target.value)}
      />

      <h3>Роль</h3>
      <div className="segmented two">
        {['student', 'admin'].map((r) => (
          <button key={r} className={role === r ? 'active' : ''} onClick={() => setRole(r)} type="button">{ROLE_NAMES[r]}</button>
        ))}
      </div>
      {role === 'admin' && <div className="muted small hint-line">Администратор может менять расписание, ДЗ и пользователей</div>}

      {error && <div className="error">{error}</div>}
    </Modal>
  );
}
