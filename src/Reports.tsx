import { useEffect, useState } from 'react';
import { api } from './api';
import type { ReportSummary } from './types';

// Categorical pair validated for the dark surface (#161b24) with the dataviz
// six-checks validator: lightness band, chroma, CVD separation, contrast all pass.
const SERIES = {
  user: { label: 'User messages', color: '#4f8cff' },
  assistant: { label: 'Agent replies', color: '#bd7f38' },
} as const;

export function Reports() {
  const [days, setDays] = useState(7);
  const [data, setData] = useState<ReportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<ReportSummary>(`/reports/summary?days=${days}`)
      .then(setData)
      .catch((e) => setError(String(e.message)));
  }, [days]);

  if (error) return <div className="banner banner-error">{error}</div>;
  if (!data) return <p className="muted">Loading report…</p>;

  const t = data.totals;

  return (
    <div className="reports">
      <div className="report-controls">
        <label className="muted">Window:</label>
        {[7, 14, 30].map((d) => (
          <button key={d} className={`btn ${days === d ? 'btn-primary' : ''}`} onClick={() => setDays(d)}>
            {d} days
          </button>
        ))}
      </div>

      <div className="stat-tiles">
        <StatTile label="Messages" value={t.messages} />
        <StatTile label="Sessions" value={t.sessions} />
        <StatTile label="Active users" value={`${t.activeUsers} / ${t.users}`} />
        <StatTile label="Agents" value={t.agents} />
        <StatTile label="Avg latency" value={`${t.avgLatencyMs} ms`} />
        <StatTile label="DLP events" value={t.dlpEvents} tone={t.dlpEvents > 0 ? 'warn' : undefined} />
        <StatTile label="EMA denials" value={t.emaDenials} tone={t.emaDenials > 0 ? 'warn' : undefined} />
      </div>

      <section className="report-card">
        <h3 className="section-title">Messages per day</h3>
        <div className="legend">
          {Object.values(SERIES).map((s) => (
            <span key={s.label} className="legend-item">
              <span className="legend-swatch" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
        <MessagesChart data={data.messagesByDay} />
        <details>
          <summary className="muted">View as table</summary>
          <table className="table">
            <thead>
              <tr><th>Date</th><th>User messages</th><th>Agent replies</th></tr>
            </thead>
            <tbody>
              {data.messagesByDay.map((d) => (
                <tr key={d.date}><td>{d.date}</td><td>{d.user}</td><td>{d.assistant}</td></tr>
              ))}
            </tbody>
          </table>
        </details>
      </section>

      <section className="report-card">
        <h3 className="section-title">Usage by agent</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Agent</th><th>Type</th><th>Sessions</th><th>Messages</th>
              <th>Avg latency</th><th>EMA denials</th><th>DLP events</th>
            </tr>
          </thead>
          <tbody>
            {data.perAgent.map((a) => (
              <tr key={a.agentId}>
                <td><strong>{a.name}</strong></td>
                <td><span className={`chip chip-type chip-type-${a.type}`}>{a.type}</span></td>
                <td>{a.sessions}</td>
                <td>{a.messages}</td>
                <td>{a.avgLatencyMs} ms</td>
                <td>{a.emaDenials > 0 ? <span className="chip chip-denied">{a.emaDenials}</span> : '0'}</td>
                <td>{a.dlpEvents > 0 ? <span className="chip chip-dlp">{a.dlpEvents}</span> : '0'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="report-split">
        <section className="report-card">
          <h3 className="section-title">DLP events by detector</h3>
          {data.dlpByDetector.length === 0 && <p className="muted">No DLP events in this window.</p>}
          {data.dlpByDetector.length > 0 && (
            <table className="table">
              <thead>
                <tr><th>Detector</th><th>Redactions</th><th>Blocks</th></tr>
              </thead>
              <tbody>
                {data.dlpByDetector.map((d) => (
                  <tr key={d.detector}>
                    <td><span className="chip">{d.detector}</span></td>
                    <td>{d.redact > 0 ? <span className="chip chip-dlp">⚠ {d.redact}</span> : '0'}</td>
                    <td>{d.block > 0 ? <span className="chip chip-denied">⛔ {d.block}</span> : '0'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="report-card">
          <h3 className="section-title">Most active users</h3>
          {data.topUsers.length === 0 && <p className="muted">No activity in this window.</p>}
          {data.topUsers.length > 0 && (
            <table className="table">
              <thead>
                <tr><th>User</th><th>Messages sent</th></tr>
              </thead>
              <tbody>
                {data.topUsers.map((u) => (
                  <tr key={u.userId}>
                    <td>{u.name}</td>
                    <td>{u.messages}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  );
}

function StatTile({ label, value, tone }: { label: string; value: number | string; tone?: 'warn' }) {
  return (
    <div className={`stat-tile ${tone ? `stat-${tone}` : ''}`}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

// Grouped bar chart: thin marks, 4px rounded value-ends, 2px gap between adjacent
// bars, recessive gridline, per-group hover tooltip. Text stays in text tokens.
function MessagesChart({ data }: { data: ReportSummary['messagesByDay'] }) {
  const [hover, setHover] = useState<number | null>(null);

  const W = 720;
  const H = 180;
  const PAD_BOTTOM = 22;
  const plotH = H - PAD_BOTTOM;
  const max = Math.max(...data.map((d) => Math.max(d.user, d.assistant)), 1);
  const groupW = W / data.length;
  const barW = Math.min(22, (groupW - 10) / 2 - 1);

  const bar = (x: number, value: number, color: string) => {
    const h = Math.round((value / max) * (plotH - 12));
    if (value === 0) return null;
    const y = plotH - h;
    const r = Math.min(4, h);
    return (
      <path
        d={`M${x},${plotH} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + barW - r},${y} Q${x + barW},${y} ${x + barW},${y + r} L${x + barW},${plotH} Z`}
        fill={color}
      />
    );
  };

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Messages per day, grouped by sender">
        <line x1="0" y1={plotH} x2={W} y2={plotH} className="chart-axis" />
        {data.map((d, i) => {
          const cx = i * groupW + groupW / 2;
          const x1 = cx - barW - 1; // 2px gap between the pair
          const x2 = cx + 1;
          const showLabel = data.length <= 14 || i % 2 === 0;
          return (
            <g
              key={d.date}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              {/* hit target bigger than the marks */}
              <rect x={i * groupW} y="0" width={groupW} height={H} fill="transparent" />
              {hover === i && <rect x={i * groupW} y="0" width={groupW} height={plotH} className="chart-hover-band" />}
              <g>{bar(x1, d.user, SERIES.user.color)}</g>
              <g>{bar(x2, d.assistant, SERIES.assistant.color)}</g>
              {showLabel && (
                <text x={cx} y={H - 6} className="chart-label" textAnchor="middle">
                  {d.date.slice(5)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div className="chart-tooltip" style={{ left: `${((hover + 0.5) / data.length) * 100}%` }}>
          <strong>{data[hover].date}</strong>
          <div>
            <span className="legend-swatch" style={{ background: SERIES.user.color }} /> User: {data[hover].user}
          </div>
          <div>
            <span className="legend-swatch" style={{ background: SERIES.assistant.color }} /> Agent: {data[hover].assistant}
          </div>
        </div>
      )}
    </div>
  );
}
