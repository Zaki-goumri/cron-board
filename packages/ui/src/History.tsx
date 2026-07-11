import { useState } from 'react';
import { ExecutionStatus, type ExecutionRecord } from 'cronboard-api';

interface HistoryProps {
  executions: ExecutionRecord[];
  onRefresh: () => void;
}

/**
 * Execution history table with per-job filter and expandable stdout/stderr.
 */
export function History({ executions, onRefresh }: HistoryProps): JSX.Element {
  const [filter, setFilter] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const filtered = filter
    ? executions.filter((e) => e.jobName === filter)
    : executions;

  const jobNames = [...new Set(executions.map((e) => e.jobName))].sort();

  return (
    <div>
      <div style={styles.toolbar}>
        <h2 style={styles.heading}>Execution History</h2>
        <div style={styles.controls}>
          <select
            style={styles.select}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="">All jobs</option>
            {jobNames.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          <button style={styles.btn} onClick={onRefresh}>Refresh</button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div style={styles.empty}>
          <p>No executions recorded yet.</p>
          <p style={styles.hint}>Executions appear here when cron jobs fire.</p>
        </div>
      ) : (
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Job</th>
              <th style={styles.th}>Status</th>
              <th style={styles.th}>Started</th>
              <th style={styles.th}>Duration</th>
              <th style={styles.th}>Error</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((rec) => (
              <tr key={rec.id} style={styles.tr}>
                <td style={styles.td}>
                  <code style={styles.code}>{rec.jobName}</code>
                </td>
                <td style={styles.td}>
                  <StatusBadge status={rec.status} />
                </td>
                <td style={styles.td}>{formatDate(rec.startedAt)}</td>
                <td style={styles.td}>{formatDuration(rec.durationMs)}</td>
                <td style={styles.td}>
                  {rec.error ? (
                    <div>
                      <div
                        style={styles.errorToggle}
                        onClick={() => setExpanded(expanded === rec.id ? null : rec.id)}
                      >
                        {expanded === rec.id ? '▾' : '▸'} {rec.error.message.slice(0, 80)}
                      </div>
                      {expanded === rec.id && (
                        <div style={styles.errorDetail}>
                          {rec.stderrTail && (
                            <div>
                              <strong>stderr:</strong>
                              <pre style={styles.pre}>{rec.stderrTail}</pre>
                            </div>
                          )}
                          {rec.error.stack && (
                            <div>
                              <strong>stack:</strong>
                              <pre style={styles.pre}>{rec.error.stack}</pre>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <span style={styles.muted}>—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: ExecutionStatus }): JSX.Element {
  const styleMap = {
    [ExecutionStatus.Success]: { bg: '#e6f4ea', color: '#137333' },
    [ExecutionStatus.Failed]: { bg: '#fce8e6', color: '#c5221f' },
    [ExecutionStatus.Timeout]: { bg: '#fef7e0', color: '#b06000' },
    [ExecutionStatus.Skipped]: { bg: '#f0f0f0', color: '#666' },
  } as const;

  const s = styleMap[status] ?? styleMap[ExecutionStatus.Skipped];

  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: '10px',
      fontSize: '12px',
      fontWeight: 600,
      backgroundColor: s.bg,
      color: s.color,
    }}>
      {status}
    </span>
  );
}

function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

const styles = {
  toolbar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
  } as const,
  heading: {
    fontSize: '20px',
    fontWeight: 600,
    margin: 0,
  } as const,
  controls: {
    display: 'flex',
    gap: '8px',
  } as const,
  select: {
    padding: '6px 10px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '13px',
  } as const,
  btn: {
    padding: '6px 14px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    background: '#fff',
    cursor: 'pointer',
    fontSize: '13px',
  } as const,
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  } as const,
  th: {
    textAlign: 'left',
    padding: '10px 12px',
    fontSize: '12px',
    fontWeight: 600,
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    borderBottom: '2px solid #e0e0e0',
  } as const,
  tr: {
    borderBottom: '1px solid #f0f0f0',
  } as const,
  td: {
    padding: '10px 12px',
    fontSize: '14px',
    verticalAlign: 'top',
  } as const,
  code: {
    fontFamily: 'monospace',
    fontSize: '13px',
  } as const,
  errorToggle: {
    cursor: 'pointer',
    fontSize: '13px',
    color: '#c5221f',
    userSelect: 'none',
  } as const,
  errorDetail: {
    marginTop: '8px',
    padding: '8px',
    backgroundColor: '#fce8e6',
    borderRadius: '4px',
  } as const,
  pre: {
    margin: '4px 0',
    padding: '8px',
    backgroundColor: '#fff',
    borderRadius: '4px',
    fontSize: '12px',
    fontFamily: 'monospace',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    overflow: 'auto',
    maxHeight: '300px',
  } as const,
  muted: {
    color: '#999',
  } as const,
  empty: {
    textAlign: 'center',
    padding: '40px',
    color: '#666',
  } as const,
  hint: {
    fontSize: '13px',
    color: '#999',
    marginTop: '8px',
  } as const,
};
