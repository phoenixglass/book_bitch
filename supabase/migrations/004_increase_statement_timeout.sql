-- Run this in your Supabase SQL editor (https://supabase.com/dashboard → SQL Editor)
-- Projects are stored as a single JSONB blob and can legitimately grow large
-- (long manuscripts, imported research, etc.), and bugs elsewhere can bloat
-- them further. Supabase's default statement_timeout for the authenticated
-- role is short enough that a large project save can be cancelled outright
-- ("canceling statement due to statement timeout") with no amount of client
-- retrying able to fix it. Raise it so big-but-legitimate saves have room to
-- complete; the client's own retry/backoff logic in src/lib/dbRetry.ts still
-- handles genuinely transient failures on top of this.
ALTER ROLE authenticated SET statement_timeout = '30s';
