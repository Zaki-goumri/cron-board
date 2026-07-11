import type { CronBoardStats, CronJobSnapshot } from 'cronboard-api';

interface StatsProps {
  stats: CronBoardStats | null;
  jobs: CronJobSnapshot[];
}

/**
 * Aggregate statistics panel — job counts, 24h execution breakdown.
 */
export function Stats({ stats, jobs }: StatsProps): JSX.Element {
  const total = stats?.totalJobs ?? jobs.length;
  const active = stats?.activeJobs ?? jobs.filter((j) => j.isActive).length;
  const disabled = stats?.disabledJobs ?? total - active;
  const last24h = stats?.last24h ?? { fired: 0, success: 0, failed: 0, timeout: 0 };

  const successRate = last24h.fired > 0
    ? ((last24h.success / last24h.fired) * 100).toFixed(1)
    : '—';

  return (
    <div>
      <h2 style={styles.heading}>Statistics</h2>

      <div style={styles.grid}>
        <StatCard label="Total Jobs" value={total} color="#1a73e8" />
        <StatCard label="Active" value={active} color="#137333" />
        <StatCard label="Paused" value={disabled} color="#b06000" />
        <StatCard label="24h Success Rate" value={`${successRate}%`} color={successRate === '100.0' ? '#137333' : '#c5221f'} />
      </div>

      <h3 style={styles.subheading}>Last 24 Hours</h3>
      <div style={styles.grid}>
        <StatCard label="Fired" value={last24h.fired} color="#1a73e8" />
        <StatCard label="Succeeded" value={last24h.success} color="#137333" />
        <StatCard label="Failed" value={last24h.failed} color="#c5221f" />
        <StatCard label="Timeout" value={last24h.timeout} color="#b06000" />
      </div>

      <h3 style={styles.subheading}>Jobs by Status</h3>
      <div style={styles.list}>
        {jobs.length === 0 ? (
          <p style={styles.muted}>No jobs registered.</p>
        ) : (
          jobs.map((job) => (
            <div key={job.name} style={styles.listItem}>
              <code style={styles.code}>{job.name}</code>
              <span style={job.isActive ? styles.active : styles.paused}>
                {job.isActive ? 'Active' : 'Paused'}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string | number; color: string }): JSX.Element {
  return (
    <div style={styles.card}>
      <div style={styles.cardValue(color)}>{value}</div>
      <div style={styles.cardLabel}>{label}</div>
    </div>
  );
}

const styles = {
  heading: {
    fontSize: '20px',
    fontWeight: 600,
    margin: '0 0 20px 0',
  } as const,
  subheading: {
    fontSize: '16px',
    fontWeight: 600,
    margin: '24px 0 12px 0',
    color: '#333',
  } as const,
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: '16px',
  } as const,
  card: {
    backgroundColor: '#f5f5fa',
    borderRadius: '8px',
    padding: '20px',
    textAlign: 'center',
  } as const,
  cardValue: (color: string) => ({
    fontSize: '32px',
    fontWeight: 700,
    color,
    lineHeight: 1.2,
  } as const),
  cardLabel: {
    fontSize: '13px',
    color: '#666',
    marginTop: '8px',
  } as const,
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  } as const,
  listItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 12px',
    backgroundColor: '#f5f5fa',
    borderRadius: '4px',
  } as const,
  code: {
    fontFamily: 'monospace',
    fontSize: '13px',
  } as const,
  active: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#137333',
  } as const,
  paused: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#b06000',
  } as const,
  muted: {
    color: '#999',
    fontSize: '14px',
  } as const,
};
