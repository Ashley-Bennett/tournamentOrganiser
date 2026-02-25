-- ============================================================
-- Migration: Create personal workspaces for existing users
-- and backfill workspace_id on all tenant-owned tables.
-- ============================================================

-- 1. Create a personal workspace for every existing auth user
--    who doesn't already have one (e.g. from the trigger firing).
INSERT INTO public.workspaces (id, name, slug, type, created_by)
SELECT
  gen_random_uuid(),
  COALESCE(raw_user_meta_data->>'name', email, 'My Workspace'),
  'personal-' || substr(replace(id::text, '-', ''), 1, 12),
  'personal',
  id
FROM auth.users
ON CONFLICT (slug) DO NOTHING;

-- 2. Create owner memberships for any workspaces that don't have one yet
INSERT INTO public.workspace_memberships (workspace_id, user_id, role)
SELECT w.id, w.created_by, 'owner'
FROM public.workspaces w
WHERE w.created_by IS NOT NULL
ON CONFLICT (workspace_id, user_id) DO NOTHING;

-- 3. Backfill tournaments: match tournament.created_by → owner's workspace
UPDATE public.tournaments t
SET workspace_id = wm.workspace_id
FROM public.workspace_memberships wm
WHERE t.created_by = wm.user_id
  AND wm.role = 'owner'
  AND t.workspace_id IS NULL;

-- 4. Backfill tournament_players via parent tournament
UPDATE public.tournament_players tp
SET workspace_id = t.workspace_id
FROM public.tournaments t
WHERE tp.tournament_id = t.id
  AND t.workspace_id IS NOT NULL
  AND tp.workspace_id IS NULL;

-- 5. Backfill tournament_matches via parent tournament
UPDATE public.tournament_matches tm
SET workspace_id = t.workspace_id
FROM public.tournaments t
WHERE tm.tournament_id = t.id
  AND t.workspace_id IS NOT NULL
  AND tm.workspace_id IS NULL;

-- 6. Backfill tournament_standings via parent tournament
UPDATE public.tournament_standings ts
SET workspace_id = t.workspace_id
FROM public.tournaments t
WHERE ts.tournament_id = t.id
  AND t.workspace_id IS NOT NULL
  AND ts.workspace_id IS NULL;
