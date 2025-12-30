export interface Post {
  id: string;
  profile_id: string;
  title: string;
  expression: string;
  mode: string;
  sample_rate: number;
  is_draft: boolean;
  created_at: string;
  updated_at: string;
  pre_rendered?: boolean;
  sample_url?: string;
  prerender_duration?: number;
  prerender_signature?: string;
}
