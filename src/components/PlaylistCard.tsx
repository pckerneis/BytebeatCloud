import Link from 'next/link';

interface PlaylistCardProps {
  id: string;
  name: string;
  description?: string | null;
  postsCount?: number;
}

export function PlaylistCard({ id, name, description, postsCount }: PlaylistCardProps) {
  return (
    <li className="playlist-card">
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
        <Link href={`/playlists/${id}`} className="button small secondary">
          View
        </Link>
        <Link href={`/playlists/${id}`} className="button small secondary ml-10">
          Play
        </Link>
      </div>
    </li>
  );
}
