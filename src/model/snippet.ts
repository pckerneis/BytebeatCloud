export interface SnippetRow {
  id: string;
  name: string;
  profile_id: string;
  created_at: string;
  description: string;
  snippet: string;
  is_public: boolean;
  username?: string;
}
