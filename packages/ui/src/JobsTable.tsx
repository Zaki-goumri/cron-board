import { useState } from 'react';
import type { CronJobSnapshot } from 'cronboard-api';
import { describeCron } from './App';

interface JobsTableProps {
  jobs: CronJobSnapshot[];
  onRefresh: () => void;
  apiCall: <T>(path: string, method?: string, body?: unknown) => Promise<T>;
}

/**
 * Table of all registered cron jobs with inline controls.
 */
export function JobsTable({ jobs, onRefresh, apiCall }: JobsTableProps): JSX.Element {
  const [editing, setEditing] = useState<string | null>(null);
  const [editExpr, setEditExpr] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function handleAction(name: string, action: 'pause' | 'resume' | 'trigger'): Promise<void> {
    setBusy(`${name}:${action}`);
    try {
      await apiCall(`/jobs/${encodeURIComponent(name)}/${action}`, 'POST');
    } catch (err) {
      alert(`Failed: ${(err as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete(name: string): Promise<void> {
    if (!confirm(`Delete cron job "${name}"? This removes it from the scheduler.`)) return;
    setBusy(`${name}:delete`);
    try {
      await apiCall(`/jobs/${encodeURIComponent(name)}`, 'DELETE');
    } catch (err) {
      alert(`Failed: ${(err as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  function startEdit(name: string, currentExpr: string): void {
    setEditing(name);
    setEditExpr(currentExpr);
    setEditError(null);
  }

  async function saveEdit(name: string): Promise<void> {
    setBusy(`${name}:save`);
    try {
      await apiCall(`/jobs/${encodeURIComponent(name)}`, 'PATCH', { cronExpression: editExpr });
      setEditing(null);
      setEditError(null);
    } catch (err) {
      setEditError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (jobs.length === 0) {
    return (
      <div style={styles.empty}>
        <p>No cron jobs registered.</p>
        <p style={styles.hint}>
          Add <code>@Cron('* * * * *')</code> decorators to your providers and ensure
          ScheduleModule.forRoot() is imported.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div style={styles.toolbar}>
        <h2 style={styles.heading}>Registered Jobs</h2>
        <button style={styles.btn} onClick={onRefresh}>Refresh</button>
      </div>

      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>Name</th>
            <th style={styles.th}>Schedule</th>
            <th style={styles.th}>Status</th>
            <th style={styles.th}>Last Run</th>
            <th style={styles.th}>Next Run</th>
            <th style={styles.th}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => (
            <tr key={job.name} style={styles.tr}>
              <td style={styles.td}>
                <div style={styles.jobName}>{job.name}</div>
                {job.timezone && (
                  <div style={styles.tz}>{job.timezone}</div>
                )}
              </td>
              <td style={styles.td}>
                {editing === job.name ? (
                  <div>
                    <input
                      style={styles.editInput}
                      value={editExpr}
                      onChange={(e) => setEditExpr(e.target.value)}
                      placeholder="*/5 * * * *"
                    />
                    {editError && <div style={styles.editError}>{editError}</div>}
                  </div>
                ) : (
                  <div>
                    <code style={styles.code}>{job.cronExpression}</code>
                    <div style={styles.desc}>{describeCron(job.cronExpression)}</div>
                  </div>
                )}
              </td>
              <td style={styles.td}>
                {job.isActive ? (
                  <span style={styles.statusActive}>Active</span>
                ) : (
                  <span style={styles.statusPaused}>Paused</span>
                )}
                {job.isCallbackRunning && (
                  <span style={styles.running}>running…</span>
                )}
              </td>
              <td style={styles.td}>{formatDate(job.lastDate)}</td>
              <td style={styles.td}>{formatDate(job.nextDate)}</td>
              <td style={styles.td}>
                <div style={styles.actions}>
                  {editing === job.name ? (
                    <>
                      <button
                        style={styles.btnSmall}
                        disabled={busy === `${job.name}:save`}
                        onClick={() => saveEdit(job.name)}
                      >
                        Save
                      </button>
                      <button
                        style={styles.btnSmall}
                        onClick={() => setEditing(null)}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      {job.isActive ? (
                        <button
                          style={styles.btnSmall}
                          disabled={busy === `${job.name}:pause`}
                          onClick={() => handleAction(job.name, 'pause')}
                        >
                          Pause
                        </button>
                      ) : (
                        <button
                          style={styles.btnSmall}
                          disabled={busy === `${job.name}:resume`}
                          onClick={() => handleAction(job.name, 'resume')}
                        >
                          Resume
                        </button>
                      )}
                      <button
                        style={styles.btnSmall}
                        disabled={busy === `${job.name}:trigger`}
                        onClick={() => handleAction(job.name, 'trigger')}
                      >
                        Trigger
                      </button>
                      <button
                        style={styles.btnSmall}
                        onClick={() => startEdit(job.name, job.cronExpression)}
                      >
                        Edit
                      </button>
                      <button
                        style={styles.btnDanger}
                        disabled={busy === `${job.name}:delete`}
                        onClick={() => handleDelete(job.name)}
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatDate(date: Date | null | string): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString();
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
    padding: '12px',
    fontSize: '14px',
    verticalAlign: 'top',
  } as const,
  jobName: {
    fontWeight: 600,
    fontFamily: 'monospace',
    fontSize: '13px',
  } as const,
  tz: {
    fontSize: '11px',
    color: '#999',
    marginTop: '2px',
  } as const,
  code: {
    fontFamily: 'monospace',
    fontSize: '13px',
    backgroundColor: '#f5f5fa',
    padding: '2px 6px',
    borderRadius: '3px',
  } as const,
  desc: {
    fontSize: '12px',
    color: '#666',
    marginTop: '4px',
  } as const,
  statusActive: {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: '10px',
    fontSize: '12px',
    fontWeight: 600,
    backgroundColor: '#e6f4ea',
    color: '#137333',
  } as const,
  statusPaused: {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: '10px',
    fontSize: '12px',
    fontWeight: 600,
    backgroundColor: '#fef7e0',
    color: '#b06000',
  } as const,
  running: {
    display: 'block',
    marginTop: '4px',
    fontSize: '11px',
    color: '#1a73e8',
    fontStyle: 'italic',
  } as const,
  actions: {
    display: 'flex',
    gap: '4px',
    flexWrap: 'wrap',
  } as const,
  btn: {
    padding: '6px 14px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    background: '#fff',
    cursor: 'pointer',
    fontSize: '13px',
  } as const,
  btnSmall: {
    padding: '4px 10px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    background: '#fff',
    cursor: 'pointer',
    fontSize: '12px',
  } as const,
  btnDanger: {
    padding: '4px 10px',
    border: '1px solid #c5221f',
    borderRadius: '4px',
    background: '#fff',
    color: '#c5221f',
    cursor: 'pointer',
    fontSize: '12px',
  } as const,
  editInput: {
    width: '100%',
    padding: '4px 8px',
    border: '1px solid #1a73e8',
    borderRadius: '4px',
    fontSize: '13px',
    fontFamily: 'monospace',
  } as const,
  editError: {
    fontSize: '11px',
    color: '#c5221f',
    marginTop: '4px',
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
