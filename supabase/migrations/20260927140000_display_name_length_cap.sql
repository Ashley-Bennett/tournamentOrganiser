-- Cap profiles.display_name at 50 characters, matching the player-name limit on
-- the tournament join page. Previously it was unbounded TEXT.

-- Trim any existing over-long names so the constraint can be added.
UPDATE public.profiles
SET display_name = LEFT(BTRIM(display_name), 50)
WHERE char_length(display_name) > 50;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_display_name_len
  CHECK (display_name IS NULL OR char_length(display_name) <= 50);

-- The signup trigger seeds display_name from the name metadata or the email,
-- either of which can exceed 50 characters. Truncate so signups never fail on it.
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace_id UUID;
BEGIN
  -- Personal workspace was just created by the workspace trigger
  SELECT id INTO v_workspace_id
  FROM public.workspaces
  WHERE created_by = NEW.id AND type = 'personal'
  LIMIT 1;

  INSERT INTO public.profiles (id, display_name, default_workspace_id)
  VALUES (
    NEW.id,
    LEFT(COALESCE(NEW.raw_user_meta_data->>'name', NEW.email), 50),
    v_workspace_id
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;
