import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../lib/supabaseClient';

interface LineageNode {
  id: string;
  title: string | null;
  author_username: string | null;
  children: LineageNode[];
}

interface PostLineageProps {
  postId: string;
}

interface LineageRow {
  id: string;
  title: string | null;
  author_username: string | null;
  fork_of_post_id: string | null;
  is_ancestor: boolean;
  depth: number;
}

interface CurrentPostRow {
  id: string;
  title: string | null;
  author_username: string | null;
}

function buildAncestorChain(ancestors: LineageRow[]): LineageNode[] {
  // Sort by depth descending (root ancestor first)
  const sorted = [...ancestors].sort((a, b) => b.depth - a.depth);
  return sorted.map((a) => ({
    id: a.id,
    title: a.title,
    author_username: a.author_username,
    children: [],
  }));
}

function buildDescendantTree(descendants: LineageRow[], parentId: string): LineageNode[] {
  const children = descendants.filter((d) => d.fork_of_post_id === parentId);
  return children.map((child) => ({
    id: child.id,
    title: child.title,
    author_username: child.author_username,
    children: buildDescendantTree(descendants, child.id),
  }));
}

function LineageItem({
  node,
  depth = 0,
  currentPostId,
}: {
  node: LineageNode;
  depth?: number;
  currentPostId: string;
}) {
  const title = node.title || '(untitled)';
  const author = node.author_username || 'unknown';
  const isCurrent = node.id === currentPostId;

  return (
    <li className={`lineage-item${isCurrent ? ' is-current' : ''}`}>
      <Link href={`/post/${node.id}`} className="lineage-link">
        {title} <span className="secondary-text">by @{author}</span>
      </Link>
      {node.children.length > 0 && (
        <ul className="lineage-children">
          {node.children.map((child) => (
            <LineageItem key={child.id} node={child} depth={depth + 1} currentPostId={currentPostId} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function PostLineage({ postId }: PostLineageProps) {
  const [ancestors, setAncestors] = useState<LineageNode[]>([]);
  const [descendants, setDescendants] = useState<LineageNode[]>([]);
  const [currentPost, setCurrentPost] = useState<LineageNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError('');

      try {
        // Fetch current post info and lineage in parallel
        const [postResult, lineageResult] = await Promise.all([
          supabase
            .from('posts_with_meta')
            .select('id, title, author_username')
            .eq('id', postId)
            .eq('is_draft', false)
            .maybeSingle(),
          supabase.rpc('get_post_lineage', { target_post_id: postId }),
        ]);

        if (cancelled) return;

        const { data: postData, error: postError } = postResult;
        const { data: lineageData, error: lineageError } = lineageResult;

        if (postError || !postData) {
          setError('Unable to load lineage.');
          setLoading(false);
          return;
        }

        setCurrentPost({
          id: postData.id,
          title: (postData as CurrentPostRow).title,
          author_username: (postData as CurrentPostRow).author_username,
          children: [],
        });

        if (lineageError) {
          console.warn('Error loading lineage:', lineageError.message);
          // Still show the post even if lineage fails
          setAncestors([]);
          setDescendants([]);
        } else {
          const rows = (lineageData ?? []) as LineageRow[];
          const ancestorRows = rows.filter((r) => r.is_ancestor);
          const descendantRows = rows.filter((r) => !r.is_ancestor);

          setAncestors(buildAncestorChain(ancestorRows));
          setDescendants(buildDescendantTree(descendantRows, postId));
        }
      } catch (err) {
        if (!cancelled) {
          setError('Unable to load lineage.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [postId]);

  if (loading) {
    return <p className="secondary-text">Loading lineage…</p>;
  }

  if (error) {
    return <p className="error-message">{error}</p>;
  }

  const hasAncestors = ancestors.length > 0;
  const hasDescendants = descendants.length > 0;

  if (!hasAncestors && !hasDescendants) {
    return <p className="secondary-text">No lineage yet.</p>;
  }

  // Build the tree: ancestors → current post → descendants
  const buildTree = (): LineageNode | null => {
    if (!currentPost) return null;

    // Current post with its descendants
    const currentWithDescendants: LineageNode = {
      ...currentPost,
      children: descendants,
    };

    if (ancestors.length === 0) {
      return currentWithDescendants;
    }

    // Chain ancestors together, with the current post at the end
    let root = ancestors[0];
    let current = root;

    for (let i = 1; i < ancestors.length; i++) {
      current.children = [ancestors[i]];
      current = ancestors[i];
    }

    // Attach current post to the last ancestor
    current.children = [currentWithDescendants];

    return root;
  };

  const tree = buildTree();

  if (!tree) {
    return <p className="secondary-text">No lineage yet.</p>;
  }

  return (
    <ul className="lineage-tree">
      <LineageItem node={tree} currentPostId={postId} />
    </ul>
  );
}
