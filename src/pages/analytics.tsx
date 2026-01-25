import Head from 'next/head';
import Link from 'next/link';
import React, { useEffect, useState } from 'react';
import { useCurrentUserProfile } from '../hooks/useCurrentUserProfile';
import { BackButton } from '../components/BackButton';
import {
  getCreatorAnalytics,
  getCreatorStats,
  CreatorAnalyticsRow,
  CreatorStats,
} from '../services/playEventsClient';
import { formatPostTitle } from '../utils/post-format';

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  }
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

export default function AnalyticsPage() {
  const { status, user } = useCurrentUserProfile();
  const [stats, setStats] = useState<CreatorStats | null>(null);
  const [analytics, setAnalytics] = useState<CreatorAnalyticsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [periodDays, setPeriodDays] = useState(30);

  useEffect(() => {
    if (status !== 'idle' || !user) return;

    const fetchData = async () => {
      setLoading(true);
      setError(null);

      const [statsResult, analyticsResult] = await Promise.all([
        getCreatorStats(user.id, periodDays),
        getCreatorAnalytics(user.id, periodDays),
      ]);

      if (statsResult.error) {
        setError(statsResult.error.message);
        setLoading(false);
        return;
      }

      if (analyticsResult.error) {
        setError(analyticsResult.error.message);
        setLoading(false);
        return;
      }

      setStats(statsResult.data?.[0] ?? null);
      setAnalytics(analyticsResult.data ?? []);
      setLoading(false);
    };

    void fetchData();
  }, [status, user, periodDays]);

  if (status === 'loading') {
    return (
      <>
        <Head>
          <title>Analytics - BytebeatCloud</title>
        </Head>
        <section>
          <p className="text-centered">Loading...</p>
        </section>
      </>
    );
  }

  if (status === 'error' || !user) {
    return (
      <>
        <Head>
          <title>Analytics - BytebeatCloud</title>
        </Head>
        <section>
          <p className="text-centered">
            Please <Link href="/login">log in</Link> to view your analytics.
          </p>
        </section>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>Analytics - BytebeatCloud</title>
      </Head>
      <section className="analytics-page">
        <BackButton />

        <h2>Creator Analytics</h2>

        <div className="analytics-period-selector">
          <label htmlFor="period">Time period:</label>
          <select
            id="period"
            value={periodDays}
            onChange={(e) => setPeriodDays(Number(e.target.value))}
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
            <option value={365}>Last year</option>
          </select>
        </div>

        {loading && <p className="text-centered">Loading analytics...</p>}
        {error && <p className="error-message">{error}</p>}

        {!loading && !error && stats && (
          <>
            <div className="analytics-stats-grid">
              <div className="analytics-stat-card">
                <div className="stat-value">{stats.total_posts}</div>
                <div className="stat-label">Published Posts</div>
              </div>
              <div className="analytics-stat-card">
                <div className="stat-value">{stats.total_plays}</div>
                <div className="stat-label">Total Plays</div>
              </div>
              <div className="analytics-stat-card">
                <div className="stat-value">{formatDuration(stats.total_play_seconds)}</div>
                <div className="stat-label">Total Play Time</div>
              </div>
              <div className="analytics-stat-card">
                <div className="stat-value">{stats.unique_listeners}</div>
                <div className="stat-label">Unique Listeners</div>
              </div>
              <div className="analytics-stat-card">
                <div className="stat-value">{stats.plays_in_period}</div>
                <div className="stat-label">Plays (Last {periodDays}d)</div>
              </div>
              <div className="analytics-stat-card">
                <div className="stat-value">{formatDuration(stats.play_seconds_in_period)}</div>
                <div className="stat-label">Play Time (Last {periodDays}d)</div>
              </div>
              <div className="analytics-stat-card">
                <div className="stat-value">{stats.total_favorites}</div>
                <div className="stat-label">Total Favorites</div>
              </div>
            </div>

            <h3>Posts Performance</h3>
            {analytics.length === 0 ? (
              <p className="text-centered">No published posts yet.</p>
            ) : (
              <div className="analytics-table-container">
                <table className="analytics-table">
                  <thead>
                    <tr>
                      <th>Post</th>
                      <th>Total Plays</th>
                      <th>Play Time</th>
                      <th>Listeners</th>
                      <th>Plays ({periodDays}d)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.map((row) => (
                      <tr key={row.post_id}>
                        <td>
                          <Link href={`/post/${row.post_id}`} className="analytics-post-link">
                            {formatPostTitle(row.post_title)}
                          </Link>
                        </td>
                        <td>{row.total_plays}</td>
                        <td>{formatDuration(row.total_play_seconds)}</td>
                        <td>{row.unique_listeners}</td>
                        <td>{row.plays_in_period}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>
    </>
  );
}
