import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? '').split(',').filter(Boolean);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (ADMIN_EMAILS.length === 0) {
    return res.status(403).json({ error: 'Admin access not configured' });
  }

  // Get user from Authorization header
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.slice(7);
  const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

  // Verify the token and get user
  const {
    data: { user },
    error: authError,
  } = await supabaseClient.auth.getUser(token);

  if (authError || !user?.email) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  if (!ADMIN_EMAILS.includes(user.email)) {
    return res.status(403).json({ error: 'Not an admin' });
  }

  // Fetch metrics using service role
  const { data: metrics, error: metricsError } = await supabaseClient.rpc('admin_get_metrics');

  if (metricsError) {
    return res.status(500).json({ error: metricsError.message });
  }

  // Fetch daily trends
  const [signupsResult, postsResult, favoritesResult] = await Promise.all([
    supabaseClient.rpc('admin_get_daily_signups', { days_back: 30 }),
    supabaseClient.rpc('admin_get_daily_posts', { days_back: 30 }),
    supabaseClient.rpc('admin_get_daily_favorites', { days_back: 30 }),
  ]);

  return res.status(200).json({
    metrics,
    trends: {
      signups: signupsResult.data ?? [],
      posts: postsResult.data ?? [],
      favorites: favoritesResult.data ?? [],
    },
  });
}
