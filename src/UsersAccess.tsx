import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from './api';
import type { RoleDef, ToolScope, UserRecord } from './types';

export function UsersAccess() {
  const [usersList, setUsersList] = useState<UserRecord[]>([]);
  const [rolesList, setRolesList] = useState<RoleDef[]>([]);
  const [scopesList, setScopesList] = useState<ToolScope[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [newUser, setNewUser] = useState({ name: '', role: 'member' });
  const [newRole, setNewRole] = useState({ name: '', description: '' });

  const refresh = useCallback(async () => {
    const [u, r, s] = await Promise.all([
      api.get<UserRecord[]>('/users'),
      api.get<RoleDef[]>('/roles'),
      api.get<ToolScope[]>('/scopes'),
    ]);
    setUsersList(u);
    setRolesList(r);
    setScopesList(s);
  }, []);

  useEffect(() => {
    refresh().catch((e) => setError(String(e.message)));
  }, [refresh]);

  const act = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    }
  };

  const toggleGrant = (role: RoleDef, scope: string) => {
    const grants = role.grants.includes(scope)
      ? role.grants.filter((g) => g !== scope)
      : [...role.grants, scope];
    act(() => api.patch(`/roles/${role.name}`, { grants }));
  };

  return (
    <div>
      {error && <div className="banner banner-error">{error}</div>}

      <section>
        <h3 className="section-title">Users</h3>
        <table className="table">
          <thead>
            <tr><th>User</th><th>Role</th><th>Status</th><th>Created</th><th></th></tr>
          </thead>
          <tbody>
            {usersList.map((u) => (
              <tr key={u.id}>
                <td><strong>{u.name}</strong><br /><span className="muted">{u.id}</span></td>
                <td>
                  <select
                    value={u.role}
                    onChange={(e) => act(() => api.patch(`/users/${u.id}`, { role: e.target.value }))}
                  >
                    {rolesList.map((r) => (
                      <option key={r.name} value={r.name}>{r.name}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <span className={`chip ${u.active ? 'chip-ok' : 'chip-denied'}`}>
                    {u.active ? 'active' : 'deactivated'}
                  </span>
                </td>
                <td className="muted">{new Date(u.createdAt).toLocaleDateString()}</td>
                <td>
                  <button className="btn" onClick={() => act(() => api.patch(`/users/${u.id}`, { active: !u.active }))}>
                    {u.active ? 'Deactivate' : 'Reactivate'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="form-row inline-form">
          <input
            placeholder="Full name"
            value={newUser.name}
            onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
          />
          <select value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}>
            {rolesList.map((r) => (
              <option key={r.name} value={r.name}>{r.name}</option>
            ))}
          </select>
          <button
            className="btn btn-primary"
            disabled={!newUser.name.trim()}
            onClick={() =>
              act(() => api.post('/users', newUser)).then(() => setNewUser({ name: '', role: 'member' }))
            }
          >
            Add user
          </button>
        </div>
      </section>

      <section>
        <h3 className="section-title">Access matrix — role → tool scope grants (EMA)</h3>
        <p className="muted">
          A tool call succeeds only when the scope is declared by the agent <em>and</em> granted to the
          user's role. Changes apply to the very next tool call.
        </p>
        <table className="table matrix">
          <thead>
            <tr>
              <th>Scope</th>
              {rolesList.map((r) => (
                <th key={r.name}>{r.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {scopesList.map((s) => (
              <tr key={s.name}>
                <td>
                  <span className="chip">{s.name}</span>
                  {s.sensitive && <span className="chip chip-dlp">sensitive</span>}
                  <br />
                  <span className="muted">{s.description}</span>
                </td>
                {rolesList.map((r) => {
                  const granted = r.grants.includes('*') || r.grants.includes(s.name);
                  const locked = r.grants.includes('*');
                  return (
                    <td key={r.name}>
                      <input
                        type="checkbox"
                        checked={granted}
                        disabled={locked}
                        title={locked ? `${r.name} has the * grant` : `Toggle ${s.name} for ${r.name}`}
                        onChange={() => toggleGrant(r, s.name)}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="form-row inline-form">
          <input
            placeholder="New role name (e.g. analyst)"
            value={newRole.name}
            onChange={(e) => setNewRole({ ...newRole, name: e.target.value })}
          />
          <input
            placeholder="Description"
            value={newRole.description}
            onChange={(e) => setNewRole({ ...newRole, description: e.target.value })}
          />
          <button
            className="btn btn-primary"
            disabled={!newRole.name.trim()}
            onClick={() =>
              act(() => api.post('/roles', { ...newRole, grants: [] })).then(() =>
                setNewRole({ name: '', description: '' })
              )
            }
          >
            Add role
          </button>
        </div>
      </section>
    </div>
  );
}
