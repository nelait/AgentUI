import { useCallback, useEffect, useState } from 'react';
import { Admin } from './Admin';
import { api, getUser, setUser } from './api';
import { Chat } from './Chat';
import type { LoginOption, Me } from './types';

export function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [tab, setTab] = useState<'chat' | 'admin'>('chat');
  const [userId, setUserId] = useState(getUser());
  const [logins, setLogins] = useState<LoginOption[]>([]);

  const loadLogins = useCallback(() => {
    api.get<LoginOption[]>('/login-options').then(setLogins).catch(() => {});
  }, []);

  useEffect(loadLogins, [loadLogins]);

  useEffect(() => {
    setUser(userId);
    setTab('chat');
    api.get<Me>('/me').then(setMe).catch(() => setMe(null));
  }, [userId]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">◈</span> Aisure
          <span className="brand-sub">Unified AI Portal</span>
        </div>
        <nav className="tabs">
          <button className={`tab ${tab === 'chat' ? 'active' : ''}`} onClick={() => setTab('chat')}>
            Chat
          </button>
          {me?.role === 'admin' && (
            <button className={`tab ${tab === 'admin' ? 'active' : ''}`} onClick={() => setTab('admin')}>
              Admin Console
            </button>
          )}
        </nav>
        <div className="identity">
          <select
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            onFocus={loadLogins}
            aria-label="Acting user"
          >
            {logins.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
            {logins.length === 0 && <option value={userId}>{userId}</option>}
          </select>
        </div>
      </header>
      {/* key forces a clean remount when identity changes so no stale data leaks across users */}
      {me && (tab === 'chat' ? <Chat key={userId} me={me} /> : <Admin key={userId} />)}
      {!me && <div className="banner banner-error">Gateway unreachable — is it running on port 4000?</div>}
    </div>
  );
}
