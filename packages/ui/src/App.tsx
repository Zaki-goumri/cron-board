import { useEffect, useMemo, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import cronstrue from 'cronstrue';
import type {
  CronBoardEvent,
  CronBoardStats,
  CronJobSnapshot,
  ExecutionRecord,
} from 'cronboard-api';
import { JobsTable } from './JobsTable';
import { History } from './History';
import { Stats } from './Stats';

const WS_EVENT = 'cronboard:event';

type Tab = 'jobs' | 'history' | 'stats';

/**
 * Detects the board's base route from the current URL path.
 * The SPA is served at e.g. /cronboard, so the API and WS are at /cronboard/api and /cronboard.
 */
function detectBaseRoute(): string {
  const path = window.location.pathname;
  const hashIndex = path.indexOf('#');
  const cleanPath = hashIndex === -1 ? path : path.slice(0, hashIndex);
  const segments = cleanPath.split('/').filter(Boolean);
  if (segments.length === 0) return '';
  return '/' + segments[0];
}

/**
 * Main CronBoard dashboard application.
 * Connects to the WebSocket, fetches initial state, and renders the active tab.
 */
export function App(): JSX.Element {
  const [jobs, setJobs] = useState<CronJobSnapshot[]>([]);
  const [executions, setExecutions] = useState<ExecutionRecord[]>([]);
  const [stats, setStats] = useState<CronBoardStats | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('jobs');
  const [connected, setConnected] = useState(false);

  const baseRoute = useMemo(() => detectBaseRoute(), []);
  const apiBase = baseRoute + '/api';

  const socket = useMemo<Socket>(() => {
    return io(baseRoute, {
      transports: ['websocket'],
      reconnection: true,
      withCredentials: true,
    });
  }, [baseRoute]);

  useEffect(() => {
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on(WS_EVENT, (event: CronBoardEvent) => {
      switch (event.type) {
        case 'snapshot':
          setJobs(event.jobs);
          break;
        case 'job':
          setJobs((prev) => {
            if (event.action === 'deleted') {
              return prev.filter((j) => j.name !== event.job.name);
            }
            const idx = prev.findIndex((j) => j.name === event.job.name);
            if (idx === -1) return [...prev, event.job];
            const next = [...prev];
            next[idx] = event.job;
            return next;
          });
          break;
        case 'execution':
          setExecutions((prev) => [event.record, ...prev].slice(0, 200));
          break;
        case 'stats':
          setStats(event.stats);
          break;
      }
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [socket]);

  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    // Trigger browser Basic Auth dialog by fetching an endpoint that returns 401.
    // Once the browser has credentials, subsequent fetch with credentials:'include' will use them.
    void triggerAuth();
  }, []);

  async function triggerAuth(): Promise<void> {
    try {
      const res = await fetch(`${apiBase}/jobs`, { credentials: 'include' });
      if (res.ok) {
        setAuthed(true);
        void fetchJobs();
        void fetchExecutions();
        void fetchStats();
      } else if (res.status === 401) {
        // Browser should have prompted for credentials via WWW-Authenticate header.
        // Retry after a short delay.
        setTimeout(() => void triggerAuth(), 500);
      }
    } catch {
      // Network error — retry
      setTimeout(() => void triggerAuth(), 1000);
    }
  }

  async function fetchJobs(): Promise<void> {
    try {
      const res = await fetch(`${apiBase}/jobs`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setJobs(data?.data ?? data);
      }
    } catch {
      // WebSocket will push snapshot on connect
    }
  }

  async function fetchExecutions(): Promise<void> {
    try {
      const res = await fetch(`${apiBase}/executions?limit=100`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setExecutions(data?.data ?? data);
      }
    } catch {
      // ignore — WS will push new ones
    }
  }

  async function fetchStats(): Promise<void> {
    try {
      const res = await fetch(`${apiBase}/stats`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setStats(data?.data ?? data);
      }
    } catch {
      // ignore
    }
  }

  async function apiCall<T>(path: string, method = 'POST', body?: unknown): Promise<T> {
    const res = await fetch(`${apiBase}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
    const data = await res.json();
    return (data?.data ?? data) as T;
  }

  if (!authed) {
    return (
      <div style={styles.container}>
        <div style={styles.loading}>
          <h2>CronBoard</h2>
          <p>Authenticating…</p>
          <p style={styles.hint}>
            If prompted, enter your CronBoard credentials.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>CronBoard</h1>
        <div style={styles.badge(connected)}>
          {connected ? 'Connected' : 'Disconnected'}
        </div>
      </header>

      <nav style={styles.nav}>
        <button
          style={activeTab === 'jobs' ? styles.tabActive : styles.tab}
          onClick={() => setActiveTab('jobs')}
        >
          Jobs ({jobs.length})
        </button>
        <button
          style={activeTab === 'history' ? styles.tabActive : styles.tab}
          onClick={() => setActiveTab('history')}
        >
          History
        </button>
        <button
          style={activeTab === 'stats' ? styles.tabActive : styles.tab}
          onClick={() => setActiveTab('stats')}
        >
          Stats
        </button>
      </nav>

      <main style={styles.main}>
        {activeTab === 'jobs' && (
          <JobsTable jobs={jobs} onRefresh={fetchJobs} apiCall={apiCall} />
        )}
        {activeTab === 'history' && (
          <History executions={executions} onRefresh={fetchExecutions} />
        )}
        {activeTab === 'stats' && <Stats stats={stats} jobs={jobs} />}
      </main>
    </div>
  );
}

function describeCron(expr: string): string {
  try {
    if (expr.startsWith('@')) return expr;
    return cronstrue.toString(expr);
  } catch {
    return expr;
  }
}

const styles = {
  container: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '20px',
    color: '#1a1a2e',
    backgroundColor: '#f5f5fa',
    minHeight: '100vh',
  } as const,
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    marginBottom: '16px',
  } as const,
  title: {
    fontSize: '28px',
    fontWeight: 700,
    margin: 0,
  } as const,
  badge: (connected: boolean) => ({
    fontSize: '12px',
    padding: '4px 10px',
    borderRadius: '12px',
    backgroundColor: connected ? '#e6f4ea' : '#fce8e6',
    color: connected ? '#137333' : '#c5221f',
    fontWeight: 600,
  } as const),
  nav: {
    display: 'flex',
    gap: '4px',
    marginBottom: '20px',
    borderBottom: '2px solid #e0e0e0',
  } as const,
  tab: {
    padding: '8px 20px',
    border: 'none',
    background: 'none',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 500,
    color: '#666',
    borderBottom: '3px solid transparent',
    marginBottom: '-2px',
  } as const,
  tabActive: {
    padding: '8px 20px',
    border: 'none',
    background: 'none',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 600,
    color: '#1a73e8',
    borderBottom: '3px solid #1a73e8',
    marginBottom: '-2px',
  } as const,
  main: {
    backgroundColor: '#fff',
    borderRadius: '8px',
    padding: '24px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
  } as const,
  loading: {
    textAlign: 'center',
    padding: '60px',
    color: '#666',
  } as const,
  hint: {
    fontSize: '13px',
    color: '#999',
    marginTop: '8px',
  } as const,
};

export { describeCron };
