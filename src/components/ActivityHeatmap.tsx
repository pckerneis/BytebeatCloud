import { useEffect, useMemo, useRef, useState } from 'react';
import { getUserActivityHeatmap, ActivityHeatmapRow } from '../services/playEventsClient';

interface ActivityHeatmapProps {
  userId: string;
}

interface DayData {
  date: string;
  postsCount: number;
  favoritesCount: number;
  totalCount: number;
  level: number;
}

function getWeeksInYear(): number {
  return 53;
}

interface DayActivityData {
  postsCount: number;
  favoritesCount: number;
  totalCount: number;
}

function generateEmptyGrid(): Map<string, DayActivityData> {
  const map = new Map<string, DayActivityData>();
  const today = new Date();
  const oneYearAgo = new Date(today);
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  for (let d = new Date(oneYearAgo); d <= today; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split('T')[0];
    map.set(dateStr, { postsCount: 0, favoritesCount: 0, totalCount: 0 });
  }

  return map;
}

function getLevel(count: number, max: number): number {
  if (count === 0) return 0;
  if (max === 0) return 0;
  const ratio = count / max;
  if (ratio <= 0.25) return 1;
  if (ratio <= 0.5) return 2;
  if (ratio <= 0.75) return 3;
  return 4;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface TooltipState {
  day: DayData;
  x: number;
  y: number;
}

export function ActivityHeatmap({ userId }: ActivityHeatmapProps) {
  const [data, setData] = useState<ActivityHeatmapRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      setLoading(true);
      const { data: result, error } = await getUserActivityHeatmap(userId);

      if (cancelled) return;

      if (error) {
        console.warn('Error fetching heatmap data:', error);
        setData([]);
      } else {
        setData(result ?? []);
      }
      setLoading(false);
    };

    void fetchData();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const { weeks, monthLabels, totalActivities } = useMemo(() => {
    const countMap = generateEmptyGrid();

    for (const row of data) {
      countMap.set(row.date, {
        postsCount: row.posts_count,
        favoritesCount: row.favorites_count,
        totalCount: row.total_count,
      });
    }

    let max = 0;
    let total = 0;
    for (const activity of countMap.values()) {
      if (activity.totalCount > max) max = activity.totalCount;
      total += activity.totalCount;
    }

    const today = new Date();
    const oneYearAgo = new Date(today);
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    // Find the first Sunday on or before oneYearAgo
    const startDate = new Date(oneYearAgo);
    startDate.setDate(startDate.getDate() - startDate.getDay());

    const weeksData: DayData[][] = [];
    const labels: { month: string; weekIndex: number }[] = [];
    let currentMonth = -1;

    const numWeeks = getWeeksInYear();

    for (let week = 0; week < numWeeks; week++) {
      const weekData: DayData[] = [];

      for (let day = 0; day < 7; day++) {
        const currentDate = new Date(startDate);
        currentDate.setDate(startDate.getDate() + week * 7 + day);
        const dateStr = currentDate.toISOString().split('T')[0];
        const activity = countMap.get(dateStr) ?? {
          postsCount: 0,
          favoritesCount: 0,
          totalCount: 0,
        };

        // Track month changes for labels
        if (currentDate.getMonth() !== currentMonth && currentDate <= today) {
          currentMonth = currentDate.getMonth();
          labels.push({ month: MONTHS[currentMonth], weekIndex: week });
        }

        // Only include days up to today
        if (currentDate <= today && currentDate >= oneYearAgo) {
          weekData.push({
            date: dateStr,
            postsCount: activity.postsCount,
            favoritesCount: activity.favoritesCount,
            totalCount: activity.totalCount,
            level: getLevel(activity.totalCount, max),
          });
        } else {
          weekData.push({
            date: dateStr,
            postsCount: 0,
            favoritesCount: 0,
            totalCount: 0,
            level: -1, // Hidden
          });
        }
      }

      weeksData.push(weekData);
    }

    return {
      weeks: weeksData,
      monthLabels: labels,
      totalActivities: total,
    };
  }, [data]);

  if (loading) {
    return <div className="activity-heatmap-loading">Loading activity...</div>;
  }

  return (
    <div className="activity-heatmap" ref={containerRef}>
      <div className="activity-heatmap-header">
        <span className="activity-heatmap-title">
          {totalActivities} {totalActivities === 1 ? 'activity' : 'activities'} in the last year
        </span>
      </div>

      <div className="activity-heatmap-container">
        <div className="activity-heatmap-days">
          {DAYS.filter((_, i) => i % 2 === 1).map((day) => (
            <span key={day} className="activity-heatmap-day-label">
              {day}
            </span>
          ))}
        </div>

        <div className="activity-heatmap-grid-wrapper">
          <div className="activity-heatmap-months">
            {monthLabels.map((label, i) => (
              <span
                key={`${label.month}-${i}`}
                className="activity-heatmap-month-label"
                style={{ gridColumn: label.weekIndex + 1 }}
              >
                {label.month}
              </span>
            ))}
          </div>

          <div className="activity-heatmap-grid">
            {weeks.map((week, weekIndex) => (
              <div key={weekIndex} className="activity-heatmap-week">
                {week.map((day, dayIndex) => (
                  <div
                    key={`${weekIndex}-${dayIndex}`}
                    className={`activity-heatmap-cell level-${day.level}`}
                    onMouseEnter={(e) => {
                      if (day.level < 0) return;
                      const rect = containerRef.current?.getBoundingClientRect();
                      if (!rect) return;
                      setTooltip({
                        day,
                        x: e.clientX - rect.left,
                        y: e.clientY - rect.top,
                      });
                    }}
                    onMouseLeave={() => setTooltip(null)}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="activity-heatmap-legend">
        <span className="activity-heatmap-legend-label">Less</span>
        <div className="activity-heatmap-cell level-0" />
        <div className="activity-heatmap-cell level-1" />
        <div className="activity-heatmap-cell level-2" />
        <div className="activity-heatmap-cell level-3" />
        <div className="activity-heatmap-cell level-4" />
        <span className="activity-heatmap-legend-label">More</span>
      </div>

      {tooltip && (
        <div className="activity-heatmap-tooltip" style={{ left: tooltip.x, top: tooltip.y - 60 }}>
          <strong>{formatDate(tooltip.day.date)}</strong>
          <br />
          {tooltip.day.postsCount > 0 && (
            <span>
              {tooltip.day.postsCount} post{tooltip.day.postsCount !== 1 ? 's' : ''} created
            </span>
          )}
          {tooltip.day.postsCount > 0 && tooltip.day.favoritesCount > 0 && <br />}
          {tooltip.day.favoritesCount > 0 && (
            <span>
              {tooltip.day.favoritesCount} favorite{tooltip.day.favoritesCount !== 1 ? 's' : ''}{' '}
              given
            </span>
          )}
          {tooltip.day.totalCount === 0 && <span>No activity</span>}
        </div>
      )}
    </div>
  );
}
