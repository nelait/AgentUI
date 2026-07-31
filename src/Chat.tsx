import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError, streamMessage } from './api';
import type { Agent, Me, Message, Session } from './types';

interface StreamState {
  thinking: string | null;
  tools: { name: string; status: string }[];
  text: string;
  dlp: string[];
}

export function Chat({ me }: { me: Me }) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [stream, setStream] = useState<StreamState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    const [a, s] = await Promise.all([
      api.get<Agent[]>('/agents'),
      api.get<Session[]>('/sessions'),
    ]);
    setAgents(a);
    setSessions(s);
  }, []);

  useEffect(() => {
    refresh().catch((e) => setError(String(e.message)));
  }, [refresh]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, stream]);

  // Stateful session hydration: reopening a session replays its full history
  // from the gateway.
  const openSession = useCallback(async (id: string) => {
    setError(null);
    setActiveId(id);
    const full = await api.get<Session & { messages: Message[] }>(`/sessions/${id}`);
    setMessages(full.messages);
  }, []);

  const startSession = useCallback(
    async (agent: Agent) => {
      setError(null);
      try {
        const session = await api.post<Session>('/sessions', { agentId: agent.id });
        await refresh();
        await openSession(session.id);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : String(e));
      }
    },
    [openSession, refresh]
  );

  const send = useCallback(async () => {
    const content = input.trim();
    if (!content || !activeId || stream) return;
    setInput('');
    setError(null);
    setStream({ thinking: null, tools: [], text: '', dlp: [] });
    try {
      await streamMessage(activeId, content, (e) => {
        setStream((prev) => {
          if (!prev) return prev;
          switch (e.event) {
            case 'accepted':
              return prev;
            case 'thinking':
              return { ...prev, thinking: e.data.text };
            case 'tool': {
              const tools = [...prev.tools.filter((t) => t.name !== e.data.name)];
              tools.push({ name: e.data.name, status: e.data.status });
              return { ...prev, tools };
            }
            case 'token':
              return { ...prev, thinking: null, text: prev.text + e.data.text };
            case 'dlp':
              return { ...prev, dlp: [...prev.dlp, `${e.data.direction} ${e.data.action}`] };
            case 'error':
              setError(e.data.message);
              return prev;
            default:
              return prev;
          }
        });
      });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setStream(null);
      if (activeId) {
        const full = await api.get<Session & { messages: Message[] }>(`/sessions/${activeId}`);
        setMessages(full.messages);
        api.get<Session[]>('/sessions').then(setSessions);
      }
    }
  }, [activeId, input, stream]);

  const activeSession = sessions.find((s) => s.id === activeId);
  const activeAgent = agents.find((a) => a.id === activeSession?.agentId);

  return (
    <div className="chat-layout">
      <aside className="sidebar">
        <button className="btn btn-primary full-width" onClick={() => setActiveId(null)}>
          + New session
        </button>
        <h3>Sessions</h3>
        {sessions.length === 0 && <p className="muted">No sessions yet.</p>}
        <ul className="session-list">
          {sessions.map((s) => (
            <li key={s.id}>
              <button
                className={`session-item ${s.id === activeId ? 'active' : ''}`}
                onClick={() => openSession(s.id).catch((e) => setError(String(e.message)))}
              >
                <span className="session-title">{s.title}</span>
                <span className="session-agent">
                  {agents.find((a) => a.id === s.agentId)?.name ?? s.agentId}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <main className="chat-main">
        {error && <div className="banner banner-error">{error}</div>}

        {!activeId ? (
          <div className="catalog">
            <h2>Agent catalog</h2>
            <p className="muted">
              One portal, every agent. Pick an agent to start a governed session.
            </p>
            <div className="agent-grid">
              {agents
                .filter((a) => a.enabled)
                .map((a) => (
                  <button key={a.id} className="agent-card" onClick={() => startSession(a)}>
                    <div className="agent-card-head">
                      <h3>{a.name}</h3>
                      <span className={`chip chip-type chip-type-${a.type}`}>{a.type}</span>
                    </div>
                    <p>{a.description}</p>
                    <div className="scopes">
                      {a.type === 'rest' || a.type === 'a2a' ? (
                        <span className="chip">external · tools owned by peer</span>
                      ) : (
                        a.toolScopes.map((s) => (
                          <span key={s} className="chip">{s}</span>
                        ))
                      )}
                    </div>
                  </button>
                ))}
            </div>
          </div>
        ) : (
          <>
            <header className="chat-header">
              <div>
                <strong>{activeAgent?.name ?? 'Agent'}</strong>
                <span className="muted"> · {activeSession?.title}</span>
              </div>
            </header>
            <div className="messages">
              {messages.map((m) => (
                <div key={m.id} className={`msg msg-${m.role}`}>
                  <div className="msg-body">{m.content}</div>
                  {m.dlpActions.length > 0 && (
                    <div className="msg-meta">
                      {m.dlpActions.map((a) => (
                        <span key={a} className="chip chip-dlp">DLP {a}</span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {stream && (
                <div className="msg msg-assistant">
                  {stream.thinking && <div className="thinking">💭 {stream.thinking}</div>}
                  {stream.tools.length > 0 && (
                    <div className="msg-meta">
                      {stream.tools.map((t) => (
                        <span
                          key={t.name}
                          className={`chip ${t.status === 'denied' ? 'chip-denied' : ''}`}
                        >
                          🔧 {t.name} · {t.status}
                        </span>
                      ))}
                    </div>
                  )}
                  {stream.dlp.length > 0 && (
                    <div className="msg-meta">
                      {stream.dlp.map((d, i) => (
                        <span key={i} className="chip chip-dlp">DLP {d}</span>
                      ))}
                    </div>
                  )}
                  {stream.text && <div className="msg-body">{stream.text}▌</div>}
                </div>
              )}
              <div ref={bottomRef} />
            </div>
            <div className="composer">
              <textarea
                value={input}
                placeholder={`Message ${activeAgent?.name ?? 'the agent'}…`}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                rows={2}
              />
              <button className="btn btn-primary" onClick={send} disabled={!!stream || !input.trim()}>
                Send
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
