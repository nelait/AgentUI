import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from './api';
import { Reports } from './Reports';
import type { Agent, AgentType, DlpEvent, RoleDef, Span, ToolScope, TraceSummary } from './types';
import { UsersAccess } from './UsersAccess';

type Tab = 'agents' | 'users' | 'reports' | 'traces' | 'dlp';

const TAB_LABELS: Record<Tab, string> = {
  agents: 'Agent Registry',
  users: 'Users & Access',
  reports: 'Reports',
  traces: 'Traces',
  dlp: 'DLP Events',
};

export function Admin() {
  const [tab, setTab] = useState<Tab>('agents');
  return (
    <div className="admin">
      <nav className="subtabs">
        {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
          <button key={t} className={`subtab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {TAB_LABELS[t]}
          </button>
        ))}
      </nav>
      {tab === 'agents' && <AgentsAdmin />}
      {tab === 'users' && <UsersAccess />}
      {tab === 'reports' && <Reports />}
      {tab === 'traces' && <TracesAdmin />}
      {tab === 'dlp' && <DlpAdmin />}
    </div>
  );
}

const TYPE_HELP: Record<AgentType, string> = {
  mock: 'Built-in offline runtime with gateway-governed tool scopes. Good for demos and testing.',
  rest: 'Plain HTTP agent: the gateway POSTs { input, systemPrompt, history } and expects { reply }.',
  a2a: 'Agent-to-Agent protocol peer. The gateway validates its agent card and delegates via message/send.',
  mcp: 'MCP server: its tools are discovered at registration, become EMA scopes, and every call is checked.',
  'mcp-llm': 'MCP + LLM reasoning: Gemini selects tools, maps arguments, and synthesizes natural responses.',
};

const emptyForm = {
  name: '',
  description: '',
  systemPrompt: '',
  type: 'mock' as AgentType,
  endpoint: '',
  authToken: '',
  authScheme: 'bearer' as 'bearer' | 'api-key',
  toolScopes: [] as string[],
  allowedRoles: [] as string[],
};

function AgentsAdmin() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [scopes, setScopes] = useState<ToolScope[]>([]);
  const [roles, setRoles] = useState<RoleDef[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const refresh = useCallback(async () => {
    const [a, s, r] = await Promise.all([
      api.get<Agent[]>('/agents'),
      api.get<ToolScope[]>('/scopes'),
      api.get<RoleDef[]>('/roles'),
    ]);
    setAgents(a);
    setScopes(s);
    setRoles(r);
  }, []);

  useEffect(() => {
    refresh().catch((e) => setError(String(e.message)));
  }, [refresh]);

  const toggle = async (agent: Agent) => {
    await api.patch(`/agents/${agent.id}`, { enabled: !agent.enabled });
    refresh();
  };

  const toggleAgentRole = async (agent: Agent, role: string) => {
    const allowedRoles = agent.allowedRoles.includes(role)
      ? agent.allowedRoles.filter((r) => r !== role)
      : [...agent.allowedRoles, role];
    await api.patch(`/agents/${agent.id}`, { allowedRoles });
    refresh();
  };

  const register = async () => {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const created = await api.post<Agent>('/agents', {
        name: form.name,
        description: form.description,
        systemPrompt: form.systemPrompt,
        type: form.type,
        connection: form.type === 'mock' ? {} : {
          endpoint: form.endpoint,
          authToken: form.authToken || undefined,
          authScheme: form.authToken ? form.authScheme : undefined,
        },
        toolScopes: form.toolScopes,
        allowedRoles: form.allowedRoles,
      });
      setForm(emptyForm);
      setNotice(
        created.type === 'mcp' || created.type === 'mcp-llm'
          ? `Registered ${created.name} — discovered MCP tools: ${created.toolScopes.join(', ')}${created.type === 'mcp-llm' ? ' (LLM-powered)' : ''}`
          : `Registered ${created.name} (${created.type})`
      );
      refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const needsEndpoint = form.type !== 'mock';

  return (
    <div>
      {error && <div className="banner banner-error">{error}</div>}
      {notice && <div className="banner banner-ok">{notice}</div>}
      <table className="table">
        <thead>
          <tr>
            <th>Agent</th><th>Type</th><th>Description</th><th>Tool scopes</th><th>Allowed roles</th><th>Status</th><th></th>
          </tr>
        </thead>
        <tbody>
          {agents.map((a) => (
            <tr key={a.id}>
              <td><strong>{a.name}</strong><br /><span className="muted">{a.id}</span></td>
              <td>
                <span className={`chip chip-type chip-type-${a.type}`}>{a.type}</span>
                {a.connection.endpoint && <><br /><span className="muted mono">{a.connection.endpoint}</span></>}
              </td>
              <td>{a.description}</td>
              <td>
                {a.type === 'rest' || a.type === 'a2a' ? (
                  <span className="muted">peer-owned</span>
                ) : (
                  a.toolScopes.map((s) => <span key={s} className="chip">{s}</span>)
                )}
              </td>
              <td>
                {roles.map((r) => (
                  <label key={r.name} className={`chip chip-select ${a.allowedRoles.includes(r.name) ? 'chip-on' : ''}`}>
                    <input
                      type="checkbox"
                      checked={a.allowedRoles.includes(r.name)}
                      onChange={() => toggleAgentRole(a, r.name)}
                    />
                    {r.name}
                  </label>
                ))}
                {a.allowedRoles.length === 0 && <><br /><span className="muted">all roles</span></>}
              </td>
              <td>
                <span className={`chip ${a.enabled ? 'chip-ok' : 'chip-denied'}`}>
                  {a.enabled ? 'enabled' : 'disabled'}
                </span>
              </td>
              <td>
                <button className="btn" onClick={() => toggle(a)}>
                  {a.enabled ? 'Disable' : 'Enable'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className="register-form">
        <h3>Register a new agent</h3>
        <p className="muted">
          Any protocol, one portal — no new dashboard is built for a new agent.
        </p>
        <div className="type-picker">
          {(Object.keys(TYPE_HELP) as AgentType[]).map((t) => (
            <button
              key={t}
              className={`type-option ${form.type === t ? 'active' : ''}`}
              onClick={() => setForm({ ...form, type: t })}
            >
              <span className={`chip chip-type chip-type-${t}`}>{t}</span>
              <span className="type-help">{TYPE_HELP[t]}</span>
            </button>
          ))}
        </div>
        <div className="form-row">
          <input
            placeholder="Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <input
            placeholder={form.type === 'a2a' ? 'Description (agent card can fill this)' : 'Description'}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </div>
        {needsEndpoint && (
          <div className="form-row">
            <input
              placeholder={
                form.type === 'rest'
                  ? 'Endpoint URL (e.g. http://localhost:7101/invoke)'
                  : form.type === 'a2a'
                    ? 'A2A base URL (e.g. http://localhost:7102)'
                    : 'MCP endpoint (e.g. https://your-server/mcp)'
              }
              value={form.endpoint}
              onChange={(e) => setForm({ ...form, endpoint: e.target.value })}
            />
            <input
              placeholder="Auth token (optional)"
              value={form.authToken}
              onChange={(e) => setForm({ ...form, authToken: e.target.value })}
            />
            <select
              value={form.authScheme}
              onChange={(e) => setForm({ ...form, authScheme: e.target.value as 'bearer' | 'api-key' })}
              aria-label="Auth scheme"
            >
              <option value="bearer">Bearer token</option>
              <option value="api-key">X-API-Key</option>
            </select>
          </div>
        )}
        {form.type === 'mock' && (
          <>
            <textarea
              placeholder="System prompt"
              value={form.systemPrompt}
              onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })}
              rows={2}
            />
            <div className="scope-picker">
              {scopes.map((s) => (
                <label key={s.name} className="chip chip-select">
                  <input
                    type="checkbox"
                    checked={form.toolScopes.includes(s.name)}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        toolScopes: e.target.checked
                          ? [...form.toolScopes, s.name]
                          : form.toolScopes.filter((x) => x !== s.name),
                      })
                    }
                  />
                  {s.name}
                  {s.sensitive ? ' 🔒' : ''}
                </label>
              ))}
            </div>
          </>
        )}
        {(form.type === 'mcp' || form.type === 'mcp-llm') && (
          <p className="muted">
            Tools are discovered from the server at registration and become EMA scopes.
            {form.type === 'mcp-llm' && ' Gemini LLM will intelligently select tools and synthesize natural answers.'}
          </p>
        )}
        <div className="scope-picker">
          <span className="muted">Restrict to roles (none = all): </span>
          {roles.map((r) => (
            <label key={r.name} className="chip chip-select">
              <input
                type="checkbox"
                checked={form.allowedRoles.includes(r.name)}
                onChange={(e) =>
                  setForm({
                    ...form,
                    allowedRoles: e.target.checked
                      ? [...form.allowedRoles, r.name]
                      : form.allowedRoles.filter((x) => x !== r.name),
                  })
                }
              />
              {r.name}
            </label>
          ))}
        </div>
        <button
          className="btn btn-primary"
          onClick={register}
          disabled={busy || !form.name || !form.description || (needsEndpoint && !form.endpoint)}
        >
          {busy ? 'Validating connection…' : 'Register agent'}
        </button>
      </section>
    </div>
  );
}

function TracesAdmin() {
  const [traces, setTraces] = useState<TraceSummary[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [spans, setSpans] = useState<Span[]>([]);

  useEffect(() => {
    api.get<TraceSummary[]>('/traces').then(setTraces).catch(() => {});
  }, []);

  const expand = async (traceId: string) => {
    if (open === traceId) return setOpen(null);
    setOpen(traceId);
    setSpans(await api.get<Span[]>(`/traces/${traceId}`));
  };

  const depth = (span: Span, all: Span[]): number => {
    let d = 0;
    let cur = span;
    while (cur.parentSpanId) {
      const parent = all.find((s) => s.spanId === cur.parentSpanId);
      if (!parent) break;
      d += 1;
      cur = parent;
    }
    return d;
  };

  const maxDuration = Math.max(...spans.map((s) => s.durationMs), 1);

  return (
    <div>
      {traces.length === 0 && <p className="muted">No traces yet — send a message in the Chat tab.</p>}
      {traces.map((t) => (
        <div key={t.traceId} className="trace-card">
          <button className="trace-head" onClick={() => expand(t.traceId)}>
            <span className={`chip ${t.status === 'ok' ? 'chip-ok' : 'chip-denied'}`}>{t.status}</span>
            <strong>{t.agentId}</strong>
            <span className="muted">{t.traceId}</span>
            <span>{t.durationMs} ms · {t.spanCount} spans</span>
            <span className="muted">{new Date(t.startedAt).toLocaleTimeString()}</span>
          </button>
          {open === t.traceId && (
            <div className="spans">
              {spans.map((s) => (
                <div key={s.spanId} className="span-row" style={{ paddingLeft: depth(s, spans) * 18 }}>
                  <div className="span-name">
                    <span className={`dot dot-${s.status}`} />
                    {s.name}
                  </div>
                  <div className="span-bar-track">
                    <div
                      className={`span-bar span-bar-${s.status}`}
                      style={{ width: `${Math.max((s.durationMs / maxDuration) * 100, 2)}%` }}
                    />
                  </div>
                  <div className="span-ms">{s.durationMs} ms</div>
                  <div className="span-attrs muted">
                    {Object.entries(s.attributes)
                      .map(([k, v]) => `${k}=${v}`)
                      .join('  ')}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function DlpAdmin() {
  const [events, setEvents] = useState<DlpEvent[]>([]);
  useEffect(() => {
    api.get<DlpEvent[]>('/dlp/events').then(setEvents).catch(() => {});
  }, []);
  return (
    <div>
      {events.length === 0 && <p className="muted">No DLP events. Try sending a message containing an SSN like 123-45-6789.</p>}
      {events.length > 0 && (
        <table className="table">
          <thead>
            <tr><th>Time</th><th>Direction</th><th>Detector</th><th>Action</th><th>Session</th><th>Redacted sample</th></tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id}>
                <td>{new Date(e.createdAt).toLocaleTimeString()}</td>
                <td>{e.direction}</td>
                <td><span className="chip">{e.detector}</span></td>
                <td>
                  <span className={`chip ${e.action === 'block' ? 'chip-denied' : 'chip-dlp'}`}>{e.action}</span>
                </td>
                <td className="muted">{e.sessionId}</td>
                <td className="muted">{e.sample}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
