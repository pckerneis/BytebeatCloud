import Link from 'next/link';
import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { usePlayerStore } from '../hooks/usePlayerStore';
import { useBytebeatPlayer } from '../hooks/useBytebeatPlayer';
import type { PostRow } from './PostList';

interface PlaylistCardProps {
  id: string;
  name: string;
  description?: string | null;
  postsCount?: number;
}

// Module-level storage for the currently loaded playlist ID
let currentLoadedPlaylistId: string | null = null;

function setLoadedPlaylistId(playlistId: string | null) {
  currentLoadedPlaylistId = playlistId;
}

export function PlaylistCard({ id, name, description, postsCount }: Readonly<PlaylistCardProps>) {
  const [loading, setLoading] = useState(false);
  const { setPlaylist, setCurrentPostById, playlist } = usePlayerStore();
  const { toggle, isPlaying, stop } = useBytebeatPlayer();

  // Check if this specific playlist is loaded by comparing the playlist ID
  const isThisPlaylistLoaded = currentLoadedPlaylistId === id && playlist.length > 0;
  const isPlayingThisPlaylist = isThisPlaylistLoaded && isPlaying;

  const handlePlay = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (loading) return;

    // If a different playlist is playing, stop it first
    if (isPlaying && currentLoadedPlaylistId !== id) {
      await stop();
    }

    setLoading(true);
    try {
      // Load playlist entries with posts in a single query
      const { data: entries, error: entErr } = await supabase
        .from('playlist_entries')
        .select(
          'position, post:posts_with_meta!playlist_entries_post_id_fkey(id,title,description,expression,is_draft,sample_rate,mode,created_at,profile_id,fork_of_post_id,is_fork,author_username,origin_title,origin_username,favorites_count,is_weekly_winner,license,comments_count)',
        )
        .eq('playlist_id', id)
        .eq('post.is_draft', false)
        .order('position', { ascending: true });

      if (entErr || !entries || entries.length === 0) {
        console.warn('Error loading playlist entries or empty playlist');
        setLoading(false);
        return;
      }

      // Map entries to PostRow format
      const orderedPosts: PostRow[] = entries
        .map((entry: any) => {
          const p = entry.post;
          if (!p) return null;
          return {
            id: p.id,
            title: p.title,
            expression: p.expression,
            mode: p.mode,
            sample_rate: p.sample_rate,
            profile_id: p.profile_id,
            created_at: p.created_at,
            favorites_count: p.favorites_count ?? 0,
            is_draft: p.is_draft,
            license: p.license,
            description: p.description,
            author_username: p.author_username ?? null,
            favorited_by_current_user: false,
            fork_of_post_id: p.fork_of_post_id ?? null,
            is_fork: p.is_fork ?? false,
            origin_title: p.origin_title ?? null,
            origin_username: p.origin_username ?? null,
            is_weekly_winner: p.is_weekly_winner ?? false,
            comments_count: p.comments_count ?? 0,
          } as PostRow;
        })
        .filter((p) => p !== null) as PostRow[];

      if (orderedPosts.length === 0) {
        console.warn('No valid posts found');
        setLoading(false);
        return;
      }

      // Load playlist into player
      setPlaylist(orderedPosts, orderedPosts[0].id);
      setCurrentPostById(orderedPosts[0].id);
      setLoadedPlaylistId(id);

      // Start playing first post
      const firstPost = orderedPosts[0];
      await toggle(firstPost.expression, firstPost.mode, firstPost.sample_rate);
    } catch (err) {
      console.error('Error playing playlist:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <li className={`playlist-card${isPlayingThisPlaylist ? ' playing' : ''}`}>
      <div className="flex-row flex-end">
        <Link href={`/playlists/${id}`} className="weight-600">
          {name}
        </Link>
        <span className="secondary-text ml-auto smaller">
          {postsCount ?? 0} {postsCount === 1 ? 'post' : 'posts'}
        </span>
      </div>
      {description && <div className="secondary-text smaller">{description}</div>}
      <div className="flex-row">
        <button
          onClick={handlePlay}
          className="button small secondary"
          disabled={loading || postsCount === 0 || isPlayingThisPlaylist}
        >
          {loading ? 'Loading…' : isPlayingThisPlaylist ? 'Playing' : 'Play'}
        </button>
        <Link href={`/playlists/${id}`} className="button small secondary ml-10">
          View
        </Link>
      </div>
    </li>
  );
}
