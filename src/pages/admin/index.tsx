import { useEffect, useState } from 'react';
import Head from 'next/head';
import { useSupabaseAuth } from '../../hooks/useSupabaseAuth';
import { supabase } from '../../lib/supabaseClient';

interface Metrics {
  total_users: number;
  total_profiles: number;
  total_posts: number;
  total_drafts: number;
  total_forks: number;
  total_favorites: number;
  total_follows: number;
  total_weekly_challenges: number;
  users_last_24h: number;
  users_last_7d: number;
  users_last_30d: number;
  posts_last_24h: number;
  posts_last_7d: number;
  posts_last_30d: number;
  favorites_last_24h: number;
  favorites_last_7d: number;
  favorites_last_30d: number;
  follows_last_24h: number;
  follows_last_7d: number;
  follows_last_30d: number;
}

interface DailyData {
  day: string;
  count: number;
}

interface AdminData {
  metrics: Metrics;
  trends: {
    signups: DailyData[];
    posts: DailyData[];
    favorites: DailyData[];
  };
}

export default function AdminDashboard() {
  const { user, loading: authLoading } = useSupabaseAuth();
  const [data, setData] = useState<AdminData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setError('Please log in to access admin dashboard');
      setLoading(false);
      return;
    }

    const fetchMetrics = async () => {
      setLoading(true);
      setError('');

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      if (!token) {
        setError('No session token');
        setLoading(false);
        return;
      }

      try {
        const res = await fetch('/api/admin/metrics', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!res.ok) {
          const errData = await res.json();
          setError(errData.error ?? 'Failed to fetch metrics');
          setLoading(false);
          return;
        }

        const json = await res.json();
        setData(json);
      } catch (err) {
        setError('Network error');
      } finally {
        setLoading(false);
      }
    };

    void fetchMetrics();
  }, [user, authLoading]);

  if (authLoading || loading) {
    return (
      <>
        <Head>
          <title>Admin Dashboard - BytebeatCloud</title>
        </Head>
        <section>
          <h1>Admin Dashboard</h1>
          <p className="text-centered">Loading...</p>
        </section>
      </>
    );
  }

  if (error) {
    return (
      <>
        <Head>
          <title>Admin Dashboard - BytebeatCloud</title>
        </Head>
        <section>
          <h1>Admin Dashboard</h1>
          <p className="error-message">{error}</p>
        </section>
      </>
    );
  }

  if (!data) {
    return null;
  }

  const { metrics, trends } = data;

  return (
    <>
      <Head>
        <title>Admin Dashboard - BytebeatCloud</title>
      </Head>
      <section className="admin-dashboard">
        <h2>Admin Dashboard</h2>

        <fieldset>
          <legend>Totals</legend>
          <div className="metrics-grid">
            <MetricCard label="Users" value={metrics.total_users} />
            <MetricCard label="Profiles" value={metrics.total_profiles} />
            <MetricCard label="Posts" value={metrics.total_posts} />
            <MetricCard label="Drafts" value={metrics.total_drafts} />
            <MetricCard label="Forks" value={metrics.total_forks} />
            <MetricCard label="Favorites" value={metrics.total_favorites} />
            <MetricCard label="Follows" value={metrics.total_follows} />
            <MetricCard label="Weekly Challenges" value={metrics.total_weekly_challenges} />
          </div>
        </fieldset>

        <fieldset>
          <legend>New Users</legend>
          <div className="metrics-grid">
            <MetricCard label="Last 24h" value={metrics.users_last_24h} />
            <MetricCard label="Last 7 days" value={metrics.users_last_7d} />
            <MetricCard label="Last 30 days" value={metrics.users_last_30d} />
          </div>
          <TrendChart data={trends.signups} label="Daily Signups (30d)" />
        </fieldset>

        <fieldset>
          <legend>New Posts</legend>
          <div className="metrics-grid">
            <MetricCard label="Last 24h" value={metrics.posts_last_24h} />
            <MetricCard label="Last 7 days" value={metrics.posts_last_7d} />
            <MetricCard label="Last 30 days" value={metrics.posts_last_30d} />
          </div>
          <TrendChart data={trends.posts} label="Daily Posts (30d)" />
        </fieldset>

        <fieldset>
          <legend>Favorites</legend>
          <div className="metrics-grid">
            <MetricCard label="Last 24h" value={metrics.favorites_last_24h} />
            <MetricCard label="Last 7 days" value={metrics.favorites_last_7d} />
            <MetricCard label="Last 30 days" value={metrics.favorites_last_30d} />
          </div>
          <TrendChart data={trends.favorites} label="Daily Favorites (30d)" />
        </fieldset>

        <fieldset>
          <legend>Follows</legend>
          <div className="metrics-grid">
            <MetricCard label="Last 24h" value={metrics.follows_last_24h} />
            <MetricCard label="Last 7 days" value={metrics.follows_last_7d} />
            <MetricCard label="Last 30 days" value={metrics.follows_last_30d} />
          </div>
        </fieldset>
      </section>

      <style jsx>{`
        .admin-dashboard fieldset {
          margin-bottom: 1.5rem;
        }
        .metrics-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
          gap: 1rem;
          margin-bottom: 1rem;
        }
      `}</style>
    </>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="metric-card">
      <div className="metric-value">{value.toLocaleString()}</div>
      <div className="metric-label">{label}</div>
      <style jsx>{`
        .metric-card {
          background: var(--chip-background-color,#1a1a1a);
          border: 1px solid var(--border-color, #333);
          border-radius: 4px;
          padding: 0.75rem;
          text-align: center;
        }
        .metric-value {
          font-size: 1.5rem;
          font-weight: bold;
          color: var(--accent-color, #4a9eff);
        }
        .metric-label {
          font-size: 0.85rem;
          color: var(--secondary-text-color, #888);
          margin-top: 0.25rem;
        }
      `}</style>
    </div>
  );
}

function TrendChart({ data, label }: { data: DailyData[]; label: string }) {
  if (!data || data.length === 0) {
    return <p className="text-centered">No data for chart</p>;
  }

  const maxCount = Math.max(...data.map((d) => d.count), 1);
  const chartHeight = 100;

  return (
    <div className="trend-chart">
      <div className="chart-label">{label}</div>
      <div className="chart-container">
        {data.map((d, i) => {
          const height = (d.count / maxCount) * chartHeight;
          const dateStr = new Date(d.day).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          });
          return (
            <div key={i} className="bar-wrapper" title={`${dateStr}: ${d.count}`}>
              <div className="bar" style={{ height: `${height}%` }} />
            </div>
          );
        })}
      </div>
      <style jsx>{`
        .trend-chart {
          margin-top: 1rem;
        }
        .chart-label {
          font-size: 0.85rem;
          color: var(--secondary-text-color, #888);
          margin-bottom: 0.5rem;
        }
        .chart-container {
          display: flex;
          align-items: flex-end;
          height: ${chartHeight}px;
          gap: 2px;
          background: var(--chip-background-color, #1a1a1a);
          border: 1px solid var(--border-color, #333);
          border-radius: 4px;
          padding: 0.5rem;
        }
        .bar-wrapper {
          flex: 1;
          display: flex;
          align-items: flex-end;
          height: 100%;
        }
        .bar {
          width: 100%;
          background: var(--accent-color, #4a9eff);
          border-radius: 2px 2px 0 0;
          min-height: 2px;
            opacity: 0.8;
        }
        .bar-wrapper:hover .bar {
          opacity: 1;
        }
      `}</style>
    </div>
  );
}
