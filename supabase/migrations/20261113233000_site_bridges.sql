-- Read-only data bridges from client sites into site_records (synced daily by the Hub server).
-- Holds secret tokens: RLS on and no policies, so only the service role (Hub server) can read it.
CREATE TABLE IF NOT EXISTS public.site_bridges (
  site_id uuid PRIMARY KEY REFERENCES public.monitored_sites(id) ON DELETE CASCADE,
  kind text NOT NULL,          -- supabase_rpc | http
  url text NOT NULL,
  apikey text,                 -- public anon/publishable key (supabase_rpc only)
  token text NOT NULL,         -- secret shared with the client site
  last_sync_at timestamptz,
  last_error text
);
ALTER TABLE public.site_bridges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.site_bridges FROM anon, authenticated;
